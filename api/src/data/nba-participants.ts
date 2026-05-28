// OddsPapi participant ID → ESPN-style 3-letter team abbreviation, NBA only.
//
// Sourced 2026-05-28 from a one-shot dump of OddsPapi
//   /v4/participants?sportId=11
// run from the VPS with the production ODDSPAPI_KEY. The dump returned 5540
// basketball participants worldwide; this file is the 30-team NBA subset
// after filtering by team-mascot regex + cross-reference against
// /v4/odds-by-tournaments?tournamentIds=132 active fixtures. Each ID
// confirmed against the catalog name (see scripts/extract_basketball_teams.py
// output for the 2026-05-28 dump).
//
// Long-term plan (per spec 2026-05-27-oddspapi-proxy.md "Out of scope"):
// replace these hardcoded maps with a participants poller hitting
// /v4/participants?sportId=X on a refresh cycle into a real `participants`
// table. This file goes away then.

export const NBA_PARTICIPANTS: Record<number, string> = {
  3409: "CHI", // Chicago Bulls
  3410: "MIL", // Milwaukee Bucks
  3411: "DAL", // Dallas Mavericks
  3412: "HOU", // Houston Rockets
  3413: "SAC", // Sacramento Kings
  3414: "POR", // Portland Trail Blazers
  3415: "MEM", // Memphis Grizzlies
  3416: "PHX", // Phoenix Suns
  3417: "DEN", // Denver Nuggets
  3418: "OKC", // Oklahoma City Thunder
  3419: "IND", // Indiana Pacers
  3420: "PHI", // Philadelphia 76ers
  3421: "NYK", // New York Knicks
  3422: "BOS", // Boston Celtics
  3423: "ATL", // Atlanta Hawks
  3424: "DET", // Detroit Pistons
  3425: "LAC", // LA Clippers
  3426: "MIN", // Minnesota Timberwolves
  3427: "LAL", // Los Angeles Lakers
  3428: "GSW", // Golden State Warriors
  3429: "SAS", // San Antonio Spurs
  3430: "CHA", // Charlotte Hornets
  3431: "WAS", // Washington Wizards
  3432: "CLE", // Cleveland Cavaliers
  3433: "TOR", // Toronto Raptors
  3434: "UTA", // Utah Jazz
  3435: "MIA", // Miami Heat
  3436: "BKN", // Brooklyn Nets
  3437: "ORL", // Orlando Magic
  5539: "NOP", // New Orleans Pelicans
};
