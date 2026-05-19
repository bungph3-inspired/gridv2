// ════════════════════════════════════════════════════════════════════════════
//  api.js — OddsPapi integration + refresh cycle
//  ────────────────────────────────────────────────────────────────────────────
//  Mock-mode router, live fetch, market metadata + participants resolution,
//  market normalization, board refresh cycle, line-movement detection, online
//  status, quota display. Anything that talks to the data layer lives here.
// ════════════════════════════════════════════════════════════════════════════

import { state, SPORT_CFG, BASE, AUTO_MS } from './state.js';
import { ensureSign, fmtLine, fmtTotalLine } from './utils.js';

// Forward-declared imports from other modules — set later via setRenderHooks.
// This avoids a circular import: api.js → render functions live in main.js
// (_renderBoard, _showBoardMsg), but render functions also call fetchAndRender.
// We use a hook pattern instead of direct imports.
let _renderBoard = () => {};
let _showBoardMsg = () => {};
let _showToast = () => {};
export function setApiHooks({renderBoard, showBoardMsg, showToast}) {
  if (renderBoard)   _renderBoard = renderBoard;
  if (showBoardMsg)  _showBoardMsg = showBoardMsg;
  if (showToast)     _showToast = showToast;
}

// Mock-mode router: resolves API paths against the captured fixture in mock_data.js.
// Returns undefined for endpoints not covered (caller falls through to live fetch).
export function mockResolve(path) {
  const M = window.MOCK_DATA;
  if (!M) return undefined;
  if (path.startsWith('/tournaments?')) {
    const sid = parseInt(new URLSearchParams(path.split('?')[1]).get('sportId'));
    return sid===M.sportId ? [{tournamentId:M.tournamentId, tournamentName:'NBA', upcomingFixtures:1, liveFixtures:1, categorySlug:'usa', categoryName:'USA'}] : [];
  }
  if (path.startsWith('/markets?')) {
    const sid = parseInt(new URLSearchParams(path.split('?')[1]).get('sportId'));
    return sid===M.sportId ? M.markets : [];
  }
  if (path.startsWith('/odds-by-tournaments?')) {
    const tids = (new URLSearchParams(path.split('?')[1]).get('tournamentIds')||'').split(',').map(s=>parseInt(s));
    return tids.includes(M.tournamentId) ? M.odds : [];
  }
  if (path.startsWith('/participants?')) return M.participants;
  return undefined;
}

export async function apiFetch(path) {
  if (state.mockMode && window.MOCK_DATA) {
    const r = mockResolve(path);
    if (r !== undefined) return Promise.resolve(r);
  }
  if (!state.apiKey||state.apiKey==='') { _showBoardMsg('key'); return null; }
  const sep = path.includes('?')?'&':'?';
  const res = await fetch(`${BASE}${path}${sep}apiKey=${state.apiKey}`);
  if (!res.ok) { const e=await res.json().catch(()=>({})); throw new Error(e.error?.message||`HTTP ${res.status}`); }
  return res.json();
}

export async function resolveParticipants(ids, sportId) {
  const missing = ids.filter(id=>!state.participantCache[id]);
  if (!missing.length) return;
  // OddsPapi /participants requires sportId (numeric)
  const data = await apiFetch(`/participants?participantIds=${missing.join(',')}&sportId=${sportId}`);
  // Handle both shapes: array of {participantId, participantName} OR object {id: name}
  if (Array.isArray(data)) {
    data.forEach(p=>{ state.participantCache[p.participantId]=p.participantName||p.shortName||String(p.participantId); });
  } else if (data && typeof data==='object') {
    Object.keys(data).forEach(id=>{ state.participantCache[id] = (typeof data[id]==='string') ? data[id] : (data[id]?.participantName||data[id]?.shortName||String(id)); });
  }
}

// Market metadata cache: sportId → { marketId → metadata } from /markets?sportId=N.
// The odds response gives priceAmerican by marketId+outcomeId, but the line/handicap
// value lives in this metadata catalog (keyed by marketId). We need both to render.

export async function fetchMarketMeta(sportId) {
  // Cache by sportId (not league key) — multiple leagues share the same catalog
  // (e.g. NBA and NCAAB both consume sportId 11's markets metadata).
  if (state.marketMetaCache[sportId]) return;
  const data = await apiFetch(`/markets?sportId=${sportId}`);
  if (!Array.isArray(data)) return;
  const byId = {};
  data.forEach(m => { byId[m.marketId] = m; });
  state.marketMetaCache[sportId] = byId;
}

export async function fetchOdds(sportKey) {
  if (!state.mockMode && (!state.apiKey||state.apiKey==='YOUR_API_KEY_HERE')) { _showBoardMsg('key'); return null; }
  const cfg = SPORT_CFG.find(s=>s.key===sportKey);
  if (!cfg) return null;
  const sportId = cfg.sportId;

  // Get tournament ID if we don't have it yet
  if (!cfg.tournamentId) {
    const tours = await apiFetch(`/tournaments?sportId=${sportId}`);
    if (Array.isArray(tours)) {
      // Active tournaments only
      const candidates = tours.filter(t=>t.upcomingFixtures>0||t.liveFixtures>0);
      // If cfg.tournamentMatch is set (e.g. NCAAB, NCAAF), require a match — no
      // fallback. Otherwise NCAAB would silently pick the NBA tournament for
      // sportId 11. Without tournamentMatch we use the USA/major-league heuristic.
      const active = cfg.tournamentMatch
        ? candidates.find(t => cfg.tournamentMatch.test(t.tournamentName||''))
        : candidates.find(t=>(t.categorySlug==='usa'||t.categoryName==='USA'||t.tournamentName?.includes('MLB')||t.tournamentName?.includes('NBA')||t.tournamentName?.includes('NHL')||t.tournamentName?.includes('NFL')));
      if (active) cfg.tournamentId = active.tournamentId;
    }
    if (!cfg.tournamentId) { _showBoardMsg('err','No active tournaments found for '+cfg.label); return null; }
  }

  // Markets metadata is needed to resolve handicap/total values (not in odds response)
  await fetchMarketMeta(sportId);

  const data = await apiFetch(`/odds-by-tournaments?bookmaker=${state.prefBook}&tournamentIds=${cfg.tournamentId}&oddsFormat=american`);
  if (!Array.isArray(data)) return null;

  // Resolve all participant names
  const pids = [...new Set(data.flatMap(g=>[g.participant1Id,g.participant2Id]))];
  await resolveParticipants(pids, sportId);

  // No quota headers from OddsPapi — just show connected
  updateQuota();
  return data;
}

// ─── PLAYER PROPS NORMALIZATION ─────────────────────────────────────────────
// Live OddsPapi /odds-by-tournaments does NOT include playerProp markets on the
// free tier (confirmed across NBA/MLB/NHL, all bookmakers, May 2026). Props
// therefore come from MOCK_DATA.props (synthetic, keyed by fixtureId) only.
// Each entry:
//   { player, team:'home'|'away', mkt:'pts'|'reb'|'ast'|'3pm'|'blk'|'stl'|...,
//     line:number, overVig, underVig, alts:[{line, overVig, underVig}] }
// Normalize attaches resolved teamName + standardized signed-vig strings.
export function normalizeProps(fixtureId, homeName, awayName) {
  const props = window.MOCK_DATA?.props?.[fixtureId];
  if (!Array.isArray(props)) return [];
  return props.map(p => ({
    player: p.player,
    team: p.team,
    teamName: p.team === 'home' ? homeName : awayName,
    mkt: p.mkt,
    line: p.line,
    overVig: ensureSign(p.overVig),
    underVig: ensureSign(p.underVig),
    alts: (p.alts || []).map(a => ({
      line: a.line,
      overVig: ensureSign(a.overVig),
      underVig: ensureSign(a.underVig),
    })),
  }));
}

export function normalizeGames(data, label, sportKey) {
  if (!Array.isArray(data)) return [];
  // Look up the league cfg to find its sportId — meta cache is keyed by sportId
  // (shared across leagues with the same OddsPapi sport: NBA + NCAAB both = 11)
  const cfg = SPORT_CFG.find(s => s.key === sportKey);
  const meta = (cfg && state.marketMetaCache[cfg.sportId]) || {};

  return data.map(ev => {
    let bm = ev.bookmakerOdds?.[state.prefBook];
    // Mock-mode bookmaker fallback: our captured fixture only carries 'draftkings'.
    // If the user picked a different book in Settings (persisted in localStorage as
    // bs_book), every event would filter to null and the board would show "No
    // upcoming games" even though data exists. Transparently fall back to the
    // first active book in mock mode so the demo always shows odds.
    if ((!bm || !bm.bookmakerIsActive) && state.mockMode) {
      const books = ev.bookmakerOdds || {};
      for (const bk of Object.keys(books)) {
        if (books[bk]?.bookmakerIsActive) { bm = books[bk]; break; }
      }
    }
    if (!bm || !bm.bookmakerIsActive) return null;
    const mkts = bm.markets || {};

    const p1name = state.participantCache[ev.participant1Id] || `Team ${ev.participant1Id}`;
    const p2name = state.participantCache[ev.participant2Id] || `Team ${ev.participant2Id}`;

    // Find main markets by joining odds keys with metadata catalog.
    // Filter: period='result' (full game), marketLength=2 (binary outcome), not playerProp.
    // Spreads/totals/team-totals: many handicap variants exist; pick the one whose first
    // outcome's first player has mainLine===true (the "main" line books promote on the board).
    //
    // Team-total convention in OddsPapi:
    //   teamtotals-team1 → participant1 (= HOME team) own total
    //   teamtotals-team2 → participant2 (= AWAY team) own total
    //   Each market's outcome[0] is OVER, outcome[1] is UNDER for that team's total.
    let mlMkt=null, spMkt=null, spMeta=null, totMkt=null, totMeta=null;
    let tt1Mkt=null, tt1Meta=null, tt2Mkt=null, tt2Meta=null;
    // Team-total fallback: DraftKings doesn't always set mainLine=true on team-totals
    // (reliable for spreads/totals but spotty for teamtotals in observed fixtures).
    // Track a fallback per side so we surface *something* when no flagged main exists.
    let tt1Fb=null, tt2Fb=null;
    // Alt-line variants: collect EVERY handicap variant per market type, not just
    // the mainLine. Bucket 3 (alt lines / props) uses these to power the popover.
    // Each entry: {market, meta} — same shape as the main pick. We sort + format
    // and project to {line, vig} arrays after the scan.
    const spAll=[], totAll=[], tt1All=[], tt2All=[];
    for (const id in mkts) {
      const md = meta[id];
      if (!md || md.period !== 'result' || md.playerProp || md.marketLength !== 2) continue;
      const m = mkts[id];
      const o1id = md.outcomes[0].outcomeId;
      const p1 = m.outcomes?.[o1id]?.players?.[0];
      if (!p1) continue;
      if (md.marketType === 'moneyline' && !mlMkt) {
        mlMkt = {market:m, meta:md};
      } else if (md.marketType === 'spreads') {
        spAll.push({market:m, meta:md});
        if (p1.mainLine === true && !spMkt) { spMkt = {market:m, meta:md}; spMeta = md; }
      } else if (md.marketType === 'totals') {
        totAll.push({market:m, meta:md});
        if (p1.mainLine === true && !totMkt) { totMkt = {market:m, meta:md}; totMeta = md; }
      } else if (md.marketType === 'teamtotals-team1') {
        tt1All.push({market:m, meta:md});
        if (p1.mainLine === true && !tt1Mkt) { tt1Mkt = {market:m, meta:md}; tt1Meta = md; }
        else if (!tt1Fb) { tt1Fb = {market:m, meta:md}; }
      } else if (md.marketType === 'teamtotals-team2') {
        tt2All.push({market:m, meta:md});
        if (p1.mainLine === true && !tt2Mkt) { tt2Mkt = {market:m, meta:md}; tt2Meta = md; }
        else if (!tt2Fb) { tt2Fb = {market:m, meta:md}; }
      }
    }
    // Apply team-total fallbacks when no flagged-main was found
    if (!tt1Mkt && tt1Fb) { tt1Mkt = tt1Fb; tt1Meta = tt1Fb.meta; }
    if (!tt2Mkt && tt2Fb) { tt2Mkt = tt2Fb; tt2Meta = tt2Fb.meta; }

    // Helper: get priceAmerican from a {market,meta} pair by outcome index (0 or 1)
    const getVig = (pair, idx) => {
      if (!pair) return '';
      const oid = pair.meta.outcomes[idx].outcomeId;
      const p = pair.market.outcomes?.[oid]?.players?.[0];
      return (p?.active && p.priceAmerican) ? p.priceAmerican : '';
    };

    // Moneyline: outcome[0]=p1 (home), outcome[1]=p2 (away)
    const mlP1 = getVig(mlMkt, 0);
    const mlP2 = getVig(mlMkt, 1);

    // Spread: handicap is the home (p1) line; away (p2) line is the negation
    const spP1Line = spMeta ? fmtLine(spMeta.handicap) : '';
    const spP2Line = spMeta ? fmtLine(-spMeta.handicap) : '';
    const spP1Vig  = getVig(spMkt, 0);
    const spP2Vig  = getVig(spMkt, 1);

    // Total: handicap is the o/u line; outcome[0]=Over, outcome[1]=Under
    const totLine    = totMeta ? fmtTotalLine(totMeta.handicap) : '';
    const totOverVig  = getVig(totMkt, 0);
    const totUnderVig = getVig(totMkt, 1);

    // Team Totals: each team has its own total. We surface the OVER side of each
    // team's own total on that team's row (e.g. away row shows "Over away's TT",
    // home row shows "Over home's TT"). The UNDER variants are accessible per
    // OddsPapi's full market list but we don't have UI surface for them in this
    // one-cell-per-team layout — out of scope for this pass.
    const tt1Line = tt1Meta ? fmtTotalLine(tt1Meta.handicap) : '';   // home team's TT
    const tt1Vig  = getVig(tt1Mkt, 0);                               // over (p1's row)
    const tt2Line = tt2Meta ? fmtTotalLine(tt2Meta.handicap) : '';   // away team's TT
    const tt2Vig  = getVig(tt2Mkt, 0);                               // over (p2's row)

    // ─── ALT-LINE PROJECTIONS ────────────────────────────────────────────────
    // From the *All bucket arrays, project per-team {line, vig} lists.
    //
    // Spreads: home (p1) gets +handicap; away (p2) gets -handicap. Sort by
    // numeric line ascending (per team) so the popover reads top-to-bottom
    // from most-negative (heavy fave) to most-positive (heavy dog).
    //
    // Totals: away team's column shows OVER variants; home shows UNDER (per
    // the existing main-pick convention). Sort by handicap ascending.
    //
    // TT1 = home team's own total, TT2 = away team's own total. Only OVER
    // is surfaced (matches main-pick semantics). Sort by handicap.
    //
    // Each entry: {line: formatted string, vig: signed American odds string,
    //              raw: numeric handicap for sort/dedupe in callers}.
    const numHc = pair => parseFloat(pair.meta.handicap);
    const altSpHome = spAll
      .map(pair => ({line: fmtLine(pair.meta.handicap), vig: ensureSign(getVig(pair, 0)), raw: numHc(pair)}))
      .filter(e => e.vig)
      .sort((a,b)=>a.raw-b.raw);
    const altSpAway = spAll
      .map(pair => ({line: fmtLine(-pair.meta.handicap), vig: ensureSign(getVig(pair, 1)), raw: -numHc(pair)}))
      .filter(e => e.vig)
      .sort((a,b)=>a.raw-b.raw);
    const altTotOver = totAll
      .map(pair => ({line: 'o'+fmtTotalLine(pair.meta.handicap), vig: ensureSign(getVig(pair, 0)), raw: numHc(pair)}))
      .filter(e => e.vig)
      .sort((a,b)=>a.raw-b.raw);
    const altTotUnder = totAll
      .map(pair => ({line: 'u'+fmtTotalLine(pair.meta.handicap), vig: ensureSign(getVig(pair, 1)), raw: numHc(pair)}))
      .filter(e => e.vig)
      .sort((a,b)=>a.raw-b.raw);
    const altTT1 = tt1All
      .map(pair => ({line: 'o'+fmtTotalLine(pair.meta.handicap), vig: ensureSign(getVig(pair, 0)), raw: numHc(pair)}))
      .filter(e => e.vig)
      .sort((a,b)=>a.raw-b.raw);
    const altTT2 = tt2All
      .map(pair => ({line: 'o'+fmtTotalLine(pair.meta.handicap), vig: ensureSign(getVig(pair, 0)), raw: numHc(pair)}))
      .filter(e => e.vig)
      .sort((a,b)=>a.raw-b.raw);

    const gt = new Date(ev.startTime);
    const isLive = ev.statusId===1 || gt<new Date();

    // p1=home, p2=away in OddsPapi convention
    return {
      id: ev.fixtureId,
      sport: label, isLive,
      date: gt.toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'}),
      time: gt.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZoneName:'short'}),
      home: p1name, away: p2name,
      props: normalizeProps(ev.fixtureId, p1name, p2name),
      teams: [
        // Away team (p2)
        { name:p2name, abbr:p2name.split(' ').map(w=>w[0]).join('').slice(0,3).toUpperCase(),
          spread: spP2Line, spVig: ensureSign(spP2Vig),
          ml: ensureSign(mlP2),
          total: totLine?('o'+totLine):'', totVig: ensureSign(totOverVig),
          tt: tt2Line?('o'+tt2Line):'', ttVig: ensureSign(tt2Vig),
          altSpreads: altSpAway,   // p2 sees -handicap variants
          altTotals:  altTotOver,  // away row carries the OVER variants
          altTT:      altTT2,      // away team's own total OVER variants
        },
        // Home team (p1)
        { name:p1name, abbr:p1name.split(' ').map(w=>w[0]).join('').slice(0,3).toUpperCase(),
          spread: spP1Line, spVig: ensureSign(spP1Vig),
          ml: ensureSign(mlP1),
          total: totLine?('u'+totLine):'', totVig: ensureSign(totUnderVig),
          tt: tt1Line?('o'+tt1Line):'', ttVig: ensureSign(tt1Vig),
          altSpreads: altSpHome,    // p1 sees +handicap variants
          altTotals:  altTotUnder,  // home row carries the UNDER variants
          altTT:      altTT1,       // home team's own total OVER variants
        },
      ],
    };
  }).filter(Boolean);
}

export async function fetchAndRender(sportKey,loader=true) {
  if(state.isLoading) return; state.isLoading=true; setSpinner(true);
  if(loader&&!state.gamesCache[sportKey]) _showBoardMsg('load');
  try {
    const raw=await fetchOdds(sportKey);
    if(!raw){state.isLoading=false;setSpinner(false);return;}
    const label=SPORT_CFG.find(s=>s.key===sportKey)?.label||sportKey;
    const games=normalizeGames(raw,label,sportKey);
    const moved=detectMoved(games);
    state.gamesCache[sportKey]=games;
    // Re-render board if this sport is currently active
    const sc=SPORT_CFG.find(s=>s.key===sportKey);
    const activeSportKey=getActiveSportKey();
    if(sc&&sportKey===activeSportKey) _renderBoard(moved);
    document.getElementById('lupd').textContent='Updated '+new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
    setOnline(true);
    if(moved.size) _showToast(`📈 ${moved.size} line${moved.size>1?'s':''} moved`);
  } catch(e) {
    setOnline(false);
    if(!Object.keys(state.gamesCache).length) _showBoardMsg('err',e.message);
    else _showToast('⚠ Refresh failed');
  }
  state.isLoading=false; setSpinner(false);
}

export function detectMoved(games) {
  // Returns a Map of key → 'up' | 'dn'. Direction is determined by comparing the
  // current numeric line value against the previously stored value, NOT by the
  // sign of the line itself (a -160 ML moving to -150 is an "up" move for backers).
  const moved=new Map();
  games.forEach(g=>g.teams.forEach(t=>{
    ['spread','ml','total','tt'].forEach(mk=>{
      const line=mk==='spread'?t.spread:mk==='ml'?t.ml:mk==='total'?t.total:t.tt;
      const vig=mk==='spread'?t.spVig:mk==='ml'?'':mk==='total'?t.totVig:t.ttVig;
      const key=`${g.id}_${t.name}_${mk}`;
      const prev=state.prevOdds[key],curr=line+vig;
      if(prev&&prev!==curr&&line) {
        const prevLineMatch=String(prev).match(/-?\d+(\.\d+)?/);
        const prevLineNum=prevLineMatch?parseFloat(prevLineMatch[0]):NaN;
        const currLineNum=parseFloat(line);
        if(!isNaN(prevLineNum)&&!isNaN(currLineNum)&&prevLineNum!==currLineNum) {
          moved.set(key, currLineNum > prevLineNum ? 'up' : 'dn');
        }
      }
      if(line) state.prevOdds[key]=curr;
    });
  }));
  return moved;
}

export async function manualRefresh(){await fetchAndRender(getActiveSportKey(),false);resetAuto();}

export function getActiveSportKey(){
  // Map the active sidebar league name to a SPORT_CFG key. NCAA* checked first
  // (more specific) so "NCAAB" doesn't accidentally match the "NBA" prefix.
  if(state.activeLeague.startsWith('NCAAB')) return 'NCAAB';
  if(state.activeLeague.startsWith('NCAAF')) return 'NCAAF';
  if(state.activeLeague.startsWith('NBA')) return 'NBA';
  if(state.activeLeague.startsWith('MLB')) return 'MLB';
  if(state.activeLeague.startsWith('NHL')) return 'NHL';
  if(state.activeLeague.startsWith('NFL')) return 'NFL';
  return SPORT_CFG[0].key;
}

export function startAuto(){
  clearInterval(state.autoTimer);clearInterval(state.cdownTimer);
  state.cdownSec=AUTO_MS/1000;
  state.cdownTimer=setInterval(()=>{
    state.cdownSec--;
    const m=Math.floor(state.cdownSec/60),s=String(state.cdownSec%60).padStart(2,'0');
    document.getElementById('auto-timer').textContent=` | Auto: ${m}:${s}`;
    if(state.cdownSec<=0) state.cdownSec=AUTO_MS/1000;
  },1000);
  state.autoTimer=setInterval(()=>{ fetchAndRender('NBA',false); setTimeout(()=>fetchAndRender('MLB',false),1500); },AUTO_MS);
}
export function resetAuto(){clearInterval(state.autoTimer);clearInterval(state.cdownTimer);startAuto();}

// ─── STATUS ──────────────────────────────────────────
export function setOnline(ok){
  const d=document.getElementById('ldot'),t=document.getElementById('api-status');
  d.className=ok?'ldot live':'ldot off';
  t.textContent = state.mockMode ? '🎭 Mock Mode' : (ok?'Live':'Offline');
}
export function setSpinner(on){
  // Desktop uses #upd-btn, mobile uses #mob-upd-btn — tolerate either being absent
  const el = document.getElementById('upd-btn') || document.getElementById('mob-upd-btn');
  if (el) el.classList.toggle('spinning', on);
}
export function updateQuota(){
  const total=state.qUsed+state.qRem,pct=total>0?Math.round(state.qUsed/total*100):0;
  const cls=state.qRem<50?'bad':state.qRem<150?'warn':'ok';
  const q=document.getElementById('qtxt'); if(q) q.innerHTML=` | Quota: <span class="${cls}">${state.qRem}</span> left`;
  const bar=document.getElementById('qbar');
  if(bar){ bar.style.width=pct+'%'; bar.className='qbar-fill'+(state.qRem<50?' bad':state.qRem<150?' warn':''); }
  const eu=document.getElementById('q-used');if(eu)eu.textContent=state.qUsed+' used';
  const er=document.getElementById('q-rem');if(er)er.textContent=state.qRem+' remaining';
}
