// OddsPapi participant ID → ESPN-style 3-letter team abbreviation, MLB only.
//
// Sourced 2026-05-27 from a one-shot curl of OddsPapi
//   /v4/participants?sportId=13
// run from the VPS with the production ODDSPAPI_KEY. Coverage: 30 of 30 MLB
// teams as of 2026-05-27 (completed in PR10 via pr10_discover.sh against the
// full sportId=13 catalog). The off-day teams now resolve to their real abbr
// instead of the `#<id>` fallback.
//
// Long-term plan (per spec 2026-05-27-oddspapi-proxy.md "Out of scope"):
// replace this hardcoded map with a participants poller hitting
// /v4/participants?sportId=X on a refresh cycle into a real `participants`
// table. This file goes away then.

export const MLB_PARTICIPANTS: Record<number, string> = {
  3627: "CHC", // Chicago Cubs
  3628: "COL", // Colorado Rockies
  3629: "NYM", // New York Mets
  3633: "CIN", // Cincinnati Reds
  3637: "PIT", // Pittsburgh Pirates
  3638: "LAD", // Los Angeles Dodgers
  3644: "CWS", // Chicago White Sox
  3646: "BOS", // Boston Red Sox
  3647: "TEX", // Texas Rangers
  3648: "DET", // Detroit Tigers
  3649: "MIN", // Minnesota Twins
  3651: "KC",  // Kansas City Royals
  3652: "BAL", // Baltimore Orioles
  3653: "TB",  // Tampa Bay Rays
  3654: "NYY", // New York Yankees
  3655: "HOU", // Houston Astros
  3656: "ATL", // Atlanta Braves
  5929: "LAA", // Los Angeles Angels
  // ─── added 2026-05-27 (PR10) via the OddsPapi /v4/participants sportId=13 dump ───
  3630: "MIL", // Milwaukee Brewers
  3632: "STL", // St. Louis Cardinals
  3634: "SF",  // San Francisco Giants
  3635: "PHI", // Philadelphia Phillies
  3636: "SD",  // San Diego Padres
  3639: "MIA", // Miami Marlins
  3640: "ARI", // Arizona Diamondbacks
  3641: "SEA", // Seattle Mariners
  3642: "TOR", // Toronto Blue Jays
  3645: "ATH", // Athletics (post-Oakland-relocation; teams.js carries OAK + ATH aliases)
  3650: "CLE", // Cleveland Guardians
  5930: "WSH", // Washington Nationals
};
