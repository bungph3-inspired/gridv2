// Parser tests against a checked-in MLB fixture captured from the live recon
// run 2026-05-26. The fixture is a real OddsPapi /v4/odds-by-tournaments
// response trimmed to a single MLB game with 38 markets (moneyline, totals,
// spreads, teamTotal + alt-lines).

import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseOddsResponse } from "../workers/oddspapi-parser";

const SAMPLE_PATH = join(__dirname, "fixtures/oddspapi-mlb-sample.json");
const SAMPLE = JSON.parse(readFileSync(SAMPLE_PATH, "utf8"));

describe("parseOddsResponse — MLB live fixture", () => {
  test("returns one fixture with the expected upstream IDs", () => {
    const { fixtures, stats } = parseOddsResponse(SAMPLE, {
      tournamentLeague: { 109: "MLB" },
    });
    expect(fixtures).toHaveLength(1);
    const f = fixtures[0]!;
    expect(f.oddspapiEventId).toBe("id1300010963300131");
    expect(f.sport).toBe("baseball");
    expect(f.league).toBe("MLB");
    expect(f.tournamentId).toBe(109);
    expect(f.participant1Id).toBe(3644);
    expect(f.participant2Id).toBe(3649);
    expect(f.status).toBe("open");
    expect(f.startsAt).toBeInstanceOf(Date);
    expect(stats.fixturesParsed).toBe(1);
  });

  test("includes the moneyline market with home + away outcomes", () => {
    const { fixtures } = parseOddsResponse(SAMPLE);
    const f = fixtures[0]!;
    const ml = f.markets.find((m) => m.marketType === "moneyline");
    expect(ml).toBeDefined();
    expect(ml!.isAltLine).toBe(false);
    expect(ml!.line).toBeNull();
    expect(ml!.period).toBe("fulltime");
    expect(ml!.oddspapiMarketId).toBe("131");

    const sides = ml!.outcomes.map((o) => o.side).sort();
    expect(sides).toEqual(["away", "home"]);
    // Real odds from the recon: home=2.02, away=1.909
    const home = ml!.outcomes.find((o) => o.side === "home")!;
    const away = ml!.outcomes.find((o) => o.side === "away")!;
    expect(Number(home.odds)).toBeCloseTo(2.02, 2);
    expect(Number(away.odds)).toBeCloseTo(1.909, 2);
  });

  test("parses spreads markets with line + home/away sides", () => {
    const { fixtures } = parseOddsResponse(SAMPLE);
    const f = fixtures[0]!;
    const spreads = f.markets.filter((m) => m.marketType === "spreads");
    expect(spreads.length).toBeGreaterThan(0);

    // At least one main-line spread.
    const mainSpreads = spreads.filter((m) => !m.isAltLine);
    expect(mainSpreads.length).toBeGreaterThan(0);
    for (const s of mainSpreads) {
      expect(s.line).not.toBeNull();
      const sides = s.outcomes.map((o) => o.side).sort();
      expect(sides).toEqual(["away", "home"]);
    }

    // And alt-line spreads — verify the is_alt_line flag flips.
    const altSpreads = spreads.filter((m) => m.isAltLine);
    expect(altSpreads.length).toBeGreaterThan(0);
  });

  test("parses totals markets with line + over/under sides", () => {
    const { fixtures } = parseOddsResponse(SAMPLE);
    const f = fixtures[0]!;
    const totals = f.markets.filter((m) => m.marketType === "totals");
    expect(totals.length).toBeGreaterThan(0);

    // Main-line total exists with both over and under priced.
    const mainTotal = totals.find((m) => !m.isAltLine);
    expect(mainTotal).toBeDefined();
    expect(mainTotal!.line).not.toBeNull();
    const sides = mainTotal!.outcomes.map((o) => o.side).sort();
    expect(sides).toEqual(["over", "under"]);

    // Multiple alt-line totals.
    const altTotals = totals.filter((m) => m.isAltLine);
    expect(altTotals.length).toBeGreaterThanOrEqual(5);
  });

  test("skips teamTotal markets with a counted reason", () => {
    const { stats } = parseOddsResponse(SAMPLE);
    expect(stats.skippedReasons["market_teamTotal_skipped"]).toBeGreaterThan(0);
  });

  test("skips unrecognized-prefix markets (the special pinnacle URL slugs)", () => {
    const { stats } = parseOddsResponse(SAMPLE);
    // Each fixture has ~1 of these in the sample, prefix is a numeric pinnacle ID.
    const unknownPrefixCount = Object.entries(stats.skippedReasons)
      .filter(([k]) => k.startsWith("market_unknown_prefix_"))
      .reduce((acc, [, v]) => acc + v, 0);
    expect(unknownPrefixCount).toBeGreaterThan(0);
  });

  test("counts every outcome it parsed", () => {
    const { fixtures, stats } = parseOddsResponse(SAMPLE);
    const totalOutcomes = fixtures
      .flatMap((f) => f.markets)
      .reduce((acc, m) => acc + m.outcomes.length, 0);
    expect(stats.outcomesParsed).toBe(totalOutcomes);
  });

  test("returns empty when input is not an array", () => {
    const { fixtures, stats } = parseOddsResponse({ not: "an array" });
    expect(fixtures).toHaveLength(0);
    expect(stats.skippedReasons["top_level_not_array"]).toBe(1);
  });

  test("league falls back to tournament-<id> when no mapping provided", () => {
    const { fixtures } = parseOddsResponse(SAMPLE); // no tournamentLeague opt
    expect(fixtures[0]!.league).toBe("tournament-109");
  });

  test("tournamentId is carried through regardless of tournamentLeague mapping", () => {
    // With mapping
    const a = parseOddsResponse(SAMPLE, { tournamentLeague: { 109: "MLB" } });
    expect(a.fixtures[0]!.tournamentId).toBe(109);
    // Without mapping — still populated from the raw response
    const b = parseOddsResponse(SAMPLE);
    expect(b.fixtures[0]!.tournamentId).toBe(109);
  });
});
