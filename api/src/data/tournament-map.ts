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
  132: {
    sportId: 11, // basketball
    tournamentName: "NBA",
    league: "NBA",
    categorySlug: "usa",
    categoryName: "USA",
  },
  486: {
    sportId: 11, // basketball (shares sportId with NBA)
    tournamentName: "WNBA",
    league: "WNBA",
    categorySlug: "usa",
    categoryName: "USA",
  },
  // Future entries (NHL, NCAAB, NCAAF, NFL) get added as those leagues come
  // back in season. See projects/GridV2/docs/league-wiring-procedure.md for
  // the discovery + wiring checklist.
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
