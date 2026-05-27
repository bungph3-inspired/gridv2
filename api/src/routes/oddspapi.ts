// OddsPapi proxy routes — replaces the in-browser OddsPapi client.
//
// Per spec `projects/GridV2/specs/2026-05-27-oddspapi-proxy.md`, this is a
// 4-endpoint server-side proxy that mirrors the OddsPapi response shapes
// the existing frontend already parses. Endpoints land per PR:
//   PR1 — /tournaments
//   PR2 — /participants
//   PR3 — /markets         ← this PR
//   PR4 — /odds-by-tournaments
//
// Auth: every route runs requireSession + requireActive. No real-money risk,
// but issued accounts only — same model as /api/agents.

import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { requireActive, requireSession } from "../auth/middleware";
import { db } from "../db/client";
import { fixtures, markets } from "../db/schema";
import { TOURNAMENT_MAP } from "../data/tournament-map";
import { MLB_PARTICIPANTS } from "../data/mlb-participants";
import {
  marketName,
  outcomeNames,
  synthMarketId,
  synthOutcomeIds,
} from "../data/synthetic-ids";
import type { AppEnv } from "../auth/types";

// Inverse of the parser's SPORT_BY_ID — proxy clients pass numeric sportId
// (matches OddsPapi convention) and we map back to our stored sport string.
const SPORT_BY_ID: Record<number, string> = {
  10: "soccer",
  11: "basketball",
  12: "tennis",
  13: "baseball",
  14: "american-football",
  15: "ice-hockey",
};

// Per-sport participant maps. Only baseball has coverage in PR2; other sports
// fall through to all-fallback responses until their maps land.
const PARTICIPANTS_BY_SPORT: Record<number, Record<number, string>> = {
  13: MLB_PARTICIPANTS,
};

/** Build the `#<id>` fallback string used when a participant ID isn't mapped. */
function fallbackAbbr(id: number): string {
  return `#${id}`;
}

export const oddspapiRoutes = new Hono<AppEnv>();

// Every route below runs through requireSession + requireActive first.
oddspapiRoutes.use("*", requireSession, requireActive);

/* -------------------------------------------------------------------------- */
/* GET /tournaments?sportId=N                                                 */
/* -------------------------------------------------------------------------- */

oddspapiRoutes.get("/tournaments", async (c) => {
  const sportIdRaw = c.req.query("sportId");
  const sportId = sportIdRaw !== undefined ? Number(sportIdRaw) : NaN;
  if (!Number.isFinite(sportId) || !Number.isInteger(sportId)) {
    return c.json(
      { error: "bad_request", detail: "sportId is required and must be an integer" },
      400,
    );
  }

  const sport = SPORT_BY_ID[sportId];
  if (!sport) return c.json([]);

  const rows = await db
    .select({
      tournamentId: fixtures.tournamentId,
      upcomingFixtures: sql<string>`COUNT(*) FILTER (
        WHERE ${fixtures.status} = 'open' AND ${fixtures.startsAt} > NOW()
      )`.as("upcoming_fixtures"),
      liveFixtures: sql<string>`COUNT(*) FILTER (
        WHERE ${fixtures.status} = 'live'
      )`.as("live_fixtures"),
    })
    .from(fixtures)
    .where(eq(fixtures.sport, sport))
    .groupBy(fixtures.tournamentId);

  const result = rows
    .filter((r) => r.tournamentId !== 0)
    .map((r) => {
      const meta = TOURNAMENT_MAP[r.tournamentId];
      return {
        tournamentId: r.tournamentId,
        tournamentName: meta?.tournamentName ?? `tournament-${r.tournamentId}`,
        upcomingFixtures: Number(r.upcomingFixtures),
        liveFixtures: Number(r.liveFixtures),
        categorySlug: meta?.categorySlug ?? "",
        categoryName: meta?.categoryName ?? "",
      };
    });

  return c.json(result);
});

/* -------------------------------------------------------------------------- */
/* GET /participants?sportId=N&participantIds=A,B,C                          */
/* -------------------------------------------------------------------------- */

oddspapiRoutes.get("/participants", async (c) => {
  const sportIdRaw = c.req.query("sportId");
  const sportId = sportIdRaw !== undefined ? Number(sportIdRaw) : NaN;
  if (!Number.isFinite(sportId) || !Number.isInteger(sportId)) {
    return c.json(
      { error: "bad_request", detail: "sportId is required and must be an integer" },
      400,
    );
  }

  const participantIdsRaw = c.req.query("participantIds") ?? "";
  const ids: number[] = [];
  for (const part of participantIdsRaw.split(",")) {
    const trimmed = part.trim();
    if (trimmed === "") continue;
    const n = Number(trimmed);
    if (!Number.isFinite(n) || !Number.isInteger(n)) {
      return c.json(
        {
          error: "bad_request",
          detail: `participantIds must be a CSV of integers; got "${trimmed}"`,
        },
        400,
      );
    }
    ids.push(n);
  }
  if (ids.length === 0) {
    return c.json(
      { error: "bad_request", detail: "participantIds is required and must be non-empty" },
      400,
    );
  }

  const uniqueIds = Array.from(new Set(ids));
  const map = PARTICIPANTS_BY_SPORT[sportId] ?? {};
  const result: Record<string, string> = {};
  for (const id of uniqueIds) {
    result[String(id)] = map[id] ?? fallbackAbbr(id);
  }
  return c.json(result);
});

/* -------------------------------------------------------------------------- */
/* GET /markets?sportId=N                                                     */
/*                                                                            */
/* Returns the catalog of distinct (marketType, line, period) combinations    */
/* seen in fixtures of this sport. Synthetic marketId + outcomeIds via         */
/* synthMarketId/synthOutcomeIds (PR4's odds-by-tournaments uses the same      */
/* functions, so IDs match across both responses by construction).             */
/* -------------------------------------------------------------------------- */

oddspapiRoutes.get("/markets", async (c) => {
  const sportIdRaw = c.req.query("sportId");
  const sportId = sportIdRaw !== undefined ? Number(sportIdRaw) : NaN;
  if (!Number.isFinite(sportId) || !Number.isInteger(sportId)) {
    return c.json(
      { error: "bad_request", detail: "sportId is required and must be an integer" },
      400,
    );
  }

  const sport = SPORT_BY_ID[sportId];
  if (!sport) return c.json([]);

  // GROUP BY (market_type, line, period) gives us the unique catalog rows.
  // Volume is small — for MLB with ~30 fixtures × ~38 markets, distinct
  // combos are ~50-80 rows. No index needed.
  const rows = await db
    .select({
      marketType: markets.marketType,
      line: markets.line,
      period: markets.period,
    })
    .from(markets)
    .innerJoin(fixtures, eq(markets.fixtureId, fixtures.id))
    .where(eq(fixtures.sport, sport))
    .groupBy(markets.marketType, markets.line, markets.period);

  const result = rows.map((r) => {
    const marketId = synthMarketId(r.marketType, r.line, r.period);
    const [oid1, oid2] = synthOutcomeIds(marketId);
    const [name1, name2] = outcomeNames(r.marketType);
    return {
      marketId,
      marketName: marketName(r.marketType, r.line),
      marketLength: 2,
      sportId,
      handicap: r.line !== null ? Number(r.line) : 0,
      // Spec mandates "result" regardless of our DB's "fulltime" string —
      // keeps the response shape stable when non-fulltime periods land.
      period: "result",
      marketType: r.marketType,
      playerProp: false,
      outcomes: [
        { outcomeId: oid1, outcomeName: name1 },
        { outcomeId: oid2, outcomeName: name2 },
      ],
    };
  });

  return c.json(result);
});
