// NOTE: localStorage keys are prefixed `bs_*` (legacy from the BetSimV2 era).
// Kept as-is so existing user settings survive — do not rename.
// ════════════════════════════════════════════════════════════════════════════
//  state.js — Centralized mutable state + configs
//  ────────────────────────────────────────────────────────────────────────────
//  Why a single `state` object instead of per-variable exports?
//
//  ES modules can export `let` bindings, but consumers can't reassign through
//  the import — they'd be read-only on the import side. To allow any module
//  to mutate (e.g. bets.js writing `state.balance -= risk`) we wrap mutable
//  state in one object. Every module imports `state` and reads/writes via
//  `state.X`. Simple, uniform, no setters required.
//
//  Arrays/objects could be exported directly (mutation in-place works through
//  live bindings) but for consistency we put them in `state` too.
//
//  Pure config constants (SPORT_CFG, TEASER_VARIANTS, etc.) stay as named
//  exports — they're never mutated after definition.
// ════════════════════════════════════════════════════════════════════════════

import { apiBase } from './agent-api.js';

// ─── ODDSPAPI CONFIG ────────────────────────────────────────────────────────
// Sport IDs: Basketball=11, Baseball=13, Hockey=15, AmFootball=14
// One entry per *league*. Multiple leagues can share an OddsPapi sportId
// (e.g. NBA + NCAAB both = 11). `key` is unique per league and used
// internally; `sportId` is what we pass to URLs. `tournamentMatch`
// (regex) disambiguates which tournament to pick when several share a sportId.
export const SPORT_CFG = [
  { key:'NBA',   label:'NBA',   sportId:11, tournamentId:132 },
  { key:'WNBA',  label:'WNBA',  sportId:11, tournamentId:486 },
  { key:'MLB',   label:'MLB',   sportId:13, tournamentId:null },
  { key:'NHL',   label:'NHL',   sportId:15, tournamentId:null },
  { key:'NFL',   label:'NFL',   sportId:14, tournamentId:null },
  { key:'NCAAB', label:'NCAAB', sportId:11, tournamentId:null, tournamentMatch:/NCAA|college/i },
  { key:'NCAAF', label:'NCAAF', sportId:14, tournamentId:null, tournamentMatch:/NCAA|college/i },
];

// Server-side OddsPapi proxy. apiBase() picks the right origin per env:
//   - prod (app.azuresb.com)  → 'https://api.azuresb.com/api/oddspapi'
//   - dev  (anything else)    → '/api/oddspapi'  (Vite server.proxy forwards)
// Replaces the old direct OddsPapi call ('https://api.oddspapi.io/v4').
// The proxy is auth-gated via the session cookie — no more bs_key apiKey.
export const BASE = apiBase() + '/api/oddspapi';
export const AUTO_MS = 2 * 60 * 1000;

// ─── TEASER CONFIG ──────────────────────────────────────────────────────────
// Each variant: shift in points (football, basketball), min/max legs, payout
// table {legs: amOdds}. Sweetheart variants (3T 10-8, 4T 12-9) are fixed-leg
// with a single payout. Standard variants (6 / 6.5 / 7) scale 2–8 legs.
export const TEASER_VARIANTS = [
  { key:'PRIME3T', label:'PRIME 3T 10-8',  ftbShift:10,   bbShift:8,   minLegs:3, maxLegs:3, enabled:true,
    payouts:{3:'+180'} },
  { key:'PRIME4T', label:'PRIME 4T 12-9',  ftbShift:12,   bbShift:9,   minLegs:4, maxLegs:4, enabled:true,
    payouts:{4:'+250'} },
  { key:'PRIME6',  label:'PRIME 6',        ftbShift:6,    bbShift:5.5, minLegs:2, maxLegs:8, enabled:true,
    payouts:{2:'-120',3:'+150',4:'+220',5:'+340',6:'+550',7:'+700',8:'+800'} },
  { key:'PRIME65', label:'PRIME 6.5',      ftbShift:6.5,  bbShift:6,   minLegs:2, maxLegs:8, enabled:true,
    payouts:{2:'-130',3:'+135',4:'+200',5:'+300',6:'+450',7:'+600',8:'+750'} },
  { key:'PRIME7',  label:'PRIME 7',        ftbShift:7,    bbShift:6.5, minLegs:2, maxLegs:8, enabled:true,
    payouts:{2:'-140',3:'+120',4:'+180',5:'+260',6:'+400',7:'+550',8:'+700'} },
];
export const getVariant = k => TEASER_VARIANTS.find(v => v.key===k);

// Map sport label → 'ftb' | 'bb' | null (not eligible for teaser)
export const teaserSportType = sport => ({NBA:'bb', NCAAB:'bb', NFL:'ftb', NCAAF:'ftb'})[sport] || null;

// Apply teaser line shift. mkey: 'spread' | 'total'.
export function teaserShift(line, mkey, variant, sport) {
  const type = teaserSportType(sport);
  if (!type) return null;
  const shift = type==='ftb' ? variant.ftbShift : variant.bbShift;
  const n = parseFloat(line);
  if (isNaN(n)) return null;
  if (mkey==='spread') {
    // Spread shifts in bettor's favor: -7 → -1 (favorite), +3 → +9 (underdog)
    return n >= 0 ? `+${(n+shift).toFixed(1).replace(/\.0$/,'')}` : `${(n+shift).toFixed(1).replace(/\.0$/,'')}`;
  }
  // Total: over moves down by shift; under moves up. Stored as raw shifted
  // number; display layer marks o/u.
  return (n - shift).toFixed(1).replace(/\.0$/,'');
}

export const teaserPayout = (variant, n) => variant.payouts && variant.payouts[n] ? variant.payouts[n] : null;

// ─── SIDEBAR LEAGUES ────────────────────────────────────────────────────────
export const LEAGUES_LIST = [
  {sport:'NBA',name:'NBA – Playoffs'},{sport:'NBA',name:'NBA – Series'},
  {sport:'NBA',name:'NBA 1st Half'},{sport:'NBA',name:'NBA Player Props'},
  {sport:'WNBA',name:'WNBA – Regular Season'},{sport:'WNBA',name:'WNBA – Playoffs'},
  {sport:'MLB',name:'MLB'},{sport:'MLB',name:'MLB 1st 5 Innings'},
  {sport:'MLB',name:'MLB – Props'},{sport:'MLB',name:'MLB – Alternate Lines'},
  {sport:'NHL',name:'NHL – Playoffs'},{sport:'NHL',name:'NHL – Stanley Cup'},
  {sport:'NFL',name:'NFL – Preseason'},{sport:'NFL',name:'NFL – Regular Season'},
  {sport:'NCAAB',name:'NCAAB – Regular Season'},{sport:'NCAAB',name:'NCAAB – March Madness'},
  {sport:'NCAAF',name:'NCAAF – Regular Season'},{sport:'NCAAF',name:'NCAAF – Bowl Games'},
];

// ─── GAME META (enriched info row) ──────────────────────────────────────────
// Optional per-matchup meta. Keyed by "Away @ Home". Any/all fields optional.
//   badge:     short tag ("Playoffs", "Reg Season"). Playoffs/Finals get
//              teal-darker bg; others get orange.
//   seedAway/seedHome: integer seeds (rendered as "#N" before team names).
//   network:   broadcast network ("TNT", "Prime Video"). Italic after home.
//   series:    series state ("OKC leads 2-1"). Orange-tinted pill on right.
//   maxWager:  per-game wager cap. Rendered as "Max $X.XX" on the right.
//   injury:    free-text injury note. Sub-row beneath info row in red italic.
export const BS_GAME_META = {
  'Los Angeles Lakers @ Oklahoma City Thunder': {
    badge:'Playoffs', seedAway:5, seedHome:1, network:'TNT',
    series:'OKC leads 2-1', maxWager:1000,
    injury:'LAL: L. James (questionable)'
  },
  'New York Knicks @ Philadelphia 76ers': {
    badge:'Playoffs', seedAway:3, seedHome:2, network:'ESPN',
    series:'Tied 2-2', maxWager:1000
  },
  'San Antonio Spurs @ Minnesota Timberwolves': {
    badge:'Reg Season', network:'NBA TV', maxWager:500
  },
};

export function getGameMeta(g){
  return BS_GAME_META[`${g.away} @ ${g.home}`] || {};
}

// ─── MUTABLE STATE ──────────────────────────────────────────────────────────
// Single source of truth for everything that changes during a session.
// localStorage initializers run at module-load (which happens once per page).
//
// Removed in PR5 (server-side proxy cutover):
//   - HARDCODED_KEY constant — no more upstream OddsPapi apiKey in browser
//   - state.apiKey + bs_key localStorage — auth now via session cookie set
//     by the agent login flow (POST /api/login → gridv2_session cookie)
export const state = {
  // ── book preference ─────────────────────────────────────
  // Mock Mode default: ON when fixture available and user hasn't opted out.
  mockMode:  !!window.MOCK_DATA && localStorage.getItem('bs_mock') !== '0',
  prefBook:  localStorage.getItem('bs_book') || 'draftkings',

  // ── money + bets ────────────────────────────────────────
  balance:    parseFloat(localStorage.getItem('bs_bal') || '1000'),
  placedBets: JSON.parse(localStorage.getItem('bs_bets') || '[]'),

  // ── bet builders (per-mode work-in-progress) ────────────
  slip:          [],   // straight: {key,gameId,teamName,sport,matchup,type,line,vig,win}
  parlayLegs:    [],
  teaserLegs:    [],   // {key,gameId,teamName,sport,matchup,type,origLine,shiftedLine}
  teaserVariant: null, // null = on menu screen, 'PRIME6' etc. = on board
  ifBetLegs:    [],   // {key,gameId,teamName,sport,matchup,type,line,vig,win,fireRule}
  reverseLegs:  [],   // 2-team Reverse Action: exactly 2 legs {key,gameId,teamName,sport,matchup,type,line,vig}
  reverseStake: 50,   // per-play stake (each If chain risks this; total risk = 2 × stake)
  selCells:     {},   // map: betKey → true (which odds cells are visually "selected")

  // ── ui ─────────────────────────────────────────────────
  wagerMode:    'straight',   // 'straight' | 'parlay' | 'teaser' | 'ifbet' | 'reverse'
  // 'home' shows the league-tile landing; 'board' shows the odds board.
  // Defaults to 'home' so fresh loads + reloads land on the picker.
  view:         'home',
  activeLeague: 'NBA – Playoffs',
  // Alt-line chevrons are hidden by default; user opts in via Settings.
  // Gates the ▼ buttons on spread/total/teamtotal/prop cells across
  // desktop + mobile. Persisted in localStorage as 'bs_alt' = '1' | '0'.
  altLinesEnabled: localStorage.getItem('bs_alt') === '1',

  // ── data caches ─────────────────────────────────────────
  gamesCache:        {},  // sport key → normalized games array
  marketMetaCache:   {},  // sportId → market metadata index (shared per sportId)
  participantCache:  {},  // participantId → team name
  prevOdds:          {},  // betKey → previous line+vig string (for move detection)

    // ── quota / loaders ─────────────────────────────────────
  qUsed:    parseInt(localStorage.getItem('bs_qu') || '0'),
  qRem:     parseInt(localStorage.getItem('bs_qr') || '500'),
  autoTimer: null,
  cdownTimer: null,
  cdownSec:  0,
  isLoading: false,
};
