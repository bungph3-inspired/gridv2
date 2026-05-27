// Unit tests for the synthetic ID helpers used by the OddsPapi proxy.
//
// These are pure functions — no DB, no auth, no Hono. Tests focus on:
//   - hash stability (same input → same output every call)
//   - input differentiation (different inputs → different outputs, no
//     accidental collisions across our domain)
//   - 32-bit unsigned output range
//   - outcome ID derivation matches the documented marketId*2 / *2+1 scheme

import { describe, expect, test } from "vitest";
import {
  marketName,
  outcomeNames,
  synthMarketId,
  synthOutcomeIds,
} from "../data/synthetic-ids";

describe("synthMarketId", () => {
  test("same input returns same hash on repeated calls", () => {
    const a = synthMarketId("moneyline", null, "result");
    const b = synthMarketId("moneyline", null, "result");
    expect(a).toBe(b);
  });

  test("hash is a 32-bit unsigned integer", () => {
    const cases = [
      ["moneyline", null] as const,
      ["spreads", "-1.5"] as const,
      ["spreads", "+1.5"] as const,
      ["totals", "7.5"] as const,
      ["totals", "10.5"] as const,
    ];
    for (const [t, l] of cases) {
      const id = synthMarketId(t, l);
      expect(Number.isInteger(id)).toBe(true);
      expect(id).toBeGreaterThanOrEqual(0);
      expect(id).toBeLessThanOrEqual(0xffff_ffff);
    }
  });

  test("different marketType produces different hash", () => {
    const ml = synthMarketId("moneyline", null);
    const sp = synthMarketId("spreads", null);
    const tl = synthMarketId("totals", null);
    expect(new Set([ml, sp, tl]).size).toBe(3);
  });

  test("different lines on same marketType produce different hashes", () => {
    const ids = new Set<number>();
    for (const line of ["-2.5", "-1.5", "-0.5", "0.5", "1.5", "2.5"]) {
      ids.add(synthMarketId("spreads", line));
    }
    expect(ids.size).toBe(6);
  });

  test("null line vs '0' line produce different hashes", () => {
    expect(synthMarketId("moneyline", null)).not.toBe(synthMarketId("moneyline", "0"));
  });

  test("default period is 'result' — explicit and omitted args match", () => {
    const explicit = synthMarketId("spreads", "-1.5", "result");
    const implicit = synthMarketId("spreads", "-1.5");
    expect(explicit).toBe(implicit);
  });

  test("changing period changes the hash", () => {
    const fulltime = synthMarketId("moneyline", null, "result");
    const halftime = synthMarketId("moneyline", null, "first_half");
    expect(fulltime).not.toBe(halftime);
  });

  test("known fixture: realistic MLB combos all produce distinct IDs", () => {
    // 38-ish markets per MLB fixture (moneyline + ~18 alt spreads + ~18 alt totals).
    // Verify they all hash to distinct IDs.
    const combos: Array<[string, string | null]> = [
      ["moneyline", null],
      ["spreads", "-2.5"],
      ["spreads", "-1.5"],
      ["spreads", "-0.5"],
      ["spreads", "0.5"],
      ["spreads", "1.5"],
      ["spreads", "2.5"],
      ["totals", "6.5"],
      ["totals", "7.0"],
      ["totals", "7.5"],
      ["totals", "8.0"],
      ["totals", "8.5"],
      ["totals", "9.0"],
      ["totals", "9.5"],
      ["totals", "10.0"],
      ["totals", "10.5"],
      ["totals", "11.0"],
      ["totals", "11.5"],
    ];
    const ids = new Set(combos.map(([t, l]) => synthMarketId(t, l)));
    expect(ids.size).toBe(combos.length); // no collisions
  });
});

describe("synthOutcomeIds", () => {
  test("returns [marketId*2, marketId*2+1]", () => {
    const mid = 12345;
    const [a, b] = synthOutcomeIds(mid);
    expect(a).toBe(24690);
    expect(b).toBe(24691);
  });

  test("outcome IDs are stable", () => {
    const mid = synthMarketId("totals", "7.5");
    const [a1, b1] = synthOutcomeIds(mid);
    const [a2, b2] = synthOutcomeIds(mid);
    expect(a1).toBe(a2);
    expect(b1).toBe(b2);
  });

  test("different markets get different outcome pairs", () => {
    const ml = synthMarketId("moneyline", null);
    const sp = synthMarketId("spreads", "-1.5");
    const [a1] = synthOutcomeIds(ml);
    const [a2] = synthOutcomeIds(sp);
    expect(a1).not.toBe(a2);
  });

  test("outcome IDs stay within JS safe-integer range", () => {
    // Max marketId is 0xffff_ffff (~4.29B); *2+1 ≈ 8.59B which is well below
    // Number.MAX_SAFE_INTEGER (~9.007 × 10^15).
    const maxMid = 0xffff_ffff;
    const [a, b] = synthOutcomeIds(maxMid);
    expect(Number.isSafeInteger(a)).toBe(true);
    expect(Number.isSafeInteger(b)).toBe(true);
  });
});

describe("marketName", () => {
  test("moneyline ignores line", () => {
    expect(marketName("moneyline", null)).toBe("Moneyline");
    expect(marketName("moneyline", "-1.5")).toBe("Moneyline");
  });

  test("spreads includes the line when present", () => {
    expect(marketName("spreads", "-1.5")).toBe("Spread -1.5");
    expect(marketName("spreads", null)).toBe("Spread");
  });

  test("totals includes the line when present", () => {
    expect(marketName("totals", "7.5")).toBe("Total 7.5");
    expect(marketName("totals", null)).toBe("Total");
  });

  test("unknown marketType passes through", () => {
    expect(marketName("teamtotals-team1", null)).toBe("teamtotals-team1");
  });
});

describe("outcomeNames", () => {
  test("totals → [Over, Under]", () => {
    expect(outcomeNames("totals")).toEqual(["Over", "Under"]);
  });

  test("moneyline and spreads → [Home, Away]", () => {
    expect(outcomeNames("moneyline")).toEqual(["Home", "Away"]);
    expect(outcomeNames("spreads")).toEqual(["Home", "Away"]);
  });
});
