// OddsPapi participant ID → ESPN-style 3-letter team abbreviation, MLB only.
//
// Sourced 2026-05-27 from a one-shot curl of OddsPapi
//   /v4/participants?sportId=13
// run from the VPS with the production ODDSPAPI_KEY. Coverage: 18 of 30 MLB
// teams (the ones playing in the evening slate that day). Off-day teams get
// added as they appear in fixtures — `#<id>` fallback in the proxy keeps the
// UI rendering until then.
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
  // TODO (filled as we see them in fixtures):
  //   - Seattle Mariners (SEA)
  //   - Oakland Athletics (OAK / ATH after relocation if applicable)
  //   - Toronto Blue Jays (TOR)
  //   - Cleveland Guardians (CLE)
  //   - St. Louis Cardinals (STL)
  //   - Milwaukee Brewers (MIL)
  //   - Miami Marlins (MIA)
  //   - Washington Nationals (WSH)
  //   - Philadelphia Phillies (PHI)
  //   - San Diego Padres (SD)
  //   - Arizona Diamondbacks (ARI)
  //   - San Francisco Giants (SF)
};
