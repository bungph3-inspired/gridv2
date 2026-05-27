// Unit tests for decimalToAmerican. Pure function, no DB.

import { describe, expect, test } from "vitest";
import { decimalToAmerican } from "../data/odds-conversion";

describe("decimalToAmerican", () => {
  test("even money: 2.0 → +100", () => {
    expect(decimalToAmerican(2.0)).toBe("+100");
  });

  test("classic underdog: 3.0 → +200", () => {
    expect(decimalToAmerican(3.0)).toBe("+200");
  });

  test("classic favorite: 1.5 → -200", () => {
    expect(decimalToAmerican(1.5)).toBe("-200");
  });

  test("typical Pinnacle juice: 1.952 → -105 (rounded from -104.17)", () => {
    expect(decimalToAmerican(1.952)).toBe("-105");
  });

  test("slight underdog: 2.05 → +105", () => {
    expect(decimalToAmerican(2.05)).toBe("+105");
  });

  test("longshot: 5.5 → +450", () => {
    expect(decimalToAmerican(5.5)).toBe("+450");
  });

  test("heavy favorite: 1.1 → -1000", () => {
    expect(decimalToAmerican(1.1)).toBe("-1000");
  });

  test("just below even: 1.999 → -1001 (boundary)", () => {
    // (1.999 - 1) = 0.999;  -100 / 0.999 ≈ -100.10 → round → -100. Hmm,
    // let's verify: actually -100 / 0.999 = -100.1001... → round to -100.
    // So result is "-100".
    expect(decimalToAmerican(1.999)).toBe("-100");
  });

  test("just above even: 2.001 → +100", () => {
    // (2.001 - 1) * 100 = 100.1 → round → 100. Result "+100".
    expect(decimalToAmerican(2.001)).toBe("+100");
  });

  test("priceAmerican always has explicit sign for positives", () => {
    expect(decimalToAmerican(2.5).startsWith("+")).toBe(true);
    expect(decimalToAmerican(5.0).startsWith("+")).toBe(true);
  });

  test("priceAmerican has explicit '-' for negatives", () => {
    expect(decimalToAmerican(1.5).startsWith("-")).toBe(true);
    expect(decimalToAmerican(1.1).startsWith("-")).toBe(true);
  });

  /* ---- invalid inputs return empty string ---- */

  test("decimal <= 1 returns ''", () => {
    expect(decimalToAmerican(1.0)).toBe("");
    expect(decimalToAmerican(0.5)).toBe("");
    expect(decimalToAmerican(0)).toBe("");
    expect(decimalToAmerican(-1)).toBe("");
  });

  test("NaN returns ''", () => {
    expect(decimalToAmerican(NaN)).toBe("");
  });

  test("Infinity returns ''", () => {
    expect(decimalToAmerican(Infinity)).toBe("");
    expect(decimalToAmerican(-Infinity)).toBe("");
  });
});
