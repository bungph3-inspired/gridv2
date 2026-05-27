// Parse the OddsPapi /v4/odds-by-tournaments response into our domain shape.
//
// Input shape (from MLB recon dump 2026-05-26):
//
//   [
//     {
//       fixtureId: "id1300010963300131",
//       participant1Id: 3644, participant2Id: 3649,
//       sportId: 13, tournamentId: 109, seasonId: ..., statusId: 0,
//       hasOdds: true,
//       startTime: "2026-05-26T23:40:00.000Z",
//       updatedAt: "...",
//       bookmakerOdds: {
//         pinnacle: {
//           bookmakerIsActive: true,
//           bookmakerFixtureId: "1631071543",
//           fixturePath: "https://...",
//           markets: {
//             "131": {
//               bookmakerMarketId: "line/3/246/.../moneyline",
//               marketActive: true,
//               outcomes: {
//                 "131": { players: { "0": { bookmakerOutcomeId: "home", price: 2.02, mainLine: true, ... } } },
//                 "132": { players: { "0": { bookmakerOutcomeId: "away", price: 1.909, mainLine: true, ... } } }
//               }
//             },
//             ...
//           }
//         }
//       }
//     },
//     ...
//   ]
//
// Output: arrays of plain objects mapped 1:1 to our schema columns. The
// upsert layer consumes these directly.

export type MarketType = "moneyline" | "spreads" | "totals";
export type Side = "home" | "away" | "over" | "under";

export interface ParsedFixture {
  oddspapiEventId: string;
  sport: string;
  league: string;
  tournamentId: number;
  participant1Id: number;
  participant2Id: number;
  startsAt: Date;
  status: string;
  markets: ParsedMarket[];
}

export interface ParsedMarket {
  oddspapiMarketId: string;
  marketType: MarketType;
  period: string;
  line: string | null; // string to preserve decimal precision (drizzle decimal)
  isAltLine: boolean;
  outcomes: ParsedOutcome[];
}

export interface ParsedOutcome {
  side: Side;
  odds: string; // decimal as string for drizzle
}

export interface ParseStats {
  fixturesParsed: number;
  marketsParsed: number;
  marketsSkipped: number;
  outcomesParsed: number;
  outcomesSkipped: number;
  skippedReasons: Record<string, number>; // reason → count
}

// SportId → string slug. Could be extended later via /v4/sports lookup, but
// these are stable upstream IDs so a hardcoded table works.
const SPORT_BY_ID: Record<number, string> = {
  10: "soccer",
  11: "basketball",
  12: "tennis",
  13: "baseball",
  14: "american-football",
  15: "ice-hockey",
};

// statusId 0 = scheduled per the OddsPapi convention. Other values seen later
// (live=1?) will need verification.
const STATUS_BY_ID: Record<number, string> = {
  0: "open",
  // TODO: confirm live / finished / cancelled / postponed numeric values.
};

function bumpReason(stats: ParseStats, reason: string) {
  stats.skippedReasons[reason] = (stats.skippedReasons[reason] ?? 0) + 1;
}

/**
 * Parse the upstream response into ParsedFixture[]. Tournament names + leagues
 * aren't on the per-fixture response — caller supplies a `tournamentLeague`
 * map keyed by tournamentId (e.g. `{ 109: "MLB" }`). For unmapped tournaments,
 * league falls back to a `tournament-<id>` string.
 */
export function parseOddsResponse(
  raw: unknown,
  opts: {
    bookmaker?: string;
    tournamentLeague?: Record<number, string>;
  } = {},
): { fixtures: ParsedFixture[]; stats: ParseStats } {
  const bookmaker = opts.bookmaker ?? "pinnacle";
  const tournamentLeague = opts.tournamentLeague ?? {};
  const stats: ParseStats = {
    fixturesParsed: 0,
    marketsParsed: 0,
    marketsSkipped: 0,
    outcomesParsed: 0,
    outcomesSkipped: 0,
    skippedReasons: {},
  };

  if (!Array.isArray(raw)) {
    bumpReason(stats, "top_level_not_array");
    return { fixtures: [], stats };
  }

  const fixtures: ParsedFixture[] = [];

  for (const f of raw) {
    if (!f || typeof f !== "object") {
      bumpReason(stats, "fixture_not_object");
      continue;
    }
    const fix = f as Record<string, unknown>;

    const oddspapiEventId = typeof fix.fixtureId === "string" ? fix.fixtureId : null;
    const sportId = typeof fix.sportId === "number" ? fix.sportId : null;
    const tournamentId = typeof fix.tournamentId === "number" ? fix.tournamentId : null;
    const participant1Id = typeof fix.participant1Id === "number" ? fix.participant1Id : null;
    const participant2Id = typeof fix.participant2Id === "number" ? fix.participant2Id : null;
    const startTime = typeof fix.startTime === "string" ? fix.startTime : null;

    if (
      !oddspapiEventId ||
      sportId === null ||
      tournamentId === null ||
      participant1Id === null ||
      participant2Id === null ||
      !startTime
    ) {
      bumpReason(stats, "fixture_missing_required_field");
      continue;
    }

    const startsAt = new Date(startTime);
    if (Number.isNaN(startsAt.getTime())) {
      bumpReason(stats, "fixture_invalid_start_time");
      continue;
    }

    const bookmakerOdds = (fix.bookmakerOdds ?? {}) as Record<string, unknown>;
    const bm = bookmakerOdds[bookmaker];
    if (!bm || typeof bm !== "object") {
      bumpReason(stats, "fixture_no_bookmaker_data");
      continue;
    }
    const bmObj = bm as Record<string, unknown>;
    const rawMarkets = (bmObj.markets ?? {}) as Record<string, unknown>;

    const parsedMarkets: ParsedMarket[] = [];

    for (const [mid, mRaw] of Object.entries(rawMarkets)) {
      if (!mRaw || typeof mRaw !== "object") {
        stats.marketsSkipped += 1;
        bumpReason(stats, "market_not_object");
        continue;
      }
      const m = mRaw as Record<string, unknown>;
      const bookmakerMarketId =
        typeof m.bookmakerMarketId === "string" ? m.bookmakerMarketId : null;
      if (!bookmakerMarketId) {
        stats.marketsSkipped += 1;
        bumpReason(stats, "market_no_bookmakerMarketId");
        continue;
      }

      // bookmakerMarketId path = "<prefix>/.../<market_type>" e.g.:
      //   "line/3/246/.../moneyline"     — main moneyline
      //   "altLine/3/246/.../totals"     — alt total line
      //   "line/3/246/.../spreads"       — main spread
      //   "1631071543/.../1631372169"   — special market with no semantic suffix (skip)
      const parts = bookmakerMarketId.split("/");
      const prefix = parts[0] ?? "";
      const suffix = parts[parts.length - 1] ?? "";

      if (prefix !== "line" && prefix !== "altLine") {
        stats.marketsSkipped += 1;
        bumpReason(stats, `market_unknown_prefix_${prefix.slice(0, 20)}`);
        continue;
      }

      let marketType: MarketType;
      if (suffix === "moneyline") marketType = "moneyline";
      else if (suffix === "spreads") marketType = "spreads";
      else if (suffix === "totals") marketType = "totals";
      else if (suffix === "teamTotal") {
        // Skip teamTotal in Phase D — needs separate "which team" handling.
        stats.marketsSkipped += 1;
        bumpReason(stats, "market_teamTotal_skipped");
        continue;
      } else {
        stats.marketsSkipped += 1;
        bumpReason(stats, `market_unknown_suffix_${suffix.slice(0, 20)}`);
        continue;
      }

      const isAltLine = prefix === "altLine";
      const outcomesRaw = (m.outcomes ?? {}) as Record<string, unknown>;
      const parsedOutcomes: ParsedOutcome[] = [];
      let line: string | null = null;

      for (const [, oRaw] of Object.entries(outcomesRaw)) {
        if (!oRaw || typeof oRaw !== "object") {
          stats.outcomesSkipped += 1;
          bumpReason(stats, "outcome_not_object");
          continue;
        }
        const o = oRaw as Record<string, unknown>;
        const players = (o.players ?? {}) as Record<string, unknown>;
        // Top-level player "0" carries the price for non-prop markets.
        const player0 = players["0"];
        if (!player0 || typeof player0 !== "object") {
          stats.outcomesSkipped += 1;
          bumpReason(stats, "outcome_no_player0");
          continue;
        }
        const p = player0 as Record<string, unknown>;
        const bookmakerOutcomeId =
          typeof p.bookmakerOutcomeId === "string" ? p.bookmakerOutcomeId : "";
        const price = typeof p.price === "number" ? p.price : null;
        if (price === null) {
          stats.outcomesSkipped += 1;
          bumpReason(stats, "outcome_no_price");
          continue;
        }

        // bookmakerOutcomeId encoding by market_type:
        //   moneyline:  "home" | "away"
        //   spreads:    "<line>/home" | "<line>/away"   e.g. "-1.5/home"
        //   totals:     "<line>/over" | "<line>/under"  e.g. "7.5/under"
        let side: Side | null = null;
        if (marketType === "moneyline") {
          if (bookmakerOutcomeId === "home" || bookmakerOutcomeId === "away") {
            side = bookmakerOutcomeId;
          }
        } else {
          const [linePart, sidePart] = bookmakerOutcomeId.split("/");
          if (linePart !== undefined && sidePart) {
            if (marketType === "spreads" && (sidePart === "home" || sidePart === "away")) {
              side = sidePart;
              line = linePart;
            } else if (marketType === "totals" && (sidePart === "over" || sidePart === "under")) {
              side = sidePart;
              line = linePart;
            }
          }
        }
        if (!side) {
          stats.outcomesSkipped += 1;
          bumpReason(stats, `outcome_bad_id_${marketType}`);
          continue;
        }

        parsedOutcomes.push({
          side,
          odds: String(price), // drizzle decimal column wants string
        });
        stats.outcomesParsed += 1;
      }

      if (parsedOutcomes.length === 0) {
        stats.marketsSkipped += 1;
        bumpReason(stats, "market_no_valid_outcomes");
        continue;
      }

      parsedMarkets.push({
        oddspapiMarketId: mid,
        marketType,
        period: "fulltime", // §future: parse from bookmakerMarketId if non-fulltime markets appear
        line,
        isAltLine,
        outcomes: parsedOutcomes,
      });
      stats.marketsParsed += 1;
    }

    fixtures.push({
      oddspapiEventId,
      sport: SPORT_BY_ID[sportId] ?? `sport-${sportId}`,
      league: tournamentLeague[tournamentId] ?? `tournament-${tournamentId}`,
      tournamentId,
      participant1Id,
      participant2Id,
      startsAt,
      status: STATUS_BY_ID[(fix.statusId as number) ?? 0] ?? "open",
      markets: parsedMarkets,
    });
    stats.fixturesParsed += 1;
  }

  return { fixtures, stats };
}
