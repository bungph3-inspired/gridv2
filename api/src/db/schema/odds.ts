// OddsPapi-sourced market data — runbook 09.
//
// Phase D update (2026-05-26):
//   - fixtures: + participant1_id / participant2_id (OddsPapi doesn't return
//     team-name strings on /odds-by-tournaments; teams are upstream-ID-only
//     until a participants poller lands). home_team / away_team made nullable
//     so backfill can happen later without breaking existing rows.
//   - markets: + line (DECIMAL — spread/total number, NULL for moneyline) and
//     is_alt_line (BOOLEAN — the bookmakerMarketId prefix "altLine" vs "line").
//     Unique key changed from (fixture_id, market_type, period) to
//     (fixture_id, oddspapi_market_id) because one fixture can have many
//     totals markets (one per alt-line). oddspapi_market_id is now NOT NULL.
//   - prices: unchanged. Side values are 'home' / 'away' / 'over' / 'under'.

import {
  bigint,
  bigserial,
  boolean,
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

    // OddsPapi's per-team IDs. Resolved to readable names by a future
    // /v4/participants poller; until then, the team-name columns may be NULL.
    participant1Id: bigint("participant1_id", { mode: "number" }).notNull(),
    participant2Id: bigint("participant2_id", { mode: "number" }).notNull(),

    // Nullable until the participants table lands.
    homeTeam: text("home_team"),
    awayTeam: text("away_team"),

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

    // 'moneyline' | 'spreads' | 'totals'
    // (teamTotal markets are SKIPPED in Phase D — they need separate
    // "which team" handling. Future enhancement.)
    marketType: text("market_type").notNull(),

    // 'fulltime' | 'first_half' | 'second_half' | 'first_quarter' | etc.
    period: text("period").notNull().default("fulltime"),

    // Spread number (e.g. -1.5) for spreads, line (e.g. 7.5) for totals.
    // NULL for moneyline.
    line: decimal("line", { precision: 8, scale: 2 }),

    // bookmakerMarketId prefix: "line" = headline market, "altLine" = alt line.
    isAltLine: boolean("is_alt_line").notNull().default(false),

    // Upstream's per-fixture stable market identifier (the numeric key in the
    // markets dict, e.g. "131"). NOT NULL after Phase D — every market we
    // insert has one. Drives upserts.
    oddspapiMarketId: text("oddspapi_market_id").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_markets_fixture").on(t.fixtureId),
    unique("uq_markets_fixture_oddspapi_id").on(t.fixtureId, t.oddspapiMarketId),
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

    capturedAt: timestamp("captured_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // "Latest price per (market, side)" queries: ORDER BY captured_at DESC LIMIT 1.
    index("idx_prices_market_captured").on(t.marketId, t.capturedAt),
  ],
);

export type Price = typeof prices.$inferSelect;
export type NewPrice = typeof prices.$inferInsert;
