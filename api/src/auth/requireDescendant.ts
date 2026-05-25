// requireDescendant middleware — AUTH_DESIGN.md §7 + §6 (404-vs-403 leak rule).
//
// Wraps the `isDescendant(actor, target)` check as a Hono middleware factory.
// All `/api/agents/:id/*` mutating endpoints chain this AFTER requireSession +
// requireActive so the actor is guaranteed to exist + be allowed in.
//
// Critical: when the target is NOT in the actor's downline, we return **404**
// (not 403). Per §6: "prefer 404 when the target isn't in the requester's
// downline (don't reveal whether the agent exists outside their visibility)."
// 403 would leak the existence of the agent — 404 keeps the visibility scope
// opaque.

import { createMiddleware } from "hono/factory";
import { isDescendant } from "./downline";
import type { AppEnv } from "./types";

/**
 * Build a middleware that checks `:paramName` (default `id`) is in the actor's
 * downline. Usage:
 *
 *   agents.patch('/:id/disable', requireSession, requireActive,
 *     requireDescendant(), async (c) => { ... })
 */
export function requireDescendant(paramName: string = "id") {
  return createMiddleware<AppEnv>(async (c, next) => {
    const raw = c.req.param(paramName);
    const targetId = Number(raw);
    if (!Number.isInteger(targetId) || targetId < 1) {
      // Malformed id — treat as not-found rather than bad-request so we keep
      // the same opaque-404 stance regardless of failure mode.
      return c.json({ error: "not_found" }, 404);
    }

    const actor = c.get("agent");
    const ok = await isDescendant(actor.id, targetId);
    if (!ok) {
      return c.json({ error: "not_found" }, 404);
    }
    await next();
  });
}
