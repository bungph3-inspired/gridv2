// Agent CRUD routes — AUTH_DESIGN.md §6 rows 4–9.
//
//   GET    /api/agents?scope=children|downline
//   POST   /api/agents                          { username, password }
//   PATCH  /api/agents/:id/password             { new_password }
//   PATCH  /api/agents/:id/disable
//   PATCH  /api/agents/:id/enable
//   PATCH  /api/agents/:id/unlock
//
// Every endpoint requires a session (requireSession) + an active actor
// (requireActive). The mutating :id endpoints additionally require the target
// to be in the actor's downline (requireDescendant — returns 404 on miss per
// the §6 leak-prevention rule).

import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { listChildren, listDownline } from "../auth/downline";
import { hashPassword } from "../auth/password";
import { requireActive, requireSession } from "../auth/middleware";
import { requireDescendant } from "../auth/requireDescendant";
import { db } from "../db/client";
import { agents, sessions } from "../db/schema";
import type { AppEnv } from "../auth/types";

// Mirror the validators from routes/auth.ts so the constraints are consistent
// across login and subagent creation. AUTH_DESIGN §10 rows 1 + 2.
const USERNAME_RE = /^[A-Za-z0-9_]{3,32}$/;
const PASSWORD_MIN = 3;

export const agentsRoutes = new Hono<AppEnv>();

// Every route below runs through requireSession + requireActive first.
agentsRoutes.use("*", requireSession, requireActive);

/* -------------------------------------------------------------------------- */
/* GET /agents — list children (default) or full downline                      */
/* -------------------------------------------------------------------------- */

agentsRoutes.get("/", async (c) => {
  const scope = c.req.query("scope") ?? "children";
  const actor = c.get("agent");

  if (scope === "downline") {
    const rows = await listDownline(actor.id);
    return c.json({ scope: "downline", agents: rows });
  }
  if (scope === "children") {
    const rows = await listChildren(actor.id);
    return c.json({ scope: "children", agents: rows });
  }
  return c.json({ error: "bad_request", detail: "scope must be 'children' or 'downline'" }, 400);
});

/* -------------------------------------------------------------------------- */
/* POST /agents — create a child under the requester                          */
/* -------------------------------------------------------------------------- */

agentsRoutes.post("/", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "bad_request" }, 400);
  }
  const username = typeof (body as any)?.username === "string" ? (body as any).username : "";
  const password = typeof (body as any)?.password === "string" ? (body as any).password : "";

  if (!USERNAME_RE.test(username) || password.length < PASSWORD_MIN) {
    return c.json({ error: "bad_request" }, 400);
  }

  const actor = c.get("agent");
  const usernameLower = username.toLowerCase();

  // Uniqueness pre-check so we can return a clean 409 instead of relying on
  // the DB constraint to throw an opaque error. Race condition window between
  // SELECT and INSERT is harmless — the UNIQUE constraint on username_lower
  // will still catch a concurrent insert (we just return 500 in that edge case
  // rather than a clean 409; acceptable for an invite-only tool).
  const dupe = await db
    .select({ id: agents.id })
    .from(agents)
    .where(eq(agents.usernameLower, usernameLower))
    .limit(1);
  if (dupe[0]) {
    return c.json({ error: "username_taken" }, 409);
  }

  const passwordHash = await hashPassword(password);
  const inserted = await db
    .insert(agents)
    .values({
      username,
      usernameLower,
      passwordHash,
      parentId: actor.id,
      createdBy: actor.id,
    })
    .returning({
      id: agents.id,
      username: agents.username,
      parentId: agents.parentId,
      hasChildren: agents.hasChildren,
      createdAt: agents.createdAt,
    });

  const row = inserted[0];
  return c.json(
    {
      id: row.id,
      username: row.username,
      parent_id: row.parentId,
      has_children: row.hasChildren,
      created_at: row.createdAt,
    },
    201,
  );
});

/* -------------------------------------------------------------------------- */
/* PATCH /agents/:id/password                                                 */
/* -------------------------------------------------------------------------- */

agentsRoutes.patch("/:id/password", requireDescendant(), async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "bad_request" }, 400);
  }
  const newPassword =
    typeof (body as any)?.new_password === "string" ? (body as any).new_password : "";
  if (newPassword.length < PASSWORD_MIN) {
    return c.json({ error: "bad_request" }, 400);
  }

  const targetId = Number(c.req.param("id"));
  const passwordHash = await hashPassword(newPassword);
  await db.update(agents).set({ passwordHash }).where(eq(agents.id, targetId));

  // Forced password change kicks every session for the target. The new
  // password takes effect on next login.
  await db.delete(sessions).where(eq(sessions.agentId, targetId));

  return c.body(null, 204);
});

/* -------------------------------------------------------------------------- */
/* PATCH /agents/:id/disable                                                  */
/* -------------------------------------------------------------------------- */

agentsRoutes.patch("/:id/disable", requireDescendant(), async (c) => {
  const targetId = Number(c.req.param("id"));

  // §10 row 6 — UPDATE disabled_at + DELETE sessions in a single transaction
  // so an attacker can't ride a session in-between the two statements.
  await db.transaction(async (tx) => {
    await tx.update(agents).set({ disabledAt: new Date() }).where(eq(agents.id, targetId));
    await tx.delete(sessions).where(eq(sessions.agentId, targetId));
  });

  return c.body(null, 204);
});

/* -------------------------------------------------------------------------- */
/* PATCH /agents/:id/enable                                                   */
/* -------------------------------------------------------------------------- */

agentsRoutes.patch("/:id/enable", requireDescendant(), async (c) => {
  const targetId = Number(c.req.param("id"));
  await db.update(agents).set({ disabledAt: null }).where(eq(agents.id, targetId));
  return c.body(null, 204);
});

/* -------------------------------------------------------------------------- */
/* PATCH /agents/:id/unlock                                                   */
/* -------------------------------------------------------------------------- */

agentsRoutes.patch("/:id/unlock", requireDescendant(), async (c) => {
  const targetId = Number(c.req.param("id"));
  await db
    .update(agents)
    .set({ lockedAt: null, failedLogins: 0 })
    .where(eq(agents.id, targetId));
  return c.body(null, 204);
});
