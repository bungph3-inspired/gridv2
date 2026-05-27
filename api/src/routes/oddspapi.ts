// OddsPapi proxy routes — replaces the in-browser OddsPapi client.
//
// Per spec `projects/GridV2/specs/2026-05-27-oddspapi-proxy.md`, this is a
// 4-endpoint server-side proxy that mirrors the OddsPapi response shapes
// the existing frontend already parses. All endpoints land here after PR4:
//   PR1 — /tournaments
//   PR2 — /participants
//   PR3 — /markets
//   PR4 — /odds-by-tournaments  ← this PR
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
  normalizeLine,
  outcomeNames,
  synthMarketId,
  synthOutcomeIds,
} from "../data/synthetic-ids";
import { decimalToAmerican } from "../data/odds-conversion";
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

// Reverse map for /odds-by-tournaments which emits numeric sportId per
// fixture (we store the string sport name).
const SPORT_TO_ID: Record<string, number> = Object.fromEntries(
  Object.entries(SPORT_BY_ID).map(([k, v]) => [v, Number(k)]),
);

// Status string → numeric statusId for /odds-by-tournaments response.
// 0 = open (confirmed in parser STATUS_BY_ID), 1 = live (assumed). Other
// statuses don't appear in odds responses (parser filters them).
function statusToId(status: string): number {
  if (status === "open") return 0;
  if (status === "live") return 1;
  return 0;
}

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
    // Hash with "result" — matches the period we emit below. Hashing with the
    // DB's period ("fulltime") would produce a different marketId than callers
    // get when they recompute synthMarketId(type, line) with the default
    // ("result"), breaking the catalog ↔ odds join.
    const marketId = synthMarketId(r.marketType, r.line, "result");
    const [oid1, oid2] = synthOutcomeIds(marketId);
    const [name1, name2] = outcomeNames(r.marketType);
    return {
      marketId,
      marketName: marketName(r.marketType, r.line),
      marketLength: 2,
      sportId,
      handicap: r.line !== null ? Number(r.line) : 0,
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

/* -------------------------------------------------------------------------- */
/* GET /odds-by-tournaments?bookmaker=pinnacle&tournamentIds=109&oddsFormat=american
 *
 * The big one. Returns per-fixture odds in OddsPapi's nested
 *   bookmakerOdds.<bm>.markets[id].outcomes[oid].players["0"]
 * shape so the frontend's normalizeGames() in src/api.js can parse it without
 * change. Synthetic marketId + outcomeId come from the same helpers as
 * /markets so the two responses cross-reference cleanly.
 *
 * Query: one JOIN LATERAL pulls the latest captured_at price per (market,
 * side) for fixtures matching tournamentIds AND status in (open, live).
 * Then we reshape in JS — Postgres-side JSON aggregation would be cleaner
 * but the row volume here is tiny (MLB ~30 fixtures × 38 markets × 2 sides
 * = ~2300 rows tops).
 */
/* -------------------------------------------------------------------------- */

oddspapiRoutes.get("/odds-by-tournaments", async (c) => {
  // -- Validate tournamentIds (required, CSV of integers) --
  const tournamentIdsRaw = c.req.query("tournamentIds") ?? "";
  const tids: number[] = [];
  for (const part of tournamentIdsRaw.split(",")) {
    const trimmed = part.trim();
    if (trimmed === "") continue;
    const n = Number(trimmed);
    if (!Number.isFinite(n) || !Number.isInteger(n)) {
      return c.json(
        {
          error: "bad_request",
          detail: `tournamentIds must be a CSV of integers; got "${trimmed}"`,
        },
        400,
      );
    }
    tids.push(n);
  }
  if (tids.length === 0) {
    return c.json(
      { error: "bad_request", detail: "tournamentIds is required and must be non-empty" },
      400,
    );
  }

  // -- Optional knobs --
  // Bookmaker defaults to pinnacle (the only one our poller fetches today).
  // If a different bookmaker is passed, we still honor it as the key in the
  // bookmakerOdds dict but emit no data inside — the poller doesn't fetch
  // others. Future: per-bookmaker prices columns or separate tables.
  const bookmaker = (c.req.query("bookmaker") ?? "pinnacle").toLowerCase();
  // oddsFormat is ignored — we always emit both `price` (decimal) and
  // `priceAmerican` (string) so the frontend can pick.

  // -- One round-trip: latest price per (market, side), only for open/live
  //    fixtures in the requested tournaments. --
  type RawRow = {
    fixture_db_id: number;
    fixture_id: string;
    participant1_id: number;
    participant2_id: number;
    tournament_id: number;
    sport: string;
    starts_at: Date;
    status: string;
    updated_at: Date;
    market_db_id: number;
    market_type: string;
    line: string | null;
    period: string;
    is_alt_line: boolean;
    oddspapi_market_id: string;
    side: string;
    odds: string;
  };

  const rawRows = await db.execute<RawRow>(sql`
    SELECT
      f.id              AS fixture_db_id,
      f.oddspapi_event_id AS fixture_id,
      f.participant1_id, f.participant2_id,
      f.tournament_id, f.sport,
      f.starts_at, f.status, f.updated_at,
      m.id              AS market_db_id,
      m.market_type, m.line, m.period,
      m.is_alt_line, m.oddspapi_market_id,
      p.side, p.odds
    FROM fixtures f
    JOIN markets m ON m.fixture_id = f.id
    JOIN LATERAL (
      SELECT DISTINCT ON (side) side, odds
      FROM prices
      WHERE market_id = m.id
      ORDER BY side, captured_at DESC
    ) p ON true
    WHERE f.tournament_id IN (${sql.join(tids.map((t) => sql`${t}`), sql`, `)})
      AND f.status IN ('open', 'live')
    ORDER BY f.id, m.id, p.side
  `);

  // -- Reshape into nested OddsPapi response shape --
  type Player0 = {
    bookmakerOutcomeId: string;
    price: number;
    priceAmerican: string;
    mainLine: boolean;
    active: boolean;
  };
  type MarketEntry = {
    bookmakerMarketId: string;
    marketActive: boolean;
    outcomes: Record<string, { players: { "0": Player0 } }>;
  };
  type FixtureEntry = {
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
    bookmakerOdds: Record<
      string,
      {
        bookmakerIsActive: boolean;
        bookmakerFixtureId: string;
        markets: Record<string, MarketEntry>;
      }
    >;
  };

  const fixtureMap = new Map<number, FixtureEntry>();

  for (const row of rawRows) {
    let fix = fixtureMap.get(row.fixture_db_id);
    if (!fix) {
      fix = {
        fixtureId: row.fixture_id,
        // bigint columns come back as strings from postgres-js (because JS
        // numbers can't represent bigints > 2^53). Sports IDs are nowhere
        // near that range, so Number() cast is safe and gives the frontend
        // actual numbers as the spec response shape expects.
        participant1Id: Number(row.participant1_id),
        participant2Id: Number(row.participant2_id),
        sportId: SPORT_TO_ID[row.sport] ?? 0,
        tournamentId: Number(row.tournament_id),
        seasonId: 0, // not tracked
        statusId: statusToId(row.status),
        hasOdds: true,
        startTime: new Date(row.starts_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString(),
        bookmakerOdds: {
          [bookmaker]: {
            bookmakerIsActive: true,
            bookmakerFixtureId: "", // not stored upstream-side; empty is harmless
            markets: {},
          },
        },
      };
      fixtureMap.set(row.fixture_db_id, fix);
    }

    const bmEntry = fix.bookmakerOdds[bookmaker]!;
    // Hash with "result" (not row.period) to match the catalog endpoint.
    const mid = synthMarketId(row.market_type, row.line, "result");
    let market = bmEntry.markets[String(mid)];
    if (!market) {
      market = {
        bookmakerMarketId: reconstructBookmakerMarketId(row.is_alt_line, row.market_type),
        marketActive: true,
        outcomes: {},
      };
      bmEntry.markets[String(mid)] = market;
    }

    const [oid1, oid2] = synthOutcomeIds(mid);
    const isFirst = isFirstSide(row.market_type, row.side);
    const outcomeId = isFirst ? oid1 : oid2;
    const decimal = Number(row.odds);
    market.outcomes[String(outcomeId)] = {
      players: {
        "0": {
          bookmakerOutcomeId: reconstructBookmakerOutcomeId(
            row.market_type,
            row.line,
            row.side,
            isFirst,
          ),
          price: decimal,
          priceAmerican: decimalToAmerican(decimal),
          mainLine: !row.is_alt_line,
          active: true,
        },
      },
    };
  }

  return c.json(Array.from(fixtureMap.values()));
});

/* -------------------------------------------------------------------------- */
/* Reconstruction helpers — inverse of the parser's encoding                  */
/* -------------------------------------------------------------------------- */

/**
 * Whether `side` is the "first" outcome in canonical order (home for
 * moneyline/spreads, over for totals). Maps to synthOutcomeIds()[0].
 */
function isFirstSide(marketType: string, side: string): boolean {
  if (marketType === "totals") return side === "over";
  return side === "home";
}

/**
 * Best-effort reconstruction of the upstream bookmakerMarketId path. We
 * only store the dict key (e.g. "131"), not the full path the upstream
 * emitted. Frontend's parser only inspects the prefix ("line"/"altLine")
 * and the suffix (the marketType), so a synthetic middle is fine.
 */
function reconstructBookmakerMarketId(isAltLine: boolean, marketType: string): string {
  const prefix = isAltLine ? "altLine" : "line";
  return `${prefix}/proxy/${marketType}`;
}

/**
 * Inverse of the parser's bookmakerOutcomeId encoding:
 *   moneyline:  "home" | "away"
 *   spreads:    "<line>/home" | "<flipped-line>/away"
 *   totals:     "<line>/over" | "<line>/under"
 *
 * Caveat: our schema currently stores only ONE `line` value per market row
 * (whatever the parser saw last during outcome iteration — usually the
 * second outcome). When reconstructing, we treat the stored value as the
 * line for `isFirst` side and flip it for the second side on spreads. Until
 * the schema grows per-side line columns, this is the best we can do; the
 * frontend's behavior is what matters and it parses just `side` from this
 * field via its inverse routine. A separate cleanup PR is queued.
 */
function reconstructBookmakerOutcomeId(
  marketType: string,
  line: string | null,
  side: string,
  isFirst: boolean,
): string {
  if (marketType === "moneyline") return side;
  if (line === null) {
    // Spreads or totals without a line shouldn't happen, but emit something
    // sensible rather than crashing.
    return side;
  }
  // Normalize first so "-1.50" from Postgres decimal(8,2) emits as "-1.5"
  // — matches upstream OddsPapi convention and what the parser sees.
  const normalized = normalizeLine(line);
  if (marketType === "spreads") {
    const lineForSide = isFirst ? normalized : flipLineSign(normalized);
    return `${lineForSide}/${side}`;
  }
  // totals: same line for both sides
  return `${normalized}/${side}`;
}

/**
 * Sign-flip a decimal string. "-1.5" → "1.5", "1.5" → "-1.5", "0" → "0",
 * "0.00" → "0.00". Leading "+" isn't stored by Postgres decimal so we
 * never see it.
 */
function flipLineSign(line: string): string {
  if (line.startsWith("-")) return line.slice(1);
  // Treat any all-zero string as no-op (avoids producing "-0").
  if (/^0(\.0+)?$/.test(line)) return line;
  return `-${line}`;
}
