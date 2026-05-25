// Session-auth middleware — AUTH_DESIGN.md §7.
//
// Two layers, applied in order on any protected route:
//   1. requireSession  — cookie present + matches an active session row
//   2. requireActive   — agent isn't disabled or locked (belt-and-suspenders;
//                        login already prevents this but we cover the case
//                        where a session was issued and the agent was
//                        disabled/locked afterward)
//
// Cookies / responses use the canonical 401 (not authenticated). 423 is reserved
// for login attempts against a locked account — middleware doesn't issue 423
// because by the time we're in middleware the session was already created.

import { eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import { db } from "../db/client";
import { agents, sessions } from "../db/schema";
import { clearSessionCookie, SESSION_COOKIE_NAME } from "./cookie";
import { hashToken } from "./sessionToken";
import type { AppEnv } from "./types";

/**
 * Require a valid session cookie. Attaches `agent` + `session` to context.
 *
 * - No cookie / unknown cookie → 401 (no Set-Cookie clearing; nothing to clear).
 * - Valid cookie → updates last_seen_at + ip + user_agent in the background,
 *   then calls next().
 */
export const requireSession = createMiddleware<AppEnv>(async (c, next) => {
  const rawToken = getCookie(c, SESSION_COOKIE_NAME);
  if (!rawToken) {
    return c.json({ error: "unauthenticated" }, 401);
  }

  const tokenHash = hashToken(rawToken);
  const rows = await db
    .select({
      // Pull full session + full agent in one round-trip.
      session: sessions,
      agent: agents,
    })
    .from(sessions)
    .innerJoin(agents, eq(sessions.agentId, agents.id))
    .where(eq(sessions.tokenHash, tokenHash))
    .limit(1);

  const row = rows[0];
  if (!row) {
    // Cookie pointed at a session that no longer exists (logged out, evicted
    // by max-1-session, or DB cleanup). Clear the stale cookie too so the
    // browser stops sending it.
    clearSessionCookie(c);
    return c.json({ error: "unauthenticated" }, 401);
  }

  // Best-effort session touch. Don't await — the response shouldn't wait on
  // this UPDATE. Errors are swallowed; if the DB is having a bad day the
  // touch can be missed without breaking the request.
  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ua = c.req.header("user-agent") ?? null;
  void db
    .update(sessions)
    .set({ lastSeenAt: new Date(), ip, userAgent: ua })
    .where(eq(sessions.tokenHash, tokenHash))
    .catch((err) => {
      console.warn("[requireSession] session touch failed:", err);
    });

  c.set("agent", row.agent);
  c.set("session", row.session);
  await next();
});

/**
 * After requireSession, additionally reject if the agent is disabled or locked.
 * Kills the session row + clears the cookie so the SPA's 401-interceptor
 * redirects to login on the very next request.
 *
 * Implementation note: login itself blocks disabled/locked logins, so this
 * only fires when an agent was disabled/locked AFTER their session was issued.
 */
export const requireActive = createMiddleware<AppEnv>(async (c, next) => {
  const agent = c.get("agent");
  if (agent.disabledAt || agent.lockedAt) {
    await db.delete(sessions).where(eq(sessions.tokenHash, c.get("session").tokenHash));
    clearSessionCookie(c);
    return c.json({ error: "unauthenticated" }, 401);
  }
  await next();
});
