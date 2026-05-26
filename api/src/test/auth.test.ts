// AUTH_DESIGN §12 — first proof tests for Phase E.
//
// Subsequent PRs add: unlock by ancestor, downline scope 404, cookie attrs,
// max-1-session, disable cascade, 404-vs-403 leak.

import { describe, expect } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { agents } from "../db/schema";
import { hashPassword } from "../auth/password";
import { seedMaster } from "../auth/seedMaster";
import { txTest, request, extractSessionCookie } from "./helpers";

const MASTER_USERNAME = "TestMaster";
const MASTER_PASSWORD = "testmasterpw";

// Insert a known MASTER row inside the current transaction. Used by tests that
// want a clean baseline without exercising the seedMaster code path itself.
async function seedFreshMaster() {
  await db.execute(sql`DELETE FROM sessions`);
  await db.execute(sql`DELETE FROM agents`);
  const hash = await hashPassword(MASTER_PASSWORD);
  await db.execute(sql`
    INSERT INTO agents (id, username, username_lower, password_hash, parent_id, created_by)
    VALUES (1, ${MASTER_USERNAME}, ${MASTER_USERNAME.toLowerCase()}, ${hash}, NULL, NULL)
  `);
  await db.execute(sql`
    SELECT setval(
      pg_get_serial_sequence('agents', 'id'),
      GREATEST((SELECT MAX(id) FROM agents), 1)
    )
  `);
}

describe("AUTH §12 — first proof tests", () => {
  txTest("MASTER seed is idempotent", async () => {
    // ARRANGE: empty agents/sessions (rollback isolation gives us this between
    // tests, but other tests in the file may have written into the same txn).
    process.env.MASTER_USERNAME = MASTER_USERNAME;
    process.env.MASTER_PASSWORD = MASTER_PASSWORD;
    await db.execute(sql`DELETE FROM sessions`);
    await db.execute(sql`DELETE FROM agents`);

    // ACT 1: first seed inserts the row.
    await seedMaster();
    const after1 = await db.execute<{ id: number; username: string; password_hash: string }>(
      sql`SELECT id, username, password_hash FROM agents WHERE id = 1`,
    );
    expect(after1).toHaveLength(1);
    expect(after1[0]!.username).toBe(MASTER_USERNAME);

    // ACT 2: clear MASTER_PASSWORD, second seed is a no-op.
    delete process.env.MASTER_PASSWORD;
    await seedMaster();
    const after2 = await db.execute<{ id: number; password_hash: string }>(
      sql`SELECT id, password_hash FROM agents WHERE id = 1`,
    );
    expect(after2).toHaveLength(1);
    expect(after2[0]!.password_hash).toBe(after1[0]!.password_hash);
  });

  txTest("login success sets cookie + GET /api/me returns the agent", async () => {
    await seedFreshMaster();
    const loginRes = await request("POST", "/api/login", {
      body: { username: MASTER_USERNAME, password: MASTER_PASSWORD },
    });
    expect(loginRes.status).toBe(200);

    const cookie = extractSessionCookie(loginRes);
    expect(cookie).toBeTruthy();

    const meRes = await request("GET", "/api/me", { cookie: cookie! });
    expect(meRes.status).toBe(200);
    const me = (await meRes.json()) as {
      id: number;
      username: string;
      parent_id: number | null;
    };
    expect(me.username).toBe(MASTER_USERNAME);
    expect(me.id).toBe(1);
    expect(me.parent_id).toBeNull();
  });

  txTest("5 wrong passwords lock the account (failed_logins=5, locked_at set)", async () => {
    await seedFreshMaster();
    for (let i = 0; i < 5; i += 1) {
      const res = await request("POST", "/api/login", {
        body: { username: MASTER_USERNAME, password: "wrong-pw" },
      });
      expect(res.status).toBe(401);
    }
    const [row] = await db
      .select({ failedLogins: agents.failedLogins, lockedAt: agents.lockedAt })
      .from(agents)
      .where(eq(agents.id, 1));
    expect(row!.failedLogins).toBe(5);
    expect(row!.lockedAt).not.toBeNull();
  });

  txTest("locked account returns 423 even with correct password, no extra burn", async () => {
    await seedFreshMaster();
    // Manually lock the MASTER row (skip the 5x wrong-password ceremony).
    await db
      .update(agents)
      .set({ lockedAt: new Date(), failedLogins: 5 })
      .where(eq(agents.id, 1));

    const before = await db
      .select({ failedLogins: agents.failedLogins })
      .from(agents)
      .where(eq(agents.id, 1));

    const res = await request("POST", "/api/login", {
      body: { username: MASTER_USERNAME, password: MASTER_PASSWORD },
    });
    expect(res.status).toBe(423);

    // §8 — locked path returns 423 BEFORE the password check; failedLogins
    // must not increment.
    const after = await db
      .select({ failedLogins: agents.failedLogins })
      .from(agents)
      .where(eq(agents.id, 1));
    expect(after[0]!.failedLogins).toBe(before[0]!.failedLogins);
  });
});
