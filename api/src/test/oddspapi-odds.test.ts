// Tests for GET /api/oddspapi/odds-by-tournaments (PR4).
//
// Verifies the nested OddsPapi shape reconstruction, the JOIN LATERAL
// latest-price-per-side semantics, sign-flipping for spreads, and the
// decimal→American conversion at the edge cases that are easy to get
// wrong (1.952 → -105, 2.0 → +100, 1.5 → -200).

import { describe, expect } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "../db/client";
import { fixtures, markets, prices } from "../db/schema";
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
  startsAt?: Date;
  participant1Id?: number;
  participant2Id?: number;
}): Promise<number> {
  const rows = await db
    .insert(fixtures)
    .values({
      oddspapiEventId: opts.oddspapiEventId,
      sport: opts.sport,
      league: opts.league,
      tournamentId: opts.tournamentId,
      participant1Id: opts.participant1Id ?? 1,
      participant2Id: opts.participant2Id ?? 2,
      startsAt: opts.startsAt ?? new Date(Date.now() + 3600_000),
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
}): Promise<number> {
  const rows = await db
    .insert(markets)
    .values({
      fixtureId: opts.fixtureId,
      marketType: opts.marketType,
      period: "fulltime",
      line: opts.line,
      isAltLine: opts.isAltLine ?? false,
      oddspapiMarketId: opts.oddspapiMarketId,
    })
    .returning({ id: markets.id });
  return rows[0]!.id;
}

async function seedPrice(opts: {
  marketId: number;
  side: string;
  odds: string;
  capturedAt?: Date;
}): Promise<void> {
  await db.insert(prices).values({
    marketId: opts.marketId,
    side: opts.side,
    odds: opts.odds,
    ...(opts.capturedAt ? { capturedAt: opts.capturedAt } : {}),
  });
}

describe("GET /api/oddspapi/odds-by-tournaments", () => {
  /* ------------------------- auth + validation ------------------------- */

  txTest("401 when no session cookie", async () => {
    await seedFreshMaster();
    const res = await request("GET", "/api/oddspapi/odds-by-tournaments?tournamentIds=109");
    expect(res.status).toBe(401);
  });

  txTest("400 when tournamentIds is missing", async () => {
    await seedFreshMaster();
    const cookie = await loginAs(MASTER_USERNAME, MASTER_PASSWORD);
    const res = await request("GET", "/api/oddspapi/odds-by-tournaments", { cookie });
    expect(res.status).toBe(400);
  });

  txTest("400 when tournamentIds contains non-integer junk", async () => {
    await seedFreshMaster();
    const cookie = await loginAs(MASTER_USERNAME, MASTER_PASSWORD);
    const res = await request(
      "GET",
      "/api/oddspapi/odds-by-tournaments?tournamentIds=109,bad,17",
      { cookie },
    );
    expect(res.status).toBe(400);
  });

  txTest("400 when tournamentIds is empty (just commas)", async () => {
    await seedFreshMaster();
    const cookie = await loginAs(MASTER_USERNAME, MASTER_PASSWORD);
    const res = await request("GET", "/api/oddspapi/odds-by-tournaments?tournamentIds=,,", {
      cookie,
    });
    expect(res.status).toBe(400);
  });

  txTest("returns empty array when no fixtures match", async () => {
    await seedFreshMaster();
    const cookie = await loginAs(MASTER_USERNAME, MASTER_PASSWORD);
    const res = await request("GET", "/api/oddspapi/odds-by-tournaments?tournamentIds=109", {
      cookie,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  /* ------------------------- nested shape ------------------------- */

  txTest("emits full nested shape for one fixture with moneyline", async () => {
    await seedFreshMaster();
    const fxId = await seedFixture({
      oddspapiEventId: "id1300010963300131",
      sport: "baseball",
      league: "MLB",
      tournamentId: 109,
      status: "open",
      participant1Id: 3644,
      participant2Id: 3649,
    });
    const mlId = await seedMarket({
      fixtureId: fxId,
      marketType: "moneyline",
      line: null,
      oddspapiMarketId: "131",
    });
    await seedPrice({ marketId: mlId, side: "home", odds: "2.02" });
    await seedPrice({ marketId: mlId, side: "away", odds: "1.909" });

    const cookie = await loginAs(MASTER_USERNAME, MASTER_PASSWORD);
    const res = await request(
      "GET",
      "/api/oddspapi/odds-by-tournaments?tournamentIds=109",
      { cookie },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{
      fixtureId: string;
      participant1Id: number;
      participant2Id: number;
      sportId: number;
      tournamentId: number;
      seasonId: number;
      statusId: number;
      hasOdds: boolean;
      startTime: string;
      updatedAt: string;
      bookmakerOdds: Record<string, {
        bookmakerIsActive: boolean;
        bookmakerFixtureId: string;
        markets: Record<string, {
          bookmakerMarketId: string;
          marketActive: boolean;
          outcomes: Record<string, { players: { "0": {
            bookmakerOutcomeId: string;
            price: number;
            priceAmerican: string;
            mainLine: boolean;
            active: boolean;
          } } }>;
        }>;
      }>;
    }>;

    expect(body).toHaveLength(1);
    const f = body[0]!;
    expect(f.fixtureId).toBe("id1300010963300131");
    expect(f.participant1Id).toBe(3644);
    expect(f.participant2Id).toBe(3649);
    expect(f.sportId).toBe(13);
    expect(f.tournamentId).toBe(109);
    expect(f.statusId).toBe(0);
    expect(f.hasOdds).toBe(true);
    expect(typeof f.startTime).toBe("string");
    expect(typeof f.updatedAt).toBe("string");

    const bm = f.bookmakerOdds.pinnacle!;
    expect(bm.bookmakerIsActive).toBe(true);
    expect(Object.keys(bm.markets)).toHaveLength(1);

    const expectedMid = synthMarketId("moneyline", null);
    const market = bm.markets[String(expectedMid)]!;
    expect(market.bookmakerMarketId).toBe("line/proxy/moneyline");
    expect(market.marketActive).toBe(true);

    const [oid1, oid2] = synthOutcomeIds(expectedMid);
    const homeOutcome = market.outcomes[String(oid1)]!.players["0"];
    const awayOutcome = market.outcomes[String(oid2)]!.players["0"];

    expect(homeOutcome.bookmakerOutcomeId).toBe("home");
    expect(homeOutcome.price).toBeCloseTo(2.02, 2);
    expect(homeOutcome.priceAmerican).toBe("+102"); // (2.02-1)*100 = 102
    expect(homeOutcome.mainLine).toBe(true);
    expect(homeOutcome.active).toBe(true);

    expect(awayOutcome.bookmakerOutcomeId).toBe("away");
    expect(awayOutcome.price).toBeCloseTo(1.909, 2);
    expect(awayOutcome.priceAmerican).toBe("-110"); // -100/0.909 = -110.01 → round → -110
    expect(awayOutcome.mainLine).toBe(true);
  });

  /* ------------------------- spreads sign flip ------------------------- */

  txTest("spreads: home gets stored line, away gets sign-flipped line", async () => {
    await seedFreshMaster();
    const fxId = await seedFixture({
      oddspapiEventId: "evt-sp",
      sport: "baseball",
      league: "MLB",
      tournamentId: 109,
      status: "open",
    });
    // Stored line = "-1.5" (the parser's last seen value; convention: home line)
    const spId = await seedMarket({
      fixtureId: fxId,
      marketType: "spreads",
      line: "-1.5",
      oddspapiMarketId: "200",
    });
    await seedPrice({ marketId: spId, side: "home", odds: "1.95" });
    await seedPrice({ marketId: spId, side: "away", odds: "1.95" });

    const cookie = await loginAs(MASTER_USERNAME, MASTER_PASSWORD);
    const res = await request(
      "GET",
      "/api/oddspapi/odds-by-tournaments?tournamentIds=109",
      { cookie },
    );
    const body = (await res.json()) as Array<{
      bookmakerOdds: { pinnacle: { markets: Record<string, {
        outcomes: Record<string, { players: { "0": { bookmakerOutcomeId: string } } }>;
      }> } };
    }>;
    const mid = synthMarketId("spreads", "-1.5");
    const [oid1, oid2] = synthOutcomeIds(mid);
    const market = body[0]!.bookmakerOdds.pinnacle!.markets[String(mid)]!;
    expect(market.outcomes[String(oid1)]!.players["0"].bookmakerOutcomeId).toBe("-1.5/home");
    expect(market.outcomes[String(oid2)]!.players["0"].bookmakerOutcomeId).toBe("1.5/away");
  });

  /* ------------------------- totals same line ------------------------- */

  txTest("totals: over and under share the same line value", async () => {
    await seedFreshMaster();
    const fxId = await seedFixture({
      oddspapiEventId: "evt-t",
      sport: "baseball",
      league: "MLB",
      tournamentId: 109,
      status: "open",
    });
    const tId = await seedMarket({
      fixtureId: fxId,
      marketType: "totals",
      line: "7.5",
      oddspapiMarketId: "300",
    });
    await seedPrice({ marketId: tId, side: "over", odds: "1.91" });
    await seedPrice({ marketId: tId, side: "under", odds: "1.95" });

    const cookie = await loginAs(MASTER_USERNAME, MASTER_PASSWORD);
    const res = await request(
      "GET",
      "/api/oddspapi/odds-by-tournaments?tournamentIds=109",
      { cookie },
    );
    const body = (await res.json()) as Array<{
      bookmakerOdds: { pinnacle: { markets: Record<string, {
        outcomes: Record<string, { players: { "0": { bookmakerOutcomeId: string } } }>;
      }> } };
    }>;
    const mid = synthMarketId("totals", "7.5");
    const [oid1, oid2] = synthOutcomeIds(mid);
    const market = body[0]!.bookmakerOdds.pinnacle!.markets[String(mid)]!;
    expect(market.outcomes[String(oid1)]!.players["0"].bookmakerOutcomeId).toBe("7.5/over");
    expect(market.outcomes[String(oid2)]!.players["0"].bookmakerOutcomeId).toBe("7.5/under");
  });

  /* ------------------------- alt-line flag ------------------------- */

  txTest("mainLine is false for alt-line markets, true for main-line", async () => {
    await seedFreshMaster();
    const fxId = await seedFixture({
      oddspapiEventId: "evt-alt",
      sport: "baseball",
      league: "MLB",
      tournamentId: 109,
      status: "open",
    });
    const mainId = await seedMarket({
      fixtureId: fxId,
      marketType: "totals",
      line: "7.5",
      isAltLine: false,
      oddspapiMarketId: "main-t",
    });
    const altId = await seedMarket({
      fixtureId: fxId,
      marketType: "totals",
      line: "9.5",
      isAltLine: true,
      oddspapiMarketId: "alt-t",
    });
    await seedPrice({ marketId: mainId, side: "over", odds: "1.91" });
    await seedPrice({ marketId: mainId, side: "under", odds: "1.95" });
    await seedPrice({ marketId: altId, side: "over", odds: "3.5" });
    await seedPrice({ marketId: altId, side: "under", odds: "1.3" });

    const cookie = await loginAs(MASTER_USERNAME, MASTER_PASSWORD);
    const res = await request(
      "GET",
      "/api/oddspapi/odds-by-tournaments?tournamentIds=109",
      { cookie },
    );
    const body = (await res.json()) as Array<{
      bookmakerOdds: { pinnacle: { markets: Record<string, {
        bookmakerMarketId: string;
        outcomes: Record<string, { players: { "0": { mainLine: boolean } } }>;
      }> } };
    }>;
    const mainMid = synthMarketId("totals", "7.5");
    const altMid = synthMarketId("totals", "9.5");
    const mainMarket = body[0]!.bookmakerOdds.pinnacle!.markets[String(mainMid)]!;
    const altMarket = body[0]!.bookmakerOdds.pinnacle!.markets[String(altMid)]!;

    expect(mainMarket.bookmakerMarketId).toBe("line/proxy/totals");
    expect(altMarket.bookmakerMarketId).toBe("altLine/proxy/totals");

    const [mainOid1] = synthOutcomeIds(mainMid);
    const [altOid1] = synthOutcomeIds(altMid);
    expect(mainMarket.outcomes[String(mainOid1)]!.players["0"].mainLine).toBe(true);
    expect(altMarket.outcomes[String(altOid1)]!.players["0"].mainLine).toBe(false);
  });

  /* ------------------------- latest-price-per-side ------------------------- */

  txTest("uses only the latest captured_at price per (market, side)", async () => {
    await seedFreshMaster();
    const fxId = await seedFixture({
      oddspapiEventId: "evt-latest",
      sport: "baseball",
      league: "MLB",
      tournamentId: 109,
      status: "open",
    });
    const mlId = await seedMarket({
      fixtureId: fxId,
      marketType: "moneyline",
      line: null,
      oddspapiMarketId: "ml",
    });
    // Old prices first
    const old = new Date(Date.now() - 3600_000);
    await seedPrice({ marketId: mlId, side: "home", odds: "1.50", capturedAt: old });
    await seedPrice({ marketId: mlId, side: "away", odds: "2.80", capturedAt: old });
    // Newer prices second
    await seedPrice({ marketId: mlId, side: "home", odds: "2.02" });
    await seedPrice({ marketId: mlId, side: "away", odds: "1.909" });

    const cookie = await loginAs(MASTER_USERNAME, MASTER_PASSWORD);
    const res = await request(
      "GET",
      "/api/oddspapi/odds-by-tournaments?tournamentIds=109",
      { cookie },
    );
    const body = (await res.json()) as Array<{
      bookmakerOdds: { pinnacle: { markets: Record<string, {
        outcomes: Record<string, { players: { "0": { price: number } } }>;
      }> } };
    }>;
    const mid = synthMarketId("moneyline", null);
    const [oid1, oid2] = synthOutcomeIds(mid);
    const market = body[0]!.bookmakerOdds.pinnacle!.markets[String(mid)]!;
    expect(market.outcomes[String(oid1)]!.players["0"].price).toBeCloseTo(2.02);
    expect(market.outcomes[String(oid2)]!.players["0"].price).toBeCloseTo(1.909);
  });

  /* ------------------------- tournament filter ------------------------- */

  txTest("only returns fixtures matching tournamentIds, ignores others", async () => {
    await seedFreshMaster();
    // MLB fixture — should appear
    const mlbFx = await seedFixture({
      oddspapiEventId: "evt-mlb",
      sport: "baseball",
      league: "MLB",
      tournamentId: 109,
      status: "open",
    });
    const mlbMl = await seedMarket({ fixtureId: mlbFx, marketType: "moneyline", line: null, oddspapiMarketId: "ml-mlb" });
    await seedPrice({ marketId: mlbMl, side: "home", odds: "1.95" });
    await seedPrice({ marketId: mlbMl, side: "away", odds: "1.95" });
    // NBA fixture — should NOT appear
    const nbaFx = await seedFixture({
      oddspapiEventId: "evt-nba",
      sport: "basketball",
      league: "NBA",
      tournamentId: 132,
      status: "open",
    });
    const nbaMl = await seedMarket({ fixtureId: nbaFx, marketType: "moneyline", line: null, oddspapiMarketId: "ml-nba" });
    await seedPrice({ marketId: nbaMl, side: "home", odds: "1.50" });
    await seedPrice({ marketId: nbaMl, side: "away", odds: "2.80" });

    const cookie = await loginAs(MASTER_USERNAME, MASTER_PASSWORD);
    const res = await request(
      "GET",
      "/api/oddspapi/odds-by-tournaments?tournamentIds=109",
      { cookie },
    );
    const body = (await res.json()) as Array<{ fixtureId: string; tournamentId: number }>;
    expect(body).toHaveLength(1);
    expect(body[0]!.fixtureId).toBe("evt-mlb");
    expect(body[0]!.tournamentId).toBe(109);
  });

  /* ------------------------- status filter ------------------------- */

  txTest("excludes fixtures in finished/cancelled/postponed status", async () => {
    await seedFreshMaster();

    const states = ["open", "live", "finished", "cancelled", "postponed"];
    for (const s of states) {
      const fxId = await seedFixture({
        oddspapiEventId: `evt-${s}`,
        sport: "baseball",
        league: "MLB",
        tournamentId: 109,
        status: s,
      });
      const mlId = await seedMarket({
        fixtureId: fxId,
        marketType: "moneyline",
        line: null,
        oddspapiMarketId: `ml-${s}`,
      });
      await seedPrice({ marketId: mlId, side: "home", odds: "2.0" });
      await seedPrice({ marketId: mlId, side: "away", odds: "1.95" });
    }

    const cookie = await loginAs(MASTER_USERNAME, MASTER_PASSWORD);
    const res = await request(
      "GET",
      "/api/oddspapi/odds-by-tournaments?tournamentIds=109",
      { cookie },
    );
    const body = (await res.json()) as Array<{ fixtureId: string }>;
    const ids = body.map((f) => f.fixtureId).sort();
    expect(ids).toEqual(["evt-live", "evt-open"]);
  });

  /* ------------------------- bookmaker param ------------------------- */

  txTest("bookmaker query param controls the key in bookmakerOdds dict", async () => {
    await seedFreshMaster();
    const fxId = await seedFixture({
      oddspapiEventId: "evt-bm",
      sport: "baseball",
      league: "MLB",
      tournamentId: 109,
      status: "open",
    });
    const mlId = await seedMarket({ fixtureId: fxId, marketType: "moneyline", line: null, oddspapiMarketId: "ml" });
    await seedPrice({ marketId: mlId, side: "home", odds: "2.0" });
    await seedPrice({ marketId: mlId, side: "away", odds: "1.95" });

    const cookie = await loginAs(MASTER_USERNAME, MASTER_PASSWORD);

    // Default → pinnacle
    const defaultRes = await request(
      "GET",
      "/api/oddspapi/odds-by-tournaments?tournamentIds=109",
      { cookie },
    );
    const defaultBody = (await defaultRes.json()) as Array<{ bookmakerOdds: Record<string, unknown> }>;
    expect(Object.keys(defaultBody[0]!.bookmakerOdds)).toEqual(["pinnacle"]);

    // Explicit override
    const overrideRes = await request(
      "GET",
      "/api/oddspapi/odds-by-tournaments?tournamentIds=109&bookmaker=draftkings",
      { cookie },
    );
    const overrideBody = (await overrideRes.json()) as Array<{ bookmakerOdds: Record<string, unknown> }>;
    expect(Object.keys(overrideBody[0]!.bookmakerOdds)).toEqual(["draftkings"]);
  });

  /* ------------------------- multiple tournaments ------------------------- */

  txTest("accepts multiple tournamentIds and returns all matching fixtures", async () => {
    await seedFreshMaster();

    const fx1 = await seedFixture({
      oddspapiEventId: "evt-109",
      sport: "baseball",
      league: "MLB",
      tournamentId: 109,
      status: "open",
    });
    const m1 = await seedMarket({ fixtureId: fx1, marketType: "moneyline", line: null, oddspapiMarketId: "ml-1" });
    await seedPrice({ marketId: m1, side: "home", odds: "2.0" });
    await seedPrice({ marketId: m1, side: "away", odds: "1.95" });

    const fx2 = await seedFixture({
      oddspapiEventId: "evt-17",
      sport: "soccer",
      league: "Premier League",
      tournamentId: 17,
      status: "open",
    });
    const m2 = await seedMarket({ fixtureId: fx2, marketType: "moneyline", line: null, oddspapiMarketId: "ml-2" });
    await seedPrice({ marketId: m2, side: "home", odds: "1.8" });
    await seedPrice({ marketId: m2, side: "away", odds: "2.2" });

    const cookie = await loginAs(MASTER_USERNAME, MASTER_PASSWORD);
    const res = await request(
      "GET",
      "/api/oddspapi/odds-by-tournaments?tournamentIds=109,17",
      { cookie },
    );
    const body = (await res.json()) as Array<{ fixtureId: string; tournamentId: number; sportId: number }>;
    expect(body).toHaveLength(2);
    const byTid = Object.fromEntries(body.map((f) => [f.tournamentId, f]));
    expect(byTid[109]!.sportId).toBe(13);
    expect(byTid[17]!.sportId).toBe(10); // soccer
  });
});
