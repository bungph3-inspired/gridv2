// MASTER seeder — AUTH_DESIGN.md §5.
//
// Runs once on every API boot, before the HTTP listener starts. Idempotent.
// Four cases, all observable via the structured log lines below:
//
//   present-row + empty MASTER_PASSWORD  → no-op (normal steady state)
//   present-row + set   MASTER_PASSWORD  → reset password + clear lockout (recovery hatch)
//   absent-row  + set   MASTER_PASSWORD  → INSERT row with id=1 + advance sequence
//   absent-row  + empty MASTER_PASSWORD  → log fatal + exit 1 (refuse to start)
//
// The recovery hatch (§5 line 174): if MASTER forgets the password, John SSHes to the
// VPS, sets MASTER_PASSWORD in /etc/gridv2/env, restarts gridv2.service, logs in via
// the new password, clears the env var, restarts again. The env-reset isn't persistent
// across deploys because we clear the env var after step 1.
//
// MASTER_USERNAME drift (§10 row 4): env-var value is consulted on first boot only.
// On every subsequent boot, if env differs from the DB row, we log a warning and keep
// the DB value. Renames happen through the UI, never via env.

import { sql } from "drizzle-orm";
import { db } from "../db/client";
import { hashPassword } from "./password";

export async function seedMaster(): Promise<void> {
  const username = process.env.MASTER_USERNAME;
  const password = process.env.MASTER_PASSWORD ?? "";

  if (!username) {
    throw new Error("MASTER_USERNAME must be set in env (see /etc/gridv2/env)");
  }

  // Read the candidate MASTER row directly with raw SQL — Drizzle's query builder
  // works too, but seedMaster runs once at boot and dipping into sql`` keeps the
  // file dependency-light + maps 1:1 to the operations described in AUTH_DESIGN.
  const existing = await db.execute<{ id: number; username: string }>(
    sql`SELECT id, username FROM agents WHERE id = 1`,
  );
  const row = existing[0];

  if (!row) {
    if (!password) {
      // Refuse to boot — the API has no usable login surface without MASTER.
      console.error(
        "[seedMaster] MASTER absent, MASTER_PASSWORD not set — refusing to start.",
      );
      process.exit(1);
    }
    const hash = await hashPassword(password);
    await db.execute(sql`
      INSERT INTO agents (id, username, username_lower, password_hash, parent_id, created_by)
      VALUES (1, ${username}, ${username.toLowerCase()}, ${hash}, NULL, NULL)
    `);

    // Advance the BIGSERIAL sequence past 1 so the next INSERT (parent_id != NULL)
    // doesn't collide with the explicit id=1 we just inserted. pg_get_serial_sequence
    // resolves the sequence name from (table, column) so we don't hardcode
    // "agents_id_seq" and silently break if the column ever gets renamed.
    await db.execute(sql`
      SELECT setval(
        pg_get_serial_sequence('agents', 'id'),
        GREATEST((SELECT MAX(id) FROM agents), 1)
      )
    `);

    console.log(`[seedMaster] MASTER seeded as '${username}' (id=1)`);
    return;
  }

  if (password) {
    const hash = await hashPassword(password);
    await db.execute(sql`
      UPDATE agents SET password_hash = ${hash}, locked_at = NULL, failed_logins = 0
      WHERE id = 1
    `);
    console.log("[seedMaster] MASTER password reset from env.");
  } else {
    console.log("[seedMaster] MASTER present, no seeding action.");
  }

  if (row.username !== username) {
    console.warn(
      `[seedMaster] MASTER_USERNAME in env ('${username}') differs from DB ('${row.username}'). ` +
        "Keeping DB value — rename via admin UI.",
    );
  }
}
