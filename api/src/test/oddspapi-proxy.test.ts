// /api/oddspapi/* proxy routes. PR1 added /tournaments, PR2 added /participants,
// PR3 adds /markets.
//
// Pattern matches auth.test.ts: seedFreshMaster() inside txTest, login to
// pick up a session cookie, hit the route. Fixtures + markets are seeded with
// raw drizzle inserts on the same transactional `db` Proxy.

import { describe, expect } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "../db/client";
import { fixtures, markets } from "../db/schema";
import { hashPassword } from "../auth/password";
import { synthMarketId, synthOutcomeIds } from "../data/synthetic-ids";
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

async function seedFixture(opts: {
  oddspapiEventId: string;
  sport: string;
  league: string;
  tournamentId: number;
  status: string;
  startsAt: Date;
}): Promise<number> {
  const rows = await db
    .insert(fixtures)
    .values({
      oddspapiEventId: opts.oddspapiEventId,
      sport: opts.sport,
      league: opts.league,
      tournamentId: opts.tournamentId,
      participant1Id: 1,
      participant2Id: 2,
      startsAt: opts.startsAt,
      status: opts.status,
    })
    .returning({ id: fixtures.id });
  return rows[0]!.id;
}

async function seedMarket(opts: {
  fixtureId: number;
  marketType: string;
  line: string | null;
  isAltLine?: boolean;
  oddspapiMarketId: string;
}): Promise<void> {
  await db.insert(markets).values({
    fixtureId: opts.fixtureId,
    marketType: opts.marketType,
    period: "fulltime",
    line: opts.line,
    isAltLine: opts.isAltLine ?? false,
    oddspapiMarketId: opts.oddspapiMarketId,
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
    const res = await request("GET", "/api/oddspapi/tournaments?sportId=99", { cookie });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  txTest("groups fixtures by tournament_id and counts open/live correctly", async () => {
    await seedFreshMaster();
    const future = new Date(Date.now() + 86_400_000);
    const past = new Date(Date.now() - 86_400_000);
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
    expect(body[0]!.tournamentId).toBe(109);
    expect(body[0]!.tournamentName).toBe("MLB");
    expect(body[0]!.upcomingFixtures).toBe(1);
    expect(body[0]!.liveFixtures).toBe(1);
    expect(body[0]!.categorySlug).toBe("usa");
    expect(body[0]!.categoryName).toBe("USA");
  });

  txTest("excludes fixtures with tournament_id = 0", async () => {
    await seedFreshMaster();
    const future = new Date(Date.now() + 86_400_000);
    await seedFixture({
      oddspapiEventId: "evt-1",
      sport: "baseball",
      league: "MLB",
      tournamentId: 109,
      status: "open",
      startsAt: future,
    });
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
    expect(body.map((r) => r.tournamentId).sort()).toEqual([109]);
  });

  txTest("falls back to 'tournament-<id>' name when ID is not in TOURNAMENT_MAP", async () => {
    await seedFreshMaster();
    const future = new Date(Date.now() + 86_400_000);
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
    await seedFixture({
      oddspapiEventId: "evt-past-open",
      sport: "baseball",
      league: "MLB",
      tournamentId: 109,
      status: "open",
      startsAt: past,
    });
    await seedFixture({
      oddspapiEventId: "evt-future-open",
      sport: "baseball",
      league: "MLB",
      tournamentId: 109,
      status: "open",
      startsAt: future,
    });
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
    const res = await request("GET", "/api/oddspapi/participants?sportId=13&participantIds=,,", {
      cookie,
    });
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
    expect(body).toEqual({ "3644": "CWS", "999999": "#999999" });
  });

  txTest("returns all '#<id>' fallback for unmapped sport (e.g. tennis)", async () => {
    await seedFreshMaster();
    const cookie = await loginAs(MASTER_USERNAME, MASTER_PASSWORD);
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
    expect(Object.keys(body).sort()).toEqual(["3644", "3649"]);
    expect(body["3644"]).toBe("CWS");
    expect(body["3649"]).toBe("MIN");
  });

  txTest("ignores empty CSV slots between commas", async () => {
    await seedFreshMaster();
    const cookie = await loginAs(MASTER_USERNAME, MASTER_PASSWORD);
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

/* ========================================================================== */
/* GET /api/oddspapi/markets                                                  */
/* ========================================================================== */

describe("GET /api/oddspapi/markets", () => {
  txTest("401 when no session cookie", async () => {
    await seedFreshMaster();
    const res = await request("GET", "/api/oddspapi/markets?sportId=13");
    expect(res.status).toBe(401);
  });

  txTest("400 when sportId is missing", async () => {
    await seedFreshMaster();
    const cookie = await loginAs(MASTER_USERNAME, MASTER_PASSWORD);
    const res = await request("GET", "/api/oddspapi/markets", { cookie });
    expect(res.status).toBe(400);
  });

  txTest("400 when sportId is not an integer", async () => {
    await seedFreshMaster();
    const cookie = await loginAs(MASTER_USERNAME, MASTER_PASSWORD);
    const res = await request("GET", "/api/oddspapi/markets?sportId=abc", { cookie });
    expect(res.status).toBe(400);
  });

  txTest("returns empty array for unknown sportId", async () => {
    await seedFreshMaster();
    const cookie = await loginAs(MASTER_USERNAME, MASTER_PASSWORD);
    const res = await request("GET", "/api/oddspapi/markets?sportId=99", { cookie });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  txTest("dedupes catalog across multiple fixtures with the same market combos", async () => {
    await seedFreshMaster();
    const future = new Date(Date.now() + 86_400_000);

    // Two MLB fixtures, each with moneyline + totals 7.5 + spreads -1.5.
    // Catalog should have just three entries, not six.
    for (const evtId of ["evt-a", "evt-b"]) {
      const fxId = await seedFixture({
        oddspapiEventId: evtId,
        sport: "baseball",
        league: "MLB",
        tournamentId: 109,
        status: "open",
        startsAt: future,
      });
      await seedMarket({
        fixtureId: fxId,
        marketType: "moneyline",
        line: null,
        oddspapiMarketId: `${evtId}-ml`,
      });
      await seedMarket({
        fixtureId: fxId,
        marketType: "totals",
        line: "7.5",
        oddspapiMarketId: `${evtId}-t75`,
      });
      await seedMarket({
        fixtureId: fxId,
        marketType: "spreads",
        line: "-1.5",
        oddspapiMarketId: `${evtId}-s15`,
      });
    }

    const cookie = await loginAs(MASTER_USERNAME, MASTER_PASSWORD);
    const res = await request("GET", "/api/oddspapi/markets?sportId=13", { cookie });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ marketType: string; handicap: number }>;
    expect(body).toHaveLength(3);
    const byType = Object.fromEntries(body.map((m) => [m.marketType, m]));
    expect(byType.moneyline).toBeDefined();
    expect(byType.spreads).toBeDefined();
    expect(byType.totals).toBeDefined();
  });

  txTest("handicap is 0 for moneyline, the line for spreads/totals", async () => {
    await seedFreshMaster();
    const future = new Date(Date.now() + 86_400_000);
    const fxId = await seedFixture({
      oddspapiEventId: "evt-h",
      sport: "baseball",
      league: "MLB",
      tournamentId: 109,
      status: "open",
      startsAt: future,
    });
    await seedMarket({ fixtureId: fxId, marketType: "moneyline", line: null, oddspapiMarketId: "ml" });
    await seedMarket({ fixtureId: fxId, marketType: "spreads", line: "-1.5", oddspapiMarketId: "s" });
    await seedMarket({ fixtureId: fxId, marketType: "totals", line: "7.5", oddspapiMarketId: "t" });

    const cookie = await loginAs(MASTER_USERNAME, MASTER_PASSWORD);
    const res = await request("GET", "/api/oddspapi/markets?sportId=13", { cookie });
    const body = (await res.json()) as Array<{ marketType: string; handicap: number }>;
    const byType = Object.fromEntries(body.map((m) => [m.marketType, m]));
    expect(byType.moneyline!.handicap).toBe(0);
    expect(byType.spreads!.handicap).toBe(-1.5);
    expect(byType.totals!.handicap).toBe(7.5);
  });

  txTest("emits stable synthetic marketId + outcome IDs", async () => {
    await seedFreshMaster();
    const future = new Date(Date.now() + 86_400_000);
    const fxId = await seedFixture({
      oddspapiEventId: "evt-s",
      sport: "baseball",
      league: "MLB",
      tournamentId: 109,
      status: "open",
      startsAt: future,
    });
    await seedMarket({ fixtureId: fxId, marketType: "moneyline", line: null, oddspapiMarketId: "ml" });

    const cookie = await loginAs(MASTER_USERNAME, MASTER_PASSWORD);
    const res = await request("GET", "/api/oddspapi/markets?sportId=13", { cookie });
    const body = (await res.json()) as Array<{
      marketId: number;
      outcomes: Array<{ outcomeId: number; outcomeName: string }>;
    }>;
    expect(body).toHaveLength(1);

    // Recompute the expected IDs via the same helpers — that's the contract.
    const expectedMid = synthMarketId("moneyline", null);
    const [expectedOid1, expectedOid2] = synthOutcomeIds(expectedMid);
    expect(body[0]!.marketId).toBe(expectedMid);
    expect(body[0]!.outcomes[0]!.outcomeId).toBe(expectedOid1);
    expect(body[0]!.outcomes[1]!.outcomeId).toBe(expectedOid2);
    expect(body[0]!.outcomes[0]!.outcomeName).toBe("Home");
    expect(body[0]!.outcomes[1]!.outcomeName).toBe("Away");
  });

  txTest("totals get [Over, Under] outcome names", async () => {
    await seedFreshMaster();
    const future = new Date(Date.now() + 86_400_000);
    const fxId = await seedFixture({
      oddspapiEventId: "evt-t",
      sport: "baseball",
      league: "MLB",
      tournamentId: 109,
      status: "open",
      startsAt: future,
    });
    await seedMarket({ fixtureId: fxId, marketType: "totals", line: "7.5", oddspapiMarketId: "t75" });

    const cookie = await loginAs(MASTER_USERNAME, MASTER_PASSWORD);
    const res = await request("GET", "/api/oddspapi/markets?sportId=13", { cookie });
    const body = (await res.json()) as Array<{
      outcomes: Array<{ outcomeName: string }>;
    }>;
    expect(body[0]!.outcomes.map((o) => o.outcomeName)).toEqual(["Over", "Under"]);
  });

  txTest("response shape matches spec: marketLength 2, playerProp false, period 'result'", async () => {
    await seedFreshMaster();
    const future = new Date(Date.now() + 86_400_000);
    const fxId = await seedFixture({
      oddspapiEventId: "evt-shape",
      sport: "baseball",
      league: "MLB",
      tournamentId: 109,
      status: "open",
      startsAt: future,
    });
    await seedMarket({ fixtureId: fxId, marketType: "moneyline", line: null, oddspapiMarketId: "ml" });

    const cookie = await loginAs(MASTER_USERNAME, MASTER_PASSWORD);
    const res = await request("GET", "/api/oddspapi/markets?sportId=13", { cookie });
    const body = (await res.json()) as Array<{
      marketLength: number;
      sportId: number;
      period: string;
      playerProp: boolean;
      marketName: string;
    }>;
    expect(body[0]!.marketLength).toBe(2);
    expect(body[0]!.sportId).toBe(13);
    expect(body[0]!.period).toBe("result");
    expect(body[0]!.playerProp).toBe(false);
    expect(body[0]!.marketName).toBe("Moneyline");
  });

  txTest("scoped by sport — basketball markets don't appear in baseball catalog", async () => {
    await seedFreshMaster();
    const future = new Date(Date.now() + 86_400_000);

    const mlbFx = await seedFixture({
      oddspapiEventId: "evt-mlb",
      sport: "baseball",
      league: "MLB",
      tournamentId: 109,
      status: "open",
      startsAt: future,
    });
    await seedMarket({
      fixtureId: mlbFx,
      marketType: "moneyline",
      line: null,
      oddspapiMarketId: "ml-mlb",
    });

    const nbaFx = await seedFixture({
      oddspapiEventId: "evt-nba",
      sport: "basketball",
      league: "NBA",
      tournamentId: 132,
      status: "open",
      startsAt: future,
    });
    await seedMarket({
      fixtureId: nbaFx,
      marketType: "spreads",
      line: "-6.5",
      oddspapiMarketId: "sp-nba",
    });
    await seedMarket({
      fixtureId: nbaFx,
      marketType: "totals",
      line: "220.5",
      oddspapiMarketId: "t-nba",
    });

    const cookie = await loginAs(MASTER_USERNAME, MASTER_PASSWORD);
    const baseballRes = await request("GET", "/api/oddspapi/markets?sportId=13", { cookie });
    const baseballBody = (await baseballRes.json()) as Array<{ marketType: string }>;
    expect(baseballBody.map((m) => m.marketType)).toEqual(["moneyline"]);

    const basketballRes = await request("GET", "/api/oddspapi/markets?sportId=11", { cookie });
    const basketballBody = (await basketballRes.json()) as Array<{ marketType: string }>;
    expect(basketballBody.map((m) => m.marketType).sort()).toEqual(["spreads", "totals"]);
  });
});
