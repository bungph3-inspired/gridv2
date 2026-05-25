// sessions table — AUTH_DESIGN.md §3.2
//
// One row per active session. Server stores SHA-256(token) so a DB leak doesn't
// immediately compromise live sessions. No expires_at — session cookie dies on
// browser close (§4). agentId cascades on delete so disabling an agent kills
// their sessions (§10 row 6).

import {
  bigint,
  customType,
  index,
  inet,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { agents } from "./agents";

// drizzle-orm/pg-core doesn't ship a bytea export. customType is the documented
// pattern. postgres-js driver returns Uint8Array for bytea; we coerce to Buffer
// on read so consumers can use the full Buffer API. Buffer extends Uint8Array,
// so toDriver is a no-op.
const bytea = customType<{ data: Buffer; driverData: Uint8Array }>({
  dataType() {
    return "bytea";
  },
  fromDriver(value) {
    return Buffer.from(value);
  },
});

export const sessions = pgTable(
  "sessions",
  {
    // sha256(rawToken). 32 bytes. PK so a single SELECT looks up the session.
    tokenHash: bytea("token_hash").primaryKey(),

    // Owning agent. Cascade so disable/delete cleans up sessions automatically.
    agentId: bigint("agent_id", { mode: "number" })
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),

    // Touched on every authenticated request (used for "active sessions" UI later).
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),

    // For the agent's "active sessions" UI (§3.2)
    userAgent: text("user_agent"),
    ip: inet("ip"),
  },
  (t) => [index("idx_sessions_agent").on(t.agentId)],
);

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
