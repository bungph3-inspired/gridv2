// Static mapping of upstream OddsPapi tournament IDs to our display metadata.
//
// Source of truth is OddsPapi /v4/tournaments; this hardcoded table is our
// "tournaments we care about" list. Adding a new league = add an entry here +
// add its tournament ID to ODDSPAPI_TOURNAMENT_IDS in /etc/gridv2/env on the
// VPS (so the poller pulls it).
//
// Used by:
//   - oddspapi-poll worker: derives `tournamentLeague` so parsed fixtures get
//     human-readable league strings ("MLB" instead of "tournament-109").
//   - /api/oddspapi/tournaments proxy route: decorates aggregated rows with
//     tournament_name + category metadata that the frontend renders.

export interface TournamentMeta {
  sportId: number;
  tournamentName: string;
  league: string; // canonical league string stored in fixtures.league
  categorySlug: string;
  categoryName: string;
}

export const TOURNAMENT_MAP: Record<number, TournamentMeta> = {
  109: {
    sportId: 13, // baseball
    tournamentName: "MLB",
    league: "MLB",
    categorySlug: "usa",
    categoryName: "USA",
  },
  // Future entries (NBA, NFL, NHL, NCAAB, NCAAF) get added as we expand
  // coverage. Each should be confirmed against an OddsPapi sample before
  // committing — the upstream IDs are stable but easy to mis-paste.
};

/**
 * Derive a tournamentId → league map for parser/poll usage. Just a flattened
 * view of TOURNAMENT_MAP, scoped to the `league` field.
 */
export function tournamentLeagueMap(): Record<number, string> {
  const out: Record<number, string> = {};
  for (const [idStr, meta] of Object.entries(TOURNAMENT_MAP)) {
    out[Number(idStr)] = meta.league;
  }
  return out;
}
