// Deterministic synthetic IDs for the OddsPapi proxy.
//
// Why we need them: our DB doesn't store the upstream OddsPapi marketId at the
// per-(marketType, line) catalog level — we only have per-row market_id
// (database PK). But the frontend's normalizeGames joins /markets and
// /odds-by-tournaments responses by marketId, so we need a stable ID that's
// the same across both endpoints for the same logical market.
//
// Solution: FNV-1a 32-bit hash of (marketType | line | period). Both PR3
// (/markets catalog) and PR4 (/odds-by-tournaments per-fixture markets)
// import this module and call the same function. By construction the IDs
// match, no separate lookup table needed.
//
// 32-bit IDs are unsigned and fit in JS's safe-integer range. Outcome IDs
// double the space (marketId * 2 + {0,1}) but the doubled max (~8B) is still
// well within safe-integer range.

/**
 * Hash a market's identity tuple into a stable 32-bit unsigned integer.
 * Use this for marketId in both /markets and /odds-by-tournaments responses.
 *
 * `line` is null for moneyline markets; pass `null` and we encode that as
 * an empty string in the hash key so the IDs are stable.
 *
 * `period` is the canonical "result" string the spec mandates. Our DB stores
 * "fulltime" (or eventually "first_half" etc.) but the proxy always emits
 * "result" until non-fulltime markets show up — keep this consistent here so
 * IDs don't shift if a future PR distinguishes periods.
 */
export function synthMarketId(
  marketType: string,
  line: string | null,
  period: string = "result",
): number {
  const key = `${marketType}|${line ?? ""}|${period}`;
  // FNV-1a 32-bit: offset basis 0x811c9dc5, prime 0x01000193.
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0; // coerce to unsigned 32-bit
}

/**
 * Derive the two outcome IDs for a given market. Returns [firstSide, secondSide]
 * in canonical order:
 *   - moneyline: [home, away]
 *   - spreads:   [home, away]   (home gets the stored line, away gets -line)
 *   - totals:    [over, under]
 *
 * Frontend resolves outcome → bookmakerOutcomeId → "home"/"away"/"over"/"under"
 * via the parser's reverse encoding in PR4's response, so this canonical order
 * is what /markets and /odds-by-tournaments both rely on.
 */
export function synthOutcomeIds(marketId: number): [number, number] {
  return [marketId * 2, marketId * 2 + 1];
}

/**
 * Human-readable label for the market catalog. Frontend may override these
 * for display; we just need a sensible default.
 */
export function marketName(marketType: string, line: string | null): string {
  switch (marketType) {
    case "moneyline":
      return "Moneyline";
    case "spreads":
      return line !== null ? `Spread ${line}` : "Spread";
    case "totals":
      return line !== null ? `Total ${line}` : "Total";
    default:
      return marketType;
  }
}

/**
 * Canonical side labels in [first, second] order. Matches the outcome ID
 * pairing in synthOutcomeIds.
 */
export function outcomeNames(marketType: string): [string, string] {
  if (marketType === "totals") return ["Over", "Under"];
  return ["Home", "Away"];
}
