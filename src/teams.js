// ════════════════════════════════════════════════════════════════════════════
//  teams.js — Team logo lookup + monogram fallback
//  ────────────────────────────────────────────────────────────────────────────
//  Maps full team names ("Los Angeles Lakers") to ESPN-CDN URL slugs ("lal")
//  and canonical league abbreviations ("LAL"). Logos live at
//      /teams/{league}/{slug}.png
//  served from public/teams/ and bundled by Vite.
//
//  Render-site usage: `${teamLogoImg('NBA', team, 'tlogo')}` returns an <img>
//  tag pointing at the local PNG. If the file is missing (e.g. user hasn't run
//  scripts/fetch_logos.py yet, or the team is NCAA/unmapped), the <img>'s
//  onerror handler swaps the element for a monogram <div> styled identically
//  to the legacy text-only logo. So the page never shows a broken-image icon.
//
//  The variant flag controls the CSS class applied to both the <img> and the
//  fallback monogram, so size/position match each call site:
//      'tlogo'      — 20px circle, board rows
//      'sel-logo'   — 24px circle, selections panel (right rail)
//      'pmlogo'     — 22px circle, modal review rows
//      'mob-tlogo'  — 18px circle, mobile board cards
// ════════════════════════════════════════════════════════════════════════════

import { escapeHtml } from "./utils.js";

// ─── TEAM MAPPING ─────────────────────────────────────────────────────────
// Each entry: [fullName, slug, abbr]. Multiple full-name aliases can share
// the same slug (e.g. "Athletics" and "Oakland Athletics" both → oak).
// Slugs follow ESPN's URL convention which is mostly the league standard
// abbr lowercased, with a handful of quirks captured below.
const TEAM_DATA = {
  NBA: [
    ["Atlanta Hawks", "atl", "ATL"],
    ["Boston Celtics", "bos", "BOS"],
    ["Brooklyn Nets", "bkn", "BKN"],
    ["Charlotte Hornets", "cha", "CHA"],
    ["Chicago Bulls", "chi", "CHI"],
    ["Cleveland Cavaliers", "cle", "CLE"],
    ["Dallas Mavericks", "dal", "DAL"],
    ["Denver Nuggets", "den", "DEN"],
    ["Detroit Pistons", "det", "DET"],
    ["Golden State Warriors", "gs", "GSW"],
    ["Houston Rockets", "hou", "HOU"],
    ["Indiana Pacers", "ind", "IND"],
    ["LA Clippers", "lac", "LAC"],
    ["Los Angeles Clippers", "lac", "LAC"],
    ["Los Angeles Lakers", "lal", "LAL"],
    ["Memphis Grizzlies", "mem", "MEM"],
    ["Miami Heat", "mia", "MIA"],
    ["Milwaukee Bucks", "mil", "MIL"],
    ["Minnesota Timberwolves", "min", "MIN"],
    ["New Orleans Pelicans", "no", "NOP"],
    ["New York Knicks", "ny", "NYK"],
    ["Oklahoma City Thunder", "okc", "OKC"],
    ["Orlando Magic", "orl", "ORL"],
    ["Philadelphia 76ers", "phi", "PHI"],
    ["Phoenix Suns", "phx", "PHX"],
    ["Portland Trail Blazers", "por", "POR"],
    ["Sacramento Kings", "sac", "SAC"],
    ["San Antonio Spurs", "sa", "SAS"],
    ["Toronto Raptors", "tor", "TOR"],
    ["Utah Jazz", "utah", "UTA"],
    ["Washington Wizards", "wsh", "WAS"],
  ],
  NFL: [
    ["Arizona Cardinals", "ari", "ARI"],
    ["Atlanta Falcons", "atl", "ATL"],
    ["Baltimore Ravens", "bal", "BAL"],
    ["Buffalo Bills", "buf", "BUF"],
    ["Carolina Panthers", "car", "CAR"],
    ["Chicago Bears", "chi", "CHI"],
    ["Cincinnati Bengals", "cin", "CIN"],
    ["Cleveland Browns", "cle", "CLE"],
    ["Dallas Cowboys", "dal", "DAL"],
    ["Denver Broncos", "den", "DEN"],
    ["Detroit Lions", "det", "DET"],
    ["Green Bay Packers", "gb", "GB"],
    ["Houston Texans", "hou", "HOU"],
    ["Indianapolis Colts", "ind", "IND"],
    ["Jacksonville Jaguars", "jax", "JAX"],
    ["Kansas City Chiefs", "kc", "KC"],
    ["Las Vegas Raiders", "lv", "LV"],
    ["Los Angeles Chargers", "lac", "LAC"],
    ["Los Angeles Rams", "lar", "LAR"],
    ["Miami Dolphins", "mia", "MIA"],
    ["Minnesota Vikings", "min", "MIN"],
    ["New England Patriots", "ne", "NE"],
    ["New Orleans Saints", "no", "NO"],
    ["New York Giants", "nyg", "NYG"],
    ["New York Jets", "nyj", "NYJ"],
    ["Philadelphia Eagles", "phi", "PHI"],
    ["Pittsburgh Steelers", "pit", "PIT"],
    ["San Francisco 49ers", "sf", "SF"],
    ["Seattle Seahawks", "sea", "SEA"],
    ["Tampa Bay Buccaneers", "tb", "TB"],
    ["Tennessee Titans", "ten", "TEN"],
    ["Washington Commanders", "wsh", "WAS"],
  ],
  MLB: [
    ["Arizona Diamondbacks", "ari", "ARI"],
    ["Atlanta Braves", "atl", "ATL"],
    ["Baltimore Orioles", "bal", "BAL"],
    ["Boston Red Sox", "bos", "BOS"],
    ["Chicago Cubs", "chc", "CHC"],
    ["Chicago White Sox", "chw", "CHW"],
    ["Cincinnati Reds", "cin", "CIN"],
    ["Cleveland Guardians", "cle", "CLE"],
    ["Colorado Rockies", "col", "COL"],
    ["Detroit Tigers", "det", "DET"],
    ["Houston Astros", "hou", "HOU"],
    ["Kansas City Royals", "kc", "KC"],
    ["Los Angeles Angels", "laa", "LAA"],
    ["Los Angeles Dodgers", "lad", "LAD"],
    ["Miami Marlins", "mia", "MIA"],
    ["Milwaukee Brewers", "mil", "MIL"],
    ["Minnesota Twins", "min", "MIN"],
    ["New York Mets", "nym", "NYM"],
    ["New York Yankees", "nyy", "NYY"],
    ["Oakland Athletics", "oak", "OAK"],
    ["Athletics", "oak", "ATH"],
    ["Philadelphia Phillies", "phi", "PHI"],
    ["Pittsburgh Pirates", "pit", "PIT"],
    ["San Diego Padres", "sd", "SD"],
    ["Seattle Mariners", "sea", "SEA"],
    ["San Francisco Giants", "sf", "SF"],
    ["St. Louis Cardinals", "stl", "STL"],
    ["St Louis Cardinals", "stl", "STL"],
    ["Tampa Bay Rays", "tb", "TB"],
    ["Texas Rangers", "tex", "TEX"],
    ["Toronto Blue Jays", "tor", "TOR"],
    ["Washington Nationals", "wsh", "WSH"],
  ],
  NHL: [
    ["Anaheim Ducks", "ana", "ANA"],
    ["Boston Bruins", "bos", "BOS"],
    ["Buffalo Sabres", "buf", "BUF"],
    ["Calgary Flames", "cgy", "CGY"],
    ["Carolina Hurricanes", "car", "CAR"],
    ["Chicago Blackhawks", "chi", "CHI"],
    ["Colorado Avalanche", "col", "COL"],
    ["Columbus Blue Jackets", "cbj", "CBJ"],
    ["Dallas Stars", "dal", "DAL"],
    ["Detroit Red Wings", "det", "DET"],
    ["Edmonton Oilers", "edm", "EDM"],
    ["Florida Panthers", "fla", "FLA"],
    ["Los Angeles Kings", "la", "LAK"],
    ["Minnesota Wild", "min", "MIN"],
    ["Montreal Canadiens", "mtl", "MTL"],
    ["Nashville Predators", "nsh", "NSH"],
    ["New Jersey Devils", "nj", "NJ"],
    ["New York Islanders", "nyi", "NYI"],
    ["New York Rangers", "nyr", "NYR"],
    ["Ottawa Senators", "ott", "OTT"],
    ["Philadelphia Flyers", "phi", "PHI"],
    ["Pittsburgh Penguins", "pit", "PIT"],
    ["San Jose Sharks", "sj", "SJ"],
    ["Seattle Kraken", "sea", "SEA"],
    ["St. Louis Blues", "stl", "STL"],
    ["St Louis Blues", "stl", "STL"],
    ["Tampa Bay Lightning", "tb", "TB"],
    ["Toronto Maple Leafs", "tor", "TOR"],
    ["Utah Hockey Club", "utah", "UTA"],
    ["Utah Mammoth", "utah", "UTA"],
    ["Vancouver Canucks", "van", "VAN"],
    ["Vegas Golden Knights", "vgs", "VGK"],
    ["Washington Capitals", "wsh", "WSH"],
    ["Winnipeg Jets", "wpg", "WPG"],
  ],
};

// Build a fast { "NBA|Los Angeles Lakers" -> {slug, abbr, league} } index.
// Lowercase the team name so callers don't have to worry about casing
// inconsistencies coming back from OddsPapi.
const _byKey = (() => {
  const m = new Map();
  for (const [league, rows] of Object.entries(TEAM_DATA)) {
    const leagueLower = league.toLowerCase();
    for (const [name, slug, abbr] of rows) {
      m.set(`${league}|${name.toLowerCase()}`, { slug, abbr, league: leagueLower });
    }
  }
  return m;
})();

// Lookup: returns { slug, abbr, league } or null.
// `sport` is the league key from state ("NBA", "NFL", "MLB", "NHL", etc.).
// NCAAB / NCAAF / unknown leagues fall through to null → monogram only.
export function lookupTeam(sport, name) {
  if (!sport || !name) return null;
  return _byKey.get(`${sport}|${String(name).toLowerCase()}`) || null;
}

// Reverse index: keyed by `${league}|${abbr.toUpperCase()}` → { fullName, slug, league }.
// First-write-wins so when multiple aliases share an abbr the canonical
// (first-listed in TEAM_DATA) full name wins. Examples:
//   STL → "St. Louis Cardinals" (first), not "St Louis Cardinals" (alias)
//   OAK → "Oakland Athletics" (first), not "Athletics" (alias)
//   UTA → "Utah Jazz" (NBA) / "Utah Hockey Club" (NHL) — disambiguated by league
const _byAbbr = (() => {
  const m = new Map();
  for (const [league, rows] of Object.entries(TEAM_DATA)) {
    const leagueLower = league.toLowerCase();
    for (const [name, slug, abbr] of rows) {
      const key = `${league}|${String(abbr).toUpperCase()}`;
      if (!m.has(key)) m.set(key, { fullName: name, slug, league: leagueLower });
    }
  }
  return m;
})();

// Inverse of lookupTeam: given the ESPN 3-letter abbr the proxy's
// /participants endpoint emits, return the canonical full team name for
// display on the board ("CHC" → "Chicago Cubs"). Returns { fullName, slug,
// league } or null. NCAAB / NCAAF / unknown leagues fall through to null;
// callers should fall back to the raw abbr in that case.
export function lookupTeamByAbbr(sport, abbr) {
  if (!sport || !abbr) return null;
  return _byAbbr.get(`${sport}|${String(abbr).toUpperCase()}`) || null;
}

// Generate the same 3-letter initials the original code used, as a final
// fallback when a team isn't in our mapping (e.g. NCAA).
function initialsOf(name) {
  return String(name || "").trim().split(/\s+/).map(w => w[0] || "").join("").slice(0, 3).toUpperCase();
}

// Class names per call site. Keep these in sync with style.css rules.
const VARIANT_CLASS = {
  "tlogo":     "tlogo",      // board row
  "sel-logo":  "sel-logo",   // selections panel
  "pmlogo":    "pmlogo",     // modal review
  "mob-tlogo": "mob-tlogo",  // mobile board
};

// teamLogoImg(sport, team, variant) → HTML string.
//   <img src="/teams/nba/lal.png" class="tlogo-img" data-mono="LAL"
//        data-variant="tlogo" alt="" onerror="window.__bsLogoFallback(this)">
// On 404 (e.g. asset not yet downloaded), the <img> swaps for the monogram.
export function teamLogoImg(sport, team, variant = "tlogo") {
  if (!team) return "";
  const cls = VARIANT_CLASS[variant] || VARIANT_CLASS.tlogo;
  const found = lookupTeam(sport, team.name);
  const mono = escapeHtml((found?.abbr) || team.abbr || initialsOf(team.name));
  if (!found) {
    // No mapping → render the monogram directly (no img, no failed network round-trip).
    return `<div class="${cls}" data-mono="${mono}">${mono}</div>`;
  }
  const src = `/teams/${found.league}/${found.slug}.png`;
  return `<img src="${src}" class="${cls}-img" data-mono="${mono}" data-variant="${cls}" alt="" onerror="window.__bsLogoFallback(this)">`;
}

// Same as teamLogoImg but for prop legs (which have a player name, not a team
// name). Player props always render as monogram — players don't have logos.
export function playerMonogram(initials, variant = "sel-logo") {
  const cls = VARIANT_CLASS[variant] || VARIANT_CLASS["sel-logo"];
  const safe = escapeHtml(initials || "");
  return `<div class="${cls}" data-mono="${safe}">${safe}</div>`;
}

// Install the global onerror handler. Idempotent; called once at module load.
// Replaces the broken <img> with a monogram <div> using the same class so the
// surrounding layout doesn't shift. window-scoped because the onerror=""
// attribute can't see ES module exports.
if (typeof window !== "undefined" && !window.__bsLogoFallback) {
  window.__bsLogoFallback = function (img) {
    const variant = img.getAttribute("data-variant") || "tlogo";
    const mono = img.getAttribute("data-mono") || "?";
    const div = document.createElement("div");
    div.className = variant;
    div.setAttribute("data-mono", mono);
    div.textContent = mono;
    img.replaceWith(div);
  };
}

// ════════════════════════════════════════════════════════════════════════════
//  LEAGUE ICONS — small inline SVG sport marks for the sidebar / tab strip.
//  Inline because: (1) tabs are interactive (hover/active need color tinting,
//  fill="currentColor" handles that for free), (2) tiny render size (14–16px)
//  where SVG is sharper than a scaled raster, (3) only 6 leagues — too small
//  to warrant a network round-trip per logo.
//
//  Each entry returns the inner SVG content only. The wrapping <svg> is
//  injected by leagueIconHtml so the consumer doesn't repeat viewBox/etc.
//
//  Marks are stylized sport-type glyphs (basketball, football, baseball, puck)
//  rather than league wordmarks — wordmarks read poorly at <16px and would
//  expose us to trademark questions even for a learning project. NCAAB and
//  NCAAF reuse the basketball / football marks because the NCAA logo is a
//  generic shield that adds no information at this size.
// ════════════════════════════════════════════════════════════════════════════

// Each value is an inner-SVG fragment for a 24×24 viewBox. fill="currentColor"
// throughout so CSS color inherits cleanly.
const _BASKETBALL = `<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3 12h18M12 3v18M5.5 5.5c4 4 9 4 13 0M5.5 18.5c4-4 9-4 13 0" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>`;
const _FOOTBALL = `<ellipse cx="12" cy="12" rx="9" ry="5.5" fill="none" stroke="currentColor" stroke-width="1.6" transform="rotate(-30 12 12)"/><path d="M9 12h6M10 10v4M12 10v4M14 10v4" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" transform="rotate(-30 12 12)"/>`;
const _BASEBALL = `<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M5.5 5.5c2.5 2 4 4.5 4 6.5s-1.5 4.5-4 6.5M18.5 5.5c-2.5 2-4 4.5-4 6.5s1.5 4.5 4 6.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>`;
const _PUCK = `<ellipse cx="12" cy="14.5" rx="8" ry="2.5" fill="currentColor" opacity="0.85"/><ellipse cx="12" cy="11.5" rx="8" ry="2.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M4 11.5v3M20 11.5v3" fill="none" stroke="currentColor" stroke-width="1.6"/>`;

const LEAGUE_ICONS = {
  NBA:   _BASKETBALL,
  NCAAB: _BASKETBALL,
  NFL:   _FOOTBALL,
  NCAAF: _FOOTBALL,
  MLB:   _BASEBALL,
  NHL:   _PUCK,
};

// leagueIconHtml(sportKey, sizePx?) → '<svg ...>...</svg>' string.
// Sized to inherit currentColor; sizePx defaults to 14 (sidebar/tab default).
// Returns empty string for unknown leagues so callers don't have to guard.
export function leagueIconHtml(sportKey, sizePx = 14) {
  const inner = LEAGUE_ICONS[sportKey];
  if (!inner) return "";
  const s = Number(sizePx) || 14;
  return `<svg class="lg-icon" viewBox="0 0 24 24" width="${s}" height="${s}" aria-hidden="true" focusable="false">${inner}</svg>`;
}
