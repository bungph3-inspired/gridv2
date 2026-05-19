// ════════════════════════════════════════════════════════════════════════════
//  bets.js — All bet-type logic
//  ────────────────────────────────────────────────────────────────────────────
//  Mode switching, parlay/teaser/ifbet/straight builders, modals, settle,
//  My Bets list. Anything triggered by a user placing or managing a wager.
// ════════════════════════════════════════════════════════════════════════════

import {
  state, SPORT_CFG, TEASER_VARIANTS, getVariant,
  teaserSportType, teaserShift, teaserPayout,
} from './state.js';
import {
  toDec, decToAm, calcRisk, calcWin, parlayDec,
  fmtUSD, fmtAm, ensureSign, escapeHtml,
  isPropLeg, propMktLabel, propInitials, propSide, propLineNum,
  betStatusBadge, emptyState,
} from './utils.js';
import { teamLogoImg, playerMonogram } from './teams.js';

// Render functions live in main.js — set via hook to avoid circular import.
var _renderBoard = () => {
};
var _buildGameBlock = (g) => document.createElement("div");
var _showBoardMsg = () => {
};
var _showToast = () => {
};
var _updateBalDisp = () => {
};
var _buildAltChevron = null;
export function setBetsHooks({ renderBoard, buildGameBlock, showBoardMsg, showToast, updateBalDisp, buildAltChevron }) {
  if (renderBoard) _renderBoard = renderBoard;
  if (buildGameBlock) _buildGameBlock = buildGameBlock;
  if (showBoardMsg) _showBoardMsg = showBoardMsg;
  if (showToast) _showToast = showToast;
  if (updateBalDisp) _updateBalDisp = updateBalDisp;
  if (buildAltChevron) _buildAltChevron = buildAltChevron;
}
export function setMode(mode) {
  state.wagerMode = mode;
  document.getElementById("tab-straight").classList.toggle("active", mode === "straight");
  document.getElementById("tab-parlay").classList.toggle("active", mode === "parlay");
  document.getElementById("tab-teaser").classList.toggle("active", mode === "teaser");
  document.getElementById("tab-ifbet").classList.toggle("active", mode === "ifbet");
  const rvTab = document.getElementById("tab-reverse");
  if (rvTab) rvTab.classList.toggle("active", mode === "reverse");
  document.getElementById("sel-panel").style.display = mode === "parlay" || mode === "teaser" || mode === "ifbet" || mode === "reverse" ? "flex" : "none";
  if (mode !== "straight") {
    state.slip.forEach((s) => delete state.selCells[s.key]);
    state.slip = [];
  }
  if (mode !== "parlay") {
    state.parlayLegs.forEach((l) => delete state.selCells[l.key]);
    state.parlayLegs = [];
  }
  if (mode !== "teaser") {
    state.teaserLegs.forEach((l) => delete state.selCells[l.key]);
    state.teaserLegs = [];
    state.teaserVariant = null;
  }
  if (mode !== "ifbet") {
    state.ifBetLegs.forEach((l) => delete state.selCells[l.key]);
    state.ifBetLegs = [];
  }
  if (mode !== "reverse") {
    state.reverseLegs.forEach((l) => delete state.selCells[l.key]);
    state.reverseLegs = [];
  }
  ["par-badge", "tea-badge", "if-badge", "rv-badge"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = "0";
      el.classList.add("hidden");
    }
  });
  document.getElementById("sel-combined").className = "sel-combined";
  document.getElementById("sel-legs").innerHTML = "";
  const sc = document.getElementById("sel-continue");
  sc.textContent = "(0) CONTINUE \u2192";
  sc.className = "sel-continue";
  const isP = mode === "parlay", isT = mode === "teaser", isI = mode === "ifbet", isR = mode === "reverse";
  document.getElementById("lim-spread").textContent = isP || isT || isI || isR ? "$100" : "$1000";
  document.getElementById("lim-ml").textContent = isP || isI || isR ? "$100" : isT ? "\u2014" : "$500";
  document.getElementById("lim-total").textContent = isP || isT || isI || isR ? "$100" : "$1000";
  document.getElementById("lim-tt").textContent = isP || isI || isR ? "$100" : isT ? "\u2014" : "$1000";
  document.getElementById("ch-ml").classList.toggle("disabled", isT);
  document.getElementById("ch-tt").classList.toggle("disabled", isT);
  const onTeaserMenu = isT && !state.teaserVariant;
  document.getElementById("teaser-menu").style.display = onTeaserMenu ? "block" : "none";
  document.getElementById("col-hdrs").style.display = onTeaserMenu ? "none" : "grid";
  document.getElementById("board").style.display = onTeaserMenu ? "none" : "";
  if (onTeaserMenu) renderTeaserMenu();
  if (mode === "parlay") updateParlaySelections();
  if (mode === "teaser" && state.teaserVariant) updateTeaserSelections();
  if (mode === "ifbet") updateIfBetSelections();
  if (mode === "reverse") updateReverseSelections();
  updateContinueBtn();
  _renderBoard();
}
function renderTeaserMenu() {
  const body = document.getElementById("tm-body");
  body.innerHTML = "";
  TEASER_VARIANTS.forEach((v) => {
    const row = document.createElement("div");
    row.className = "tm-row" + (v.enabled ? "" : " dis");
    const btn = document.createElement("button");
    btn.className = "tm-vbtn";
    btn.textContent = v.label;
    btn.disabled = !v.enabled;
    if (v.enabled) btn.onclick = () => selectTeaserVariant(v.key);
    const payLink = document.createElement("button");
    payLink.className = "tm-link" + (v.enabled && v.payouts ? "" : " dim");
    payLink.textContent = "PAYOUTS";
    if (v.enabled && v.payouts) payLink.onclick = () => showTeaserPayouts(v.key);
    const sportsLink = document.createElement("button");
    sportsLink.className = "tm-link dim";
    const legsTxt = v.minLegs === v.maxLegs ? `${v.minLegs} legs` : `${v.minLegs}\u2013${v.maxLegs} legs`;
    sportsLink.textContent = `NBA + NFL \xB7 ${legsTxt}`;
    row.appendChild(btn);
    row.appendChild(payLink);
    row.appendChild(sportsLink);
    body.appendChild(row);
  });
}
function selectTeaserVariant(variantKey) {
  state.teaserVariant = variantKey;
  state.teaserLegs.forEach((l) => delete state.selCells[l.key]);
  state.teaserLegs = [];
  document.getElementById("teaser-menu").style.display = "none";
  document.getElementById("col-hdrs").style.display = "grid";
  document.getElementById("board").style.display = "";
  updateTeaserSelections();
  updateContinueBtn();
  _renderBoard();
  _showToast(`Teaser: ${getVariant(variantKey).label} active`);
}
function setContinueState(n, minLegs, handler) {
  const sc = document.getElementById("sel-continue");
  const cnt = document.getElementById("sel-continue-cnt");
  if (cnt) cnt.textContent = n;
  sc.classList.toggle("dim", n < minLegs);
  sc.onclick = handler;
}
export function updateParlaySelections() {
  const n = state.parlayLegs.length;
  const badge = document.getElementById("par-badge");
  badge.textContent = n;
  badge.classList.toggle("hidden", n === 0);
  setContinueState(n, 2, () => openParlayModal());
  updateContinueBtn();
  const combined = document.getElementById("sel-combined");
  combined.classList.toggle("show", n >= 2);
  if (n >= 2) {
    const dec = parlayDec(state.parlayLegs);
    document.getElementById("sc-odds").textContent = dec.toFixed(3);
    document.getElementById("sc-am").textContent = `${decToAm(dec)} American`;
  }
  const legsCont = document.getElementById("sel-legs");
  legsCont.innerHTML = "";
  if (n === 0) {
    legsCont.innerHTML = '<div class="sel-empty"><strong>No legs yet</strong><span>Tap any odds on the board to start your parlay</span><small>Minimum 2 legs to place</small></div>';
    return;
  }
  state.parlayLegs.forEach((leg) => {
    const d = document.createElement("div");
    d.className = "sel-leg";
    let logoHtml, titleHtml, subHtml;
    if (isPropLeg(leg)) {
      const side = propSide(leg);
      const ln = propLineNum(leg);
      logoHtml = playerMonogram(propInitials(leg), 'sel-logo');
      titleHtml = `<div class="sel-team">${escapeHtml(leg.propPlayer)}</div>`;
      subHtml = `<div class="sel-sub">${escapeHtml(propMktLabel(leg))} \xB7 <strong>${escapeHtml(side)} ${escapeHtml(ln)}</strong>${leg.vig ? ` <span class="text-bet-text-xs">(${escapeHtml(leg.vig)})</span>` : ""}</div>`;
    } else {
      const tl = { spread: "Spread", ml: "Moneyline", total: "Total", tt: "Team Total" }[leg.type] || leg.type;
      const oddsTxt = leg.vig && leg.vig !== leg.line ? `${escapeHtml(leg.line)} <span class="text-bet-text-xs">(${escapeHtml(leg.vig)})</span>` : escapeHtml(leg.line);
      logoHtml = teamLogoImg(leg.sport, { name: leg.teamName }, 'sel-logo');
      titleHtml = `<div class="sel-team">${escapeHtml(leg.teamName)}</div>`;
      subHtml = `<div class="sel-sub">${tl} \xB7 <strong>${oddsTxt}</strong></div>`;
    }
    d.innerHTML = `
    ${logoHtml}
    <div class="sel-info">
      ${titleHtml}
      ${subHtml}
    </div>
    <button class="sel-rm" data-key="${escapeHtml(leg.key)}" title="Remove leg">\u2715</button>`;
    d.querySelector(".sel-rm").addEventListener("click", (e) => removeParlayLeg(e.currentTarget.dataset.key));
    legsCont.appendChild(d);
  });
}
function clearParlay() {
  state.parlayLegs.forEach((l) => delete state.selCells[l.key]);
  state.parlayLegs = [];
  updateParlaySelections();
  _renderBoard();
}
function removeParlayLeg(key) {
  delete state.selCells[key];
  state.parlayLegs = state.parlayLegs.filter((l) => l.key !== key);
  updateParlaySelections();
  _renderBoard();
}
export function clearSelections() {
  if (state.wagerMode === "teaser") clearTeaser();
  else if (state.wagerMode === "ifbet") clearIfBet();
  else if (state.wagerMode === "reverse") clearReverse();
  else clearParlay();
}
export function onIfBetClick(game, team, mkey, line, vig, key, blockEl, gameObj) {
  const idx = state.ifBetLegs.findIndex((l) => l.key === key);
  if (idx > -1) {
    state.ifBetLegs.splice(idx, 1);
    delete state.selCells[key];
  } else {
    if (state.ifBetLegs.length >= 8) {
      _showToast("Max 8 legs in an If Bet");
      return;
    }
    state.ifBetLegs.push({ key, gameId: game.id, teamName: team.name, sport: game.sport, matchup: `${game.away} @ ${game.home}`, type: mkey, line, vig: vig || line, win: 50, fireRule: "win" });
    state.selCells[key] = true;
  }
  updateIfBetSelections();
  const nb = _buildGameBlock(gameObj);
  blockEl.replaceWith(nb);
}
function clearIfBet() {
  state.ifBetLegs.forEach((l) => delete state.selCells[l.key]);
  state.ifBetLegs = [];
  updateIfBetSelections();
  _renderBoard();
}
function removeIfBetLeg(key) {
  delete state.selCells[key];
  state.ifBetLegs = state.ifBetLegs.filter((l) => l.key !== key);
  updateIfBetSelections();
  _renderBoard();
}
export function updateIfBetSelections() {
  const n = state.ifBetLegs.length;
  const ifBadge = document.getElementById("if-badge");
  ifBadge.textContent = n;
  ifBadge.classList.toggle("hidden", n === 0);
  setContinueState(n, 2, () => openIfBetModal());
  document.getElementById("sel-combined").classList.remove("show");
  const legsCont = document.getElementById("sel-legs");
  legsCont.innerHTML = "";
  if (n === 0) {
    legsCont.innerHTML = '<div class="sel-empty"><strong>If Bet builder</strong><span>Tap any odds to add legs in sequence</span><small>Each leg fires only if the previous one wins \xB7 Min 2 legs</small></div>';
    updateContinueBtn();
    return;
  }
  state.ifBetLegs.forEach((leg, i) => {
    const d = document.createElement("div");
    d.className = "sel-leg";
    let titleHtml, subHtml;
    if (isPropLeg(leg)) {
      const side = propSide(leg), ln = propLineNum(leg);
      titleHtml = `<div class="sel-team">${escapeHtml(leg.propPlayer)}</div>`;
      subHtml = `<div class="sel-sub">${escapeHtml(propMktLabel(leg))} \xB7 <strong>${escapeHtml(side)} ${escapeHtml(ln)}</strong>${leg.vig ? ` <span class="text-bet-text-xs">(${escapeHtml(leg.vig)})</span>` : ""}</div>`;
    } else {
      const tl = { spread: "Spread", ml: "Moneyline", total: "Total", tt: "Team Total" }[leg.type] || leg.type;
      const oddsTxt = leg.vig && leg.vig !== leg.line ? `${escapeHtml(leg.line)} <span class="text-bet-text-xs">(${escapeHtml(leg.vig)})</span>` : escapeHtml(leg.line);
      titleHtml = `<div class="sel-team">${escapeHtml(leg.teamName)}</div>`;
      subHtml = `<div class="sel-sub">${tl} \xB7 <strong>${oddsTxt}</strong></div>`;
    }
    d.innerHTML = `
    <div class="sel-logo numbered">${i + 1}</div>
    <div class="sel-info">
      ${titleHtml}
      ${subHtml}
    </div>
    <button class="sel-rm" data-key="${escapeHtml(leg.key)}" title="Remove leg">\u2715</button>`;
    d.querySelector(".sel-rm").addEventListener("click", (e) => removeIfBetLeg(e.currentTarget.dataset.key));
    legsCont.appendChild(d);
  });
  updateContinueBtn();
}
function openIfBetModal() {
  const n = state.ifBetLegs.length;
  if (n < 2) {
    _showToast("Min 2 legs for an If Bet");
    return;
  }
  document.getElementById("iftitle").textContent = `${n}-Leg If Bet`;
  renderIFLegs();
  document.getElementById("ifoverlay").classList.add("open");
}
export function closeIF() {
  document.getElementById("ifoverlay").classList.remove("open");
}
function renderIFLegs() {
  const cont = document.getElementById("iflegs");
  cont.innerHTML = "";
  state.ifBetLegs.forEach((leg, i) => {
    const win = parseFloat(leg.win) || 0;
    const risk = calcRisk(win, leg.vig || leg.line);
    const row = document.createElement("div");
    row.className = "if-leg";
    const ruleLabel = leg.fireRule === "winOrPush" ? "IF WIN/PUSH" : "IF WIN";
    const ruleTitle = i === 0 ? "Leg 1 always fires" : `Fires only if leg ${i} ${leg.fireRule === "winOrPush" ? "wins or pushes" : "wins"}`;
    let teamHtml;
    if (isPropLeg(leg)) {
      const side = propSide(leg), ln = propLineNum(leg);
      teamHtml = `${escapeHtml(leg.propPlayer)} <span style="color:var(--text-xs);font-weight:400">${escapeHtml(propMktLabel(leg))} ${escapeHtml(side)} ${escapeHtml(ln)}${leg.vig ? " (" + escapeHtml(leg.vig) + ")" : ""}</span>`;
    } else {
      const tl = { spread: "Spread", ml: "ML", total: "Total", tt: "TT" }[leg.type] || leg.type;
      teamHtml = `${escapeHtml(leg.teamName)} <span style="color:var(--text-xs);font-weight:400">${tl} ${escapeHtml(leg.line)}${leg.vig && leg.vig !== leg.line ? " (" + escapeHtml(leg.vig) + ")" : ""}</span>`;
    }
    row.innerHTML = `
    <div class="if-leg-num">${i + 1}</div>
    <div class="if-leg-info">
      <div class="if-leg-team">${teamHtml}</div>
      <div class="if-leg-sub">${escapeHtml(leg.matchup)} \xB7 Risk ${fmtUSD(risk)} \xB7 ${i === 0 ? "Leg 1 always fires" : ruleTitle}</div>
    </div>
    <input class="rv-win-inp" type="number" value="${win.toFixed(2)}" min="20" step="5" data-idx="${i}" style="width:70px;text-align:right;font-family:var(--fh);font-weight:700">
    ${i === 0 ? '<div style="text-align:center;font-size:9px;color:var(--text-xs)">FIRST LEG</div>' : `<button class="if-leg-rule" data-idx="${i}" title="Toggle fire rule">${ruleLabel}</button>`}
    <button class="if-leg-rm" data-idx="${i}">\u2715</button>`;
    row.querySelector(".rv-win-inp").addEventListener("input", (e) => updateIFLegWin(parseInt(e.currentTarget.dataset.idx), e.currentTarget.value));
    if (i > 0) row.querySelector(".if-leg-rule").addEventListener("click", (e) => toggleIFLegRule(parseInt(e.currentTarget.dataset.idx)));
    row.querySelector(".if-leg-rm").addEventListener("click", (e) => removeIFLegFromModal(parseInt(e.currentTarget.dataset.idx)));
    cont.appendChild(row);
  });
  updateIFTotals();
}
function updateIFLegWin(idx, val) {
  if (!state.ifBetLegs[idx]) return;
  state.ifBetLegs[idx].win = parseFloat(val) || 0;
  updateIFTotals();
}
function toggleIFLegRule(idx) {
  if (!state.ifBetLegs[idx]) return;
  state.ifBetLegs[idx].fireRule = state.ifBetLegs[idx].fireRule === "winOrPush" ? "win" : "winOrPush";
  renderIFLegs();
}
function removeIFLegFromModal(idx) {
  if (!state.ifBetLegs[idx]) return;
  delete state.selCells[state.ifBetLegs[idx].key];
  state.ifBetLegs.splice(idx, 1);
  if (state.ifBetLegs.length < 2) {
    closeIF();
    updateIfBetSelections();
    _renderBoard();
    return;
  }
  renderIFLegs();
  updateIfBetSelections();
  _renderBoard();
}
function updateIFTotals() {
  if (!state.ifBetLegs.length) {
    document.getElementById("if-totrisk").textContent = "$0.00";
    document.getElementById("if-totwin").textContent = "$0.00";
    return;
  }
  const leg1 = state.ifBetLegs[0];
  const leg1Risk = calcRisk(parseFloat(leg1.win) || 0, leg1.vig || leg1.line);
  const totalWin = state.ifBetLegs.reduce((a, l) => a + (parseFloat(l.win) || 0), 0);
  document.getElementById("if-totrisk").textContent = fmtUSD(leg1Risk);
  document.getElementById("if-totwin").textContent = fmtUSD(totalWin);
  const valEl = document.getElementById("if-val");
  const minOk = state.ifBetLegs.every((l) => (parseFloat(l.win) || 0) >= 20);
  const balOk = leg1Risk <= state.balance;
  valEl.textContent = !minOk ? "\u26A0 Each leg must win at least $20" : !balOk ? "\u26A0 Leg 1 risk exceeds state.balance" : "";
  const btn = document.getElementById("if-confirm");
  btn.disabled = !minOk || !balOk;
  btn.textContent = !balOk ? "Insufficient state.balance" : `Place ${state.ifBetLegs.length}-Leg If Bet \u2192`;
}
export function confirmIfBet() {
  const n = state.ifBetLegs.length;
  if (n < 2) {
    _showToast("Min 2 legs");
    return;
  }
  if (!state.ifBetLegs.every((l) => (parseFloat(l.win) || 0) >= 20)) {
    _showToast("Each leg must win at least $20");
    return;
  }
  const leg1Risk = calcRisk(parseFloat(state.ifBetLegs[0].win) || 0, state.ifBetLegs[0].vig || state.ifBetLegs[0].line);
  if (leg1Risk > state.balance) {
    _showToast("Insufficient state.balance");
    return;
  }
  const totalWin = state.ifBetLegs.reduce((a, l) => a + (parseFloat(l.win) || 0), 0);
  state.balance -= leg1Risk;
  state.placedBets.push({ type: "ifbet", legs: state.ifBetLegs.map((l) => ({ teamName: l.teamName, matchup: l.matchup, type: l.type, line: l.line, vig: l.vig, win: l.win, fireRule: l.fireRule, sport: l.sport, propPlayer: l.propPlayer, propSide: l.propSide, propMkt: l.propMkt })), legCount: n, risk: leg1Risk, win: totalWin, placed: (/* @__PURE__ */ new Date()).toLocaleString(), status: "pending" });
  localStorage.setItem("bs_bets", JSON.stringify(state.placedBets));
  localStorage.setItem("bs_bal", state.balance);
  state.ifBetLegs.forEach((l) => delete state.selCells[l.key]);
  state.ifBetLegs = [];
  updateIfBetSelections();
  _updateBalDisp();
  updateBetsBtn();
  _renderBoard();
  closeIF();
  _showToast(`\u2713 ${n}-leg if bet placed! Risk ${fmtUSD(leg1Risk)} \u2192 potential win ${fmtUSD(totalWin)}`);
}

// \u2500\u2500\u2500 REVERSE ACTION (2-team) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// Two If Bets at the same stake: A\u2192B and B\u2192A. "Action" semantics: push/cancel
// on a trigger passes action to the next leg; a loss kills that chain.
export function onReverseClick(game, team, mkey, line, vig, key, blockEl, gameObj) {
  const idx = state.reverseLegs.findIndex((l) => l.key === key);
  if (idx > -1) {
    state.reverseLegs.splice(idx, 1);
    delete state.selCells[key];
  } else {
    if (state.reverseLegs.length >= 2) {
      _showToast("Reverse Action: exactly 2 teams");
      return;
    }
    state.reverseLegs.push({ key, gameId: game.id, teamName: team.name, sport: game.sport, matchup: `${game.away} @ ${game.home}`, type: mkey, line, vig: vig || line });
    state.selCells[key] = true;
  }
  updateReverseSelections();
  const nb = _buildGameBlock(gameObj);
  blockEl.replaceWith(nb);
}
function clearReverse() {
  state.reverseLegs.forEach((l) => delete state.selCells[l.key]);
  state.reverseLegs = [];
  updateReverseSelections();
  _renderBoard();
}
function removeReverseLeg(key) {
  delete state.selCells[key];
  state.reverseLegs = state.reverseLegs.filter((l) => l.key !== key);
  updateReverseSelections();
  _renderBoard();
}
export function updateReverseSelections() {
  const n = state.reverseLegs.length;
  const badge = document.getElementById("rv-badge");
  if (badge) {
    badge.textContent = n;
    badge.classList.toggle("hidden", n === 0);
  }
  setContinueState(n, 2, () => openReverseModal());
  document.getElementById("sel-combined").classList.remove("show");
  const legsCont = document.getElementById("sel-legs");
  legsCont.innerHTML = "";
  if (n === 0) {
    legsCont.innerHTML = '<div class="sel-empty"><strong>Reverse Action builder</strong><span>Pick exactly 2 sides \u2014 we\'ll wager both A\u2192B and B\u2192A</span><small>Action reverse: push passes, loss kills the chain</small></div>';
    updateContinueBtn();
    return;
  }
  state.reverseLegs.forEach((leg, i) => {
    const d = document.createElement("div");
    d.className = "sel-leg";
    let titleHtml, subHtml;
    if (isPropLeg(leg)) {
      const side = propSide(leg), ln = propLineNum(leg);
      titleHtml = `<div class="sel-team">${escapeHtml(leg.propPlayer)}</div>`;
      subHtml = `<div class="sel-sub">${escapeHtml(propMktLabel(leg))} \xB7 <strong>${escapeHtml(side)} ${escapeHtml(ln)}</strong>${leg.vig ? ` <span class="text-bet-text-xs">(${escapeHtml(leg.vig)})</span>` : ""}</div>`;
    } else {
      const tl = { spread: "Spread", ml: "Moneyline", total: "Total", tt: "Team Total" }[leg.type] || leg.type;
      const oddsTxt = leg.vig && leg.vig !== leg.line ? `${escapeHtml(leg.line)} <span class="text-bet-text-xs">(${escapeHtml(leg.vig)})</span>` : escapeHtml(leg.line);
      titleHtml = `<div class="sel-team">${escapeHtml(leg.teamName)}</div>`;
      subHtml = `<div class="sel-sub">${tl} \xB7 <strong>${oddsTxt}</strong></div>`;
    }
    const lbl = i === 0 ? "A" : "B";
    d.innerHTML = `
    <div class="sel-logo numbered">${lbl}</div>
    <div class="sel-info">
      ${titleHtml}
      ${subHtml}
    </div>
    <button class="sel-rm" data-key="${escapeHtml(leg.key)}" title="Remove leg">\u2715</button>`;
    d.querySelector(".sel-rm").addEventListener("click", (e) => removeReverseLeg(e.currentTarget.dataset.key));
    legsCont.appendChild(d);
  });
  updateContinueBtn();
}
function openReverseModal() {
  if (state.reverseLegs.length !== 2) {
    _showToast("Reverse Action: exactly 2 teams");
    return;
  }
  document.getElementById("rvtitle").textContent = "2-Team Reverse Action";
  renderRVLegs();
  document.getElementById("rv-stake").value = state.reverseStake || 50;
  updateRVCalc();
  document.getElementById("rvoverlay").classList.add("open");
}
export function closeRV() {
  document.getElementById("rvoverlay").classList.remove("open");
}
function renderRVLegs() {
  const cont = document.getElementById("rvlegs");
  cont.innerHTML = "";
  state.reverseLegs.forEach((leg, i) => {
    const lbl = i === 0 ? "A" : "B";
    const tl = { spread: "Spread", ml: "ML", total: "Total", tt: "TT" }[leg.type] || leg.type;
    let teamHtml;
    if (isPropLeg(leg)) {
      const side = propSide(leg), ln = propLineNum(leg);
      teamHtml = `${escapeHtml(leg.propPlayer)} <span style="color:var(--text-xs);font-weight:400">${escapeHtml(propMktLabel(leg))} ${escapeHtml(side)} ${escapeHtml(ln)}${leg.vig ? " (" + escapeHtml(leg.vig) + ")" : ""}</span>`;
    } else {
      teamHtml = `${escapeHtml(leg.teamName)} <span style="color:var(--text-xs);font-weight:400">${tl} ${escapeHtml(leg.line)}${leg.vig && leg.vig !== leg.line ? " (" + escapeHtml(leg.vig) + ")" : ""}</span>`;
    }
    const row = document.createElement("div");
    row.className = "if-leg";
    row.innerHTML = `
    <div class="if-leg-num">${lbl}</div>
    <div class="if-leg-info">
      <div class="if-leg-team">${teamHtml}</div>
      <div class="if-leg-sub">${escapeHtml(leg.matchup)}</div>
    </div>
    <div style="text-align:center;font-size:9px;color:var(--text-xs)">${i === 0 ? "TRIGGER \u2192 B" : "TRIGGER \u2192 A"}</div>
    <div></div>
    <div></div>`;
    cont.appendChild(row);
  });
}
function rvMaxWin(stake) {
  const a = toDec(state.reverseLegs[0].vig || state.reverseLegs[0].line);
  const b = toDec(state.reverseLegs[1].vig || state.reverseLegs[1].line);
  return 2 * stake * ((a - 1) + (b - 1));
}
export function updateRVCalc() {
  const stake = parseFloat(document.getElementById("rv-stake").value) || 0;
  const risk = 2 * stake;
  const maxWin = state.reverseLegs.length === 2 ? rvMaxWin(stake) : 0;
  document.getElementById("rv-totrisk").textContent = fmtUSD(risk);
  document.getElementById("rv-maxwin").textContent = fmtUSD(maxWin);
  const valEl = document.getElementById("rv-val");
  const minOk = stake >= 20;
  const balOk = risk <= state.balance;
  valEl.textContent = !minOk ? "\u26a0 Min $20 stake per play" : !balOk ? `\u26a0 Total risk ${fmtUSD(risk)} exceeds balance` : "";
  const btn = document.getElementById("rv-confirm");
  btn.disabled = !minOk || !balOk;
  btn.textContent = !balOk ? "Insufficient balance" : `Place Reverse (Risk ${fmtUSD(risk)}) \u2192`;
}
export function confirmReverse() {
  if (state.reverseLegs.length !== 2) {
    _showToast("Reverse Action: exactly 2 teams");
    return;
  }
  const stake = parseFloat(document.getElementById("rv-stake").value) || 0;
  if (stake < 20) {
    _showToast("Min $20 stake per play");
    return;
  }
  const risk = 2 * stake;
  if (risk > state.balance) {
    _showToast("Insufficient balance");
    return;
  }
  const maxWin = rvMaxWin(stake);
  state.balance -= risk;
  state.reverseStake = stake;
  state.placedBets.push({
    type: "reverse",
    variant: "2team",
    legs: state.reverseLegs.map((l) => ({ teamName: l.teamName, matchup: l.matchup, type: l.type, line: l.line, vig: l.vig, sport: l.sport, propPlayer: l.propPlayer, propSide: l.propSide, propMkt: l.propMkt })),
    stake,
    risk,
    win: maxWin,
    placed: (/* @__PURE__ */ new Date()).toLocaleString(),
    status: "pending",
  });
  localStorage.setItem("bs_bets", JSON.stringify(state.placedBets));
  localStorage.setItem("bs_bal", state.balance);
  state.reverseLegs.forEach((l) => delete state.selCells[l.key]);
  state.reverseLegs = [];
  updateReverseSelections();
  _updateBalDisp();
  updateBetsBtn();
  _renderBoard();
  closeRV();
  _showToast(`\u2713 Reverse Action placed! Risk ${fmtUSD(risk)} \u2192 max win ${fmtUSD(maxWin)}`);
}

// Action-reverse chain math: trigger outcome decides whether the next leg fires.
//   trigger 'won'  \u2192 +winT, then next leg fires for stake
//   trigger 'push' \u2192 0,     then next leg fires for stake (action passes)
//   trigger 'lost' \u2192 -stake, chain dead
function chainProfit(trigOut, nextOut, decTrig, decNext, stake) {
  if (trigOut === "lost") return -stake;
  const trigProfit = trigOut === "won" ? (decTrig - 1) * stake : 0; // push = 0
  if (nextOut === "won") return trigProfit + (decNext - 1) * stake;
  if (nextOut === "lost") return trigProfit - stake;
  return trigProfit; // next push = 0 added
}
export function computeReverseNet(bet, outA, outB) {
  const [a, b] = bet.legs;
  const decA = toDec(a.vig || a.line);
  const decB = toDec(b.vig || b.line);
  const fwd = chainProfit(outA, outB, decA, decB, bet.stake);
  const rev = chainProfit(outB, outA, decB, decA, bet.stake);
  return fwd + rev;
}

// \u2500\u2500\u2500 REVERSE SETTLEMENT MODAL \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
let _rvSettleIdx = -1;
let _rvSettleOut = { a: "won", b: "won" };
export function openRVSettle(idx) {
  const b = state.placedBets[idx];
  if (!b || b.type !== "reverse" || b.status !== "pending") return;
  _rvSettleIdx = idx;
  _rvSettleOut = { a: "won", b: "won" };
  const body = document.getElementById("rvsetbody");
  body.innerHTML = "";
  b.legs.forEach((leg, i) => {
    const lbl = i === 0 ? "a" : "b";
    const teamLabel = isPropLeg(leg) ? `${leg.propPlayer} ${propSide(leg)} ${propLineNum(leg)}` : `${leg.teamName} (${leg.line})`;
    const row = document.createElement("div");
    row.className = "flex items-center justify-between gap-2 border border-bet-border rounded px-2 py-1.5";
    row.innerHTML = `
      <div class="text-xs"><b style="color:var(--orange)">${lbl.toUpperCase()}.</b> ${escapeHtml(teamLabel)}</div>
      <div class="settle-row" data-lbl="${lbl}">
        <button class="settle-btn won active" data-outcome="won">\u2713 Won</button>
        <button class="settle-btn push" data-outcome="push">\u21ba Push</button>
        <button class="settle-btn lost" data-outcome="lost">\u2715 Lost</button>
      </div>`;
    row.querySelectorAll(".settle-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const lblK = e.currentTarget.parentElement.dataset.lbl;
        const out = e.currentTarget.dataset.outcome;
        _rvSettleOut[lblK] = out;
        e.currentTarget.parentElement.querySelectorAll(".settle-btn").forEach((x) => x.classList.remove("active"));
        e.currentTarget.classList.add("active");
        updateRVSettlePreview();
      });
    });
    body.appendChild(row);
  });
  updateRVSettlePreview();
  document.getElementById("rvsetoverlay").classList.add("open");
}
function updateRVSettlePreview() {
  const b = state.placedBets[_rvSettleIdx];
  if (!b) return;
  const net = computeReverseNet(b, _rvSettleOut.a, _rvSettleOut.b);
  const sign = net >= 0 ? "+" : "\u2212";
  const color = net > 0 ? "var(--green)" : net < 0 ? "var(--red)" : "var(--text-xs)";
  document.getElementById("rvset-preview").innerHTML = `Net P/L: <strong style="color:${color}">${sign}${fmtUSD(Math.abs(net))}</strong> &nbsp;&middot;&nbsp; Risk ${fmtUSD(b.risk)} returned ${fmtUSD(b.risk + net)}`;
}
export function closeRVSettle() {
  document.getElementById("rvsetoverlay").classList.remove("open");
  _rvSettleIdx = -1;
}
export function confirmRVSettle() {
  const b = state.placedBets[_rvSettleIdx];
  if (!b || b.status !== "pending") {
    closeRVSettle();
    return;
  }
  const net = computeReverseNet(b, _rvSettleOut.a, _rvSettleOut.b);
  state.balance += b.risk + net;
  b.status = net > 0 ? "won" : net < 0 ? "lost" : "push";
  b.legOutcomes = { ..._rvSettleOut };
  b.netProfit = net;
  b.settled = (/* @__PURE__ */ new Date()).toLocaleString();
  localStorage.setItem("bs_bets", JSON.stringify(state.placedBets));
  localStorage.setItem("bs_bal", state.balance);
  _updateBalDisp();
  updateBetsBtn();
  renderBetsModal();
  closeRVSettle();
  const sign = net >= 0 ? "+" : "\u2212";
  _showToast(`Reverse settled: ${sign}${fmtUSD(Math.abs(net))}`);
}

export function buildTeaserCell(game, team, mkey, line, blockEl, gameObj) {
  const cell = document.createElement("div");
  cell.className = "tcell";
  if (!line) {
    cell.innerHTML = '<span class="odash">\u2014</span>';
    return cell;
  }
  const v = getVariant(state.teaserVariant);
  const key = `${game.id}_${team.name}_${mkey}_T`;
  const existing = state.teaserLegs.find((l) => l.key === key);
  const origLine = existing ? existing.origLine : line;
  const shifted = teaserShift(origLine, mkey, v, game.sport);
  if (!shifted) {
    cell.innerHTML = '<span class="odash">\u2014</span>';
    return cell;
  }
  const isSel = !!state.selCells[key];
  const btn = document.createElement("button");
  btn.className = "tbtn" + (isSel ? " sel" : "");
  btn.innerHTML = `<span class="torig">${escapeHtml(origLine)}</span> <strong>${escapeHtml(shifted)}</strong>`;
  btn.title = `Original ${origLine} \u2192 teased ${shifted} (${v.label})`;
  btn.onclick = () => onTeaserClick(game, team, mkey, origLine, shifted, key, blockEl, gameObj);
  cell.appendChild(btn);
  const altsKey = mkey === "spread" ? "altSpreads" : mkey === "total" ? "altTotals" : null;
  const alts = altsKey ? team[altsKey] || [] : [];
  if (alts.length > 1 && _buildAltChevron && state.altLinesEnabled) {
    cell.classList.add("relative");
    cell.appendChild(_buildAltChevron(game, team, mkey, origLine, "", alts, blockEl, gameObj));
  }
  return cell;
}
export function onTeaserClick(game, team, mkey, origLine, shiftedLine, key, blockEl, gameObj) {
  const v = getVariant(state.teaserVariant);
  const idx = state.teaserLegs.findIndex((l) => l.key === key);
  if (idx > -1) {
    state.teaserLegs.splice(idx, 1);
    delete state.selCells[key];
  } else {
    if (state.teaserLegs.length >= v.maxLegs) {
      _showToast(`Max ${v.maxLegs} legs for ${v.label}`);
      return;
    }
    state.teaserLegs.push({ key, gameId: game.id, teamName: team.name, sport: game.sport, matchup: `${game.away} @ ${game.home}`, type: mkey, origLine, shiftedLine });
    state.selCells[key] = true;
  }
  updateTeaserSelections();
  const nb = _buildGameBlock(gameObj);
  blockEl.replaceWith(nb);
}
export function updateTeaserSelections() {
  const n = state.teaserLegs.length;
  const v = state.teaserVariant ? getVariant(state.teaserVariant) : null;
  const teaBadge = document.getElementById("tea-badge");
  teaBadge.textContent = n;
  teaBadge.classList.toggle("hidden", n === 0);
  const minLegs = v ? v.minLegs : 2;
  setContinueState(n, minLegs, () => openTeaserModal());
  document.getElementById("sel-combined").classList.remove("show");
  const legsCont = document.getElementById("sel-legs");
  legsCont.innerHTML = "";
  if (n === 0) {
    legsCont.innerHTML = `<div class="sel-empty"><strong>${v ? escapeHtml(v.label) : "Teaser"} builder</strong><span>Tap any spread or total to add legs</span><small>Lines shift in your favor \xB7 Min ${minLegs} legs</small></div>`;
    updateContinueBtn();
    return;
  }
  state.teaserLegs.forEach((leg) => {
    const tl = { spread: "Spread", total: "Total" }[leg.type] || leg.type;
    const d = document.createElement("div");
    d.className = "sel-leg";
    const logoHtml = teamLogoImg(leg.sport, { name: leg.teamName }, 'sel-logo');
    d.innerHTML = `
    ${logoHtml}
    <div class="sel-info">
      <div class="sel-team">${escapeHtml(leg.teamName)}</div>
      <div class="sel-sub">${tl}: <span class="torig">${escapeHtml(leg.origLine)}</span> \u2192 <strong>${escapeHtml(leg.shiftedLine)}</strong></div>
    </div>
    <button class="sel-rm" data-key="${escapeHtml(leg.key)}" title="Remove leg">\u2715</button>`;
    d.querySelector(".sel-rm").addEventListener("click", (e) => removeTeaserLeg(e.currentTarget.dataset.key));
    legsCont.appendChild(d);
  });
  updateContinueBtn();
}
function removeTeaserLeg(key) {
  delete state.selCells[key];
  state.teaserLegs = state.teaserLegs.filter((l) => l.key !== key);
  updateTeaserSelections();
  _renderBoard();
}
function clearTeaser() {
  state.teaserLegs.forEach((l) => delete state.selCells[l.key]);
  state.teaserLegs = [];
  updateTeaserSelections();
  _renderBoard();
}
export function setAltLineTeaser(game, team, mkey, line) {
  if (!state.teaserVariant) return;
  const v = getVariant(state.teaserVariant);
  const shifted = teaserShift(line, mkey, v, game.sport);
  if (!shifted) return;
  const key = `${game.id}_${team.name}_${mkey}_T`;
  const idx = state.teaserLegs.findIndex((l) => l.key === key);
  if (idx > -1) {
    state.teaserLegs[idx].origLine = line;
    state.teaserLegs[idx].shiftedLine = shifted;
  } else {
    if (state.teaserLegs.length >= v.maxLegs) {
      _showToast(`Max ${v.maxLegs} legs for ${v.label}`);
      return;
    }
    state.teaserLegs.push({ key, gameId: game.id, teamName: team.name, sport: game.sport, matchup: `${game.away} @ ${game.home}`, type: mkey, origLine: line, shiftedLine: shifted });
    state.selCells[key] = true;
  }
  updateTeaserSelections();
}
function showTeaserPayouts(variantKey) {
  const v = getVariant(variantKey);
  if (!v || !v.payouts) return;
  document.getElementById("tpay-title").textContent = v.label;
  const legsTxt = v.minLegs === v.maxLegs ? `${v.minLegs} legs (fixed)` : `${v.minLegs}\u2013${v.maxLegs} legs`;
  document.getElementById("tpay-sub").textContent = `${v.ftbShift} pt Football & ${v.bbShift} pt Basketball \xB7 ${legsTxt}`;
  const body = document.getElementById("tpay-body");
  body.innerHTML = "";
  Object.keys(v.payouts).forEach((legCount) => {
    const am = v.payouts[legCount];
    const dec = toDec(am);
    const risk = am.startsWith("-") ? Math.abs(parseFloat(am)) : 100;
    const win = am.startsWith("-") ? 100 : parseFloat(am.replace("+", ""));
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${legCount}</td><td>${legCount}</td><td>${risk}</td><td>${win}</td>`;
    body.appendChild(tr);
  });
  document.getElementById("tpay-overlay").classList.add("open");
}
export function closeTeaserPayouts() {
  document.getElementById("tpay-overlay").classList.remove("open");
}
function openTeaserModal() {
  const v = getVariant(state.teaserVariant);
  const n = state.teaserLegs.length;
  if (n < v.minLegs) {
    _showToast(`Min ${v.minLegs} legs for ${v.label}`);
    return;
  }
  document.getElementById("tmtitle").textContent = `${n}-Pick Teaser \xB7 ${v.label}`;
  const am = teaserPayout(v, n);
  document.getElementById("tm-am").textContent = am || "\u2014";
  const lc = document.getElementById("tmlegs");
  lc.innerHTML = "";
  state.teaserLegs.forEach((leg) => {
    const tl = { spread: "Spread", total: "Total" }[leg.type] || leg.type;
    const logoHtml = teamLogoImg(leg.sport, { name: leg.teamName }, 'pmlogo');
    const d = document.createElement("div");
    d.className = "pmleg";
    d.innerHTML = `${logoHtml}<div class="pmteam">${escapeHtml(leg.teamName)} <span style="font-size:10px;color:var(--text-xs);font-weight:400">${tl}</span></div><div class="pmodds"><span style="text-decoration:line-through;color:var(--text-xs);font-size:11px;font-weight:400">${escapeHtml(leg.origLine)}</span> ${escapeHtml(leg.shiftedLine)}</div>`;
    lc.appendChild(d);
  });
  document.getElementById("tm-risk").value = "20";
  updateTMCalc();
  document.getElementById("tmoverlay").classList.add("open");
}
export function closeTM() {
  document.getElementById("tmoverlay").classList.remove("open");
}
export function updateTMCalc() {
  const v = getVariant(state.teaserVariant);
  const n = state.teaserLegs.length;
  const inp = document.getElementById("tm-risk");
  const risk = parseFloat(inp.value) || 0;
  const am = teaserPayout(v, n);
  if (!am || n < v.minLegs) {
    document.getElementById("tm-win").textContent = "$0.00";
    return;
  }
  const win = calcWin(risk, am);
  document.getElementById("tm-win").textContent = fmtUSD(win);
  const invalid = risk < 20 || risk > state.balance;
  inp.classList.toggle("invalid", invalid && inp.value !== "");
  document.getElementById("tm-val").textContent = risk < 20 ? "\u26A0 Minimum wager is $20" : risk > state.balance ? "\u26A0 Exceeds state.balance" : "";
  const btn = document.getElementById("tm-confirm");
  btn.disabled = n < v.minLegs || risk < 20 || risk > state.balance;
  btn.textContent = risk > state.balance ? "Insufficient state.balance" : `Place ${n}-Pick Teaser \u2192`;
}
export function confirmTeaser() {
  const v = getVariant(state.teaserVariant);
  const n = state.teaserLegs.length;
  const risk = parseFloat(document.getElementById("tm-risk").value) || 0;
  const am = teaserPayout(v, n);
  if (!am) {
    _showToast("Invalid leg count for variant");
    return;
  }
  if (risk < 20) {
    _showToast("Min $20");
    return;
  }
  if (risk > state.balance) {
    _showToast("Insufficient state.balance");
    return;
  }
  const win = calcWin(risk, am);
  state.balance -= risk;
  state.placedBets.push({ type: "teaser", variant: v.label, legs: state.teaserLegs.map((l) => ({ teamName: l.teamName, matchup: l.matchup, type: l.type, origLine: l.origLine, line: l.shiftedLine, sport: l.sport })), legCount: n, amOdds: am, risk, win, placed: (/* @__PURE__ */ new Date()).toLocaleString(), status: "pending" });
  localStorage.setItem("bs_bets", JSON.stringify(state.placedBets));
  localStorage.setItem("bs_bal", state.balance);
  state.teaserLegs.forEach((l) => delete state.selCells[l.key]);
  state.teaserLegs = [];
  updateTeaserSelections();
  _updateBalDisp();
  updateBetsBtn();
  _renderBoard();
  closeTM();
  _showToast(`\u2713 ${n}-pick ${v.label} teaser placed! To win ${fmtUSD(win)}`);
}
export function onContinue() {
  if (state.wagerMode === "parlay") {
    openParlayModal();
    return;
  }
  if (state.wagerMode === "teaser") {
    if (!state.teaserVariant) {
      _showToast("Pick a teaser variant from the menu first");
      return;
    }
    openTeaserModal();
    return;
  }
  if (state.wagerMode === "ifbet") {
    openIfBetModal();
    return;
  }
  const valid = state.slip.filter((s) => s.win > 0);
  if (!valid.length) {
    _showToast("Enter a win amount for at least one wager");
    return;
  }
  renderReview();
  document.getElementById("main-layout").style.display = "none";
  document.getElementById("review-screen").classList.add("active");
}
export function closeReview() {
  document.getElementById("main-layout").style.display = "flex";
  document.getElementById("review-screen").classList.remove("active");
}
function renderReview() {
  const tbody = document.getElementById("rv-body");
  tbody.innerHTML = "";
  let totWin = 0, totRisk = 0;
  state.slip.filter((s) => s.win > 0).forEach((s) => {
    const win = parseFloat(s.win) || 0;
    const risk = calcRisk(win, s.vig || s.line);
    totWin += win;
    totRisk += risk;
    let titleHtml, subHtml, oddsHtml;
    if (isPropLeg(s)) {
      const side = propSide(s), ln = propLineNum(s);
      titleHtml = escapeHtml(s.propPlayer);
      subHtml = `${escapeHtml(s.matchup)} \xB7 ${escapeHtml(propMktLabel(s))}`;
      oddsHtml = `${escapeHtml(side)} ${escapeHtml(ln)}${s.vig ? " (" + escapeHtml(s.vig) + ")" : ""}`;
    } else {
      const tl = { spread: "Spread", ml: "Moneyline", total: "Total/OU", tt: "Team Total" }[s.type] || s.type;
      titleHtml = escapeHtml(s.teamName);
      subHtml = `${escapeHtml(s.matchup)} \xB7 ${tl}`;
      oddsHtml = `${escapeHtml(s.line)}${s.vig && s.vig !== s.line ? " (" + escapeHtml(s.vig) + ")" : ""}`;
    }
    const tr = document.createElement("tr");
    tr.innerHTML = `
    <td class="rv-td"><div class="rv-team"><button class="rv-rm" data-key="${escapeHtml(s.key)}">\u2715</button>${titleHtml}</div><div style="font-size:10px;color:var(--text-xs)">${subHtml}</div></td>
    <td class="rv-td"><select class="rv-odds-sel"><option>${oddsHtml}</option></select></td>
    <td class="rv-td" style="text-align:right"><input class="rv-win-inp" type="number" value="${win.toFixed(2)}" min="20" step="5" data-key="${escapeHtml(s.key)}"><div class="rv-val">${win < 20 ? "\u26A0 Min $20" : ""}</div></td>
    <td class="rv-td"><div class="rv-risk">${fmtUSD(risk)}</div></td>`;
    tr.querySelector(".rv-rm").addEventListener("click", (e) => removeFromSlip(e.currentTarget.dataset.key));
    tr.querySelector(".rv-win-inp").addEventListener("input", (e) => updateSlipWin(e.currentTarget.dataset.key, e.currentTarget.value));
    tbody.appendChild(tr);
  });
  document.getElementById("rv-summary").innerHTML = `Total Win: <span>${fmtUSD(totWin)}</span> &nbsp;|&nbsp; Total Risk: <span style="color:var(--red)">${fmtUSD(totRisk)}</span> &nbsp;|&nbsp; Balance After: <span>${fmtUSD(state.balance - totRisk)}</span>`;
}
function updateSlipWin(key, val) {
  const idx = state.slip.findIndex((s) => s.key === key);
  if (idx > -1) {
    state.slip[idx].win = parseFloat(val) || 0;
    renderReview();
  }
}
function removeFromSlip(key) {
  delete state.selCells[key];
  state.slip = state.slip.filter((s) => s.key !== key);
  if (!state.slip.length) {
    closeReview();
    _renderBoard();
    return;
  }
  renderReview();
  _renderBoard();
}
export function confirmWagers() {
  const valid = state.slip.filter((s) => (parseFloat(s.win) || 0) >= 20);
  if (!valid.length) {
    _showToast("Minimum win amount is $20");
    return;
  }
  const totRisk = valid.reduce((a, s) => a + calcRisk(parseFloat(s.win) || 0, s.vig || s.line), 0);
  if (totRisk > state.balance) {
    _showToast("Insufficient state.balance");
    return;
  }
  state.balance -= totRisk;
  const now = (/* @__PURE__ */ new Date()).toLocaleString();
  valid.forEach((s) => {
    const risk = calcRisk(parseFloat(s.win) || 0, s.vig || s.line);
    state.placedBets.push({ ...s, type: "straight", risk, placed: now, status: "pending" });
  });
  localStorage.setItem("bs_bets", JSON.stringify(state.placedBets));
  localStorage.setItem("bs_bal", state.balance);
  state.slip = [];
  state.selCells = {};
  updateContinueBtn();
  _updateBalDisp();
  updateBetsBtn();
  _renderBoard();
  closeReview();
  _showToast("\u2713 Wager placed! Good luck.");
}
export function openParlayModal() {
  if (state.parlayLegs.length < 2) {
    _showToast("Select at least 2 legs");
    return;
  }
  const n = state.parlayLegs.length;
  document.getElementById("pmtitle").textContent = `${n} Team \u2013 Parlay`;
  const lc = document.getElementById("pmlegs");
  lc.innerHTML = "";
  state.parlayLegs.forEach((leg) => {
    const d = document.createElement("div");
    d.className = "pmleg";
    let logoHtml, teamHtml, oddsHtml;
    if (isPropLeg(leg)) {
      const side = propSide(leg), ln = propLineNum(leg);
      logoHtml = playerMonogram(propInitials(leg), "pmlogo");
      teamHtml = `<div class="pmteam">${escapeHtml(leg.propPlayer)} <span style="font-size:10px;color:var(--text-xs);font-weight:400">${escapeHtml(propMktLabel(leg))}</span></div>`;
      oddsHtml = `<div class="pmodds">${escapeHtml(side)} ${escapeHtml(ln)}${leg.vig ? " (" + escapeHtml(leg.vig) + ")" : ""}</div>`;
    } else {
      logoHtml = teamLogoImg(leg.sport, { name: leg.teamName }, "pmlogo");
      teamHtml = `<div class="pmteam">${escapeHtml(leg.teamName)}</div>`;
      oddsHtml = `<div class="pmodds">${escapeHtml(leg.line)}${leg.vig && leg.vig !== leg.line ? " (" + escapeHtml(leg.vig) + ")" : ""}</div>`;
    }
    d.innerHTML = `${logoHtml}${teamHtml}${oddsHtml}`;
    lc.appendChild(d);
  });
  const gids = state.parlayLegs.map((l) => l.gameId);
  document.getElementById("corr").classList.toggle("hidden", gids.length === new Set(gids).size);
  document.getElementById("pm-risk").value = "20";
  updatePMCalc();
  document.getElementById("pmoverlay").classList.add("open");
}
export function closePM() {
  document.getElementById("pmoverlay").classList.remove("open");
}
export function updatePMCalc() {
  const inp = document.getElementById("pm-risk");
  const risk = parseFloat(inp.value) || 0;
  const n = state.parlayLegs.length;
  if (n < 2) {
    document.getElementById("pm-win").textContent = "$0.00";
    return;
  }
  const dec = parlayDec(state.parlayLegs);
  const win = (dec - 1) * risk;
  document.getElementById("pm-win").textContent = fmtUSD(win);
  const invalid = risk < 20 || risk > state.balance;
  inp.classList.toggle("invalid", invalid && inp.value !== "");
  document.getElementById("pm-val").textContent = risk < 20 ? "\u26A0 Minimum wager is $20" : risk > state.balance ? "\u26A0 Exceeds state.balance" : "";
  const btn = document.getElementById("pm-confirm");
  btn.disabled = n < 2 || risk < 20 || risk > state.balance;
  btn.textContent = risk > state.balance ? "Insufficient state.balance" : `Place ${n}-Leg Parlay \u2192`;
}
export function confirmParlay() {
  const risk = parseFloat(document.getElementById("pm-risk").value) || 0;
  if (risk < 20) {
    _showToast("Min $20");
    return;
  }
  if (risk > state.balance) {
    _showToast("Insufficient state.balance");
    return;
  }
  const dec = parlayDec(state.parlayLegs), win = (dec - 1) * risk;
  state.balance -= risk;
  state.placedBets.push({ type: "parlay", legs: state.parlayLegs.map((l) => ({ teamName: l.teamName, matchup: l.matchup, type: l.type, line: l.line, vig: l.vig, propPlayer: l.propPlayer, propSide: l.propSide, propMkt: l.propMkt })), legCount: state.parlayLegs.length, decOdds: dec, amOdds: decToAm(dec), risk, win, placed: (/* @__PURE__ */ new Date()).toLocaleString(), status: "pending" });
  localStorage.setItem("bs_bets", JSON.stringify(state.placedBets));
  localStorage.setItem("bs_bal", state.balance);
  state.parlayLegs.forEach((l) => delete state.selCells[l.key]);
  state.parlayLegs = [];
  updateParlaySelections();
  _updateBalDisp();
  updateBetsBtn();
  _renderBoard();
  closePM();
  _showToast(`\u2713 ${state.placedBets[state.placedBets.length - 1].legCount}-leg parlay placed! To win ${fmtUSD(win)}`);
}
export function updateBetsBtn() {
  const n = state.placedBets.filter((b) => b.status === "pending").length;
  const cnt = document.getElementById("bets-cnt");
  cnt.style.display = n ? "inline" : "none";
  cnt.textContent = n;
  const ps = document.getElementById("pend-stat");
  if (ps) ps.style.display = n ? "block" : "none";
  const pd = document.getElementById("pend-disp");
  if (pd) pd.textContent = n;
}
export function openBets() {
  renderBetsModal();
  document.getElementById("bmodal-overlay").classList.add("open");
}
export function closeBets() {
  document.getElementById("bmodal-overlay").classList.remove("open");
}
function renderBetsModal() {
  const body = document.getElementById("bmodal-body");
  body.innerHTML = "";
  if (!state.placedBets.length) {
    body.innerHTML = emptyState({
      icon: "\u{1F39F}",
      heading: "No bets placed yet",
      sub: "Place your first wager from the board to see it here.",
      hint: "Settled bets stay in your history for review."
    });
    return;
  }
  state.placedBets.map((b, i) => ({ b, i })).reverse().forEach(({ b, i }) => {
    const card = document.createElement("div");
    card.className = "betcard";
    if (b.type === "ifbet") {
      const totWin = b.win || (b.legs || []).reduce((a, l) => a + (parseFloat(l.win) || 0), 0);
      const ifLegsHtml = (b.legs || []).map((l, i2) => {
        const rule = i2 === 0 ? "always" : l.fireRule === "winOrPush" ? "if win/push" : "if win";
        let label;
        if (isPropLeg(l)) {
          label = `${escapeHtml(l.propPlayer)} <span style="color:var(--text-xs)">(${escapeHtml(propMktLabel(l))}: ${escapeHtml(propSide(l))} ${escapeHtml(propLineNum(l))} \xB7 win ${fmtUSD(parseFloat(l.win) || 0)} \xB7 ${rule})</span>`;
        } else {
          const tl = { spread: "Spread", ml: "ML", total: "Total", tt: "TT" }[l.type] || l.type;
          label = `${escapeHtml(l.teamName)} <span style="color:var(--text-xs)">(${tl}: ${escapeHtml(l.line)} \xB7 win ${fmtUSD(parseFloat(l.win) || 0)} \xB7 ${rule})</span>`;
        }
        return `<div class="plegprevrow"><b style="color:var(--orange)">${i2 + 1}.</b> ${label}</div>`;
      }).join("");
      card.innerHTML = `<div class="bettop"><span class="bettnm">\u26D3 ${b.legCount}-Leg If Bet</span>${betStatusBadge(b.status, "betst")}</div><div class="betmeta">Sequential \xB7 ${escapeHtml(b.placed || "")}</div><div class="plegprev">${ifLegsHtml}</div><div class="betamts"><div class="betamt"><label>Risk (Leg 1)</label><div class="bamt r">${fmtUSD(b.risk)}</div></div><div class="betamt"><label>Max Win</label><div class="bamt g">${fmtUSD(totWin)}</div></div></div>`;
    } else if (b.type === "teaser") {
      const win = b.win || calcWin(b.risk || 0, b.amOdds || "-110");
      card.innerHTML = `<div class="bettop"><span class="bettnm">\u{1F3AF} ${b.legCount}-Pick ${escapeHtml(b.variant || "Teaser")}</span>${betStatusBadge(b.status, "betst")}</div><div class="betmeta">Odds: ${escapeHtml(b.amOdds || "")} \xB7 ${escapeHtml(b.placed || "")}</div><div class="plegprev">${(b.legs || []).map((l, i2) => {
        const tl = { spread: "Spread", total: "Total" }[l.type] || l.type;
        return `<div class="plegprevrow"><b style="color:var(--teal)">${i2 + 1}.</b> ${escapeHtml(l.teamName)} <span style="color:var(--text-xs)">(${tl}: <span style="text-decoration:line-through">${escapeHtml(l.origLine || "")}</span> \u2192 ${escapeHtml(l.line)})</span></div>`;
      }).join("")}</div><div class="betamts"><div class="betamt"><label>Risk</label><div class="bamt r">${fmtUSD(b.risk)}</div></div><div class="betamt"><label>To Win</label><div class="bamt g">${fmtUSD(win)}</div></div></div>`;
    } else if (b.type === "parlay" || b.legCount) {
      const win = b.win || (b.decOdds - 1) * b.risk;
      const parLegsHtml = (b.legs || []).map((l, i2) => {
        let label;
        if (isPropLeg(l)) {
          label = `${escapeHtml(l.propPlayer)} <span style="color:var(--text-xs)">(${escapeHtml(propMktLabel(l))}: ${escapeHtml(propSide(l))} ${escapeHtml(propLineNum(l))}${l.vig ? " " + escapeHtml(l.vig) : ""})</span>`;
        } else {
          const tl = { spread: "Spread", ml: "ML", total: "Total", tt: "TT" }[l.type] || l.type;
          label = `${escapeHtml(l.teamName)} <span style="color:var(--text-xs)">(${tl}: ${escapeHtml(l.line)}${l.vig && l.vig !== l.line ? " " + escapeHtml(l.vig) : ""})</span>`;
        }
        return `<div class="plegprevrow"><b style="color:var(--teal)">${i2 + 1}.</b> ${label}</div>`;
      }).join("");
      card.innerHTML = `<div class="bettop"><span class="bettnm">\u{1F3B0} ${b.legCount}-Leg Parlay</span>${betStatusBadge(b.status, "betst")}</div><div class="betmeta">Odds: ${escapeHtml(b.amOdds)} (${parseFloat(b.decOdds).toFixed(3)}x) \xB7 ${escapeHtml(b.placed || "")}</div><div class="plegprev">${parLegsHtml}</div><div class="betamts"><div class="betamt"><label>Risk</label><div class="bamt r">${fmtUSD(b.risk)}</div></div><div class="betamt"><label>To Win</label><div class="bamt g">${fmtUSD(win)}</div></div></div>`;
    } else {
      const win = b.win || calcWin(b.risk || 0, b.vig || b.line);
      const risk = b.risk || calcRisk(b.win || 0, b.vig || b.line);
      let titleHtml, metaHtml;
      if (isPropLeg(b)) {
        const sideTxt = propSide(b), lnTxt = propLineNum(b);
        titleHtml = `${escapeHtml(b.propPlayer)} <span style="color:var(--text-xs);font-weight:400">${escapeHtml(propMktLabel(b))}</span>`;
        metaHtml = `${escapeHtml(b.sport)} \xB7 ${escapeHtml(sideTxt)} ${escapeHtml(lnTxt)}${b.vig ? " (" + escapeHtml(b.vig) + ")" : ""} \xB7 ${escapeHtml(b.placed || "")}`;
      } else {
        const tl = { spread: "Spread", ml: "Moneyline", total: "Total/OU", tt: "Team Total" }[b.type] || b.type;
        titleHtml = escapeHtml(b.teamName);
        metaHtml = `${escapeHtml(b.sport)} \xB7 ${tl}: ${escapeHtml(b.line)}${b.vig && b.vig !== b.line ? " (" + escapeHtml(b.vig) + ")" : ""} \xB7 ${escapeHtml(b.placed || "")}`;
      }
      card.innerHTML = `<div class="bettop"><span class="bettnm">${titleHtml}</span>${betStatusBadge(b.status, "betst")}</div><div class="betmeta">${metaHtml}</div><div class="betamts"><div class="betamt"><label>Risk</label><div class="bamt r">${fmtUSD(risk)}</div></div><div class="betamt"><label>To Win</label><div class="bamt g">${fmtUSD(win)}</div></div></div>`;
    }
    if (b.status === "pending") {
      const sr = document.createElement("div");
      sr.className = "settle-row";
      sr.innerHTML = `<button class="settle-btn won" data-idx="${i}" data-outcome="won">\u2713 Won</button><button class="settle-btn push" data-idx="${i}" data-outcome="push">\u21BA Push</button><button class="settle-btn lost" data-idx="${i}" data-outcome="lost">\u2715 Lost</button>`;
      sr.querySelectorAll(".settle-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => settleBet(parseInt(e.currentTarget.dataset.idx, 10), e.currentTarget.dataset.outcome));
      });
      card.appendChild(sr);
    }
    body.appendChild(card);
  });
}
export function settleBet(idx, outcome) {
  const b = state.placedBets[idx];
  if (!b || b.status !== "pending") return;
  if (outcome === "won") {
    state.balance += b.risk + b.win;
  } else if (outcome === "push") {
    state.balance += b.risk;
  }
  b.status = outcome;
  b.settled = (/* @__PURE__ */ new Date()).toLocaleString();
  localStorage.setItem("bs_bets", JSON.stringify(state.placedBets));
  localStorage.setItem("bs_bal", state.balance);
  _updateBalDisp();
  updateBetsBtn();
  renderBetsModal();
  _showToast(`Bet marked as ${outcome.toUpperCase()}`);
}
export function updateContinueBtn() {
  let n = 0;
  if (state.wagerMode === "parlay") n = state.parlayLegs.length;
  else if (state.wagerMode === "teaser") n = state.teaserLegs.length;
  else if (state.wagerMode === "ifbet") n = state.ifBetLegs.length;
  else n = state.slip.filter((s) => s.win > 0).length;
  const top = document.getElementById("continue-cnt");
  const brd = document.getElementById("brd-continue-cnt");
  top.textContent = `(${n})`;
  brd.textContent = `(${n})`;
  top.classList.toggle("hidden", n === 0);
  brd.classList.toggle("hidden", n === 0);
  const cb = document.getElementById("continue-btn");
  cb.style.opacity = n > 0 ? "1" : "0.5";
}
export function onOddsClickParlay(game, team, mkey, line, vig, key, blockEl, gameObj) {
  const idx = state.parlayLegs.findIndex((l) => l.key === key);
  if (idx > -1) {
    state.parlayLegs.splice(idx, 1);
    delete state.selCells[key];
  } else {
    state.parlayLegs.push({ key, gameId: game.id, teamName: team.name, sport: game.sport, matchup: `${game.away} @ ${game.home}`, type: mkey, line, vig: vig || line });
    state.selCells[key] = true;
  }
  updateParlaySelections();
  const nb = _buildGameBlock(gameObj);
  blockEl.replaceWith(nb);
}
