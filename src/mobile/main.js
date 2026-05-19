// ─── GridV2 MOBILE entry ─────────────────────────────────────────────────
// Mobile-shaped renderer. Reuses src/state.js, src/utils.js, src/api.js
// from the desktop build. Differences from desktop main.js:
//   • Stacked single-column game cards (no left sidebar / right rail)
//   • Bottom nav for mode switching instead of top tabs
//   • Alt-lines render via .mob-sheet bottom sheet (not popover)
//   • Drawer-based settings (not modal overlay)
// Props + prop-alt-sheet land in a follow-up commit.

import '../style.css';
import {
  state, SPORT_CFG, getVariant, TEASER_VARIANTS,
  teaserShift, teaserPayout, teaserSportType,
} from '../state.js';
import {
  fmtUSD, escapeHtml, calcRisk, calcWin, parlayDec, decToAm, toDec,
  isPropLeg, propMktLabel, propInitials, propSide, propLineNum,
  betStatusBadge, emptyState,
} from '../utils.js';
import { teamLogoImg, leagueIconHtml } from '../teams.js';
import {
  setApiHooks, fetchAndRender, manualRefresh, startAuto,
  getActiveSportKey,
} from '../api.js';

// SPORT_CFG is an array — build a quick lookup keyed by .key
const SPORT_BY_KEY = Object.fromEntries(SPORT_CFG.map(c => [c.key, c]));

// ─── BOARD RENDER (mobile-stacked) ───────────────────────────────────────
function showBoardMsg(type, msg='') {
  const b = document.getElementById('board');
  if (!b) return;
  let html = '';
  if (type === 'loading')  html = `<div class="p-8 text-center text-bet-text-sm">Loading odds…</div>`;
  else if (type === 'err') html = `<div class="p-8 text-center"><div class="text-3xl mb-2">📡</div><div class="text-bet-text font-medium">Could not load odds</div><div class="text-[11px] text-bet-text-xs mt-1">${escapeHtml(msg||'Check your API key in ☰ Settings.')}</div></div>`;
  else if (type === 'key') html = `<div class="p-8 text-center"><div class="text-3xl mb-2">🔑</div><div class="text-bet-text font-medium">API Key Required</div><div class="text-[11px] text-bet-text-xs mt-1">Tap ☰ → Settings to add your free key.</div></div>`;
  else if (type === 'none') html = `<div class="p-8 text-center text-bet-text-sm">No games available for this league.</div>`;
  b.innerHTML = html;
}

function renderBoard() {
  const b = document.getElementById('board');
  if (!b) return;
  // Teaser variant picker takes over the board until a variant is selected.
  if (state.wagerMode === 'teaser' && !state.teaserVariant) {
    renderTeaserMenu();
    updateBadges();
    return;
  }
  const key = getActiveSportKey();
  const games = state.gamesCache[key]?.games || state.gamesCache[key] || [];
  if (!Array.isArray(games) || !games.length) { showBoardMsg('none'); return; }
  b.innerHTML = '';
  games.forEach(g => b.appendChild(buildGameCard(g)));
}

function buildGameCard(game) {
  const card = document.createElement('div');
  card.className = 'mob-gcard';
  card.dataset.gameId = game.id;

  // Props-only leagues (e.g. "NBA Player Props") hide the date/time strip,
  // the column header strip, and the team Spread/ML/Total rows. Only the
  // props section below renders — its banner supplies matchup + date.
  const propsOnly = /Player Props$/i.test(state.activeLeague || '');
  if (!propsOnly) {
    const hdr = document.createElement('div');
    hdr.className = 'mob-gcard-hdr';
    hdr.innerHTML = `<span>${escapeHtml(game.date || '')}</span><span class="ml-auto">${escapeHtml(game.time || '')}</span>`;
    card.appendChild(hdr);

    // Header strip for the bet markets (Spread / ML / Total)
    const colHdr = document.createElement('div');
    colHdr.className = 'mob-gcard-row text-[9px] font-display uppercase tracking-[0.5px] text-bet-text-xs bg-bet-alt';
    colHdr.innerHTML = `<div></div><div class="text-center">Spread</div><div class="text-center">ML</div><div class="text-center">Total</div>`;
    card.appendChild(colHdr);

    // Two team rows — game.teams[0] = away, game.teams[1] = home.
    // In teaser mode (with a variant picked) the spread/total cells render
    // as teased buttons (orig → shifted) and ML becomes a disabled dash.
    const teaserMode = state.wagerMode === 'teaser' && state.teaserVariant;
    (game.teams || []).forEach(team => {
      if (!team) return;
      const row = document.createElement('div');
      row.className = 'mob-gcard-row';

      const tn = document.createElement('div');
      tn.className = 'mob-teamname';
      // Logo + name. innerHTML used because teamLogoImg returns markup
      // (img with onerror swap or fallback monogram div).
      tn.innerHTML = `${teamLogoImg(game.sport, team, 'mob-tlogo')}<span class="mob-tname">${escapeHtml(team.name)}</span>`;
      row.appendChild(tn);

      if (teaserMode) {
        row.appendChild(buildTeaserCellMob(game, team, 'spread'));
        row.appendChild(buildTeaserDashCell());
        row.appendChild(buildTeaserCellMob(game, team, 'total'));
      } else {
        row.appendChild(buildOddsBtn(game, team, 'spread'));
        row.appendChild(buildOddsBtn(game, team, 'ml'));
        row.appendChild(buildOddsBtn(game, team, 'total'));
      }

      card.appendChild(row);
    });
  }

  // Player props (stacked below the game's spread/ml/total rows).
  // Game-index lookup mirrors desktop main.js — used by propBetId to keep
  // deterministic bet-ids across re-renders.
  const key = getActiveSportKey();
  const games = state.gamesCache[key]?.games || state.gamesCache[key] || [];
  const gameIdx = Math.max(0, games.findIndex(g => g.id === game.id));
  const propSec = buildPropSection(game, gameIdx);
  if (propSec) card.appendChild(propSec);

  return card;
}

function buildOddsBtn(game, team, mkey) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'mob-obtn';
  // Pull line + vig from team object based on market key
  let line = '', vig = '', alts = [];
  if (mkey === 'spread') { line = team.spread; vig = team.spVig; alts = team.altSpreads || []; }
  else if (mkey === 'ml') { line = team.ml; vig = ''; alts = []; }
  else if (mkey === 'total') { line = team.total; vig = team.totVig; alts = team.altTotals || []; }
  if (line == null || line === '') {
    btn.disabled = true;
    btn.innerHTML = `<span class="mob-oline text-bet-text-xs">—</span>`;
    return btn;
  }
  const key = `${game.id}_${team.name}_${mkey}`;
  const isSel = !!state.selCells[key];
  if (isSel) btn.classList.add('sel');

  btn.innerHTML = `<span class="mob-oline">${escapeHtml(String(line))}</span>${vig ? `<span class="mob-ovig">${escapeHtml(String(vig))}</span>` : ''}`;
  btn.onclick = () => onOddsClick(game, team, mkey, line, vig, key);

  // Alt-line chevron: open the bottom sheet instead of a popover.
  // Hidden unless the user has opted in via Settings (state.altLinesEnabled).
  if (alts.length > 1 && state.altLinesEnabled) {
    const chev = document.createElement('span');
    chev.className = 'mob-alt-chev';
    chev.textContent = '▼';
    chev.onclick = (e) => {
      e.stopPropagation();
      openAltSheet({ game, team, mkey, mainLine: line, mainVig: vig, alts });
    };
    btn.appendChild(chev);
  }
  return btn;
}

function onOddsClick(game, team, mkey, line, vig, key) {
  const matchup = `${game.away} @ ${game.home}`;
  if (state.wagerMode === 'straight') {
    const idx = state.slip.findIndex(s => s.key === key);
    if (idx > -1) { delete state.selCells[key]; state.slip.splice(idx, 1); }
    else { state.selCells[key] = true; state.slip.push({key, gameId:game.id, teamName:team.name, sport:game.sport, matchup, type:mkey, line, vig:vig||line, win:50}); }
    updateBadges();
  } else if (state.wagerMode === 'parlay') {
    const idx = state.parlayLegs.findIndex(s => s.key === key);
    if (idx > -1) { delete state.selCells[key]; state.parlayLegs.splice(idx, 1); }
    else { state.selCells[key] = true; state.parlayLegs.push({key, gameId:game.id, teamName:team.name, sport:game.sport, matchup, type:mkey, line, vig:vig||line}); }
    updateBadges();
  } else if (state.wagerMode === 'ifbet') {
    const idx = state.ifBetLegs.findIndex(s => s.key === key);
    if (idx > -1) { delete state.selCells[key]; state.ifBetLegs.splice(idx, 1); }
    else {
      if (state.ifBetLegs.length >= 8) { showToast('Max 8 legs in an If Bet'); return; }
      state.selCells[key] = true;
      state.ifBetLegs.push({key, gameId:game.id, teamName:team.name, sport:game.sport, matchup, type:mkey, line, vig:vig||line, win:50, fireRule:'win'});
    }
    updateBadges();
  } else if (state.wagerMode === 'reverse') {
    const idx = state.reverseLegs.findIndex(s => s.key === key);
    if (idx > -1) { delete state.selCells[key]; state.reverseLegs.splice(idx, 1); }
    else {
      if (state.reverseLegs.length >= 2) { showToast('Reverse Action: exactly 2 teams'); return; }
      state.selCells[key] = true;
      state.reverseLegs.push({key, gameId:game.id, teamName:team.name, sport:game.sport, matchup, type:mkey, line, vig:vig||line});
    }
    updateBadges();
  }
  renderBoard();
}

// ─── PLAYER PROPS (mobile) ──────────────────────────────────────────────
// Stacked below each game card. Props are mock-only data (OddsPapi free tier
// returns 0 player-prop markets), populated by api.js normalizeProps.
//
// Deferred to a follow-up commit:
//   - Alt-line chevron + prop-alt 3-col bottom sheet (CSS already exists at
//     .mob-sheet-prow / .mob-sheet-vig-btn). Currently the prop button only
//     surfaces the main line.

const PROP_DESC = {
  pts: 'total points',
  reb: 'total rebounds',
  ast: 'total assists',
  '3pm': 'total 3-pointers made',
  blk: 'total blocks',
  stl: 'total steals',
  pr:  'total Pts + Reb',
  pa:  'total Pts + Ast',
  ar:  'total Ast + Reb',
  pra: 'total Pts + Reb + Ast',
};

// Deterministic bet-id matches desktop pattern: 509000 + gameIdx*100 + (propIdx+1)*10 + sideOffset.
function propBetId(gameIndex, propIndex, side) {
  return 509000 + gameIndex * 100 + (propIndex + 1) * 10 + (side === 'O' ? 1 : 2);
}

function buildPropSection(game, gameIndex) {
  if (!game.props || !game.props.length) return null;
  // Hide in teaser mode — props ineligible for teasers (matches desktop).
  if (state.wagerMode === 'teaser') return null;

  const sec = document.createElement('div');
  sec.className = 'mob-prop-section';

  const banner = document.createElement('div');
  banner.className = 'mob-prop-banner';
  banner.textContent = `${game.away} @ ${game.home} — Player Props`;
  sec.appendChild(banner);

  game.props.forEach((prop, propIndex) => {
    sec.appendChild(buildPropCard(game, prop, propIndex, gameIndex));
  });
  return sec;
}

function buildPropCard(game, prop, propIndex, gameIndex) {
  const card = document.createElement('div');
  card.className = 'mob-prop-card';

  const hdr = document.createElement('div');
  hdr.className = 'mob-prop-card-hdr';
  // Normalize "5:10 PM PDT" → "5:10p PT" (LC797 style).
  const ptTag = (game.time || '')
    .replace(/\s*PDT/i, ' PT').replace(/\s*PST/i, ' PT')
    .replace(/ AM /, 'a ').replace(/ PM /, 'p ');
  const mktDesc = PROP_DESC[prop.mkt] || prop.mkt;
  hdr.innerHTML = `<span class="mob-prop-time">${escapeHtml(ptTag)}</span><span class="mob-prop-desc">${escapeHtml(prop.player)} ${escapeHtml(mktDesc)}</span>`;
  card.appendChild(hdr);

  // Two stacked rows: Over (player name as label) + Under (market label).
  card.appendChild(buildPropRow(game, prop, propIndex, gameIndex, 'O', prop.player));
  card.appendChild(buildPropRow(game, prop, propIndex, gameIndex, 'U', propMktLabel({ propMkt: prop.mkt })));
  return card;
}

function buildPropRow(game, prop, propIndex, gameIndex, side, label) {
  const row = document.createElement('div');
  row.className = 'mob-prop-row';
  const betId = propBetId(gameIndex, propIndex, side);

  const info = document.createElement('div');
  info.className = 'mob-prop-info';
  info.innerHTML = `<span class="mob-prop-id">${betId}</span><span class="mob-prop-name">${escapeHtml(label)}</span>`;
  row.appendChild(info);

  const cell = document.createElement('div');
  cell.className = 'mob-prop-cell';
  const key = `prop_${game.id}_${prop.player}_${prop.mkt}_${side}`;
  const isSel = !!state.selCells[key];
  // Reflect any already-picked line/vig from the active mode's slip so the
  // button stays in sync after future alt-line picks.
  let lineStr = (side === 'O' ? 'o' : 'u') + prop.line;
  let vig = side === 'O' ? prop.overVig : prop.underVig;
  const legSrc = state.wagerMode === 'straight' ? state.slip
              : state.wagerMode === 'parlay'   ? state.parlayLegs
              : state.wagerMode === 'ifbet'    ? state.ifBetLegs
              : null;
  if (legSrc) {
    const leg = legSrc.find(l => l.key === key);
    if (leg) { lineStr = leg.line; vig = leg.vig; }
  }

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'mob-prop-btn' + (isSel ? ' sel' : '');
  btn.innerHTML = `<span class="mob-prop-line">${escapeHtml(String(lineStr))}</span><span class="mob-prop-vig">${escapeHtml(String(vig || ''))}</span>`;
  btn.onclick = () => onPropClick(game, prop, side, key);
  cell.appendChild(btn);

  // Alt-line chevron: opens the 3-col over/under bottom sheet.
  // Hidden unless the user has opted in via Settings (state.altLinesEnabled).
  if (prop.alts && prop.alts.length && state.altLinesEnabled) {
    const chev = document.createElement('button');
    chev.type = 'button';
    chev.className = 'mob-alt-chev';
    chev.textContent = '▼';
    chev.onclick = (e) => {
      e.stopPropagation();
      openPropAltSheet({ game, prop, propIndex, gameIndex });
    };
    cell.appendChild(chev);
  }

  row.appendChild(cell);
  return row;
}

function onPropClick(game, prop, side, key) {
  const lineStr = (side === 'O' ? 'o' : 'u') + prop.line;
  const vig = side === 'O' ? prop.overVig : prop.underVig;
  const teamName = prop.teamName || (prop.team === 'home' ? game.home : game.away);
  const matchup = `${game.away} @ ${game.home}`;
  const mkey = `prop_${prop.mkt}`;
  const sport = game.sport;

  if (state.wagerMode === 'teaser') {
    showToast('Props are not eligible for teasers');
    return;
  }
  if (state.wagerMode === 'straight') {
    const idx = state.slip.findIndex(s => s.key === key);
    if (idx > -1) { delete state.selCells[key]; state.slip.splice(idx, 1); }
    else { state.selCells[key] = true; state.slip.push({ key, gameId: game.id, teamName, sport, matchup, type: mkey, propPlayer: prop.player, propSide: side, propMkt: prop.mkt, line: lineStr, vig, win: 50 }); }
  } else if (state.wagerMode === 'parlay') {
    const idx = state.parlayLegs.findIndex(s => s.key === key);
    if (idx > -1) { delete state.selCells[key]; state.parlayLegs.splice(idx, 1); }
    else { state.selCells[key] = true; state.parlayLegs.push({ key, gameId: game.id, teamName, sport, matchup, type: mkey, propPlayer: prop.player, propSide: side, propMkt: prop.mkt, line: lineStr, vig }); }
  } else if (state.wagerMode === 'ifbet') {
    const idx = state.ifBetLegs.findIndex(s => s.key === key);
    if (idx > -1) { delete state.selCells[key]; state.ifBetLegs.splice(idx, 1); }
    else {
      if (state.ifBetLegs.length >= 8) { showToast('Max 8 legs in an If Bet'); return; }
      state.selCells[key] = true;
      state.ifBetLegs.push({ key, gameId: game.id, teamName, sport, matchup, type: mkey, propPlayer: prop.player, propSide: side, propMkt: prop.mkt, line: lineStr, vig, win: 50, fireRule: 'win' });
    }
  } else if (state.wagerMode === 'reverse') {
    const idx = state.reverseLegs.findIndex(s => s.key === key);
    if (idx > -1) { delete state.selCells[key]; state.reverseLegs.splice(idx, 1); }
    else {
      if (state.reverseLegs.length >= 2) { showToast('Reverse Action: exactly 2 teams'); return; }
      state.selCells[key] = true;
      state.reverseLegs.push({ key, gameId: game.id, teamName, sport, matchup, type: mkey, propPlayer: prop.player, propSide: side, propMkt: prop.mkt, line: lineStr, vig });
    }
  }
  updateBadges();
  renderBoard();
}

// ─── PROP-ALT BOTTOM SHEET ──────────────────────────────────────────────
// 3-column over/under sheet (Line / Over vig / Under vig). Reuses the same
// #mob-sheet container as the spread/total alt sheet, but populates its body
// with .mob-sheet-prow rows instead of .mob-sheet-row.
function openPropAltSheet({ game, prop, propIndex, gameIndex }) {
  const hdr = document.getElementById('mob-sheet-hdr');
  const body = document.getElementById('mob-sheet-body');
  hdr.textContent = `${prop.player} · ${propMktLabel({ propMkt: prop.mkt })}`;

  // Find each side's currently-picked line for sel-state highlighting
  const overKey  = `prop_${game.id}_${prop.player}_${prop.mkt}_O`;
  const underKey = `prop_${game.id}_${prop.player}_${prop.mkt}_U`;
  const findLeg = (k) => {
    if (state.wagerMode === 'straight') return state.slip.find(s => s.key === k);
    if (state.wagerMode === 'parlay')   return state.parlayLegs.find(s => s.key === k);
    if (state.wagerMode === 'ifbet')    return state.ifBetLegs.find(s => s.key === k);
    if (state.wagerMode === 'reverse')  return state.reverseLegs.find(s => s.key === k);
    return null;
  };
  const stripPrefix = v => parseFloat(String(v).replace(/^[ou]/i, ''));
  const overLeg  = findLeg(overKey);
  const underLeg = findLeg(underKey);
  const pickedOverLine  = overLeg  ? stripPrefix(overLeg.line)  : null;
  const pickedUnderLine = underLeg ? stripPrefix(underLeg.line) : null;

  // Combine main + alts, sorted asc by line
  const allLines = [
    { line: prop.line, overVig: prop.overVig, underVig: prop.underVig, isMain: true },
    ...prop.alts.map(a => ({ line: a.line, overVig: a.overVig, underVig: a.underVig, isMain: false })),
  ].sort((a, b) => a.line - b.line);

  body.innerHTML = '';

  // Header row (Line / Over / Under)
  const cols = document.createElement('div');
  cols.className = 'mob-sheet-cols';
  cols.innerHTML = '<span>Line</span><span>Over</span><span>Under</span>';
  body.appendChild(cols);

  if (!allLines.length) {
    const empty = document.createElement('div');
    empty.className = 'p-4 text-center text-bet-text-xs italic';
    empty.textContent = 'No alt lines available';
    body.appendChild(empty);
  } else {
    allLines.forEach(rec => {
      const row = document.createElement('div');
      row.className = 'mob-sheet-prow' + (rec.isMain ? ' main' : '');

      const lineCell = document.createElement('span');
      lineCell.className = 'mob-sheet-line text-center font-display font-semibold text-[14px]';
      lineCell.textContent = String(rec.line);
      row.appendChild(lineCell);

      const overBtn = document.createElement('button');
      overBtn.type = 'button';
      overBtn.className = 'mob-sheet-vig-btn' + (pickedOverLine === rec.line ? ' sel' : '');
      overBtn.textContent = rec.overVig;
      overBtn.onclick = (e) => {
        e.stopPropagation();
        setPropAltLine(game, prop, propIndex, gameIndex, 'O', rec.line, rec.overVig);
        closeAltSheet();
      };
      row.appendChild(overBtn);

      const underBtn = document.createElement('button');
      underBtn.type = 'button';
      underBtn.className = 'mob-sheet-vig-btn' + (pickedUnderLine === rec.line ? ' sel' : '');
      underBtn.textContent = rec.underVig;
      underBtn.onclick = (e) => {
        e.stopPropagation();
        setPropAltLine(game, prop, propIndex, gameIndex, 'U', rec.line, rec.underVig);
        closeAltSheet();
      };
      row.appendChild(underBtn);

      body.appendChild(row);
    });
  }
  document.getElementById('mob-sheet-backdrop').classList.add('open');
  document.getElementById('mob-sheet').classList.add('open');
}

// Swap (or add) line+vig for a prop leg on the active mode's slip. Mirrors
// desktop's setPropAltLine — teaser excluded since props aren't teaser-eligible.
function setPropAltLine(game, prop, propIndex, gameIndex, side, newLine, newVig) {
  const key = `prop_${game.id}_${prop.player}_${prop.mkt}_${side}`;
  const teamName = prop.teamName || (prop.team === 'home' ? game.home : game.away);
  const matchup = `${game.away} @ ${game.home}`;
  const mkey = `prop_${prop.mkt}`;
  const lineStr = (side === 'O' ? 'o' : 'u') + newLine;
  const sport = game.sport;

  if (state.wagerMode === 'teaser') {
    showToast('Props are not eligible for teasers');
    return;
  }
  if (state.wagerMode === 'straight') {
    const idx = state.slip.findIndex(s => s.key === key);
    if (idx > -1) { state.slip[idx].line = lineStr; state.slip[idx].vig = newVig; }
    else { state.selCells[key] = true; state.slip.push({ key, gameId: game.id, teamName, sport, matchup, type: mkey, propPlayer: prop.player, propSide: side, propMkt: prop.mkt, line: lineStr, vig: newVig, win: 50 }); }
  } else if (state.wagerMode === 'parlay') {
    const idx = state.parlayLegs.findIndex(s => s.key === key);
    if (idx > -1) { state.parlayLegs[idx].line = lineStr; state.parlayLegs[idx].vig = newVig; }
    else { state.selCells[key] = true; state.parlayLegs.push({ key, gameId: game.id, teamName, sport, matchup, type: mkey, propPlayer: prop.player, propSide: side, propMkt: prop.mkt, line: lineStr, vig: newVig }); }
  } else if (state.wagerMode === 'ifbet') {
    const idx = state.ifBetLegs.findIndex(s => s.key === key);
    if (idx > -1) { state.ifBetLegs[idx].line = lineStr; state.ifBetLegs[idx].vig = newVig; }
    else {
      if (state.ifBetLegs.length >= 8) { showToast('Max 8 legs in an If Bet'); return; }
      state.selCells[key] = true;
      state.ifBetLegs.push({ key, gameId: game.id, teamName, sport, matchup, type: mkey, propPlayer: prop.player, propSide: side, propMkt: prop.mkt, line: lineStr, vig: newVig, win: 50, fireRule: 'win' });
    }
  } else if (state.wagerMode === 'reverse') {
    const idx = state.reverseLegs.findIndex(s => s.key === key);
    if (idx > -1) { state.reverseLegs[idx].line = lineStr; state.reverseLegs[idx].vig = newVig; }
    else {
      if (state.reverseLegs.length >= 2) { showToast('Reverse Action: exactly 2 teams'); return; }
      state.selCells[key] = true;
      state.reverseLegs.push({ key, gameId: game.id, teamName, sport, matchup, type: mkey, propPlayer: prop.player, propSide: side, propMkt: prop.mkt, line: lineStr, vig: newVig });
    }
  }
  updateBadges();
  renderBoard();
}

// ─── TEASER (mobile) ────────────────────────────────────────────────────
// Variant picker replaces the board until a variant is selected. Once
// picked, the board re-renders with .mob-tbtn cells (orig → shifted) for
// spread + total. ML becomes a dash (teasers don't accept ML legs). Props
// hide entirely (buildPropSection returns null in teaser mode).

function renderTeaserMenu() {
  const b = document.getElementById('board');
  if (!b) return;
  b.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'mob-teaser-menu';
  wrap.id = 'mob-teaser-menu';

  const hdr = document.createElement('div');
  hdr.className = 'mob-tm-hdr';
  hdr.textContent = 'Choose Teaser Variant';
  wrap.appendChild(hdr);

  TEASER_VARIANTS.forEach(v => {
    const row = document.createElement('div');
    row.className = 'mob-tm-row' + (v.enabled ? '' : ' dis');
    row.dataset.variant = v.key;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mob-tm-vbtn';
    btn.textContent = v.label;
    btn.disabled = !v.enabled;
    btn.dataset.variant = v.key;
    if (v.enabled) btn.onclick = () => selectMobileTeaserVariant(v.key);
    row.appendChild(btn);

    const legsTxt = v.minLegs === v.maxLegs ? `${v.minLegs} legs` : `${v.minLegs}–${v.maxLegs} legs`;
    const meta = document.createElement('div');
    meta.className = 'mob-tm-meta';
    meta.textContent = `NBA + NFL · ${legsTxt} · ${v.ftbShift}pt FB / ${v.bbShift}pt BB`;
    row.appendChild(meta);

    wrap.appendChild(row);
  });

  b.appendChild(wrap);
}

function selectMobileTeaserVariant(variantKey) {
  state.teaserVariant = variantKey;
  // Clear any teaser legs left over from a prior variant (shifts may differ).
  state.teaserLegs.forEach(l => delete state.selCells[l.key]);
  state.teaserLegs = [];
  updateBadges();
  renderBoard();
  showToast(`Teaser: ${getVariant(variantKey).label} active`);
}

function buildTeaserDashCell() {
  const d = document.createElement('div');
  d.className = 'mob-tcell-dash';
  d.textContent = '—';
  return d;
}

function buildTeaserCellMob(game, team, mkey) {
  const v = getVariant(state.teaserVariant);
  const mainLine = mkey === 'spread' ? team.spread : team.total;
  if (mainLine == null || mainLine === '') return buildTeaserDashCell();

  const key = `${game.id}_${team.name}_${mkey}_T`;
  const existing = state.teaserLegs.find(l => l.key === key);
  const origLine = existing ? existing.origLine : String(mainLine);
  const shifted = teaserShift(origLine, mkey, v, game.sport);
  if (!shifted) return buildTeaserDashCell(); // sport not teaser-eligible

  const isSel = !!state.selCells[key];
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'mob-tbtn' + (isSel ? ' sel' : '');
  btn.dataset.tkey = key;
  btn.innerHTML = `<span class="mob-torig">${escapeHtml(String(origLine))}</span><span class="mob-tshift">${escapeHtml(String(shifted))}</span>`;
  btn.title = `${origLine} → ${shifted} (${v.label})`;
  btn.onclick = () => onTeaserCellClick(game, team, mkey, origLine, shifted, key);
  return btn;
}

function onTeaserCellClick(game, team, mkey, origLine, shiftedLine, key) {
  const v = getVariant(state.teaserVariant);
  if (!v) return;
  const idx = state.teaserLegs.findIndex(l => l.key === key);
  if (idx > -1) {
    state.teaserLegs.splice(idx, 1);
    delete state.selCells[key];
  } else {
    if (state.teaserLegs.length >= v.maxLegs) {
      showToast(`Max ${v.maxLegs} legs for ${v.label}`);
      return;
    }
    state.teaserLegs.push({
      key, gameId: game.id, teamName: team.name, sport: game.sport,
      matchup: `${game.away} @ ${game.home}`, type: mkey,
      origLine, shiftedLine,
    });
    state.selCells[key] = true;
  }
  updateBadges();
  renderBoard();
}

// ─── ALT-LINE BOTTOM SHEET ──────────────────────────────────────────────
function openAltSheet({ game, team, mkey, mainLine, mainVig, alts }) {
  const hdr = document.getElementById('mob-sheet-hdr');
  const body = document.getElementById('mob-sheet-body');
  const labels = { spread:'Alt Spreads', total:'Alt Totals', tt:'Alt Team Totals', ml:'Moneyline' };
  hdr.textContent = `${labels[mkey] || 'Alt Lines'} · ${team.name}`;

  // Find current line picked for this market (from active mode's slip)
  const key = `${game.id}_${team.name}_${mkey}`;
  let currentLine = mainLine;
  const legSrc = state.wagerMode === 'straight' ? state.slip
              : state.wagerMode === 'parlay'   ? state.parlayLegs
              : state.wagerMode === 'ifbet'    ? state.ifBetLegs
              : state.wagerMode === 'reverse'  ? state.reverseLegs
              : null;
  if (legSrc) {
    const leg = legSrc.find(l => l.key === key);
    if (leg) currentLine = leg.line;
  }

  body.innerHTML = '';
  if (!alts.length) {
    body.innerHTML = '<div class="p-4 text-center text-bet-text-xs italic">No alt lines available</div>';
  } else {
    alts.forEach(alt => {
      const row = document.createElement('div');
      row.className = 'mob-sheet-row';
      if (alt.line === mainLine) row.classList.add('main');
      if (alt.line === currentLine) row.classList.add('sel');
      row.innerHTML = `<span class="mob-sheet-line">${escapeHtml(String(alt.line))}</span><span class="mob-sheet-vig">${escapeHtml(String(alt.vig))}</span>`;
      row.onclick = () => {
        setAltLine(game, team, mkey, alt.line, alt.vig);
        closeAltSheet();
      };
      body.appendChild(row);
    });
  }
  document.getElementById('mob-sheet-backdrop').classList.add('open');
  document.getElementById('mob-sheet').classList.add('open');
}

function closeAltSheet() {
  document.getElementById('mob-sheet-backdrop').classList.remove('open');
  document.getElementById('mob-sheet').classList.remove('open');
}

function setAltLine(game, team, mkey, line, vig) {
  const key = `${game.id}_${team.name}_${mkey}`;
  const matchup = `${game.away} @ ${game.home}`;
  if (state.wagerMode === 'straight') {
    const idx = state.slip.findIndex(s => s.key === key);
    if (idx > -1) { state.slip[idx].line = line; state.slip[idx].vig = vig || line; }
    else { state.slip.push({key, gameId:game.id, teamName:team.name, sport:game.sport, matchup, type:mkey, line, vig:vig||line, win:50}); state.selCells[key]=true; }
  } else if (state.wagerMode === 'parlay') {
    const idx = state.parlayLegs.findIndex(s => s.key === key);
    if (idx > -1) { state.parlayLegs[idx].line = line; state.parlayLegs[idx].vig = vig || line; }
    else { state.parlayLegs.push({key, gameId:game.id, teamName:team.name, sport:game.sport, matchup, type:mkey, line, vig:vig||line}); state.selCells[key]=true; }
  } else if (state.wagerMode === 'ifbet') {
    const idx = state.ifBetLegs.findIndex(s => s.key === key);
    if (idx > -1) { state.ifBetLegs[idx].line = line; state.ifBetLegs[idx].vig = vig || line; }
    else { state.ifBetLegs.push({key, gameId:game.id, teamName:team.name, sport:game.sport, matchup, type:mkey, line, vig:vig||line, win:50, fireRule:'win'}); state.selCells[key]=true; }
  } else if (state.wagerMode === 'reverse') {
    const idx = state.reverseLegs.findIndex(s => s.key === key);
    if (idx > -1) { state.reverseLegs[idx].line = line; state.reverseLegs[idx].vig = vig || line; }
    else {
      if (state.reverseLegs.length >= 2) { showToast('Reverse Action: exactly 2 teams'); return; }
      state.reverseLegs.push({key, gameId:game.id, teamName:team.name, sport:game.sport, matchup, type:mkey, line, vig:vig||line});
      state.selCells[key] = true;
    }
  }
  updateBadges();
  renderBoard();
}

// ─── MODE / SPORT / NAV / DRAWER ────────────────────────────────────────

// Teaser eligibility is derived from state.js's teaserSportType helper —
// whichever sports return a non-null type ('bb' | 'ftb') are eligible.
// Currently: NBA, NCAAB, NFL, NCAAF. MLB + NHL return null.
function isTeaserEligible(sportKey) {
  return teaserSportType(sportKey) !== null;
}

// Toggle the .disabled class on the Teaser bottom-nav button based on the
// current active sport. Called from setSport + init. Safe to call when the
// nav button isn't rendered yet (no-op).
function updateTeaserGating() {
  const btn = document.getElementById('nav-teaser');
  if (!btn) return;
  btn.classList.toggle('disabled', !isTeaserEligible(state.activeLeague));
}

function setMode(mode) {
  if (!['straight','parlay','teaser','ifbet','reverse'].includes(mode)) return;
  // Reject teaser switch when active sport doesn't support teasers. Toast
  // and stay in current mode — matches LC797 convention.
  if (mode === 'teaser' && !isTeaserEligible(state.activeLeague)) {
    showToast(`Teasers are not available for ${state.activeLeague}`);
    return;
  }
  // When LEAVING teaser, clear teaser-specific WIP so a stale variant +
  // teaser legs don't persist and bleed selection state into other modes.
  if (state.wagerMode === 'teaser' && mode !== 'teaser') {
    state.teaserLegs.forEach(l => delete state.selCells[l.key]);
    state.teaserLegs = [];
    state.teaserVariant = null;
  }
  // Clear leg working-state when switching away from a builder mode
  if (state.wagerMode === 'ifbet' && mode !== 'ifbet') {
    state.ifBetLegs.forEach(l => delete state.selCells[l.key]);
    state.ifBetLegs = [];
  }
  if (state.wagerMode === 'reverse' && mode !== 'reverse') {
    state.reverseLegs.forEach(l => delete state.selCells[l.key]);
    state.reverseLegs = [];
  }
  state.wagerMode = mode;
  document.querySelectorAll('.mob-nbtn').forEach(b => b.classList.remove('active'));
  document.getElementById('nav-' + mode)?.classList.add('active');
  updateBadges();
  renderBoard();
}

function setSport(sportKey) {
  state.activeLeague = sportKey;
  document.querySelectorAll('.mob-stab').forEach(t => t.classList.toggle('active', t.dataset.sport === sportKey));
  const cfg = SPORT_BY_KEY[sportKey];
  document.getElementById('board-title').textContent = `${sportKey} — ${cfg?.label || ''}`;
  // If user is in teaser mode and switches to a teaser-ineligible sport,
  // fall back to straight (clearing teaser WIP). Otherwise the board would
  // render dash placeholders for every odds cell.
  if (state.wagerMode === 'teaser' && !isTeaserEligible(sportKey)) {
    state.teaserLegs.forEach(l => delete state.selCells[l.key]);
    state.teaserLegs = [];
    state.teaserVariant = null;
    state.wagerMode = 'straight';
    document.querySelectorAll('.mob-nbtn').forEach(b => b.classList.remove('active'));
    document.getElementById('nav-straight')?.classList.add('active');
    updateBadges();
  }
  updateTeaserGating();
  if (!state.gamesCache[sportKey]) {
    showBoardMsg('loading');
    fetchAndRender(sportKey, true);
  } else {
    renderBoard();
  }
}

function updateBadges() {
  const map = { 'par-badge': state.parlayLegs.length, 'tea-badge': state.teaserLegs.length, 'if-badge': state.ifBetLegs.length, 'rv-badge': state.reverseLegs.length, 'bets-cnt': state.placedBets.filter(b => b.status === 'pending').length };
  Object.entries(map).forEach(([id, n]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = String(n);
    el.classList.toggle('hidden', n === 0);
  });
  updateContinueBar();
}

// Continue bar shows above the bottom nav whenever the active mode has legs
// that can be reviewed: straight (>=1), parlay (>=2), teaser (>=variant.minLegs),
// ifbet (>=2). Hidden otherwise.
function updateContinueBar() {
  const bar = document.getElementById('mob-continue-bar');
  const cnt = document.getElementById('mob-continue-cnt');
  if (!bar || !cnt) return;
  let n = 0, ok = false;
  if (state.wagerMode === 'straight')      { n = state.slip.length; ok = n >= 1; }
  else if (state.wagerMode === 'parlay')   { n = state.parlayLegs.length; ok = n >= 2; }
  else if (state.wagerMode === 'ifbet')    { n = state.ifBetLegs.length; ok = n >= 2; }
  else if (state.wagerMode === 'reverse')  { n = state.reverseLegs.length; ok = n >= 2; }
  else if (state.wagerMode === 'teaser')   {
    n = state.teaserLegs.length;
    const v = state.teaserVariant ? getVariant(state.teaserVariant) : null;
    ok = !!(v && n >= v.minLegs);
  }
  cnt.textContent = String(n);
  bar.classList.toggle('hidden', !ok);
}

function openDrawer() {
  // Sync settings widgets to current state on every open so the drawer
  // reflects external mutations (e.g. fixture init flipping mockMode).
  const mockCbx = document.getElementById('mock-cbx');
  if (mockCbx) mockCbx.checked = state.mockMode;
  const altCbx = document.getElementById('alt-cbx');
  if (altCbx) altCbx.checked = !!state.altLinesEnabled;
  const altStatus = document.getElementById('alt-status');
  if (altStatus) altStatus.textContent = state.altLinesEnabled ? 'Showing alt-line chevrons' : 'Show alt-line chevrons';
  const apiInp = document.getElementById('api-key-inp');
  if (apiInp) apiInp.value = state.apiKey || '';
  const bookSel = document.getElementById('book-sel');
  if (bookSel) bookSel.value = state.prefBook;
  document.getElementById('doverlay').classList.add('open');
  document.getElementById('drawer').classList.add('open');
}
function closeDrawer() {
  document.getElementById('doverlay').classList.remove('open');
  document.getElementById('drawer').classList.remove('open');
}

// Settings handlers (drawer-based mobile equivalents)
function saveApiKey() {
  const v = document.getElementById('api-key-inp').value.trim();
  if (!v) return;
  state.apiKey = v;
  localStorage.setItem('bs_key', v);
  closeDrawer();
  showToast('API key saved');
  fetchAndRender(state.activeLeague, true);
}
function saveBook() {
  state.prefBook = document.getElementById('book-sel').value;
  localStorage.setItem('bs_book', state.prefBook);
  state.gamesCache = {};
  fetchAndRender(state.activeLeague, true);
}
function toggleMockMode() {
  state.mockMode = document.getElementById('mock-cbx').checked;
  localStorage.setItem('bs_mock', state.mockMode ? '1' : '0');
  state.gamesCache = {};
  fetchAndRender(state.activeLeague, true);
}
function toggleAltLines() {
  const cbx = document.getElementById('alt-cbx');
  if (!cbx) return;
  state.altLinesEnabled = cbx.checked;
  localStorage.setItem('bs_alt', state.altLinesEnabled ? '1' : '0');
  const as = document.getElementById('alt-status');
  if (as) as.textContent = state.altLinesEnabled ? 'Showing alt-line chevrons' : 'Show alt-line chevrons';
  // Close any open alt sheet (anchor would be stale after re-render).
  closeAltSheet();
  renderBoard();
  showToast(state.altLinesEnabled ? 'Alt lines ON' : 'Alt lines OFF');
}
function resetBalance() {
  if (!confirm('Reset balance to $1,000?')) return;
  state.balance = 1000;
  localStorage.setItem('bs_bal', String(state.balance));
  updateBalDisp();
  showToast('Balance reset');
}
function updateBalDisp() {
  const f = fmtUSD(state.balance);
  const bd = document.getElementById('bal-disp'); if (bd) bd.textContent = f;
  const sb = document.getElementById('set-bal'); if (sb) sb.textContent = f;
}
function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}
// ─── MY BETS OVERLAY ────────────────────────────────────────────────────
function openBets() {
  renderMobileBets();
  document.getElementById('mob-bets-overlay').classList.add('open');
}
function closeBets() {
  document.getElementById('mob-bets-overlay').classList.remove('open');
}

function renderMobileBets() {
  const body = document.getElementById('mob-bets-body');
  if (!body) return;
  body.innerHTML = '';
  if (!state.placedBets.length) {
    body.innerHTML = emptyState({
      icon: '🎟',
      heading: 'No bets placed yet',
      sub: 'Place your first wager from the board.',
      hint: 'Settled bets stay in your history.',
    });
    return;
  }
  // Reverse-render newest-first while preserving original index for settle
  state.placedBets.map((b, i) => ({ b, i })).reverse().forEach(({ b, i }) => {
    body.appendChild(buildBetCard(b, i));
  });
}

function buildBetCard(b, idx) {
  const card = document.createElement('div');
  card.className = 'mob-betcard';
  const stClass = b.status || 'pending';
  let topName, metaTxt, legsHtml = '', riskLbl = 'Risk', riskVal, winLbl = 'To Win', winVal;

  if (b.type === 'reverse') {
    topName = `⇄ 2-Team Reverse Action`;
    metaTxt = `A→B + B→A · Stake ${fmtUSD(b.stake)}/play · ${b.placed || ''}`;
    legsHtml = (b.legs || []).map((l, j) => {
      const lblK = j === 0 ? 'A' : 'B';
      const label = isPropLeg(l)
        ? `${escapeHtml(l.propPlayer)} — ${escapeHtml(propMktLabel(l))} ${escapeHtml(propSide(l))} ${escapeHtml(propLineNum(l))}`
        : `${escapeHtml(l.teamName)} (${escapeHtml(({spread:'Spread',ml:'ML',total:'Total',tt:'TT'}[l.type] || l.type))}: ${escapeHtml(String(l.line))})`;
      let outTag = '';
      if (b.legOutcomes && b.legOutcomes[lblK.toLowerCase()]) {
        const o = b.legOutcomes[lblK.toLowerCase()];
        outTag = ` [${o.toUpperCase()}]`;
      }
      return `<div class="mob-betcard-legrow"><b style="color:var(--color-bet-accent, #e87722)">${lblK}.</b> ${label}${outTag}</div>`;
    }).join('');
    riskLbl = 'Total Risk';
    riskVal = b.risk;
    winLbl = b.status === 'pending' ? 'Max Win' : ((b.netProfit || 0) >= 0 ? 'Net Win' : 'Net Loss');
    winVal = b.status === 'pending' ? b.win : Math.abs(b.netProfit || 0);
  } else if (b.type === 'ifbet') {
    const totWin = b.win || ((b.legs || []).reduce((a, l) => a + (parseFloat(l.win) || 0), 0));
    topName = `⛓ ${b.legCount}-Leg If Bet`;
    metaTxt = `Sequential · ${b.placed || ''}`;
    legsHtml = (b.legs || []).map((l, j) => {
      const rule = j === 0 ? 'always' : (l.fireRule === 'winOrPush' ? 'if win/push' : 'if win');
      const label = isPropLeg(l)
        ? `${escapeHtml(l.propPlayer)} — ${escapeHtml(propMktLabel(l))} ${escapeHtml(propSide(l))} ${escapeHtml(propLineNum(l))} · win ${fmtUSD(parseFloat(l.win) || 0)} · ${rule}`
        : `${escapeHtml(l.teamName)} (${escapeHtml(({spread:'Spread',ml:'ML',total:'Total',tt:'TT'}[l.type] || l.type))}: ${escapeHtml(String(l.line))}) · win ${fmtUSD(parseFloat(l.win) || 0)} · ${rule}`;
      return `<div class="mob-betcard-legrow"><b style="color:var(--color-bet-accent, #e87722)">${j+1}.</b> ${label}</div>`;
    }).join('');
    riskLbl = 'Risk (Leg 1)';
    riskVal = b.risk;
    winLbl = 'Max Win';
    winVal = totWin;
  } else if (b.type === 'teaser') {
    const win = b.win || calcWin(b.risk || 0, b.amOdds || '-110');
    topName = `🎯 ${b.legCount}-Pick ${b.variant || 'Teaser'}`;
    metaTxt = `Odds: ${b.amOdds || ''} · ${b.placed || ''}`;
    legsHtml = (b.legs || []).map((l, j) => {
      const tl = {spread:'Spread',total:'Total'}[l.type] || l.type;
      return `<div class="mob-betcard-legrow"><b style="color:var(--color-bet-brand, #2a6b75)">${j+1}.</b> ${escapeHtml(l.teamName)} (${tl}: <s>${escapeHtml(String(l.origLine||''))}</s> → ${escapeHtml(String(l.line))})</div>`;
    }).join('');
    riskVal = b.risk;
    winVal = win;
  } else if (b.type === 'parlay' || (b.legCount && b.legs)) {
    const win = b.win || ((b.decOdds - 1) * b.risk);
    topName = `🎰 ${b.legCount}-Leg Parlay`;
    metaTxt = `Odds: ${b.amOdds || ''} (${parseFloat(b.decOdds || 1).toFixed(3)}x) · ${b.placed || ''}`;
    legsHtml = (b.legs || []).map((l, j) => {
      const label = isPropLeg(l)
        ? `${escapeHtml(l.propPlayer)} (${escapeHtml(propMktLabel(l))}: ${escapeHtml(propSide(l))} ${escapeHtml(propLineNum(l))})`
        : `${escapeHtml(l.teamName)} (${escapeHtml(({spread:'Spread',ml:'ML',total:'Total',tt:'TT'}[l.type] || l.type))}: ${escapeHtml(String(l.line))})`;
      return `<div class="mob-betcard-legrow"><b style="color:var(--color-bet-brand, #2a6b75)">${j+1}.</b> ${label}</div>`;
    }).join('');
    riskVal = b.risk;
    winVal = win;
  } else {
    const win = b.win || calcWin(b.risk || 0, b.vig || b.line);
    const risk = b.risk || calcRisk(b.win || 0, b.vig || b.line);
    if (isPropLeg(b)) {
      topName = `${b.propPlayer} — ${propMktLabel(b)}`;
      metaTxt = `${b.sport || ''} · ${propSide(b)} ${propLineNum(b)}${b.vig ? ' ('+b.vig+')' : ''} · ${b.placed || ''}`;
    } else {
      const tl = {spread:'Spread',ml:'Moneyline',total:'Total',tt:'Team Total'}[b.type] || b.type;
      topName = b.teamName || '';
      metaTxt = `${b.sport || ''} · ${tl}: ${b.line}${b.vig && b.vig !== b.line ? ' ('+b.vig+')' : ''} · ${b.placed || ''}`;
    }
    riskVal = risk;
    winVal = win;
  }

  card.innerHTML = `
    <div class="mob-betcard-top">
      <span class="mob-betcard-name">${escapeHtml(topName)}</span>
      ${betStatusBadge(b.status, 'mob-betcard-st')}
    </div>
    <div class="mob-betcard-meta">${escapeHtml(metaTxt)}</div>
    ${legsHtml ? `<div class="mob-betcard-legs">${legsHtml}</div>` : ''}
    <div class="mob-betcard-amts">
      <div class="mob-betcard-amt"><label>${riskLbl}</label><div class="v r">${fmtUSD(riskVal || 0)}</div></div>
      <div class="mob-betcard-amt"><label>${winLbl}</label><div class="v g">${fmtUSD(winVal || 0)}</div></div>
    </div>
  `;

  if (b.status === 'pending') {
    const sr = document.createElement('div');
    sr.className = 'mob-betcard-settle';
    if (b.type === 'reverse') {
      sr.innerHTML = `<button class="mob-settle-btn won" data-idx="${idx}" style="grid-column:1/-1">Settle Legs (A/B) →</button>`;
      sr.querySelector('.mob-settle-btn').addEventListener('click', e => openRVSettleMobile(parseInt(e.currentTarget.dataset.idx, 10)));
      card.appendChild(sr);
      return card;
    }
    sr.innerHTML = `
      <button class="mob-settle-btn won"  data-idx="${idx}" data-outcome="won">✓ Won</button>
      <button class="mob-settle-btn push" data-idx="${idx}" data-outcome="push">↺ Push</button>
      <button class="mob-settle-btn lost" data-idx="${idx}" data-outcome="lost">✕ Lost</button>
    `;
    sr.querySelectorAll('.mob-settle-btn').forEach(btn => {
      btn.addEventListener('click', e => settleBetMobile(parseInt(e.currentTarget.dataset.idx, 10), e.currentTarget.dataset.outcome));
    });
    card.appendChild(sr);
  }
  return card;
}

function settleBetMobile(idx, outcome) {
  const b = state.placedBets[idx];
  if (!b || b.status !== 'pending') return;
  if (outcome === 'won')       { state.balance += (b.risk || 0) + (b.win || 0); }
  else if (outcome === 'push') { state.balance += (b.risk || 0); }
  b.status = outcome;
  b.settled = new Date().toLocaleString();
  localStorage.setItem('bs_bets', JSON.stringify(state.placedBets));
  localStorage.setItem('bs_bal', String(state.balance));
  updateBalDisp();
  updateBadges();
  renderMobileBets();
  showToast(`Bet marked as ${outcome.toUpperCase()}`);
}

// Reverse settlement modal (mobile) — leg-level outcomes for A and B.
let _rvSetIdxMob = -1;
let _rvSetOutMob = { a: 'won', b: 'won' };
function chainProfitMob(trigOut, nextOut, decTrig, decNext, stake) {
  if (trigOut === 'lost') return -stake;
  const tp = trigOut === 'won' ? (decTrig - 1) * stake : 0;
  if (nextOut === 'won') return tp + (decNext - 1) * stake;
  if (nextOut === 'lost') return tp - stake;
  return tp;
}
function computeRVNetMob(bet, outA, outB) {
  const [a, b] = bet.legs;
  const decA = toDec(a.vig || a.line);
  const decB = toDec(b.vig || b.line);
  return chainProfitMob(outA, outB, decA, decB, bet.stake) + chainProfitMob(outB, outA, decB, decA, bet.stake);
}
function openRVSettleMobile(idx) {
  const b = state.placedBets[idx];
  if (!b || b.type !== 'reverse' || b.status !== 'pending') return;
  _rvSetIdxMob = idx;
  _rvSetOutMob = { a: 'won', b: 'won' };
  document.getElementById('mob-review-title').textContent = 'Settle Reverse';
  const body = document.getElementById('mob-review-body');
  body.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'mob-rv-card';
  b.legs.forEach((leg, i) => {
    const lblK = i === 0 ? 'a' : 'b';
    const lblD = lblK.toUpperCase();
    const teamLabel = isPropLeg(leg) ? `${leg.propPlayer} ${propSide(leg)} ${propLineNum(leg)}` : `${leg.teamName} (${leg.line})`;
    const row = document.createElement('div');
    row.className = 'mob-rv-leg';
    row.innerHTML = `
      <div class="mob-rv-leg-num">${lblD}</div>
      <div class="mob-rv-leg-info"><div class="mob-rv-leg-team">${escapeHtml(teamLabel)}</div></div>`;
    const settleRow = document.createElement('div');
    settleRow.className = 'mob-betcard-settle';
    settleRow.style.gridColumn = '1 / -1';
    settleRow.dataset.lbl = lblK;
    settleRow.innerHTML = `
      <button class="mob-settle-btn won active" data-outcome="won">✓ Won</button>
      <button class="mob-settle-btn push" data-outcome="push">↺ Push</button>
      <button class="mob-settle-btn lost" data-outcome="lost">✕ Lost</button>`;
    settleRow.querySelectorAll('.mob-settle-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        const lk = e.currentTarget.parentElement.dataset.lbl;
        _rvSetOutMob[lk] = e.currentTarget.dataset.outcome;
        e.currentTarget.parentElement.querySelectorAll('.mob-settle-btn').forEach(x => x.classList.remove('active'));
        e.currentTarget.classList.add('active');
        updateRVPreviewMob();
      });
    });
    card.appendChild(row);
    card.appendChild(settleRow);
  });
  const preview = document.createElement('div');
  preview.className = 'mob-rv-val';
  preview.id = 'mob-rv-set-preview';
  card.appendChild(preview);
  body.appendChild(card);
  const btn = document.createElement('button');
  btn.className = 'mob-rv-confirm';
  btn.textContent = 'Settle →';
  btn.onclick = confirmRVSettleMob;
  body.appendChild(btn);
  updateRVPreviewMob();
  document.getElementById('mob-review-overlay').classList.add('open');
}
function updateRVPreviewMob() {
  const b = state.placedBets[_rvSetIdxMob];
  if (!b) return;
  const net = computeRVNetMob(b, _rvSetOutMob.a, _rvSetOutMob.b);
  const sign = net >= 0 ? '+' : '−';
  document.getElementById('mob-rv-set-preview').innerHTML = `Net P/L: <strong>${sign}${fmtUSD(Math.abs(net))}</strong> · Returned ${fmtUSD(b.risk + net)}`;
}
function confirmRVSettleMob() {
  const b = state.placedBets[_rvSetIdxMob];
  if (!b || b.status !== 'pending') { closeReview(); return; }
  const net = computeRVNetMob(b, _rvSetOutMob.a, _rvSetOutMob.b);
  state.balance += b.risk + net;
  b.status = net > 0 ? 'won' : net < 0 ? 'lost' : 'push';
  b.legOutcomes = { ..._rvSetOutMob };
  b.netProfit = net;
  b.settled = new Date().toLocaleString();
  localStorage.setItem('bs_bets', JSON.stringify(state.placedBets));
  localStorage.setItem('bs_bal', String(state.balance));
  updateBalDisp();
  updateBadges();
  renderMobileBets();
  closeReview();
  const sign = net >= 0 ? '+' : '−';
  showToast(`Reverse settled: ${sign}${fmtUSD(Math.abs(net))}`);
}

function openReview() {
  const mode = state.wagerMode;
  if (mode === 'straight') {
    if (!state.slip.length) { showToast('Add a wager first'); return; }
    document.getElementById('mob-review-title').textContent = 'Review · Straight';
    renderReviewStraight();
  } else if (mode === 'parlay') {
    if (state.parlayLegs.length < 2) { showToast('Need at least 2 legs'); return; }
    document.getElementById('mob-review-title').textContent = `${state.parlayLegs.length}-Leg Parlay`;
    renderReviewParlay();
  } else if (mode === 'ifbet') {
    if (state.ifBetLegs.length < 2) { showToast('Need at least 2 legs'); return; }
    document.getElementById('mob-review-title').textContent = `${state.ifBetLegs.length}-Leg If Bet`;
    renderReviewIfBet();
  } else if (mode === 'reverse') {
    if (state.reverseLegs.length !== 2) { showToast('Reverse Action: exactly 2 teams'); return; }
    document.getElementById('mob-review-title').textContent = '2-Team Reverse Action';
    renderReviewReverse();
  } else if (mode === 'teaser') {
    const v = state.teaserVariant ? getVariant(state.teaserVariant) : null;
    if (!v || state.teaserLegs.length < v.minLegs) { showToast('Pick a teaser variant + legs'); return; }
    document.getElementById('mob-review-title').textContent = `${state.teaserLegs.length}-Pick ${v.label}`;
    renderReviewTeaser();
  }
  document.getElementById('mob-review-overlay').classList.add('open');
}
function closeReview() {
  document.getElementById('mob-review-overlay').classList.remove('open');
}

function legRowHtml(leg, idxLabel, oddsTxt) {
  const titleTxt = isPropLeg(leg) ? leg.propPlayer : leg.teamName;
  let subTxt;
  if (isPropLeg(leg)) {
    subTxt = `${propMktLabel(leg)} · ${propSide(leg)} ${propLineNum(leg)}`;
  } else {
    const tl = {spread:'Spread',ml:'Moneyline',total:'Total',tt:'Team Total'}[leg.type] || leg.type;
    subTxt = `${tl} · ${leg.matchup || ''}`;
  }
  return `
    <div class="mob-rv-leg">
      <div class="mob-rv-leg-num">${idxLabel}</div>
      <div class="mob-rv-leg-info">
        <div class="mob-rv-leg-team">${escapeHtml(titleTxt)}</div>
        <div class="mob-rv-leg-sub">${escapeHtml(subTxt)}</div>
      </div>
      <div class="mob-rv-leg-odds">${escapeHtml(oddsTxt)}</div>
    </div>`;
}

function renderReviewStraight() {
  const body = document.getElementById('mob-review-body');
  body.innerHTML = '';
  if (!state.slip.length) {
    body.innerHTML = emptyState({
      icon: '📋',
      heading: 'Nothing to review',
      sub: 'Add a wager from the board first.',
    });
    return;
  }
  const card = document.createElement('div');
  card.className = 'mob-rv-card';

  state.slip.forEach((s, i) => {
    const win = parseFloat(s.win) || 0;
    const risk = calcRisk(win, s.vig || s.line);
    const oddsTxt = isPropLeg(s)
      ? `${propSide(s)} ${propLineNum(s)}${s.vig ? ' ('+s.vig+')' : ''}`
      : `${s.line}${s.vig && s.vig !== s.line ? ' ('+s.vig+')' : ''}`;
    const titleTxt = isPropLeg(s) ? s.propPlayer : s.teamName;
    const subTxt = isPropLeg(s)
      ? `${propMktLabel(s)} · ${s.matchup || ''}`
      : `${({spread:'Spread',ml:'Moneyline',total:'Total',tt:'Team Total'}[s.type] || s.type)} · ${s.matchup || ''}`;

    const row = document.createElement('div');
    row.className = 'mob-rv-leg';
    row.innerHTML = `
      <button class="mob-rv-leg-rm" data-key="${escapeHtml(s.key)}" title="Remove">✕</button>
      <div class="mob-rv-leg-info">
        <div class="mob-rv-leg-team">${escapeHtml(titleTxt)}</div>
        <div class="mob-rv-leg-sub">${escapeHtml(subTxt)}</div>
      </div>
      <div class="mob-rv-leg-odds">${escapeHtml(oddsTxt)}</div>
    `;
    card.appendChild(row);

    const winRow = document.createElement('div');
    winRow.className = 'mob-rv-row';
    winRow.innerHTML = `
      <label>Win ($)</label>
      <input type="number" min="20" step="5" value="${win.toFixed(2)}" data-key="${escapeHtml(s.key)}" data-role="win">
    `;
    card.appendChild(winRow);

    const riskRow = document.createElement('div');
    riskRow.className = 'mob-rv-row';
    riskRow.innerHTML = `<label>Risk</label><div class="v r">${fmtUSD(risk)}</div>`;
    card.appendChild(riskRow);

    if (win > 0 && win < 20) {
      const v = document.createElement('div');
      v.className = 'mob-rv-val';
      v.textContent = '⚠ Min $20';
      card.appendChild(v);
    }
  });

  const valid = state.slip.filter(s => (parseFloat(s.win) || 0) >= 20);
  const totWin = valid.reduce((a, s) => a + (parseFloat(s.win) || 0), 0);
  const totRisk = valid.reduce((a, s) => a + calcRisk(parseFloat(s.win) || 0, s.vig || s.line), 0);
  const summ = document.createElement('div');
  summ.className = 'mob-rv-row';
  summ.style.borderTop = '1px solid var(--color-bet-border, #ccd0d4)';
  summ.style.paddingTop = '8px';
  summ.innerHTML = `<label>Total Win / Risk</label><div><span class="v g">${fmtUSD(totWin)}</span> / <span class="v r">${fmtUSD(totRisk)}</span></div>`;
  card.appendChild(summ);

  body.appendChild(card);

  const btn = document.createElement('button');
  btn.className = 'mob-rv-confirm';
  btn.id = 'mob-rv-confirm';
  btn.textContent = valid.length ? `Place ${valid.length} Wager${valid.length > 1 ? 's' : ''} →` : 'Enter win amount';
  btn.disabled = !valid.length || totRisk > state.balance;
  if (totRisk > state.balance) btn.textContent = 'Insufficient balance';
  btn.onclick = confirmStraightMobile;
  body.appendChild(btn);

  card.querySelectorAll('input[data-role="win"]').forEach(inp => {
    inp.addEventListener('input', e => {
      const key = e.currentTarget.dataset.key;
      const idx = state.slip.findIndex(s => s.key === key);
      if (idx > -1) state.slip[idx].win = parseFloat(e.currentTarget.value) || 0;
      renderReviewStraight();
    });
  });
  card.querySelectorAll('.mob-rv-leg-rm').forEach(b => {
    b.addEventListener('click', e => {
      const key = e.currentTarget.dataset.key;
      delete state.selCells[key];
      state.slip = state.slip.filter(s => s.key !== key);
      if (!state.slip.length) { closeReview(); renderBoard(); updateBadges(); return; }
      renderReviewStraight();
      renderBoard();
      updateBadges();
    });
  });
}

function confirmStraightMobile() {
  const valid = state.slip.filter(s => (parseFloat(s.win) || 0) >= 20);
  if (!valid.length) { showToast('Minimum win amount is $20'); return; }
  const totRisk = valid.reduce((a, s) => a + calcRisk(parseFloat(s.win) || 0, s.vig || s.line), 0);
  if (totRisk > state.balance) { showToast('Insufficient balance'); return; }
  state.balance -= totRisk;
  const now = new Date().toLocaleString();
  valid.forEach(s => {
    const risk = calcRisk(parseFloat(s.win) || 0, s.vig || s.line);
    state.placedBets.push({ ...s, type:'straight', risk, placed: now, status: 'pending' });
  });
  localStorage.setItem('bs_bets', JSON.stringify(state.placedBets));
  localStorage.setItem('bs_bal', String(state.balance));
  state.slip = [];
  state.selCells = {};
  updateBalDisp();
  updateBadges();
  renderBoard();
  closeReview();
  showToast('✓ Wager placed! Good luck.');
}

function renderReviewParlay() {
  const body = document.getElementById('mob-review-body');
  body.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'mob-rv-card';

  state.parlayLegs.forEach((leg, i) => {
    const oddsTxt = isPropLeg(leg)
      ? `${propSide(leg)} ${propLineNum(leg)}${leg.vig ? ' ('+leg.vig+')' : ''}`
      : `${leg.line}${leg.vig && leg.vig !== leg.line ? ' ('+leg.vig+')' : ''}`;
    card.insertAdjacentHTML('beforeend', legRowHtml(leg, String(i + 1), oddsTxt));
  });

  const dec = parlayDec(state.parlayLegs);
  const oddsRow = document.createElement('div');
  oddsRow.className = 'mob-rv-row';
  oddsRow.innerHTML = `<label>Combined Odds</label><div class="v">${decToAm(dec)} (${dec.toFixed(3)}x)</div>`;
  card.appendChild(oddsRow);

  const riskRow = document.createElement('div');
  riskRow.className = 'mob-rv-row';
  riskRow.innerHTML = `
    <label>Risk ($)</label>
    <input type="number" min="20" step="5" value="20" id="mob-pm-risk">
  `;
  card.appendChild(riskRow);

  const winRow = document.createElement('div');
  winRow.className = 'mob-rv-row';
  winRow.innerHTML = `<label>To Win</label><div class="v g" id="mob-pm-win">${fmtUSD((dec - 1) * 20)}</div>`;
  card.appendChild(winRow);

  const valEl = document.createElement('div');
  valEl.className = 'mob-rv-val';
  valEl.id = 'mob-pm-val';
  card.appendChild(valEl);

  body.appendChild(card);

  const btn = document.createElement('button');
  btn.className = 'mob-rv-confirm';
  btn.id = 'mob-rv-confirm';
  btn.textContent = `Place ${state.parlayLegs.length}-Leg Parlay →`;
  btn.onclick = confirmParlayMobile;
  body.appendChild(btn);

  const recalc = () => {
    const inp = document.getElementById('mob-pm-risk');
    const risk = parseFloat(inp.value) || 0;
    const win = (dec - 1) * risk;
    document.getElementById('mob-pm-win').textContent = fmtUSD(win);
    const valid = risk >= 20 && risk <= state.balance;
    valEl.textContent = risk < 20 ? '⚠ Min $20' : (risk > state.balance ? '⚠ Insufficient balance' : '');
    btn.disabled = !valid;
    btn.textContent = risk > state.balance ? 'Insufficient balance' : `Place ${state.parlayLegs.length}-Leg Parlay →`;
  };
  document.getElementById('mob-pm-risk').addEventListener('input', recalc);
  recalc();
}

function confirmParlayMobile() {
  const risk = parseFloat(document.getElementById('mob-pm-risk').value) || 0;
  if (risk < 20) { showToast('Min $20'); return; }
  if (risk > state.balance) { showToast('Insufficient balance'); return; }
  const dec = parlayDec(state.parlayLegs);
  const win = (dec - 1) * risk;
  state.balance -= risk;
  state.placedBets.push({
    type: 'parlay',
    legs: state.parlayLegs.map(l => ({
      teamName: l.teamName, matchup: l.matchup, type: l.type, line: l.line, vig: l.vig,
      propPlayer: l.propPlayer, propSide: l.propSide, propMkt: l.propMkt,
    })),
    legCount: state.parlayLegs.length,
    decOdds: dec, amOdds: decToAm(dec), risk, win,
    placed: new Date().toLocaleString(), status: 'pending',
  });
  localStorage.setItem('bs_bets', JSON.stringify(state.placedBets));
  localStorage.setItem('bs_bal', String(state.balance));
  state.parlayLegs.forEach(l => delete state.selCells[l.key]);
  state.parlayLegs = [];
  updateBalDisp();
  updateBadges();
  renderBoard();
  closeReview();
  showToast(`✓ Parlay placed! To win ${fmtUSD(win)}`);
}

function renderReviewIfBet() {
  const body = document.getElementById('mob-review-body');
  body.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'mob-rv-card';

  state.ifBetLegs.forEach((leg, i) => {
    const win = parseFloat(leg.win) || 0;
    const risk = calcRisk(win, leg.vig || leg.line);
    const rule = i === 0 ? 'always fires' : (leg.fireRule === 'winOrPush' ? 'if win/push' : 'if win');
    const oddsTxt = isPropLeg(leg)
      ? `${propSide(leg)} ${propLineNum(leg)}${leg.vig ? ' ('+leg.vig+')' : ''}`
      : `${leg.line}${leg.vig && leg.vig !== leg.line ? ' ('+leg.vig+')' : ''}`;
    const titleTxt = isPropLeg(leg) ? leg.propPlayer : leg.teamName;
    const subTxt = isPropLeg(leg)
      ? `${propMktLabel(leg)} · ${rule}`
      : `${({spread:'Spread',ml:'ML',total:'Total',tt:'TT'}[leg.type] || leg.type)} · ${rule}`;

    const row = document.createElement('div');
    row.className = 'mob-rv-leg';
    row.innerHTML = `
      <div class="mob-rv-leg-num">${i + 1}</div>
      <div class="mob-rv-leg-info">
        <div class="mob-rv-leg-team">${escapeHtml(titleTxt)}</div>
        <div class="mob-rv-leg-sub">${escapeHtml(subTxt)}</div>
      </div>
      <div class="mob-rv-leg-odds">${escapeHtml(oddsTxt)}</div>
    `;
    card.appendChild(row);

    const winRow = document.createElement('div');
    winRow.className = 'mob-rv-row';
    winRow.innerHTML = `
      <label>Leg ${i+1} Win ($)</label>
      <input type="number" min="20" step="5" value="${win.toFixed(2)}" data-idx="${i}" data-role="ifwin">
    `;
    card.appendChild(winRow);

    const riskRow = document.createElement('div');
    riskRow.className = 'mob-rv-row';
    riskRow.innerHTML = `<label>Leg ${i+1} Risk</label><div class="v r">${fmtUSD(risk)}</div>`;
    card.appendChild(riskRow);
  });

  const leg1 = state.ifBetLegs[0];
  const leg1Risk = calcRisk(parseFloat(leg1.win) || 0, leg1.vig || leg1.line);
  const totalWin = state.ifBetLegs.reduce((a, l) => a + (parseFloat(l.win) || 0), 0);

  const totRow = document.createElement('div');
  totRow.className = 'mob-rv-row';
  totRow.style.borderTop = '1px solid var(--color-bet-border, #ccd0d4)';
  totRow.style.paddingTop = '8px';
  totRow.innerHTML = `<label>Total Risk (Leg 1)</label><div class="v r" id="mob-if-totrisk">${fmtUSD(leg1Risk)}</div>`;
  card.appendChild(totRow);

  const winTot = document.createElement('div');
  winTot.className = 'mob-rv-row';
  winTot.innerHTML = `<label>Max Win (all hit)</label><div class="v g" id="mob-if-totwin">${fmtUSD(totalWin)}</div>`;
  card.appendChild(winTot);

  const valEl = document.createElement('div');
  valEl.className = 'mob-rv-val';
  valEl.id = 'mob-if-val';
  card.appendChild(valEl);

  body.appendChild(card);

  const btn = document.createElement('button');
  btn.className = 'mob-rv-confirm';
  btn.id = 'mob-rv-confirm';
  btn.textContent = `Place ${state.ifBetLegs.length}-Leg If Bet →`;
  btn.onclick = confirmIfBetMobile;
  body.appendChild(btn);

  const recalc = () => {
    const leg1b = state.ifBetLegs[0];
    const r = calcRisk(parseFloat(leg1b.win) || 0, leg1b.vig || leg1b.line);
    const w = state.ifBetLegs.reduce((a, l) => a + (parseFloat(l.win) || 0), 0);
    document.getElementById("mob-if-totrisk").textContent = fmtUSD(r);
    document.getElementById("mob-if-totwin").textContent = fmtUSD(w);
    const minOk = state.ifBetLegs.every((l) => (parseFloat(l.win) || 0) >= 20);
    const balOk = r <= state.balance;
    valEl.textContent = !minOk ? "\u26A0 Each leg must win at least $20" : !balOk ? "\u26A0 Leg 1 risk exceeds balance" : "";
    btn.disabled = !minOk || !balOk;
    btn.textContent = !balOk ? "Insufficient balance" : `Place ${state.ifBetLegs.length}-Leg If Bet \u2192`;
  };
  card.querySelectorAll('input[data-role="ifwin"]').forEach((inp) => {
    inp.addEventListener("input", (e) => {
      const i = parseInt(e.currentTarget.dataset.idx, 10);
      if (!state.ifBetLegs[i]) return;
      state.ifBetLegs[i].win = parseFloat(e.currentTarget.value) || 0;
      recalc();
    });
  });
  recalc();
}
function confirmIfBetMobile() {
  const n = state.ifBetLegs.length;
  if (n < 2) {
    showToast("Min 2 legs");
    return;
  }
  if (!state.ifBetLegs.every((l) => (parseFloat(l.win) || 0) >= 20)) {
    showToast("Each leg must win at least $20");
    return;
  }
  const leg1Risk = calcRisk(parseFloat(state.ifBetLegs[0].win) || 0, state.ifBetLegs[0].vig || state.ifBetLegs[0].line);
  if (leg1Risk > state.balance) {
    showToast("Insufficient balance");
    return;
  }
  const totalWin = state.ifBetLegs.reduce((a, l) => a + (parseFloat(l.win) || 0), 0);
  state.balance -= leg1Risk;
  state.placedBets.push({
    type: "ifbet",
    legs: state.ifBetLegs.map((l) => ({
      teamName: l.teamName,
      matchup: l.matchup,
      type: l.type,
      line: l.line,
      vig: l.vig,
      win: l.win,
      fireRule: l.fireRule,
      sport: l.sport,
      propPlayer: l.propPlayer,
      propSide: l.propSide,
      propMkt: l.propMkt
    })),
    legCount: n,
    risk: leg1Risk,
    win: totalWin,
    placed: (/* @__PURE__ */ new Date()).toLocaleString(),
    status: "pending"
  });
  localStorage.setItem("bs_bets", JSON.stringify(state.placedBets));
  localStorage.setItem("bs_bal", String(state.balance));
  state.ifBetLegs.forEach((l) => delete state.selCells[l.key]);
  state.ifBetLegs = [];
  updateBalDisp();
  updateBadges();
  renderBoard();
  closeReview();
  showToast(`\u2713 ${n}-leg if bet placed! Risk ${fmtUSD(leg1Risk)}`);
}

function renderReviewReverse() {
  const body = document.getElementById('mob-review-body');
  body.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'mob-rv-card';

  state.reverseLegs.forEach((leg, i) => {
    const lblK = i === 0 ? 'A' : 'B';
    const oddsTxt = isPropLeg(leg)
      ? `${propSide(leg)} ${propLineNum(leg)}${leg.vig ? ' ('+leg.vig+')' : ''}`
      : `${leg.line}${leg.vig && leg.vig !== leg.line ? ' ('+leg.vig+')' : ''}`;
    const titleTxt = isPropLeg(leg) ? leg.propPlayer : leg.teamName;
    const subTxt = isPropLeg(leg)
      ? `${propMktLabel(leg)} · ${i === 0 ? 'TRIGGER → B' : 'TRIGGER → A'}`
      : `${({spread:'Spread',ml:'ML',total:'Total',tt:'TT'}[leg.type] || leg.type)} · ${i === 0 ? 'TRIGGER → B' : 'TRIGGER → A'}`;
    const row = document.createElement('div');
    row.className = 'mob-rv-leg';
    row.innerHTML = `
      <div class="mob-rv-leg-num">${lblK}</div>
      <div class="mob-rv-leg-info">
        <div class="mob-rv-leg-team">${escapeHtml(titleTxt)}</div>
        <div class="mob-rv-leg-sub">${escapeHtml(subTxt)}</div>
      </div>
      <div class="mob-rv-leg-odds">${escapeHtml(oddsTxt)}</div>
    `;
    card.appendChild(row);
  });

  const stake = state.reverseStake || 50;
  const stakeRow = document.createElement('div');
  stakeRow.className = 'mob-rv-row';
  stakeRow.innerHTML = `<label>Stake per play ($)</label><input type="number" min="20" step="5" value="${stake}" id="mob-rv-stake">`;
  card.appendChild(stakeRow);

  const riskRow = document.createElement('div');
  riskRow.className = 'mob-rv-row';
  riskRow.innerHTML = `<label>Total Risk (2 × stake)</label><div class="v r" id="mob-rv-risk">${fmtUSD(2 * stake)}</div>`;
  card.appendChild(riskRow);

  const winRow = document.createElement('div');
  winRow.className = 'mob-rv-row';
  winRow.innerHTML = `<label>Max Win</label><div class="v g" id="mob-rv-maxwin">${fmtUSD(0)}</div>`;
  card.appendChild(winRow);

  const valEl = document.createElement('div');
  valEl.className = 'mob-rv-val';
  valEl.id = 'mob-rv-val';
  card.appendChild(valEl);

  body.appendChild(card);

  const btn = document.createElement('button');
  btn.className = 'mob-rv-confirm';
  btn.id = 'mob-rv-place-btn';
  btn.textContent = `Place Reverse →`;
  btn.onclick = confirmReverseMobile;
  body.appendChild(btn);

  const a = state.reverseLegs[0], b2 = state.reverseLegs[1];
  const recalc = () => {
    const s = parseFloat(document.getElementById('mob-rv-stake').value) || 0;
    const risk = 2 * s;
    const decA = toDec(a.vig || a.line), decB = toDec(b2.vig || b2.line);
    const maxWin = 2 * s * ((decA - 1) + (decB - 1));
    document.getElementById('mob-rv-risk').textContent = fmtUSD(risk);
    document.getElementById('mob-rv-maxwin').textContent = fmtUSD(maxWin);
    const minOk = s >= 20;
    const balOk = risk <= state.balance;
    valEl.textContent = !minOk ? '⚠ Min $20 stake per play' : (!balOk ? '⚠ Total risk exceeds balance' : '');
    btn.disabled = !minOk || !balOk;
    btn.textContent = !balOk ? 'Insufficient balance' : `Place Reverse (Risk ${fmtUSD(risk)}) →`;
  };
  document.getElementById('mob-rv-stake').addEventListener('input', recalc);
  recalc();
}

function confirmReverseMobile() {
  if (state.reverseLegs.length !== 2) { showToast('Reverse Action: exactly 2 teams'); return; }
  const stake = parseFloat(document.getElementById('mob-rv-stake').value) || 0;
  if (stake < 20) { showToast('Min $20 stake per play'); return; }
  const risk = 2 * stake;
  if (risk > state.balance) { showToast('Insufficient balance'); return; }
  const decA = toDec(state.reverseLegs[0].vig || state.reverseLegs[0].line);
  const decB = toDec(state.reverseLegs[1].vig || state.reverseLegs[1].line);
  const maxWin = 2 * stake * ((decA - 1) + (decB - 1));
  state.balance -= risk;
  state.reverseStake = stake;
  state.placedBets.push({
    type: 'reverse',
    variant: '2team',
    legs: state.reverseLegs.map(l => ({
      teamName: l.teamName, matchup: l.matchup, type: l.type, line: l.line, vig: l.vig, sport: l.sport,
      propPlayer: l.propPlayer, propSide: l.propSide, propMkt: l.propMkt,
    })),
    stake, risk, win: maxWin,
    placed: new Date().toLocaleString(), status: 'pending',
  });
  localStorage.setItem('bs_bets', JSON.stringify(state.placedBets));
  localStorage.setItem('bs_bal', String(state.balance));
  state.reverseLegs.forEach(l => delete state.selCells[l.key]);
  state.reverseLegs = [];
  updateBalDisp();
  updateBadges();
  renderBoard();
  closeReview();
  showToast(`✓ Reverse Action placed! Risk ${fmtUSD(risk)} → max ${fmtUSD(maxWin)}`);
}

function renderReviewTeaser() {
  const body = document.getElementById("mob-review-body");
  body.innerHTML = "";
  const v = getVariant(state.teaserVariant);
  if (!v) {
    body.innerHTML = emptyState({ icon: "\u{1F3AF}", heading: "Pick a teaser variant", sub: "Choose PRIME 6 / 6.5 / 7 or a sweetheart variant before reviewing." });
    return;
  }
  const card = document.createElement("div");
  card.className = "mob-rv-card";
  state.teaserLegs.forEach((leg, i) => {
    const tl = { spread: "Spread", total: "Total" }[leg.type] || leg.type;
    const oddsTxt = `${leg.origLine} \u2192 ${leg.shiftedLine}`;
    const row = document.createElement("div");
    row.className = "mob-rv-leg";
    row.innerHTML = `
    <div class="mob-rv-leg-num">${i + 1}</div>
    <div class="mob-rv-leg-info">
      <div class="mob-rv-leg-team">${escapeHtml(leg.teamName)}</div>
      <div class="mob-rv-leg-sub">${escapeHtml(tl)} \xB7 ${escapeHtml(leg.matchup || "")}</div>
    </div>
    <div class="mob-rv-leg-odds">${escapeHtml(oddsTxt)}</div>
  `;
    card.appendChild(row);
  });
  const n = state.teaserLegs.length;
  const am = v.payouts && v.payouts[n] ? v.payouts[n] : null;
  const oddsRow = document.createElement("div");
  oddsRow.className = "mob-rv-row";
  oddsRow.innerHTML = `<label>Payout Odds</label><div class="v">${escapeHtml(am || "\u2014")}</div>`;
  card.appendChild(oddsRow);
  const riskRow = document.createElement("div");
  riskRow.className = "mob-rv-row";
  riskRow.innerHTML = `
  <label>Risk ($)</label>
  <input type="number" min="20" step="5" value="20" id="mob-tm-risk">
`;
  card.appendChild(riskRow);
  const winRow = document.createElement("div");
  winRow.className = "mob-rv-row";
  winRow.innerHTML = `<label>To Win</label><div class="v g" id="mob-tm-win">${fmtUSD(am ? calcWin(20, am) : 0)}</div>`;
  card.appendChild(winRow);
  const valEl = document.createElement("div");
  valEl.className = "mob-rv-val";
  valEl.id = "mob-tm-val";
  card.appendChild(valEl);
  body.appendChild(card);
  const btn = document.createElement("button");
  btn.className = "mob-rv-confirm";
  btn.id = "mob-rv-confirm";
  btn.textContent = am ? `Place ${n}-Pick ${v.label} \u2192` : "Invalid leg count";
  btn.disabled = !am;
  btn.onclick = confirmTeaserMobile;
  body.appendChild(btn);
  const recalc = () => {
    const inp = document.getElementById("mob-tm-risk");
    const risk = parseFloat(inp.value) || 0;
    if (!am) {
      btn.disabled = true;
      return;
    }
    const win = calcWin(risk, am);
    document.getElementById("mob-tm-win").textContent = fmtUSD(win);
    const valid = risk >= 20 && risk <= state.balance;
    valEl.textContent = risk < 20 ? "\u26A0 Min $20" : risk > state.balance ? "\u26A0 Insufficient balance" : "";
    btn.disabled = !valid;
    btn.textContent = risk > state.balance ? "Insufficient balance" : `Place ${n}-Pick ${v.label} \u2192`;
  };
  document.getElementById("mob-tm-risk").addEventListener("input", recalc);
  recalc();
}
function confirmTeaserMobile() {
  const v = getVariant(state.teaserVariant);
  if (!v) return;
  const n = state.teaserLegs.length;
  const risk = parseFloat(document.getElementById("mob-tm-risk").value) || 0;
  const am = v.payouts && v.payouts[n] ? v.payouts[n] : null;
  if (!am) {
    showToast("Invalid leg count");
    return;
  }
  if (risk < 20) {
    showToast("Min $20");
    return;
  }
  if (risk > state.balance) {
    showToast("Insufficient balance");
    return;
  }
  const win = calcWin(risk, am);
  state.balance -= risk;
  state.placedBets.push({
    type: "teaser",
    variant: v.label,
    legs: state.teaserLegs.map((l) => ({ teamName: l.teamName, matchup: l.matchup, type: l.type, origLine: l.origLine, line: l.shiftedLine, sport: l.sport })),
    legCount: n,
    amOdds: am,
    risk,
    win,
    placed: (/* @__PURE__ */ new Date()).toLocaleString(),
    status: "pending"
  });
  localStorage.setItem("bs_bets", JSON.stringify(state.placedBets));
  localStorage.setItem("bs_bal", String(state.balance));
  state.teaserLegs.forEach((l) => delete state.selCells[l.key]);
  state.teaserLegs = [];
  updateBalDisp();
  updateBadges();
  renderBoard();
  closeReview();
  showToast(`\u2713 ${n}-pick ${v.label} placed! To win ${fmtUSD(win)}`);
}
setApiHooks({ renderBoard, showBoardMsg, showToast });
function init() {
  if (window.MOCK_DATA && localStorage.getItem("bs_mock") !== "0") {
    state.mockMode = true;
  }
  state.activeLeague = "NBA";
  updateBalDisp();
  const mockCbx = document.getElementById("mock-cbx");
  if (mockCbx) {
    mockCbx.checked = state.mockMode;
    mockCbx.disabled = !window.MOCK_DATA;
  }
  const bookSel = document.getElementById("book-sel");
  if (bookSel) bookSel.value = state.prefBook;
  const apiInp = document.getElementById("api-key-inp");
  if (apiInp && state.apiKey && state.apiKey !== "YOUR_API_KEY_HERE") apiInp.value = state.apiKey;
  document.querySelectorAll(".mob-stab").forEach((t) => {
    const sport = t.dataset.sport;
    if (sport && !t.querySelector("svg")) {
      t.insertAdjacentHTML("afterbegin", leagueIconHtml(sport, 14));
    }
    t.classList.toggle("active", t.dataset.sport === "NBA");
  });
  const cfg0 = SPORT_BY_KEY[state.activeLeague] || SPORT_BY_KEY.NBA;
  document.getElementById("board-title").textContent = `${state.activeLeague} \u2014 ${cfg0?.label || ""}`;
  updateTeaserGating();
  if (state.mockMode || state.apiKey && state.apiKey !== "YOUR_API_KEY_HERE") {
    fetchAndRender(state.activeLeague, true);
    if (!state.mockMode) startAuto();
  } else {
    showBoardMsg("key");
  }
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
window.addEventListener("beforeunload", () => {
  localStorage.setItem("bs_bal", String(state.balance));
  localStorage.setItem("bs_bets", JSON.stringify(state.placedBets));
});
Object.assign(window, {
  setMode,
  setSport,
  manualRefresh,
  openDrawer,
  closeDrawer,
  saveApiKey,
  saveBook,
  toggleMockMode,
  toggleAltLines,
  resetBalance,
  openBets,
  closeBets,
  closeAltSheet,
  openReview,
  closeReview,
  selectMobileTeaserVariant,
  computeRVNetMob
});
