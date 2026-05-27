// Upsert ParsedFixture[] (from oddspapi-parser.ts) into the fixtures /
// markets / prices tables.
//
// Strategy:
//   - fixtures: ON CONFLICT (oddspapi_event_id) DO UPDATE (status, starts_at,
//     participant1_id, participant2_id, tournament_id, updated_at). Returns
//     the row id.
//   - markets: ON CONFLICT (fixture_id, oddspapi_market_id) DO UPDATE (line,
//     is_alt_line, updated_at). Returns the row id.
//   - prices: INSERT only. Append-only snapshots; retention is Phase E.
//
// All three steps run inside a single drizzle.transaction() per fixture so a
// partial failure doesn't leave dangling markets/prices.

import { sql } from "drizzle-orm";
import { db } from "../db/client";
import { fixtures, markets, prices } from "../db/schema";
import type { ParsedFixture } from "./oddspapi-parser";

export interface UpsertStats {
  fixturesUpserted: number;
  marketsUpserted: number;
  pricesInserted: number;
}

export async function upsertOddsBatch(
  parsed: ParsedFixture[],
): Promise<UpsertStats> {
  const stats: UpsertStats = {
    fixturesUpserted: 0,
    marketsUpserted: 0,
    pricesInserted: 0,
  };

  for (const f of parsed) {
    await db.transaction(async (tx) => {
      // 1. Upsert the fixture row.
      const fixRows = await tx
        .insert(fixtures)
        .values({
          oddspapiEventId: f.oddspapiEventId,
          sport: f.sport,
          league: f.league,
          tournamentId: f.tournamentId,
          participant1Id: f.participant1Id,
          participant2Id: f.participant2Id,
          startsAt: f.startsAt,
          status: f.status,
        })
        .onConflictDoUpdate({
          target: fixtures.oddspapiEventId,
          set: {
            sport: f.sport,
            league: f.league,
            tournamentId: f.tournamentId,
            participant1Id: f.participant1Id,
            participant2Id: f.participant2Id,
            startsAt: f.startsAt,
            status: f.status,
            updatedAt: sql`NOW()`,
          },
        })
        .returning({ id: fixtures.id });
      const fixtureId = fixRows[0]!.id;
      stats.fixturesUpserted += 1;

      // 2. For each market, upsert + insert its prices.
      for (const m of f.markets) {
        const marketRows = await tx
          .insert(markets)
          .values({
            fixtureId,
            marketType: m.marketType,
            period: m.period,
            line: m.line ?? null,
            isAltLine: m.isAltLine,
            oddspapiMarketId: m.oddspapiMarketId,
          })
          .onConflictDoUpdate({
            target: [markets.fixtureId, markets.oddspapiMarketId],
            set: {
              marketType: m.marketType,
              period: m.period,
              line: m.line ?? null,
              isAltLine: m.isAltLine,
              updatedAt: sql`NOW()`,
            },
          })
          .returning({ id: markets.id });
        const marketId = marketRows[0]!.id;
        stats.marketsUpserted += 1;

        if (m.outcomes.length > 0) {
          await tx.insert(prices).values(
            m.outcomes.map((o) => ({
              marketId,
              side: o.side,
              odds: o.odds,
            })),
          );
          stats.pricesInserted += m.outcomes.length;
        }
      }
    });
  }

  return stats;
}
