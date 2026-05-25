// Downline helpers — AUTH_DESIGN.md §3.4 + §7.
//
// The agent tree is unbounded depth (§memory note: no role enum, every agent
// can create children, "player" is just a leaf). Access control is the same
// across every level: an agent can see and act on themselves + every
// descendant, nothing else. MASTER (id=1) is at the root, so MASTER's downline
// is literally everyone.
//
// These three helpers + the requireDescendant middleware are the only places
// in the codebase that compute tree relationships. Routes never write
// "WHERE parent_id = $x" inline — they go through here so the access semantics
// stay in one file.

import { sql } from "drizzle-orm";
import { db } from "../db/client";

/* -------------------------------------------------------------------------- */
/* Shape used by GET /api/agents list endpoints                               */
/* -------------------------------------------------------------------------- */

export type AgentListRow = {
  id: number;
  username: string;
  parent_id: number | null;
  has_children: boolean;
  disabled_at: Date | null;
  locked_at: Date | null;
  last_login_at: Date | null;
  created_at: Date;
  /** Depth from the actor (0 = actor themselves, 1 = direct child, ...). */
  depth: number;
};

/* -------------------------------------------------------------------------- */
/* Bigint coercion                                                            */
/* -------------------------------------------------------------------------- */

// postgres-js returns bigint columns as strings by default (because bigint
// can exceed Number.MAX_SAFE_INTEGER). Drizzle's `bigint("col", { mode: "number" })`
// schema config coerces on queries built through the query builder, but
// raw `db.execute(sql``)` calls bypass that path — bigint comes back as a
// string. For agents.id + parent_id we know the values stay small (sequential
// from 1, capped at the agent count which will never approach 2^53), so we
// coerce to Number here so all our endpoints return a consistent shape.
// Discovered 2026-05-24 when POST /api/agents returned `"id":2` (via drizzle
// .returning()) but GET /api/agents?scope=downline returned `"id":"2"` (via
// raw CTE).
function normalizeRow(r: AgentListRow): AgentListRow {
  return {
    ...r,
    id: Number(r.id),
    parent_id: r.parent_id == null ? null : Number(r.parent_id),
    depth: Number(r.depth),
  };
}

/* -------------------------------------------------------------------------- */
/* isDescendant — primary access-control check                                */
/* -------------------------------------------------------------------------- */

/**
 * Is `targetId` in `actorId`'s downline (inclusive of self)?
 *
 * Used by requireDescendant on every `/api/agents/:id/*` route. Inclusive of
 * self matters because routes like PATCH /api/agents/:id/password apply
 * equally to self as to descendants — an agent can always change their own
 * password without having to be their own parent.
 */
export async function isDescendant(actorId: number, targetId: number): Promise<boolean> {
  // Fast path: an agent always passes the descendant check against themselves.
  // Skips a recursive CTE for what is the most common case (self-PATCH).
  if (actorId === targetId) return true;

  const rows = await db.execute<{ found: boolean }>(sql`
    WITH RECURSIVE downline AS (
      SELECT id FROM agents WHERE id = ${actorId}
      UNION ALL
      SELECT a.id FROM agents a INNER JOIN downline d ON a.parent_id = d.id
    )
    SELECT EXISTS (SELECT 1 FROM downline WHERE id = ${targetId}) AS found
  `);
  return rows[0]?.found === true;
}

/* -------------------------------------------------------------------------- */
/* listChildren — one level deep                                              */
/* -------------------------------------------------------------------------- */

/**
 * Direct children of `actorId`. Default for GET /api/agents (§10 row 3).
 * Depth is fixed at 1 (children are always one level below the actor).
 */
export async function listChildren(actorId: number): Promise<AgentListRow[]> {
  const rows = await db.execute<AgentListRow>(sql`
    SELECT
      id,
      username,
      parent_id,
      has_children,
      disabled_at,
      locked_at,
      last_login_at,
      created_at,
      1 AS depth
    FROM agents
    WHERE parent_id = ${actorId}
    ORDER BY username_lower ASC
  `);
  return rows.map(normalizeRow);
}

/* -------------------------------------------------------------------------- */
/* listDownline — every descendant                                            */
/* -------------------------------------------------------------------------- */

/**
 * Every descendant of `actorId` (excluding self), with depth from the actor.
 * Used for the "view full downline" toggle in the admin panel (§9.2 §9.4).
 *
 * Ordering: depth ASC, then username ASC within each level — produces a
 * naturally tree-shaped list the UI can render with simple indent-by-depth.
 */
export async function listDownline(actorId: number): Promise<AgentListRow[]> {
  const rows = await db.execute<AgentListRow>(sql`
    WITH RECURSIVE downline AS (
      SELECT
        id, username, username_lower, parent_id, has_children,
        disabled_at, locked_at, last_login_at, created_at,
        0 AS depth
      FROM agents WHERE id = ${actorId}
      UNION ALL
      SELECT
        a.id, a.username, a.username_lower, a.parent_id, a.has_children,
        a.disabled_at, a.locked_at, a.last_login_at, a.created_at,
        d.depth + 1
      FROM agents a INNER JOIN downline d ON a.parent_id = d.id
    )
    SELECT id, username, parent_id, has_children, disabled_at, locked_at,
           last_login_at, created_at, depth
    FROM downline
    WHERE id <> ${actorId}
    ORDER BY depth ASC, username_lower ASC
  `);
  return rows.map(normalizeRow);
}
