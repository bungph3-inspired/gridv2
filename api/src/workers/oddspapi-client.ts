// Thin OddsPapi HTTP client. Just the fetch path — parse lives in
// oddspapi-parser.ts, upsert in oddspapi-upsert.ts.
//
// API conventions (per https://oddspapi.io/us/docs):
//   - Base: https://api.oddspapi.io
//   - Version prefix: /v4
//   - Auth: ?apiKey=<key> query param (NOT Authorization: Bearer)
//   - /odds-by-tournaments requires tournamentIds — there's no "all of Pinnacle"
//     sweep call.

export const ODDSPAPI_BASE = "https://api.oddspapi.io/v4";

export class OddsPapiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "OddsPapiError";
  }
}

export interface OddsByTournamentsOpts {
  bookmaker?: string; // default 'pinnacle'
  tournamentIds: ReadonlyArray<number | string>; // required
  signal?: AbortSignal;
}

/**
 * GET /v4/odds-by-tournaments — pull all fixtures + markets for the given
 * tournaments from a single bookmaker. Throws OddsPapiError on non-2xx.
 */
export async function fetchOddsByTournaments(
  apiKey: string,
  opts: OddsByTournamentsOpts,
): Promise<unknown> {
  if (!opts.tournamentIds || opts.tournamentIds.length === 0) {
    throw new Error("tournamentIds is required (OddsPapi has no all-tournaments sweep)");
  }
  const bookmaker = opts.bookmaker ?? "pinnacle";
  const ids = opts.tournamentIds.join(",");
  const url =
    `${ODDSPAPI_BASE}/odds-by-tournaments` +
    `?bookmaker=${encodeURIComponent(bookmaker)}` +
    `&tournamentIds=${encodeURIComponent(ids)}` +
    `&apiKey=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: opts.signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new OddsPapiError(
      res.status,
      `oddspapi /v4/odds-by-tournaments failed: ${res.status} ${res.statusText}${body ? " — " + body.slice(0, 200) : ""}`,
    );
  }

  return await res.json();
}

/**
 * Structural summary of an arbitrary JSON payload for log output.
 */
export function summarizeShape(value: unknown, depth = 0): string {
  if (value === null) return "null";
  if (Array.isArray(value)) {
    if (value.length === 0) return "Array(0)";
    return `Array(${value.length})<${summarizeShape(value[0], depth + 1)}>`;
  }
  const t = typeof value;
  if (t !== "object") return t;
  if (depth > 2) return "Object";
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).slice(0, 8);
  const parts = keys.map((k) => `${k}: ${summarizeShape(obj[k], depth + 1)}`);
  const more = Object.keys(obj).length > 8 ? ", ..." : "";
  return `{ ${parts.join(", ")}${more} }`;
}
