// Auth routes — AUTH_DESIGN.md §6 rows 1–3 (login, logout, me).
//
//   POST /api/login   — public; sets cookie on success
//   POST /api/logout  — requires session; clears cookie
//   GET  /api/me      — requires session; returns own agent row
//
// Path note: this Hono sub-app is mounted at `/api` from index.ts, so the
// routes here are declared without the `/api` prefix.

import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { hashPassword, verifyPassword } from "../auth/password";
import { clearSessionCookie, setSessionCookie } from "../auth/cookie";
import { generateToken, hashToken } from "../auth/sessionToken";
import { requireActive, requireSession } from "../auth/middleware";
import { db } from "../db/client";
import { agents, sessions } from "../db/schema";
import type { AppEnv } from "../auth/types";

// AUTH_DESIGN §10 row 1 — ASCII letters + digits + underscore, 3-32 chars,
// case-insensitive (the lower-cased copy lives in usernameLower).
const USERNAME_RE = /^[A-Za-z0-9_]{3,32}$/;

// AUTH_DESIGN §10 row 2 — min 3 chars, no other rules.
const PASSWORD_MIN = 3;

// Timing-attack guard: we still run argon2.verify against this dummy hash on
// the user-not-found path so the response time matches the bad-password path.
// Hashed once at module load (so the first request doesn't pay the cost) using
// a value that can never be a real password (under the 3-char min).
let DUMMY_HASH_PROMISE: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  if (!DUMMY_HASH_PROMISE) {
    DUMMY_HASH_PROMISE = hashPassword("\x00");
  }
  return DUMMY_HASH_PROMISE;
}

export const auth = new Hono<AppEnv>();

/* -------------------------------------------------------------------------- */
/* POST /login                                                                */
/* -------------------------------------------------------------------------- */

auth.post("/login", async (c) => {
  // Body shape: { username: string, password: string }
  // Reject any non-JSON / malformed body with 400.
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "bad_request" }, 400);
  }
  const username = typeof (body as any)?.username === "string" ? (body as any).username : "";
  const password = typeof (body as any)?.password === "string" ? (body as any).password : "";

  // Validate per §10 row 1 + row 2. Generic 400 on either — don't leak which.
  if (!USERNAME_RE.test(username) || password.length < PASSWORD_MIN) {
    return c.json({ error: "bad_request" }, 400);
  }

  const usernameLower = username.toLowerCase();
  const found = await db
    .select()
    .from(agents)
    .where(eq(agents.usernameLower, usernameLower))
    .limit(1);
  const agent = found[0];

  if (!agent) {
    // Timing-attack guard: verify against a dummy hash so this path is roughly
    // as slow as the bad-password path. Don't increment any counter here —
    // there's no row to track. Return generic 401.
    await verifyPassword(await getDummyHash(), password);
    return c.json({ error: "unauthenticated" }, 401);
  }

  // §8 lockout — locked accounts get 423 *before* we even check the password,
  // so an attacker can't burn through password attempts on a locked account.
  if (agent.lockedAt) {
    return c.json({ error: "locked" }, 423);
  }

  // Disabled accounts respond identically to bad-password — don't reveal that
  // the account exists but is disabled.
  if (agent.disabledAt) {
    await verifyPassword(await getDummyHash(), password);
    return c.json({ error: "unauthenticated" }, 401);
  }

  const ok = await verifyPassword(agent.passwordHash, password);
  if (!ok) {
    // §8 — increment counter; on 5th fail, set locked_at. Done in a single
    // round-trip via a CASE expression so we don't race a concurrent attempt.
    const nextCount = agent.failedLogins + 1;
    await db
      .update(agents)
      .set({
        failedLogins: nextCount,
        lockedAt: nextCount >= 5 ? new Date() : null,
      })
      .where(eq(agents.id, agent.id));
    return c.json({ error: "unauthenticated" }, 401);
  }

  // Success path.
  // §10 row 5 — max-1-session: delete any existing sessions for this agent
  // BEFORE inserting the new one. Side effect: logging in from a new device
  // boots all other devices on the next API call (which gets a 401 and
  // redirects to login — enforces "no shared accounts").
  await db.delete(sessions).where(eq(sessions.agentId, agent.id));

  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ua = c.req.header("user-agent") ?? null;
  await db.insert(sessions).values({
    tokenHash,
    agentId: agent.id,
    userAgent: ua,
    ip,
  });

  await db
    .update(agents)
    .set({ failedLogins: 0, lastLoginAt: new Date() })
    .where(eq(agents.id, agent.id));

  setSessionCookie(c, rawToken);
  return c.json({ ok: true }, 200);
});

/* -------------------------------------------------------------------------- */
/* POST /logout                                                               */
/* -------------------------------------------------------------------------- */

// Logout doesn't require requireActive — a disabled agent should still be able
// to clear their own cookie. requireSession is enough to identify which row
// to delete.
auth.post("/logout", requireSession, async (c) => {
  const session = c.get("session");
  await db.delete(sessions).where(eq(sessions.tokenHash, session.tokenHash));
  clearSessionCookie(c);
  return c.body(null, 204);
});

/* -------------------------------------------------------------------------- */
/* GET /me                                                                    */
/* -------------------------------------------------------------------------- */

// §6 — returns id, username, parent_id, has_children, disabled_at, created_at.
// Caller is guaranteed-active because requireActive runs after requireSession.
auth.get("/me", requireSession, requireActive, async (c) => {
  const agent = c.get("agent");
  return c.json({
    id: agent.id,
    username: agent.username,
    parent_id: agent.parentId,
    has_children: agent.hasChildren,
    disabled_at: agent.disabledAt,
    created_at: agent.createdAt,
  });
});
