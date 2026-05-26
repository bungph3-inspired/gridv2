// OddsPapi-sourced market data — runbook 09.
//
// Three tables, normalized:
//
//   fixtures  — one row per upstream event (game/match). Identified by
//               oddspapi_event_id (upstream's stable ID) for upserts.
//
//   markets   — one row per (fixture × market_type × period). E.g. a single
//               NBA game produces a moneyline market, a spread market, and a
//               total market — each with its own row, all linked to the same
//               fixture.
//
//   prices    — append-only snapshots. Each poll inserts a fresh row per
//               market × side (home/away/over/under) with the current odds
//               and line. Retention policy TBD in a later PR.
//
// Indexes are conservative: parent FK indexes + a (market_id, captured_at)
// index for "latest price per market" queries. More can be added once we see
// real query patterns.

import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  decimal,
  index,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

/* -------------------------------------------------------------------------- */
/* fixtures                                                                   */
/* -------------------------------------------------------------------------- */

export const fixtures = pgTable(
  "fixtures",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),

    // Upstream's stable event ID — drives upserts on every poll.
    oddspapiEventId: text("oddspapi_event_id").notNull().unique(),

    sport: text("sport").notNull(), // e.g. 'basketball', 'football'
    league: text("league").notNull(), // e.g. 'NBA', 'NCAAB', 'NFL'
    homeTeam: text("home_team").notNull(),
    awayTeam: text("away_team").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),

    // 'open' | 'live' | 'finished' | 'cancelled' | 'postponed'
    status: text("status").notNull().default("open"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_fixtures_starts_at").on(t.startsAt),
    index("idx_fixtures_sport_league").on(t.sport, t.league),
    index("idx_fixtures_status").on(t.status),
  ],
);

export type Fixture = typeof fixtures.$inferSelect;
export type NewFixture = typeof fixtures.$inferInsert;

/* -------------------------------------------------------------------------- */
/* markets                                                                    */
/* -------------------------------------------------------------------------- */

export const markets = pgTable(
  "markets",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),

    fixtureId: bigint("fixture_id", { mode: "number" })
      .notNull()
      .references(() => fixtures.id, { onDelete: "cascade" }),

    // 'moneyline' | 'spread' | 'total'
    marketType: text("market_type").notNull(),

    // 'fulltime' | 'first_half' | 'second_half' | 'first_quarter' | etc.
    period: text("period").notNull().default("fulltime"),

    // Upstream's stable market ID, when present. Used for upserts within a
    // fixture. Nullable because not every upstream payload exposes one — fall
    // back to (fixture_id, market_type, period) as the natural key in that case.
    oddspapiMarketId: text("oddspapi_market_id"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_markets_fixture").on(t.fixtureId),
    unique("uq_markets_natural_key").on(t.fixtureId, t.marketType, t.period),
  ],
);

export type Market = typeof markets.$inferSelect;
export type NewMarket = typeof markets.$inferInsert;

/* -------------------------------------------------------------------------- */
/* prices                                                                     */
/* -------------------------------------------------------------------------- */

export const prices = pgTable(
  "prices",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),

    marketId: bigint("market_id", { mode: "number" })
      .notNull()
      .references(() => markets.id, { onDelete: "cascade" }),

    // 'home' | 'away' | 'over' | 'under'
    side: text("side").notNull(),

    // Decimal odds (e.g. 1.952, 2.40). DECIMAL(8,3) covers up to 99999.999.
    odds: decimal("odds", { precision: 8, scale: 3 }).notNull(),

    // Spread line or total line. NULL for moneyline. DECIMAL(8,2) covers up to
    // 999999.99 — plenty for any sport's spreads/totals.
    line: decimal("line", { precision: 8, scale: 2 }),

    capturedAt: timestamp("captured_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // "Latest price per market" queries: ORDER BY captured_at DESC LIMIT 1.
    index("idx_prices_market_captured").on(t.marketId, t.capturedAt),
  ],
);

export type Price = typeof prices.$inferSelect;
export type NewPrice = typeof prices.$inferInsert;
