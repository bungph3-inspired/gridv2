// OddsPapi participant ID → ESPN-style team abbreviation, WNBA only.
//
// Sourced 2026-05-28 from the same /v4/participants?sportId=11 dump as
// nba-participants.ts. WNBA + NBA share OddsPapi sportId=11, so the proxy's
// PARTICIPANTS_BY_SPORT[11] merges both maps. Participant IDs are globally
// unique within OddsPapi, so there are no collisions; the ESPN-style abbrs
// can overlap with NBA abbrs (e.g. ATL Hawks vs ATL Dream) and the frontend
// disambiguates via the active sport key.
//
// Cross-referenced against /v4/odds-by-tournaments?tournamentIds=486 active
// fixtures (2026-05-28): IDs 3450 (Dallas Wings), 3452 (Indiana Fever),
// 35550 (Las Vegas Aces), 1200059 (Golden State Valkyries) confirmed live.

export const WNBA_PARTICIPANTS: Record<number, string> = {
  3440: "MIN",     // Minnesota Lynx
  3444: "PHX",     // Phoenix Mercury
  3446: "NY",      // New York Liberty
  3447: "LA",      // Los Angeles Sparks
  3448: "SEA",     // Seattle Storm
  3450: "DAL",     // Dallas Wings
  3452: "IND",     // Indiana Fever
  3454: "WAS",     // Washington Mystics
  35545: "ATL",    // Atlanta Dream
  35546: "CHI",    // Chicago Sky
  35547: "CON",    // Connecticut Sun
  35550: "LV",     // Las Vegas Aces
  1200059: "GSV",  // Golden State Valkyries
};
