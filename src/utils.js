// ════════════════════════════════════════════════════════════════════════════
//  utils.js — Pure helper functions (no state dependencies)
//  ────────────────────────────────────────────────────────────────────────────
//  Odds math (toDec/decToAm/calcRisk/calcWin/parlayDec), American odds sign
//  normalization (ensureSign), display formatting (fmtUSD/fmtLine/fmtTotalLine/
//  fmtAm), and HTML escaping (escapeHtml). Nothing here reads or writes state.
//
//  These mirror BetCalc's canonical conversions — keep in sync. Source of
//  truth for odds math across the legacy BetSim / BetSimV2 / BetCalc / bet-tools family.
// ════════════════════════════════════════════════════════════════════════════

// ─── ODDS MATH ──────────────────────────────────────────────────────────────
// American → Decimal: +120 → 2.20, -150 → 1.667
export const toDec = am => {
  const n = parseFloat(String(am).replace('+',''));
  if (isNaN(n)) return 1;
  return n>0 ? n/100+1 : 100/Math.abs(n)+1;
};

// Given a target win amount and American odds, how much do you risk?
export const calcRisk = (win, am) => {
  const d = toDec(am);
  return d <= 1 ? 0 : win/(d-1);
};

// Given a risk amount and American odds, what's the win?
export const calcWin = (risk, am) => (toDec(am) - 1) * risk;

// Parlay combined decimal odds — product of all legs' decimal odds.
export const parlayDec = legs => legs.reduce((a, l) => a * toDec(l.vig || l.line), 1);

// Decimal → American: 2.20 → "+120", 1.667 → "-150"
export const decToAm = dec => dec >= 2
  ? '+' + Math.round((dec-1)*100)
  : String(Math.round(-100/(dec-1)));

// Format a number with a leading + for positives (American odds convention).
export const fmtAm = n => n > 0 ? '+' + n : String(n);

// Normalize American odds (string or number) to always carry a +/- sign.
// OddsPapi's priceAmerican arrives as "320" without a + on positives — we
// fix that here so the rest of the codebase can rely on a consistent format.
export const ensureSign = v => {
  if (v==null || v==='') return '';
  const s = String(v).trim().replace(/^\+/,'');
  const n = parseFloat(s);
  if (isNaN(n)) return s;
  return n > 0 ? '+'+s : s;
};

// ─── DISPLAY FORMATTING ─────────────────────────────────────────────────────
// Currency: always 2 decimals, comma thousands, leading $.
export const fmtUSD = n => '$' + Math.abs(n).toLocaleString('en-US', {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});

// Format a points/handicap value with +/− sign and .5 → ½ glyph (sportsbook
// convention). Used for spreads.
export const fmtLine = pt => {
  if (pt==null || pt==='') return '';
  const n = Number(pt);
  if (isNaN(n)) return String(pt);
  const abs = Math.abs(n);
  const whole = Math.floor(abs);
  const isHalf = (abs - whole) === 0.5;
  const sign = n > 0 ? '+' : (n < 0 ? '-' : '');
  return sign + (isHalf ? (whole>0 ? whole+'½' : '½') : String(abs));
};

// Like fmtLine but no leading sign — for totals (always positive line value).
export const fmtTotalLine = pt => {
  if (pt==null || pt==='') return '';
  const n = Math.abs(Number(pt));
  if (isNaN(n)) return String(pt);
  const whole = Math.floor(n);
  const isHalf = (n - whole) === 0.5;
  return isHalf ? (whole>0 ? whole+'½' : '½') : String(n);
};

// ─── HTML ESCAPING ──────────────────────────────────────────────────────────
// Safer than custom char replacement — the browser does the work.
// Used everywhere we interpolate API-sourced strings (team names, etc.) into
// innerHTML. Without this, a team name containing < or & would break markup
// and could open an XSS hole on real data.
const _escDiv = document.createElement('div');
export const escapeHtml = s => {
  _escDiv.textContent = s==null ? '' : String(s);
  return _escDiv.innerHTML;
};

// ─── PLAYER PROPS HELPERS ───────────────────────────────────────────────────
// Display labels for each prop market type. Used by every render site that
// shows a prop leg (selections rail, review modals, My Bets cards).
export const PROP_LABEL = {
  pts: 'Points',
  reb: 'Rebounds',
  ast: 'Assists',
  '3pm': '3-Pointers Made',
  blk: 'Blocks',
  stl: 'Steals',
  pr:  'Pts + Reb',
  pa:  'Pts + Ast',
  ar:  'Ast + Reb',
  pra: 'Pts + Reb + Ast',
};

// Detect a prop leg. Prop legs carry a `propPlayer` field set at click time.
export const isPropLeg = leg => !!(leg && leg.propPlayer);

// Strip the 'prop_' prefix from a type code to get the bare market: 'prop_pts' → 'pts'.
// Prefers an explicit leg.propMkt (set at click time) since confirmWagers/confirmParlay
// may overwrite leg.type to 'straight'/'parlay' after placement — propMkt survives.
export const propMkt = leg => {
  if (!leg) return '';
  if (leg.propMkt) return leg.propMkt;
  if (leg.propPlayer && typeof leg.type === 'string' && leg.type.startsWith('prop_')) return leg.type.slice(5);
  return '';
};

// Return the display market label for a prop leg ('pts' → 'Points')
export const propMktLabel = leg => {
  const m = propMkt(leg);
  return PROP_LABEL[m] || m.toUpperCase();
};

// Up-to-3-letter initials from a player name ('LeBron James' → 'LJ' or 'LBJ')
export const propInitials = leg => {
  const n = leg && leg.propPlayer ? String(leg.propPlayer) : '';
  if (!n) return '?';
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

// Side label for a prop leg ('o' or 'O' prefix → 'OVER', 'u' or 'U' → 'UNDER').
// Falls back to propSide field if line doesn't carry a prefix.
export const propSide = leg => {
  if (!leg) return '';
  if (leg.propSide) return leg.propSide === 'O' ? 'OVER' : 'UNDER';
  const ch = (leg.line || '').toString().charAt(0).toLowerCase();
  return ch === 'o' ? 'OVER' : ch === 'u' ? 'UNDER' : '';
};

// Strip o/u prefix from a prop line string ('o24.5' → '24.5'). Numeric lines pass through.
export const propLineNum = leg => {
  const l = (leg && leg.line || '').toString();
  return /^[ou]/i.test(l) ? l.slice(1) : l;
};

// ─── Bet status badge ───────────────────────────────────────────────────────
// Returns HTML for a status pill. Used by both the desktop .betst pill (My
// Bets modal) and the mobile .mob-betcard-st pill. The `baseClass` lets the
// same builder serve both surfaces — pass 'betst' for desktop,
// 'mob-betcard-st' for mobile. Status values: pending / won / lost / push.
//
// The leading icon (✓ / ✕ / ↺ / ⏱) is rendered via CSS ::before so it stays
// (a) purely presentational from a screen reader POV, and (b) outside the
// element's textContent — tests can keep asserting `.textContent === 'WON'`.
export function betStatusBadge(status, baseClass = 'betst') {
  const s = String(status || 'pending').toLowerCase();
  return `<span class="${baseClass} ${s}">${s.toUpperCase()}</span>`;
}

// ─── Empty state ───────────────────────────────────────────────────────────
// Returns HTML for a friendly empty state. Shared between desktop and mobile
// surfaces — the .estate CSS class lives in style.css. icon arg is one glyph
// (emoji or unicode char) set via data-icon attribute (CSS ::before reads it).
//
// All 4 args except `heading` are optional. `hint` renders smaller/italic.
//
// Example: emptyState({ icon: '🎟', heading: 'No bets placed yet',
//                       sub: 'Place your first wager from the board.',
//                       hint: 'Settled bets stay here for your history.' })
export function emptyState({ icon = 'ℹ', heading = '', sub = '', hint = '' }) {
  return `<div class="estate" data-icon="${escapeHtml(icon)}">`
    + (heading ? `<strong>${escapeHtml(heading)}</strong>` : '')
    + (sub     ? `<span>${escapeHtml(sub)}</span>`         : '')
    + (hint    ? `<small>${escapeHtml(hint)}</small>`      : '')
    + `</div>`;
}
