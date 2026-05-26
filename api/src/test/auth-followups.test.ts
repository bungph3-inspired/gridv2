// AUTH_DESIGN §12 — remaining 6 cases (Phase E follow-up to auth.test.ts).
//
//   1. unlock by ancestor              — PATCH /agents/:id/unlock clears locked_at + failed_logins
//   2. session cookie attrs            — HttpOnly + Secure + SameSite=Lax + Path=/, no Max-Age, no Domain
//   3. max-1-session                   — second login for same agent invalidates the first cookie
//   4. disable cascade                 — disabling an agent kills their existing session immediately
//   5. downline scope rejection (404)  — non-descendant target returns 404, NOT 403
//   6. 404-vs-403 leak (non-existent)  — non-existent target ID returns the same 404 + body as #5

import { describe, expect } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { agents } from "../db/schema";
import { hashPassword } from "../auth/password";
import {
  txTest,
  request,
  loginAs,
} from "./helpers";

const MASTER_USERNAME = "TestMaster";
const MASTER_PASSWORD = "testmasterpw";

// Seeds MASTER (id=1) cleanly. Mirrors the helper in auth.test.ts — kept local
// so each test file is self-contained.
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

// Insert a child of `parentId` directly. Returns { id, username }.
async function insertChild(
  username: string,
  password: string,
  parentId: number,
): Promise<{ id: number; username: string }> {
  const hash = await hashPassword(password);
  const inserted = await db
    .insert(agents)
    .values({
      username,
      usernameLower: username.toLowerCase(),
      passwordHash: hash,
      parentId,
      createdBy: parentId,
    })
    .returning({ id: agents.id, username: agents.username });
  return inserted[0]!;
}

describe("AUTH §12 — follow-ups", () => {
  /* ------------------------------------------------------------------------ */
  /* 1. Unlock by ancestor                                                    */
  /* ------------------------------------------------------------------------ */
  txTest("ancestor can unlock a locked descendant", async () => {
    await seedFreshMaster();
    const child = await insertChild("smoketest1", "ChildPw123", 1);

    // Lock the child directly (skip the 5x wrong-pw ceremony — covered in auth.test.ts).
    await db
      .update(agents)
      .set({ lockedAt: new Date(), failedLogins: 5 })
      .where(eq(agents.id, child.id));

    const masterCookie = await loginAs(MASTER_USERNAME, MASTER_PASSWORD);
    const res = await request("PATCH", `/api/agents/${child.id}/unlock`, {
      cookie: masterCookie,
    });
    expect(res.status).toBe(204);

    const [row] = await db
      .select({ lockedAt: agents.lockedAt, failedLogins: agents.failedLogins })
      .from(agents)
      .where(eq(agents.id, child.id));
    expect(row!.lockedAt).toBeNull();
    expect(row!.failedLogins).toBe(0);
  });

  /* ------------------------------------------------------------------------ */
  /* 2. Session cookie attrs                                                  */
  /* ------------------------------------------------------------------------ */
  txTest("login Set-Cookie has HttpOnly + Secure + SameSite=Lax + Path=/, no Max-Age, no Domain", async () => {
    await seedFreshMaster();
    const res = await request("POST", "/api/login", {
      body: { username: MASTER_USERNAME, password: MASTER_PASSWORD },
    });
    expect(res.status).toBe(200);

    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).not.toBeNull();
    const raw = setCookie!;

    // Required attrs per AUTH_DESIGN §4.
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/Secure/i);
    expect(raw).toMatch(/SameSite=Lax/i);
    expect(raw).toMatch(/Path=\//);

    // Session cookie — no Max-Age, no Expires, no Domain (host-only).
    expect(raw).not.toMatch(/Max-Age/i);
    expect(raw).not.toMatch(/Expires=/i);
    expect(raw).not.toMatch(/Domain=/i);
  });

  /* ------------------------------------------------------------------------ */
  /* 3. Max-1-session — second login boots the first                          */
  /* ------------------------------------------------------------------------ */
  txTest("second login for same agent invalidates the first session", async () => {
    await seedFreshMaster();

    const cookie1 = await loginAs(MASTER_USERNAME, MASTER_PASSWORD);
    // Confirm cookie1 works.
    const me1 = await request("GET", "/api/me", { cookie: cookie1 });
    expect(me1.status).toBe(200);

    const cookie2 = await loginAs(MASTER_USERNAME, MASTER_PASSWORD);
    expect(cookie2).not.toBe(cookie1);

    // cookie1 is now stale — 401.
    const me1Stale = await request("GET", "/api/me", { cookie: cookie1 });
    expect(me1Stale.status).toBe(401);

    // cookie2 is current — 200.
    const me2 = await request("GET", "/api/me", { cookie: cookie2 });
    expect(me2.status).toBe(200);
  });

  /* ------------------------------------------------------------------------ */
  /* 4. Disable cascade                                                       */
  /* ------------------------------------------------------------------------ */
  txTest("disabling an agent kills their existing session immediately", async () => {
    await seedFreshMaster();
    const child = await insertChild("smoketest1", "ChildPw123", 1);

    // Child logs in.
    const childCookie = await loginAs("smoketest1", "ChildPw123");
    expect((await request("GET", "/api/me", { cookie: childCookie })).status).toBe(200);

    // MASTER disables child.
    const masterCookie = await loginAs(MASTER_USERNAME, MASTER_PASSWORD);
    const disable = await request("PATCH", `/api/agents/${child.id}/disable`, {
      cookie: masterCookie,
    });
    expect(disable.status).toBe(204);

    // Child's cookie is now dead (session row deleted atomically with disabled_at set).
    const meAfter = await request("GET", "/api/me", { cookie: childCookie });
    expect(meAfter.status).toBe(401);
  });

  /* ------------------------------------------------------------------------ */
  /* 5. Downline scope rejection — non-descendant target returns 404 (not 403) */
  /* ------------------------------------------------------------------------ */
  txTest("PATCH on non-descendant returns 404 (not 403), no existence leak", async () => {
    await seedFreshMaster();
    // Two siblings under MASTER. sib1 and sib2 are NOT in each other's downline.
    const sib1 = await insertChild("sib1", "sibpw1", 1);
    const sib2 = await insertChild("sib2", "sibpw2", 1);

    const sib1Cookie = await loginAs("sib1", "sibpw1");

    // sib1 tries to unlock sib2 (real agent, but not sib1's descendant).
    const res = await request("PATCH", `/api/agents/${sib2.id}/unlock`, {
      cookie: sib1Cookie,
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("not_found");
  });

  /* ------------------------------------------------------------------------ */
  /* 6. 404-vs-403 leak — non-existent target ID returns same 404 + body      */
  /* ------------------------------------------------------------------------ */
  txTest("PATCH on non-existent ID returns the same 404 + body as non-descendant case", async () => {
    await seedFreshMaster();
    const masterCookie = await loginAs(MASTER_USERNAME, MASTER_PASSWORD);

    // 99999 doesn't exist. Should NOT be distinguishable from a real-but-not-in-downline
    // agent — the §6 rule says both responses must be byte-identical so the
    // API doesn't leak whether the agent exists outside the actor's scope.
    const res = await request("PATCH", "/api/agents/99999/unlock", {
      cookie: masterCookie,
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("not_found");
  });
});
