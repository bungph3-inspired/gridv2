// agents table — AUTH_DESIGN.md §3.1
//
// Notes vs the AUTH_DESIGN draft:
// - id uses BIGSERIAL (drizzle's `bigserial`) instead of GENERATED ALWAYS AS IDENTITY,
//   so the MASTER seeder can INSERT with explicit id=1 (§5). Sequence still needs to be
//   advanced after that insert — handled in seedMaster (§A.5).
// - master_no_parent CHECK is expressed inline via drizzle's check() helper rather than
//   hand-appended SQL. It contains no sub-query so drizzle models it cleanly.
// - has_children trigger is NOT modeled here — drizzle doesn't represent triggers in the
//   schema DSL. Trigger SQL gets hand-appended to the generated migration in §A.3.

import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  index,
  pgTable,
  smallint,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const agents = pgTable(
  "agents",
  {
    // BIGSERIAL — allows explicit id=1 on MASTER seed (§5 line 167)
    id: bigserial("id", { mode: "number" }).primaryKey(),

    // Display username + lowercased copy for case-insensitive unique lookup
    username: text("username").notNull(),
    usernameLower: text("username_lower").notNull().unique(),

    // Argon2id encoded string ($argon2id$v=19$m=...$...$...)
    passwordHash: text("password_hash").notNull(),

    // Self-referential parent. NULL only for MASTER (enforced by master_no_parent CHECK).
    // The `(): any` annotation avoids TS circular-type errors on self-FK refs.
    parentId: bigint("parent_id", { mode: "number" }).references((): any => agents.id),

    // Maintained by trigger (see §3.3 + §A.3 migration append)
    hasChildren: boolean("has_children").notNull().default(false),

    // Who created this row. NULL for MASTER (seeded), set to actor.id for everyone else.
    createdBy: bigint("created_by", { mode: "number" }).references((): any => agents.id),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),

    // Soft-disable. Non-NULL = can't log in. (§7 requireActive)
    disabledAt: timestamp("disabled_at", { withTimezone: true }),

    // Lockout. Non-NULL = locked. Cleared by upline via PATCH /api/agents/:id/unlock (§8).
    lockedAt: timestamp("locked_at", { withTimezone: true }),

    // Counter never decays — reset on successful login or unlock. 5 fails → set locked_at.
    failedLogins: smallint("failed_logins").notNull().default(0),

    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_agents_parent").on(t.parentId),
    index("idx_agents_username_lower").on(t.usernameLower),
    // MASTER (id=1) has no parent; all others must have one.
    // No sub-query → drizzle's check() handles this fine.
    check("master_no_parent", sql`(${t.parentId} IS NULL) = (${t.id} = 1)`),
  ],
);

export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;
