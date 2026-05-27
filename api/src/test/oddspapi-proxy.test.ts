// /api/oddspapi/* proxy routes. PR1 covered /tournaments; PR2 adds /participants.
//
// Pattern matches auth.test.ts: seedFreshMaster() inside txTest, login to
// pick up a session cookie, hit the route. Fixtures (for /tournaments) are
// seeded with raw drizzle inserts on the same transactional `db` Proxy;
// /participants is pure in-memory map lookups, no DB.

import { describe, expect } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "../db/client";
import { fixtures } from "../db/schema";
import { hashPassword } from "../auth/password";
import { txTest, request, loginAs } from "./helpers";

const MASTER_USERNAME = "TestMaster";
const MASTER_PASSWORD = "testmasterpw";

async function seedFreshMaster(): Promise<void> {
  await db.execute(sql`DELETE FROM sessions`);
  await db.execute(sql`DELETE FROM prices`);
  await db.execute(sql`DELETE FROM markets`);
  await db.execute(sql`DELETE FROM fixtures`);
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

/** Insert an MLB-style fixture for tests. Returns nothing — assertions read back via the API. */
async function seedFixture(opts: {
  oddspapiEventId: string;
  sport: string;
  league: string;
  tournamentId: number;
  status: string;
  startsAt: Date;
}): Promise<void> {
  await db.insert(fixtures).values({
    oddspapiEventId: opts.oddspapiEventId,
    sport: opts.sport,
    league: opts.league,
    tournamentId: opts.tournamentId,
    participant1Id: 1,
    participant2Id: 2,
    startsAt: opts.startsAt,
    status: opts.status,
  });
}

/* ========================================================================== */
/* GET /api/oddspapi/tournaments                                              */
/* ========================================================================== */

describe("GET /api/oddspapi/tournaments", () => {
  txTest("401 when no session cookie", async () => {
    await seedFreshMaster();
    const res = await request("GET", "/api/oddspapi/tournaments?sportId=13");
    expect(res.status).toBe(401);
  });

  txTest("400 when sportId is missing", async () => {
    await seedFreshMaster();
    const cookie = await loginAs(MASTER_USERNAME, MASTER_PASSWORD);
    const res = await request("GET", "/api/oddspapi/tournaments", { cookie });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("bad_request");
  });

  txTest("400 when sportId is not an integer", async () => {
    await seedFreshMaster();
    const cookie = await loginAs(MASTER_USERNAME, MASTER_PASSWORD);
    const res = await request("GET", "/api/oddspapi/tournaments?sportId=banana", { cookie });
    expect(res.status).toBe(400);
  });

  txTest("returns empty array for unknown sportId", async () => {
    await seedFreshMaster();
    const cookie = await loginAs(MASTER_USERNAME, MASTER_PASSWORD);
    // 99 isn't in SPORT_BY_ID
    const res = await request("GET", "/api/oddspapi/tournaments?sportId=99", { cookie });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  txTest("groups fixtures by tournament_id and counts open/live correctly", async () => {
    await seedFreshMaster();

    const future = new Date(Date.now() + 86_400_000); // tomorrow
    const past = new Date(Date.now() - 86_400_000); // yesterday

    // Two MLB fixtures (tournament 109, sport=baseball)
    await seedFixture({
      oddspapiEventId: "evt-mlb-1",
      sport: "baseball",
      league: "MLB",
      tournamentId: 109,
      status: "open",
      startsAt: future,
    });
    await seedFixture({
      oddspapiEventId: "evt-mlb-2",
      sport: "baseball",
      league: "MLB",
      tournamentId: 109,
      status: "live",
      startsAt: past,
    });
    // One NBA fixture in a different sport (basketball) — must not appear in baseball results
    await seedFixture({
      oddspapiEventId: "evt-nba-1",
      sport: "basketball",
      league: "NBA",
      tournamentId: 132,
      status: "open",
      startsAt: future,
    });

    const cookie = await loginAs(MASTER_USERNAME, MASTER_PASSWORD);
    const res = await request("GET", "/api/oddspapi/tournaments?sportId=13", { cookie });
    expect(res.status).toBe(200);

    const body = (await res.json()) as Array<{
      tournamentId: number;
      tournamentName: string;
      upcomingFixtures: number;
      liveFixtures: number;
      categorySlug: string;
      categoryName: string;
    }>;
    expect(body).toHaveLength(1);
    const t = body[0]!;
    expect(t.tournamentId).toBe(109);
    expect(t.tournamentName).toBe("MLB");
    expect(t.upcomingFixtures).toBe(1);
    expect(t.liveFixtures).toBe(1);
    expect(t.categorySlug).toBe("usa");
    expect(t.categoryName).toBe("USA");
  });

  txTest("excludes fixtures with tournament_id = 0 (un-backfilled rows)", async () => {
    await seedFreshMaster();

    const future = new Date(Date.now() + 86_400_000);
    // Real tournament
    await seedFixture({
      oddspapiEventId: "evt-1",
      sport: "baseball",
      league: "MLB",
      tournamentId: 109,
      status: "open",
      startsAt: future,
    });
    // Pre-migration row with default tournament_id = 0
    await seedFixture({
      oddspapiEventId: "evt-0",
      sport: "baseball",
      league: "tournament-0",
      tournamentId: 0,
      status: "open",
      startsAt: future,
    });

    const cookie = await loginAs(MASTER_USERNAME, MASTER_PASSWORD);
    const res = await request("GET", "/api/oddspapi/tournaments?sportId=13", { cookie });
    const body = (await res.json()) as Array<{ tournamentId: number }>;
    const ids = body.map((r) => r.tournamentId).sort();
    expect(ids).toEqual([109]);
  });

  txTest("falls back to 'tournament-<id>' name when ID is not in TOURNAMENT_MAP", async () => {
    await seedFreshMaster();

    const future = new Date(Date.now() + 86_400_000);
    // tournament_id 999 isn't in TOURNAMENT_MAP yet
    await seedFixture({
      oddspapiEventId: "evt-unknown",
      sport: "baseball",
      league: "tournament-999",
      tournamentId: 999,
      status: "open",
      startsAt: future,
    });

    const cookie = await loginAs(MASTER_USERNAME, MASTER_PASSWORD);
    const res = await request("GET", "/api/oddspapi/tournaments?sportId=13", { cookie });
    const body = (await res.json()) as Array<{ tournamentId: number; tournamentName: string }>;
    expect(body).toHaveLength(1);
    expect(body[0]!.tournamentId).toBe(999);
    expect(body[0]!.tournamentName).toBe("tournament-999");
  });

  txTest("upcomingFixtures only counts status=open AND starts_at > NOW()", async () => {
    await seedFreshMaster();

    const future = new Date(Date.now() + 86_400_000);
    const past = new Date(Date.now() - 86_400_000);

    // Open but in the past — should NOT count as upcoming
    await seedFixture({
      oddspapiEventId: "evt-past-open",
      sport: "baseball",
      league: "MLB",
      tournamentId: 109,
      status: "open",
      startsAt: past,
    });
    // Open and in the future — counts
    await seedFixture({
      oddspapiEventId: "evt-future-open",
      sport: "baseball",
      league: "MLB",
      tournamentId: 109,
      status: "open",
      startsAt: future,
    });
    // Live — counts as live, not upcoming
    await seedFixture({
      oddspapiEventId: "evt-live",
      sport: "baseball",
      league: "MLB",
      tournamentId: 109,
      status: "live",
      startsAt: future,
    });

    const cookie = await loginAs(MASTER_USERNAME, MASTER_PASSWORD);
    const res = await request("GET", "/api/oddspapi/tournaments?sportId=13", { cookie });
    const body = (await res.json()) as Array<{ upcomingFixtures: number; liveFixtures: number }>;
    expect(body).toHaveLength(1);
    expect(body[0]!.upcomingFixtures).toBe(1);
    expect(body[0]!.liveFixtures).toBe(1);
  });
});

/* ========================================================================== */
/* GET /api/oddspapi/participants                                             */
/* ========================================================================== */

describe("GET /api/oddspapi/participants", () => {
  txTest("401 when no session cookie", async () => {
    await seedFreshMaster();
    const res = await request("GET", "/api/oddspapi/participants?sportId=13&participantIds=3644");
    expect(res.status).toBe(401);
  });

  txTest("400 when sportId is missing", async () => {
    await seedFreshMaster();
    const cookie = await loginAs(MASTER_USERNAME, MASTER_PASSWORD);
    const res = await request("GET", "/api/oddspapi/participants?participantIds=3644", { cookie });
    expect(res.status).toBe(400);
  });

  txTest("400 when participantIds is missing", async () => {
    await seedFreshMaster();
    const cookie = await loginAs(MASTER_USERNAME, MASTER_PASSWORD);
    const res = await request("GET", "/api/oddspapi/participants?sportId=13", { cookie });
    expect(res.status).toBe(400);
  });

  txTest("400 when participantIds is empty (just commas)", async () => {
    await seedFreshMaster();
    const cookie = await loginAs(MASTER_USERNAME, MASTER_PASSWORD);
    const res = await request(
      "GET",
      "/api/oddspapi/participants?sportId=13&participantIds=,,",
      { cookie },
    );
    expect(res.status).toBe(400);
  });

  txTest("400 when participantIds contains non-integer junk", async () => {
    await seedFreshMaster();
    const cookie = await loginAs(MASTER_USERNAME, MASTER_PASSWORD);
    const res = await request(
      "GET",
      "/api/oddspapi/participants?sportId=13&participantIds=3644,abc,3649",
      { cookie },
    );
    expect(res.status).toBe(400);
  });

  txTest("returns ESPN-style abbrs for known MLB IDs", async () => {
    await seedFreshMaster();
    const cookie = await loginAs(MASTER_USERNAME, MASTER_PASSWORD);
    const res = await request(
      "GET",
      "/api/oddspapi/participants?sportId=13&participantIds=3644,3649,3654,5929",
      { cookie },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, string>;
    expect(body).toEqual({
      "3644": "CWS",
      "3649": "MIN",
      "3654": "NYY",
      "5929": "LAA",
    });
  });

  txTest("falls back to '#<id>' for unknown IDs in known sport", async () => {
    await seedFreshMaster();
    const cookie = await loginAs(MASTER_USERNAME, MASTER_PASSWORD);
    const res = await request(
      "GET",
      "/api/oddspapi/participants?sportId=13&participantIds=3644,999999",
      { cookie },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, string>;
    expect(body).toEqual({
      "3644": "CWS",
      "999999": "#999999",
    });
  });

  txTest("returns all '#<id>' fallback for unmapped sport (e.g. tennis)", async () => {
    await seedFreshMaster();
    const cookie = await loginAs(MASTER_USERNAME, MASTER_PASSWORD);
    // Tennis (sportId 12) has no participant map yet
    const res = await request(
      "GET",
      "/api/oddspapi/participants?sportId=12&participantIds=100,200",
      { cookie },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, string>;
    expect(body).toEqual({ "100": "#100", "200": "#200" });
  });

  txTest("dedupes repeated IDs in the input CSV", async () => {
    await seedFreshMaster();
    const cookie = await loginAs(MASTER_USERNAME, MASTER_PASSWORD);
    const res = await request(
      "GET",
      "/api/oddspapi/participants?sportId=13&participantIds=3644,3644,3649,3644",
      { cookie },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, string>;
    // Object keys are unique by definition; check both are present
    expect(Object.keys(body).sort()).toEqual(["3644", "3649"]);
    expect(body["3644"]).toBe("CWS");
    expect(body["3649"]).toBe("MIN");
  });

  txTest("ignores empty CSV slots between commas", async () => {
    await seedFreshMaster();
    const cookie = await loginAs(MASTER_USERNAME, MASTER_PASSWORD);
    // "3644,,3649" should be treated as two valid IDs
    const res = await request(
      "GET",
      "/api/oddspapi/participants?sportId=13&participantIds=3644,,3649",
      { cookie },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, string>;
    expect(body).toEqual({ "3644": "CWS", "3649": "MIN" });
  });
});
