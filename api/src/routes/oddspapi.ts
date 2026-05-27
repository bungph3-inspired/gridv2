// OddsPapi proxy routes — replaces the in-browser OddsPapi client.
//
// Per spec `projects/GridV2/specs/2026-05-27-oddspapi-proxy.md`, this is a
// 4-endpoint server-side proxy that mirrors the OddsPapi response shapes
// the existing frontend already parses. PR1 ships just the tournaments
// endpoint — markets, participants, and odds-by-tournaments land in PR2-4.
//
// Auth: every route runs requireSession + requireActive. No real-money risk,
// but issued accounts only — same model as /api/agents.

import { and, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { requireActive, requireSession } from "../auth/middleware";
import { db } from "../db/client";
import { fixtures } from "../db/schema";
import { TOURNAMENT_MAP } from "../data/tournament-map";
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

export const oddspapiRoutes = new Hono<AppEnv>();

// Every route below runs through requireSession + requireActive first.
oddspapiRoutes.use("*", requireSession, requireActive);

/* -------------------------------------------------------------------------- */
/* GET /tournaments?sportId=N                                                 */
/*                                                                            */
/* Aggregates fixtures by tournament_id within a sport. Returns the shape     */
/* the frontend's `fetchTournaments()` in src/api.js expects.                 */
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
  if (!sport) {
    // Unknown sport — return an empty array rather than 404, matching the
    // upstream behavior and giving the frontend a no-op response to render.
    return c.json([]);
  }

  // GROUP BY tournament_id with conditional counts. Postgres FILTER syntax
  // is the cleanest way to express "count rows where X" alongside other
  // counts in a single scan.
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

  // Drop tournament_id=0 (the schema default for rows that pre-date the
  // column or aren't yet refreshed by the poller).
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
