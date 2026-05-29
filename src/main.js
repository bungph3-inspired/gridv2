// ════════════════════════════════════════════════════════════════════════════
//  GridV2 — main.js (entry + render + init)
//  ────────────────────────────────────────────────────────────────────────────
//  After the 2026-05-10 module split, this file is the entry point only.
//  It imports CSS, imports state + utils + api + bets modules, defines the
//  board renderers (which need to live somewhere central — both api.js and
//  bets.js call back into them), wires up render hooks so api/bets can reach
//  back into main.js without circular imports, defines UI helpers
//  (toast/displays/filter), boots on DOMContentLoaded, and exposes inline
//  handler functions on window.
//
//  Module layout:
//    state.js  — single state object + immutable configs
//    utils.js  — pure helpers (odds math, formatting, html escape)
//    api.js    — OddsPapi + mock + refresh cycle + status
//    bets.js   — all bet-type logic (parlay/teaser/ifbet/straight/settle)
//    main.js   — entry + board rendering + settings + init + expose
// ════════════════════════════════════════════════════════════════════════════

import './style.css';

import {
  state,
  SPORT_CFG, LEAGUES_LIST,
} from './state.js';
import { fmtUSD, escapeHtml } from './utils.js';
import { teamLogoImg, leagueIconHtml } from './teams.js';
import { emptyState } from './utils.js';
import {
  setApiHooks,
  fetchAndRender, getActiveSportKey, manualRefresh, resetAuto, startAuto,
  setOnline, setSpinner, updateQuota,
} from './api.js';
import {
  setBetsHooks,
  setMode, onContinue, closeReview, confirmWagers,
  openParlayModal, closePM, updatePMCalc, confirmParlay,
  closeIF, confirmIfBet,
  closeRV, confirmReverse, updateRVCalc, closeRVSettle, confirmRVSettle, computeReverseNet,
  closeTM, updateTMCalc, confirmTeaser, closeTeaserPayouts,
  openBets, closeBets, settleBet,
  clearSelections,
  onOddsClickParlay, onIfBetClick, onReverseClick, onTeaserClick, buildTeaserCell,
  updateContinueBtn, updateBetsBtn,
  // alt-line refresh hooks (used by setAltLine after swapping a line in-place)
  updateParlaySelections, updateIfBetSelections, updateReverseSelections, updateTeaserSelections,
  setAltLineTeaser,
} from './bets.js';

// ─── SIDEBAR ─────────────────────────────────────────
function renderSidebar(){
  const sports=[...new Set(LEAGUES_LIST.map(l=>l.sport))];
  const c=document.getElementById('sidebar-leagues');c.innerHTML='';
  sports.forEach(sport=>{
    const leagues=LEAGUES_LIST.filter(l=>l.sport===sport);
    const grp=document.createElement('div');grp.className='lg-group';
    const hdr=document.createElement('div');hdr.className='lg-hdr';
    hdr.dataset.sport = sport;  // used by filterSport to show/hide groups
    hdr.innerHTML=`${leagueIconHtml(sport, 14)}<span class="lg-hdr-label">${sport}</span><span class="chev">▾</span>`;
    hdr.onclick=()=>{hdr.classList.toggle('collapsed');items.classList.toggle('hidden');};
    const items=document.createElement('div');items.className='lg-items';
    leagues.forEach(l=>{
      const item=document.createElement('div');
      item.className='lg-item'+(l.name===state.activeLeague?' active':'');
      item.innerHTML=`<input type="checkbox" ${l.name===state.activeLeague?'checked':''}> ${l.name}`;
      item.onclick=()=>{
        state.activeLeague=l.name;
        document.getElementById('board-title').textContent=l.name;
        document.querySelectorAll('.lg-item').forEach(i=>i.classList.remove('active'));
        item.classList.add('active');
        // fetch sport for this league
        const sportKey=getActiveSportKey();
        const sc=SPORT_CFG.find(s=>s.key===sportKey);
        if(sc&&state.gamesCache[sc.key]) renderBoard();
        else if(sc) fetchAndRender(sc.key,true);
      };
      items.appendChild(item);
    });
    grp.appendChild(hdr);grp.appendChild(items);c.appendChild(grp);
  });
}

// ─── BOARD ───────────────────────────────────────────
function showBoardMsg(type,msg=''){
  const b=document.getElementById('board');
  if(type==='load') b.innerHTML=`<div class="ldstate"><div class="spinner"></div><div>Fetching live odds…</div></div>`;
  else if(type==='err') b.innerHTML=`<div class="errstate"><div style="font-size:36px">📡</div><div class="errmsg">Could not load odds</div><div class="errhint">${msg||"Couldn't reach the odds service. Try again in a moment."}</div><button class="retrybtn" onclick="manualRefresh()">Retry</button></div>`;
}

function renderBoard(moved=new Map()){
  const b=document.getElementById('board');b.innerHTML='';
  // Props-only leagues (e.g. "NBA Player Props") hide the SPREAD/ML/TOTAL/TT
  // column header strip too — there are no game-line cells to align under it.
  const propsOnly = /Player Props$/i.test(state.activeLeague || '');
  const ch = document.getElementById('col-hdrs');
  if (ch) ch.style.display = propsOnly ? 'none' : 'grid';
  // get games for the active sport
  const activeSportKey=getActiveSportKey();
  const sc=SPORT_CFG.find(s=>s.key===activeSportKey);
  if(!sc){b.innerHTML=emptyState({icon:'📋',heading:'Select a league',sub:'Pick a sport from the sidebar to start.'});return;}
  const games=state.gamesCache[sc.key]||[];
  if(!games.length){b.innerHTML='<div class="ldstate" style="color:var(--text-xs)">No upcoming games for this league.</div>';return;}
  let lastDate='';
  games.forEach(g=>{
    if(g.date!==lastDate){
      lastDate=g.date;
      const d=document.createElement('div');d.className='dsep';d.textContent=g.date;b.appendChild(d);
    }
    b.appendChild(buildGameBlock(g,moved));
  });
}

function buildGameBlock(game,moved=new Map()){
  const block=document.createElement('div');block.className='gblock';
  // Props-only leagues (e.g. "NBA Player Props") hide the game header + team
  // rows entirely — only the prop section renders below. The prop section's
  // own banner ("{date} — {away} @ {home} — Player Props") supplies enough
  // matchup context, so we skip ginfo / ginjury / .trow-g rows on this view.
  const propsOnly = /Player Props$/i.test(state.activeLeague || '');
  if (!propsOnly) {
    // Game info row — time + team names. Optional per-game meta (badges,
    // seeds, network, series state, max wager, injury sub-row) was removed
    // in PR23 when the stale demo data was purged. The CSS classes for
    // those elements remain in style.css as dead — re-introduce them with
    // a real meta source if needed.
    const info=document.createElement('div');info.className='ginfo';
    const timeHtml=`<span class="gtime-lbl${game.isLive?' live':''}">${game.isLive?'● LIVE':escapeHtml(game.time)}</span>`;
    const descHtml=`<span class="gdesc">${escapeHtml(game.awayFull||game.away)}<span class="vs">vs</span>${escapeHtml(game.homeFull||game.home)}</span>`;
    info.innerHTML=`${timeHtml}${descHtml}`;
    block.appendChild(info);
    // team rows
    game.teams.forEach(team=>{
      const row=document.createElement('div');row.className='trow-g';
      const logo=teamLogoImg(game.sport, team, 'tlogo');
      row.innerHTML=`<div class="tname-g">${logo}${escapeHtml(team.fullName||team.name)}</div>`;
      if(state.wagerMode==='teaser' && state.teaserVariant){
        // Teaser: only Spread + Total are eligible; ML and TT are empty
        row.appendChild(buildTeaserCell(game,team,'spread',team.spread,block,game));
        const mlEmpty=document.createElement('div');mlEmpty.className='tcell';mlEmpty.innerHTML='<span class="odash">—</span>';row.appendChild(mlEmpty);
        row.appendChild(buildTeaserCell(game,team,'total',team.total,block,game));
        const ttEmpty=document.createElement('div');ttEmpty.className='tcell';ttEmpty.innerHTML='<span class="odash">—</span>';row.appendChild(ttEmpty);
      } else {
        // straight + parlay + ifbet: all 4 markets including Team Total
        row.appendChild(buildOddsCell(game,team,'spread',team.spread,team.spVig,moved,block,game));
        row.appendChild(buildOddsCell(game,team,'ml',team.ml,'',moved,block,game));
        row.appendChild(buildOddsCell(game,team,'total',team.total,team.totVig,moved,block,game));
        row.appendChild(buildOddsCell(game,team,'tt',team.tt,team.ttVig,moved,block,game));
      }
      block.appendChild(row);
    });
  }
  // Compute deterministic game index from the active sport cache so bet-ids stay
  // consistent across re-renders. Defaults to 0 if not yet cached.
  let gameIdx = 0;
  try {
    const sk = getActiveSportKey();
    const games = state.gamesCache[sk] || [];
    const i = games.findIndex(g => g.id === game.id);
    if (i >= 0) gameIdx = i;
  } catch (e) {}
  const propSec = buildPropSection(game, gameIdx);
  if (propSec) block.appendChild(propSec);
  return block;
}

function buildOddsCell(game,team,mkey,line,vig,moved,blockEl,gameObj){
  const cell=document.createElement('div');cell.className='ocell';
  if(!line){cell.innerHTML='<span class="odash">—</span>';return cell;}
  const key=`${game.id}_${team.name}_${mkey}`;
  const isSel=!!state.selCells[key];
  const moveDir=moved.get(key);  // 'up' | 'dn' | undefined
  // If a leg already exists for this key (in any active mode's slip), display
  // that line/vig — picking an alt swaps the visible line on the cell.
  const existingPick =
    state.wagerMode==='straight' ? state.slip.find(s=>s.key===key) :
    state.wagerMode==='parlay'   ? state.parlayLegs.find(s=>s.key===key) :
    state.wagerMode==='ifbet'    ? state.ifBetLegs.find(s=>s.key===key) :
    state.wagerMode==='reverse'  ? state.reverseLegs.find(s=>s.key===key) : null;
  if (existingPick) { line = existingPick.line; vig = existingPick.vig === existingPick.line ? '' : existingPick.vig; }
  // Look up the alt-line list for this market. ML has no alts (single market).
  const altsKey = mkey==='spread' ? 'altSpreads' : mkey==='total' ? 'altTotals' : mkey==='tt' ? 'altTT' : null;
  const alts = altsKey ? (team[altsKey] || []) : [];
  const hasAlts = alts.length > 1;  // need >1 so popover offers something beyond the main pick
  if(state.wagerMode==='straight'){
    // input box + odds button (LC797 straight style)
    const winVal=state.slip.find(s=>s.key===key)?.win||'';
    const movCls=moveDir&&!isSel?(moveDir==='up'?' mup':' mdn'):'';
    // Build input programmatically (no string-interpolated handler — safer for team names with quotes/HTML)
    const inp=document.createElement('input');
    inp.className='wager-inp';inp.type='number';inp.value=winVal;inp.min='20';inp.step='5';
    inp.title='Enter win amount';
    inp.addEventListener('input', e => onWinInput(key,game.id,team.name,game.sport,`${game.away} @ ${game.home}`,mkey,line,vig||'',e.target.value));
    cell.appendChild(inp);
    const arrowHtml=moveDir&&!isSel?`<span class="marr ${moveDir}">${moveDir==='up'?'▲':'▼'}</span>`:'';
    const btn=document.createElement('button');
    btn.className='obtn'+(isSel?' sel':'')+movCls;
    btn.innerHTML=`${arrowHtml}<span class="onum">${escapeHtml(line)}</span>${vig?`<span class="ovig">(${escapeHtml(vig)})</span>`:''}`;
    btn.onclick=()=>onOddsClickStraight(game,team,mkey,line,vig,key,blockEl,gameObj);
    cell.appendChild(btn);
    if(hasAlts && state.altLinesEnabled) cell.appendChild(buildAltChevron(game,team,mkey,line,vig,alts,blockEl,gameObj));
  } else {
    // parlay or ifbet: plain button, goes dark when selected
    const btn=document.createElement('button');
    btn.className='pbtn'+(isSel?' sel':'');
    btn.textContent=`${line}${vig?' ('+vig+')':''}`;
    if(state.wagerMode==='ifbet') btn.onclick=()=>onIfBetClick(game,team,mkey,line,vig,key,blockEl,gameObj);
    else if(state.wagerMode==='reverse') btn.onclick=()=>onReverseClick(game,team,mkey,line,vig,key,blockEl,gameObj);
    else btn.onclick=()=>onOddsClickParlay(game,team,mkey,line,vig,key,blockEl,gameObj);
    cell.appendChild(btn);
    if(hasAlts && state.altLinesEnabled) cell.appendChild(buildAltChevron(game,team,mkey,line,vig,alts,blockEl,gameObj));
  }
  return cell;
}

function onWinInput(key,gameId,teamName,sport,matchup,mkey,line,vig,winVal){
  const win=parseFloat(winVal)||0;
  const idx=state.slip.findIndex(s=>s.key===key);
  if(idx>-1){state.slip[idx].win=win;}
  else{state.selCells[key]=true;state.slip.push({key,gameId,teamName,sport,matchup,type:mkey,line,vig:vig||line,win});}
  if(win===0){delete state.selCells[key];state.slip=state.slip.filter(s=>s.key!==key);}
  updateContinueBtn();
}
function onOddsClickStraight(game,team,mkey,line,vig,key,blockEl,gameObj){
  // clicking the odds button just highlights it without changing amounts
  if(state.selCells[key]){delete state.selCells[key];state.slip=state.slip.filter(s=>s.key!==key);}
  else{state.selCells[key]=true;if(!state.slip.find(s=>s.key===key))state.slip.push({key,gameId:game.id,teamName:team.name,sport:game.sport,matchup:`${game.away} @ ${game.home}`,type:mkey,line,vig:vig||line,win:50});}
  updateContinueBtn();
  const nb=buildGameBlock(gameObj);blockEl.replaceWith(nb);
}


// ─── ALT-LINE POPOVER ───────────────────────────────
// Single open popover at a time (one per page). Click-outside closes.
// Wired from buildOddsCell when team[altSpreads|altTotals|altTT].length > 1.

let _altPop = null;       // currently-open popover DOM node
let _altPopDoc = null;    // click-outside handler reference (for removeEventListener)

function closeAltPopover() {
  if (_altPop && _altPop.parentNode) _altPop.parentNode.removeChild(_altPop);
  if (_altPopDoc) document.removeEventListener('click', _altPopDoc, true);
  _altPop = null;
  _altPopDoc = null;
  // restore .alt-chev open state
  document.querySelectorAll('.alt-chev.open').forEach(c => c.classList.remove('open'));
}

function buildAltChevron(game, team, mkey, line, vig, alts, blockEl, gameObj) {
  const chev = document.createElement('button');
  chev.className = 'alt-chev';
  chev.type = 'button';
  chev.textContent = '▼';
  chev.title = `${alts.length} alt lines`;
  chev.addEventListener('click', (e) => {
    e.stopPropagation();
    // Toggle: if already open from this chevron, close.
    if (_altPop && _altPop.dataset.anchorKey === `${game.id}_${team.name}_${mkey}`) {
      closeAltPopover();
      return;
    }
    closeAltPopover();
    openAltPopover(chev, game, team, mkey, line, vig, alts, blockEl, gameObj);
  });
  return chev;
}

function openAltPopover(anchorEl, game, team, mkey, mainLine, mainVig, alts, blockEl, gameObj) {
  const key = `${game.id}_${team.name}_${mkey}`;
  // Determine the currently selected line for this market (from active mode's slip)
  let currentLine = mainLine;
  if (state.wagerMode === 'straight') {
    const e = state.slip.find(s => s.key === key);
    if (e) currentLine = e.line;
  } else if (state.wagerMode === 'parlay') {
    const e = state.parlayLegs.find(s => s.key === key);
    if (e) currentLine = e.line;
  } else if (state.wagerMode === 'ifbet') {
    const e = state.ifBetLegs.find(s => s.key === key);
    if (e) currentLine = e.line;
  } else if (state.wagerMode === 'reverse') {
    const e = state.reverseLegs.find(s => s.key === key);
    if (e) currentLine = e.line;
  }

  const pop = document.createElement('div');
  pop.className = 'alt-pop';
  pop.dataset.anchorKey = key;
  // Header
  const labels = { spread:'Alt Spreads', total:'Alt Totals', tt:'Alt Team Totals' };
  const hdr = document.createElement('div');
  hdr.className = 'alt-pop-hdr';
  hdr.innerHTML = `<span>${escapeHtml(labels[mkey] || 'Alt Lines')} · ${escapeHtml(team.name)}</span>`;
  const closeBtn = document.createElement('button');
  closeBtn.className = 'alt-pop-close';
  closeBtn.type = 'button';
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', (e) => { e.stopPropagation(); closeAltPopover(); });
  hdr.appendChild(closeBtn);
  pop.appendChild(hdr);
  // List
  const list = document.createElement('div');
  list.className = 'alt-pop-list';
  if (!alts.length) {
    list.innerHTML = '<div class="alt-pop-empty">No alt lines available</div>';
  } else {
    alts.forEach(alt => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'alt-pop-row';
      if (alt.line === mainLine) row.classList.add('main');
      if (alt.line === currentLine) row.classList.add('sel');
      row.innerHTML = `<span class="alt-pop-line">${escapeHtml(alt.line)}</span><span class="alt-pop-vig">${escapeHtml(alt.vig)}</span>`;
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        setAltLine(game, team, mkey, alt.line, alt.vig, blockEl, gameObj);
        closeAltPopover();
      });
      list.appendChild(row);
    });
  }
  pop.appendChild(list);
  // Anchor: append to the .ocell so absolute positioning works (cell is `relative`)
  anchorEl.parentNode.appendChild(pop);
  anchorEl.classList.add('open');
  _altPop = pop;
  // Click-outside (capture phase so we beat stopPropagation on innards)
  _altPopDoc = (e) => { if (!pop.contains(e.target) && e.target !== anchorEl) closeAltPopover(); };
  // Defer so the opening click doesn't immediately close
  setTimeout(() => document.addEventListener('click', _altPopDoc, true), 0);
}

// Swap (or add) the line+vig for this market on the active mode's slip.
// Preserves win amount / fireRule on existing entries.
function setAltLine(game, team, mkey, line, vig, blockEl, gameObj) {
  const key = `${game.id}_${team.name}_${mkey}`;
  const matchup = `${game.away} @ ${game.home}`;
  if (state.wagerMode === 'straight') {
    const idx = state.slip.findIndex(s => s.key === key);
    if (idx > -1) { state.slip[idx].line = line; state.slip[idx].vig = vig || line; }
    else { state.slip.push({key, gameId:game.id, teamName:team.name, sport:game.sport, matchup, type:mkey, line, vig:vig||line, win:50}); state.selCells[key]=true; }
    updateContinueBtn();
  } else if (state.wagerMode === 'parlay') {
    const idx = state.parlayLegs.findIndex(s => s.key === key);
    if (idx > -1) { state.parlayLegs[idx].line = line; state.parlayLegs[idx].vig = vig || line; }
    else { state.parlayLegs.push({key, gameId:game.id, teamName:team.name, sport:game.sport, matchup, type:mkey, line, vig:vig||line}); state.selCells[key]=true; }
    updateParlaySelections();
  } else if (state.wagerMode === 'ifbet') {
    const idx = state.ifBetLegs.findIndex(s => s.key === key);
    if (idx > -1) { state.ifBetLegs[idx].line = line; state.ifBetLegs[idx].vig = vig || line; }
    else { state.ifBetLegs.push({key, gameId:game.id, teamName:team.name, sport:game.sport, matchup, type:mkey, line, vig:vig||line, win:50, fireRule:'win'}); state.selCells[key]=true; }
    updateIfBetSelections();
  } else if (state.wagerMode === 'reverse') {
    const idx = state.reverseLegs.findIndex(s => s.key === key);
    if (idx > -1) { state.reverseLegs[idx].line = line; state.reverseLegs[idx].vig = vig || line; }
    else {
      if (state.reverseLegs.length >= 2) { showToast('Reverse Action: exactly 2 teams'); return; }
      state.reverseLegs.push({key, gameId:game.id, teamName:team.name, sport:game.sport, matchup, type:mkey, line, vig:vig||line});
      state.selCells[key]=true;
    }
    updateReverseSelections();
  } else if (state.wagerMode === 'teaser') {
    // Teaser leg uses {origLine, shiftedLine}; bets.js owns the shift math.
    setAltLineTeaser(game, team, mkey, line);
  }
  // Refresh the game block so the cell's main button shows the new line
  const nb = buildGameBlock(gameObj);
  blockEl.replaceWith(nb);
}



// ─── PLAYER PROPS (LC797-style layout) ───────────────
// Each game gets a banner ("Day Date — Away @ Home — Player Props"), then a
// stack of prop cards. Each card: teal-banded header with PT time tag and the
// "Matchup — Player total {market}" description, then two stacked rows
// (Over on top, Under below) showing bet-id + label + input + odds button.
// No alt-line popover — props stay single-line per directive.

// Display labels for each prop market type
const PROP_LABEL = {
  pts: 'Points',
  reb: 'Rebounds',
  ast: 'Assists',
  '3pm': '3 Point FGs made',
  blk: 'Blocks',
  stl: 'Steals',
  pr:  'Pts+Reb',
  pa:  'Pts+Ast',
  ar:  'Ast+Reb',
  pra: 'Points+Rebounds+Assist',
};
// Header copy (used in the per-prop teal banner — "Cade Cunningham total points")
const PROP_DESC = {
  pts: 'total points',
  reb: 'total rebounds',
  ast: 'total assists',
  '3pm': 'total 3 point field goals made',
  blk: 'total blocks',
  stl: 'total steals',
  pr:  'total Pts + Reb',
  pa:  'total Pts + Ast',
  ar:  'total Ast + Reb',
  pra: 'total Points+Rebounds+Assist',
};

// Deterministic bet-id: 509000 + gameIdx*100 + propIdx*10 + sideOffset (1=O, 2=U).
// Matches LC797's 509101 / 509102 / 509111 / 509112 pattern from John's screenshot.
function propBetId(gameIndex, propIndex, side) {
  return 509000 + gameIndex * 100 + (propIndex + 1) * 10 + (side === 'O' ? 1 : 2);
}

function buildPropSection(game, gameIndex) {
  if (!game.props || !game.props.length) return null;
  // Hide in teaser mode (teasers are spread/total only — no props eligible)
  if (state.wagerMode === 'teaser') return null;

  const sec = document.createElement('div');
  sec.className = 'prop-section';

  // Game-level banner ("Monday May 11 — Lakers @ Thunder — Player Props")
  const banner = document.createElement('div');
  banner.className = 'prop-banner';
  banner.textContent = `${game.date} — ${game.away} @ ${game.home} — Player Props`;
  sec.appendChild(banner);

  // Per-prop card
  game.props.forEach((prop, propIndex) => {
    sec.appendChild(buildPropCard(game, prop, propIndex, gameIndex));
  });
  return sec;
}

function buildPropCard(game, prop, propIndex, gameIndex) {
  const card = document.createElement('div');
  card.className = 'prop-card';

  // Header: PT time tag + "Player total {market}".
  // The matchup is intentionally NOT repeated here — the section banner above
  // already announces "{away} @ {home} — Player Props" for the whole game.
  // Repeating it on every prop card just adds visual noise (was looking like
  // the regular game line was duplicating per prop).
  const hdr = document.createElement('div');
  hdr.className = 'prop-card-hdr';
  // Use the same time string the game block does, normalized to "5:10p PT" style.
  // Convert "5:10 PM PDT" → "5:10p PT" (LC797 style). In jsdom (UTC) this stays
  // "1:30 AM UTC" or similar — close enough for a dev fixture.
  const ptTag = (game.time || '')
    .replace(/\s*PDT/i, ' PT').replace(/\s*PST/i, ' PT')
    .replace(/ AM /, 'a ').replace(/ PM /, 'p ');
  hdr.innerHTML = `<span class="pt-tag">${escapeHtml(ptTag)}</span><span class="pt-desc">${escapeHtml(prop.player)} ${escapeHtml(PROP_DESC[prop.mkt] || prop.mkt)}</span>`;
  card.appendChild(hdr);

  // Two stacked rows: Over (player name as label) + Under (market label)
  card.appendChild(buildPropBetRow(game, prop, propIndex, gameIndex, 'O', prop.player));
  card.appendChild(buildPropBetRow(game, prop, propIndex, gameIndex, 'U', PROP_LABEL[prop.mkt] || prop.mkt.toUpperCase()));
  return card;
}

function buildPropBetRow(game, prop, propIndex, gameIndex, side, label) {
  const row = document.createElement('div');
  row.className = 'prop-bet-row';
  const betId = propBetId(gameIndex, propIndex, side);

  // Left: bet-id + label (player name on Over row, market label on Under row)
  const info = document.createElement('div');
  info.className = 'prop-bet-info';
  info.innerHTML = `<span class="prop-bet-id">${betId}</span><span class="prop-bet-name">${escapeHtml(label)}</span>`;
  row.appendChild(info);

  // Right: input + odds button (placed in the Total column position via CSS grid-column)
  const cell = document.createElement('div');
  cell.className = 'prop-bet-cell';
  const key = `prop_${game.id}_${prop.player}_${prop.mkt}_${side}`;
  const isSel = !!state.selCells[key];
  // If a leg for this prop+side exists in the active mode, render its line/vig
  // instead of the main line — keeps the button in sync after an alt pick.
  let lineStr = (side === 'O' ? 'o' : 'u') + prop.line;
  let vig = side === 'O' ? prop.overVig : prop.underVig;
  const legSrc = state.wagerMode === 'straight' ? state.slip
              : state.wagerMode === 'parlay'   ? state.parlayLegs
              : state.wagerMode === 'ifbet'    ? state.ifBetLegs
              : state.wagerMode === 'reverse'  ? state.reverseLegs
              : null;
  if (legSrc) {
    const leg = legSrc.find(l => l.key === key);
    if (leg) { lineStr = leg.line; vig = leg.vig; }
  }

  // In straight mode: input + obtn. In parlay/ifbet: just obtn (click-to-add).
  if (state.wagerMode === 'straight') {
    const winVal = state.slip.find(s => s.key === key)?.win || '';
    const inp = document.createElement('input');
    inp.className = 'wager-inp';
    inp.type = 'number';
    inp.value = winVal;
    inp.min = '20';
    inp.step = '5';
    inp.title = 'Enter win amount';
    inp.addEventListener('input', e => onPropWinInput(game, prop, propIndex, gameIndex, side, key, e.target.value));
    cell.appendChild(inp);
  }
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'prop-obtn' + (isSel ? ' sel' : '');
  btn.innerHTML = `${escapeHtml(lineStr)}<span class="pvig">(${escapeHtml(vig)})</span>`;
  btn.onclick = () => onPropClick(game, prop, side, key, btn);
  cell.appendChild(btn);
  // Alt-line chevron (only if this prop entry exposes >0 alt lines)
  // and the user has opted into alt-line UI via Settings.
  if (prop.alts && prop.alts.length && state.altLinesEnabled) {
    cell.appendChild(buildPropAltChevron(game, prop, propIndex, gameIndex, side, key, row.parentNode));
  }
  row.appendChild(cell);
  return row;
}

// ─── PROP ALT-LINE POPOVER ───────────────────────────
// Distinct from the spread/total/tt alt popover because prop alts expose
// both over and under vigs per line side-by-side; clicking a vig swaps
// the leg's line + vig for the appropriate side.

let _propAltPop = null;
let _propAltPopDoc = null;

function closePropAltPopover() {
  if (_propAltPop && _propAltPop.parentNode) _propAltPop.parentNode.removeChild(_propAltPop);
  if (_propAltPopDoc) document.removeEventListener('click', _propAltPopDoc, true);
  _propAltPop = null;
  _propAltPopDoc = null;
  document.querySelectorAll('.alt-chev.prop-alt-chev.open').forEach(c => c.classList.remove('open'));
}

function buildPropAltChevron(game, prop, propIndex, gameIndex, side, key, _cardEl) {
  const chev = document.createElement('button');
  chev.className = 'alt-chev prop-alt-chev';
  chev.type = 'button';
  chev.textContent = '▼';
  chev.title = `${prop.alts.length} alt lines`;
  chev.addEventListener('click', (e) => {
    e.stopPropagation();
    const anchorKey = `prop_${game.id}_${prop.player}_${prop.mkt}_${side}`;
    if (_propAltPop && _propAltPop.dataset.anchorKey === anchorKey) {
      closePropAltPopover();
      return;
    }
    closeAltPopover();           // close any spread/total popover too
    closePropAltPopover();
    openPropAltPopover(chev, game, prop, propIndex, gameIndex, side, key);
  });
  return chev;
}

function openPropAltPopover(anchorEl, game, prop, propIndex, gameIndex, activeSide, _activeKey) {
  const anchorKey = `prop_${game.id}_${prop.player}_${prop.mkt}_${activeSide}`;

  const pop = document.createElement('div');
  pop.className = 'prop-alt-pop';
  pop.dataset.anchorKey = anchorKey;

  // Header
  const hdr = document.createElement('div');
  hdr.className = 'prop-alt-pop-hdr';
  hdr.innerHTML = `<span>${escapeHtml(prop.player)} · ${escapeHtml(PROP_LABEL[prop.mkt] || prop.mkt)}</span>`;
  const closeBtn = document.createElement('button');
  closeBtn.className = 'prop-alt-pop-close';
  closeBtn.type = 'button';
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', (e) => { e.stopPropagation(); closePropAltPopover(); });
  hdr.appendChild(closeBtn);
  pop.appendChild(hdr);

  // Column header (Line / Over / Under)
  const cols = document.createElement('div');
  cols.className = 'prop-alt-pop-cols';
  cols.innerHTML = `<span>Line</span><span>Over</span><span>Under</span>`;
  pop.appendChild(cols);

  // List — main line + every alt, sorted by line ascending
  const list = document.createElement('div');
  list.className = 'prop-alt-pop-list';
  // Combine main + alts; main flagged for orange styling
  const allLines = [
    { line: prop.line, overVig: prop.overVig, underVig: prop.underVig, isMain: true },
    ...prop.alts.map(a => ({ line: a.line, overVig: a.overVig, underVig: a.underVig, isMain: false })),
  ].sort((a, b) => a.line - b.line);

  // Currently picked line (from active mode's slip) — used to highlight sel state
  const overKey  = `prop_${game.id}_${prop.player}_${prop.mkt}_O`;
  const underKey = `prop_${game.id}_${prop.player}_${prop.mkt}_U`;
  const findLeg = (k) => {
    if (state.wagerMode === 'straight') return state.slip.find(s => s.key === k);
    if (state.wagerMode === 'parlay')   return state.parlayLegs.find(s => s.key === k);
    if (state.wagerMode === 'ifbet')    return state.ifBetLegs.find(s => s.key === k);
    if (state.wagerMode === 'reverse')  return state.reverseLegs.find(s => s.key === k);
    return null;
  };
  const overLeg  = findLeg(overKey);
  const underLeg = findLeg(underKey);
  const pickedOverLine  = overLeg  ? parseFloat(String(overLeg.line).replace(/^[ou]/i, ''))  : null;
  const pickedUnderLine = underLeg ? parseFloat(String(underLeg.line).replace(/^[ou]/i, '')) : null;

  if (!allLines.length) {
    list.innerHTML = '<div class="prop-alt-pop-empty">No alt lines available</div>';
  } else {
    allLines.forEach(rec => {
      const row = document.createElement('div');
      row.className = 'prop-alt-pop-row' + (rec.isMain ? ' main' : '');

      const lineCell = document.createElement('span');
      lineCell.className = 'prop-alt-pop-line';
      lineCell.textContent = String(rec.line);
      row.appendChild(lineCell);

      const overCell = document.createElement('button');
      overCell.type = 'button';
      overCell.className = 'prop-alt-pop-vig' + (pickedOverLine === rec.line ? ' sel' : '');
      overCell.textContent = rec.overVig;
      overCell.addEventListener('click', (e) => {
        e.stopPropagation();
        setPropAltLine(game, prop, propIndex, gameIndex, 'O', rec.line, rec.overVig);
        closePropAltPopover();
      });
      row.appendChild(overCell);

      const underCell = document.createElement('button');
      underCell.type = 'button';
      underCell.className = 'prop-alt-pop-vig' + (pickedUnderLine === rec.line ? ' sel' : '');
      underCell.textContent = rec.underVig;
      underCell.addEventListener('click', (e) => {
        e.stopPropagation();
        setPropAltLine(game, prop, propIndex, gameIndex, 'U', rec.line, rec.underVig);
        closePropAltPopover();
      });
      row.appendChild(underCell);

      list.appendChild(row);
    });
  }
  pop.appendChild(list);

  // Anchor: append to the .prop-bet-cell (which is now position:relative)
  anchorEl.parentNode.appendChild(pop);
  anchorEl.classList.add('open');
  _propAltPop = pop;
  _propAltPopDoc = (e) => { if (!pop.contains(e.target) && e.target !== anchorEl) closePropAltPopover(); };
  setTimeout(() => document.addEventListener('click', _propAltPopDoc, true), 0);
}

// Swap (or add) the line+vig for a prop leg on the active mode's slip.
// Teaser mode is excluded because props are never teaser-eligible.
function setPropAltLine(game, prop, propIndex, gameIndex, side, newLine, newVig) {
  const key = `prop_${game.id}_${prop.player}_${prop.mkt}_${side}`;
  const teamName = prop.teamName || (prop.team === 'home' ? game.home : game.away);
  const matchup = `${game.away} @ ${game.home}`;
  const mkey = `prop_${prop.mkt}`;
  const lineStr = (side === 'O' ? 'o' : 'u') + newLine;

  if (state.wagerMode === 'teaser') {
    showToast('Props are not eligible for teasers');
    return;
  }
  if (state.wagerMode === 'straight') {
    const idx = state.slip.findIndex(s => s.key === key);
    if (idx > -1) { state.slip[idx].line = lineStr; state.slip[idx].vig = newVig; }
    else { state.selCells[key] = true; state.slip.push({key, gameId:game.id, teamName, sport:game.sport, matchup, type:mkey, propPlayer:prop.player, propSide:side, propMkt:prop.mkt, line:lineStr, vig:newVig, win:50}); }
    updateContinueBtn();
  } else if (state.wagerMode === 'parlay') {
    const idx = state.parlayLegs.findIndex(s => s.key === key);
    if (idx > -1) { state.parlayLegs[idx].line = lineStr; state.parlayLegs[idx].vig = newVig; }
    else { state.selCells[key] = true; state.parlayLegs.push({key, gameId:game.id, teamName, sport:game.sport, matchup, type:mkey, propPlayer:prop.player, propSide:side, propMkt:prop.mkt, line:lineStr, vig:newVig}); }
    updateParlaySelections();
  } else if (state.wagerMode === 'ifbet') {
    const idx = state.ifBetLegs.findIndex(s => s.key === key);
    if (idx > -1) { state.ifBetLegs[idx].line = lineStr; state.ifBetLegs[idx].vig = newVig; }
    else {
      if (state.ifBetLegs.length >= 8) { showToast('Max 8 legs in an If Bet'); return; }
      state.selCells[key] = true;
      state.ifBetLegs.push({key, gameId:game.id, teamName, sport:game.sport, matchup, type:mkey, propPlayer:prop.player, propSide:side, propMkt:prop.mkt, line:lineStr, vig:newVig, win:50, fireRule:'win'});
    }
    updateIfBetSelections();
  } else if (state.wagerMode === 'reverse') {
    const idx = state.reverseLegs.findIndex(s => s.key === key);
    if (idx > -1) { state.reverseLegs[idx].line = lineStr; state.reverseLegs[idx].vig = newVig; }
    else {
      if (state.reverseLegs.length >= 2) { showToast('Reverse Action: exactly 2 teams'); return; }
      state.selCells[key] = true;
      state.reverseLegs.push({key, gameId:game.id, teamName, sport:game.sport, matchup, type:mkey, propPlayer:prop.player, propSide:side, propMkt:prop.mkt, line:lineStr, vig:newVig});
    }
    updateReverseSelections();
  }
  // Refresh board so the prop button shows the new line/vig
  renderBoard();
}

function onPropWinInput(game, prop, propIndex, gameIndex, side, key, winVal) {
  const win = parseFloat(winVal) || 0;
  const lineStr = (side === "O" ? "o" : "u") + prop.line;
  const vig = side === "O" ? prop.overVig : prop.underVig;
  const teamName = prop.teamName || (prop.team === "home" ? game.home : game.away);
  const matchup = `${game.away} @ ${game.home}`;
  const mkey = `prop_${prop.mkt}`;
  const idx = state.slip.findIndex((s) => s.key === key);
  if (idx > -1) {
    state.slip[idx].win = win;
  } else {
    state.selCells[key] = true;
    state.slip.push({ key, gameId: game.id, teamName, sport: game.sport, matchup, type: mkey, propPlayer: prop.player, propSide: side, propMkt: prop.mkt, line: lineStr, vig, win });
  }
  if (win === 0) {
    delete state.selCells[key];
    state.slip = state.slip.filter((s) => s.key !== key);
  }
  updateContinueBtn();
}
function onPropClick(game, prop, side, key, btnEl) {
  const lineStr = (side === "O" ? "o" : "u") + prop.line;
  const vig = side === "O" ? prop.overVig : prop.underVig;
  const teamName = prop.teamName || (prop.team === "home" ? game.home : game.away);
  const matchup = `${game.away} @ ${game.home}`;
  const mkey = `prop_${prop.mkt}`;
  const sport = game.sport;
  if (state.wagerMode === "straight") {
    const idx = state.slip.findIndex((s) => s.key === key);
    if (idx > -1) {
      delete state.selCells[key];
      state.slip.splice(idx, 1);
    } else {
      state.selCells[key] = true;
      state.slip.push({ key, gameId: game.id, teamName, sport, matchup, type: mkey, propPlayer: prop.player, propSide: side, propMkt: prop.mkt, line: lineStr, vig, win: 50 });
    }
    updateContinueBtn();
  } else if (state.wagerMode === "parlay") {
    const idx = state.parlayLegs.findIndex((s) => s.key === key);
    if (idx > -1) {
      delete state.selCells[key];
      state.parlayLegs.splice(idx, 1);
    } else {
      state.selCells[key] = true;
      state.parlayLegs.push({ key, gameId: game.id, teamName, sport, matchup, type: mkey, propPlayer: prop.player, propSide: side, propMkt: prop.mkt, line: lineStr, vig });
    }
    updateParlaySelections();
  } else if (state.wagerMode === "ifbet") {
    const idx = state.ifBetLegs.findIndex((s) => s.key === key);
    if (idx > -1) {
      delete state.selCells[key];
      state.ifBetLegs.splice(idx, 1);
    } else {
      if (state.ifBetLegs.length >= 8) {
        showToast("Max 8 legs in an If Bet");
        return;
      }
      state.selCells[key] = true;
      state.ifBetLegs.push({ key, gameId: game.id, teamName, sport, matchup, type: mkey, propPlayer: prop.player, propSide: side, propMkt: prop.mkt, line: lineStr, vig, win: 50, fireRule: "win" });
    }
    updateIfBetSelections();
  } else if (state.wagerMode === "reverse") {
    const idx = state.reverseLegs.findIndex((s) => s.key === key);
    if (idx > -1) {
      delete state.selCells[key];
      state.reverseLegs.splice(idx, 1);
    } else {
      if (state.reverseLegs.length >= 2) {
        showToast("Reverse Action: exactly 2 teams");
        return;
      }
      state.selCells[key] = true;
      state.reverseLegs.push({ key, gameId: game.id, teamName, sport, matchup, type: mkey, propPlayer: prop.player, propSide: side, propMkt: prop.mkt, line: lineStr, vig });
    }
    updateReverseSelections();
  } else if (state.wagerMode === "teaser") {
    showToast("Teasers only support spreads and totals");
    return;
  }
  btnEl.classList.toggle("sel");
}
function openSettings() {
  const sel = document.getElementById("book-sel");
  if (sel) sel.value = state.prefBook;
  const cbx = document.getElementById("mock-cbx");
  if (cbx) {
    cbx.checked = state.mockMode;
    cbx.disabled = !window.MOCK_DATA;
    const ms = document.getElementById("mock-status");
    if (ms) ms.textContent = window.MOCK_DATA ? state.mockMode ? "Active \u2014 using captured fixture" : "Use captured fixture data \u2014 no API calls" : "Fixture (mock_data.js) not loaded";
  }
  const altCbx = document.getElementById("alt-cbx");
  if (altCbx) {
    altCbx.checked = !!state.altLinesEnabled;
    const as = document.getElementById("alt-status");
    if (as) as.textContent = state.altLinesEnabled ? "Showing alt-line chevrons" : "Show alt-line chevrons on spread/total/prop cells";
  }
  const sb = document.getElementById("set-bal");
  if (sb) sb.textContent = fmtUSD(state.balance);
  const qbar = document.getElementById("qbar");
  const qu = document.getElementById("q-used"), qr = document.getElementById("q-rem");
  if (qbar) {
    const pct = state.qRem ? Math.min(100, state.qUsed / (state.qUsed + state.qRem) * 100) : 0;
    qbar.style.width = pct + "%";
  }
  if (qu) qu.textContent = `${state.qUsed} used`;
  if (qr) qr.textContent = `${state.qRem} remaining`;
  document.getElementById("set-overlay").classList.add("open");
}
function closeSettings() {
  document.getElementById("set-overlay").classList.remove("open");
}
function saveBook() {
  state.prefBook = document.getElementById("book-sel").value;
  localStorage.setItem("bs_book", state.prefBook);
  state.gamesCache = {};
  fetchAndRender();
  showToast(`Bookmaker: ${state.prefBook}`);
}
function toggleMockMode() {
  const cbx = document.getElementById("mock-cbx");
  if (!cbx) return;
  if (cbx.checked && !window.MOCK_DATA) {
    cbx.checked = false;
    showToast("Mock data not available");
    return;
  }
  state.mockMode = cbx.checked;
  localStorage.setItem("bs_mock", state.mockMode ? "1" : "0");
  state.gamesCache = {};
  setOnline(true);
  fetchAndRender();
  showToast(state.mockMode ? "Mock Mode ON" : "Mock Mode OFF");
}
function toggleAltLines() {
  const cbx = document.getElementById("alt-cbx");
  if (!cbx) return;
  state.altLinesEnabled = cbx.checked;
  localStorage.setItem("bs_alt", state.altLinesEnabled ? "1" : "0");
  const as = document.getElementById("alt-status");
  if (as) as.textContent = state.altLinesEnabled ? "Showing alt-line chevrons" : "Show alt-line chevrons on spread/total/prop cells";
  // Close any open popover (orphaned anchors would be stale).
  closeAltPopover();
  closePropAltPopover();
  renderBoard();
  showToast(state.altLinesEnabled ? "Alt lines ON" : "Alt lines OFF");
}
function resetBalance() {
  if (!confirm("Reset virtual state.balance to $1,000? This does not affect placed bets.")) return;
  state.balance = 1e3;
  localStorage.setItem("bs_bal", state.balance);
  updateBalDisp();
  const sb = document.getElementById("set-bal");
  if (sb) sb.textContent = fmtUSD(state.balance);
  showToast("Balance reset to $1,000");
}
function updateBalDisp() {
  const el = document.getElementById("bal-disp");
  if (el) el.textContent = fmtUSD(state.balance);
}
var _toastTimer = null;
function showToast(msg) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove("show"), 2400);
}
function filterSport(sport) {
  document.querySelectorAll(".lg-group").forEach((g) => {
    const hdr = g.querySelector(".lg-hdr");
    const s = hdr ? hdr.dataset.sport : "";
    g.classList.toggle("hidden", sport !== "all" && s !== sport);
  });
  if (sport !== "all" && state.activeLeague && !state.activeLeague.startsWith(sport)) {
    const firstLeague = LEAGUES_LIST.find((l) => l.sport === sport);
    if (firstLeague) {
      state.activeLeague = firstLeague.name;
      document.getElementById("board-title").textContent = firstLeague.name;
      const sportKey = getActiveSportKey();
      const sc = SPORT_CFG.find((s) => s.key === sportKey);
      if (sc && state.gamesCache[sc.key]) renderBoard();
      else if (sc) fetchAndRender(sc.key, true);
    }
  }
}
// ─── HOME VIEW (Option C — league tiles landing) ────────
async function renderHomeTiles() {
  const tilesEl = document.getElementById('home-tiles');
  if (!tilesEl) return;
  // Initial placeholders — show each sport with a loading dash
  tilesEl.innerHTML = SPORT_CFG.map(sc => `
    <button type="button" class="hv-tile" data-sport="${sc.key}" onclick="onHomeTileClick('${sc.key}')">
      <div class="hv-tile-icon">${leagueIconHtml(sc.key, 28)}</div>
      <div class="hv-tile-name">${sc.label}</div>
      <div class="hv-tile-count">…</div>
    </button>
  `).join('');

  // Fetch /tournaments per unique sportId in parallel
  const uniqueSportIds = [...new Set(SPORT_CFG.map(s => s.sportId))];
  let responses;
  try {
    responses = await Promise.all(uniqueSportIds.map(id =>
      apiFetchHome(`/tournaments?sportId=${id}`).catch(() => [])
    ));
  } catch (e) {
    SPORT_CFG.forEach(sc => updateHomeTile(sc.key, null, '—'));
    return;
  }
  const tournamentsBySportId = {};
  uniqueSportIds.forEach((id, i) => { tournamentsBySportId[id] = Array.isArray(responses[i]) ? responses[i] : []; });

  SPORT_CFG.forEach(sc => {
    const tournaments = tournamentsBySportId[sc.sportId] || [];
    const active = tournaments.filter(t => (t.upcomingFixtures + t.liveFixtures) > 0);
    let matched = null;
    if (sc.tournamentId) matched = active.find(t => t.tournamentId === sc.tournamentId);
    if (!matched && sc.tournamentMatch) matched = active.find(t => sc.tournamentMatch.test(t.tournamentName || ''));
    if (!matched && !sc.tournamentId && !sc.tournamentMatch) {
      matched = active.find(t => t.categorySlug === 'usa' || t.categoryName === 'USA');
    }
    const total = matched ? (matched.upcomingFixtures + matched.liveFixtures) : 0;
    updateHomeTile(sc.key, total > 0, total > 0 ? `${total} ${total === 1 ? 'game' : 'games'}` : 'Off-season');
  });
}

// Thin wrapper around api.js' BASE so the home page can call /tournaments
// before the per-sport fetchOdds() flow runs. Uses the same auth (cookie).
async function apiFetchHome(path) {
  const res = await fetch(`${state.__BASE || ''}${path}`, { credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
// Cache BASE on first call (state.js already exports it but not on state)
import('./state.js').then(m => { state.__BASE = m.BASE; });

function updateHomeTile(sportKey, isActive, countText) {
  const tile = document.querySelector(`.hv-tile[data-sport="${sportKey}"]`);
  if (!tile) return;
  const countEl = tile.querySelector('.hv-tile-count');
  if (countEl) countEl.textContent = countText;
  if (isActive) {
    tile.classList.remove('hv-tile-off');
    tile.disabled = false;
  } else {
    tile.classList.add('hv-tile-off');
    tile.disabled = true;
  }
}

function onHomeTileClick(sportKey) {
  const sc = SPORT_CFG.find(s => s.key === sportKey);
  if (!sc) return;
  // First sidebar label matching this sport becomes the active league.
  const firstLeague = LEAGUES_LIST.find(l => l.sport === sportKey);
  if (firstLeague) {
    state.activeLeague = firstLeague.name;
    const bt = document.getElementById('board-title');
    if (bt) bt.textContent = firstLeague.name;
  }
  showBoard();
  // Re-render sidebar + fetch this sport
  renderSidebar();
  setMode('straight');
  fetchAndRender(sportKey, true);
  startAuto();
}

function showHome() {
  state.view = 'home';
  // Stop the board's auto-refresh while we're on home
  if (state.autoTimer) { clearInterval(state.autoTimer); state.autoTimer = null; }
  if (state.cdownTimer) { clearInterval(state.cdownTimer); state.cdownTimer = null; }
  const hv = document.getElementById('home-view');
  const bv = document.getElementById('board-view');
  if (hv) hv.classList.remove('hidden');
  if (bv) bv.classList.add('hidden');
  renderHomeTiles();
}

function showBoard() {
  state.view = 'board';
  const hv = document.getElementById('home-view');
  const bv = document.getElementById('board-view');
  if (hv) hv.classList.add('hidden');
  if (bv) bv.classList.remove('hidden');
}

setApiHooks({ renderBoard, showBoardMsg, showToast });
setBetsHooks({ renderBoard, buildGameBlock, showBoardMsg, showToast, updateBalDisp, buildAltChevron });
function init() {
  // Login gate: if no player session, show splash and bail until login.
  const pid = localStorage.getItem('bs_player');
  if (!pid) {
    document.getElementById('login-splash').classList.add('show');
    return;
  }
  setAccountDisp(pid);
  updateBalDisp();
  updateBetsBtn();
  setOnline(true);
  // PR19: branch on view. Default + reload → home (tiles). Tile click → board.
  if (state.view === 'home') {
    showHome();
    return;
  }
  renderSidebar();
  setMode("straight");
  fetchAndRender(getActiveSportKey());
  startAuto();
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
window.addEventListener("beforeunload", () => {
  localStorage.setItem("bs_bal", state.balance);
  localStorage.setItem("bs_bets", JSON.stringify(state.placedBets));
});
// ─── LOGIN GATE ──────────────────────────────────────
function submitPlayerLogin(e){
  e.preventDefault();
  const id = (document.getElementById('login-id').value || '').trim();
  if (!id) return false;
  localStorage.setItem('bs_player', id);
  document.getElementById('login-splash').classList.remove('show');
  // Boot the app for real now.
  setAccountDisp(id);
  updateBalDisp();
  updateBetsBtn();
  setOnline(true);
  // Land on the home picker after fresh login.
  state.view = 'home';
  showHome();
  return false;
}
function logoutPlayer(){
  if (!confirm('Sign out? Your balance and bets are kept locally.')) return;
  localStorage.removeItem('bs_player');
  location.reload();
}
function setAccountDisp(id){
  const el = document.getElementById('acct-disp');
  if (el) el.textContent = id;
}

Object.assign(window, {
  showHome,
  showBoard,
  onHomeTileClick,
  setMode,
  onContinue,
  closeReview,
  confirmWagers,
  manualRefresh,
  filterSport,
  clearSelections,
  openParlayModal,
  closePM,
  updatePMCalc,
  confirmParlay,
  closeIF,
  confirmIfBet,
  closeRV,
  confirmReverse,
  updateRVCalc,
  closeRVSettle,
  confirmRVSettle,
  computeReverseNet,
  closeTM,
  updateTMCalc,
  confirmTeaser,
  closeTeaserPayouts,
  openBets,
  closeBets,
  settleBet,
  openSettings,
  closeSettings,
  saveBook,
  resetBalance,
  toggleMockMode,
  toggleAltLines,
  computeReverseNet,
  submitPlayerLogin,
  logoutPlayer
});
