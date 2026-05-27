// Decimal → American odds conversion.
//
// Canonical formula per spec `projects/GridV2/specs/2026-05-27-oddspapi-proxy.md`:
//   - decimal >= 2.0:  american = round((decimal - 1) * 100)        → "+150"
//   - decimal <  2.0:  american = round(-100 / (decimal - 1))       → "-200"
//
// Edge cases:
//   - decimal == 2.0 is the even-money boundary → "+100"
//   - decimal == 1.0 is a guaranteed loss for the book; we return "" since
//     no sensible American value exists (any return on a bet would be 0).
//     The OddsPapi response shape has priceAmerican as a string, so "" is a
//     valid "no value" signal that the frontend can display as a dash.
//   - decimal <= 0 / NaN / Infinity / non-finite → "" for the same reason.
//
// Output is always stringified with explicit sign for positive values
// ("+150", not "150") so the frontend can render the +/- directly without
// re-formatting.

/**
 * Convert a decimal odds value (e.g. 1.952) to an American odds string
 * (e.g. "-105"). Returns "" for invalid inputs.
 */
export function decimalToAmerican(decimal: number): string {
  if (!Number.isFinite(decimal) || decimal <= 1) {
    return "";
  }
  if (decimal >= 2.0) {
    const value = Math.round((decimal - 1) * 100);
    return `+${value}`;
  }
  // decimal in (1, 2) → negative American value.
  const value = Math.round(-100 / (decimal - 1));
  // value is already negative; toString gives the leading "-".
  return String(value);
}
