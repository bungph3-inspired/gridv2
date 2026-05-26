// Thin OddsPapi HTTP client. Just the fetch path — parse/upsert lives in
// oddspapi-poll.ts (and later, dedicated parser/upsert modules).
//
// API key comes from ODDSPAPI_KEY env var, set on the VPS at /etc/gridv2/env
// (mode 0640 root:gridv2). Smoke test confirmed 5/23: bookmaker=pinnacle
// returns ~92 markets on a live NBA fixture with ~5min refresh.

export const ODDSPAPI_BASE = "https://api.oddspapi.io";

export class OddsPapiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "OddsPapiError";
  }
}

export interface OddsByTournamentsOpts {
  bookmaker?: string; // default 'pinnacle'
  signal?: AbortSignal;
}

/**
 * GET /odds-by-tournaments — single sweep call. Returns whatever the upstream
 * sends; the shape is not enforced here so future schema changes upstream
 * don't break the fetch path. Caller is responsible for parsing.
 *
 * Throws OddsPapiError on non-2xx response. Network failures propagate as-is
 * from `fetch`.
 */
export async function fetchOddsByTournaments(
  apiKey: string,
  opts: OddsByTournamentsOpts = {},
): Promise<unknown> {
  const bookmaker = opts.bookmaker ?? "pinnacle";
  const url = `${ODDSPAPI_BASE}/odds-by-tournaments?bookmaker=${encodeURIComponent(bookmaker)}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
    signal: opts.signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new OddsPapiError(
      res.status,
      `oddspapi /odds-by-tournaments failed: ${res.status} ${res.statusText}${body ? " — " + body.slice(0, 200) : ""}`,
    );
  }

  return await res.json();
}

/**
 * Lightweight structural summary of an arbitrary JSON payload — used to log
 * the response shape on the worker's first poll so we can design the parse
 * code based on what the upstream actually returns.
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
