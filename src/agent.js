// ════════════════════════════════════════════════════════════════════════════
//  agent.js — Agent (bookie-side) portal view
//  ────────────────────────────────────────────────────────────────────────────
//  Routed sub-views:
//    'dashboard'    — KPI strip + tile grid + recent-activity widgets
//    'management'   — players table (50 rows)
//    'detail'       — single player, 11-tab editor (3 real + 8 stubs)
//    'weekly'       — Weekly Figures report (per-player P/L, column-toggle modal)
//    'pending'      — Pending Wagers (aggregated across all players)
//    'placeholder'  — unimplemented tiles
//
//  Display-only first pass for Customer Detail (no edit/save).
//  Data lives in window.AGENT_MOCK (loaded by /agent_mock.js).
//  No live scoreboard — see AGENT_RECON.md.
// ════════════════════════════════════════════════════════════════════════════

import { escapeHtml, fmtUSD } from './utils.js';

const agentState = {
  active: false,
  subview: 'dashboard',
  placeholderLabel: '',
  detail: { playerId: null, tab: 'personal' },
  weekly: {
    cols: { firstName: true, lastName: true, carry: false, pending: true, payments: false, balance: true },
    agentInfo: 'Balance',
    activity: 'This Week',
    settingsOpen: false,
  },
};

// 11 tabs in canonical LC797 order. `real: true` → has a renderer; others stub.
const DETAIL_TABS = [
  { key: 'personal',      label: 'Personal',       icon: '👤', real: true },
  { key: 'limits',        label: 'Limits',         icon: '⏱', real: true },
  { key: 'lineset',       label: 'Lineset',        icon: '✎',  real: false },
  { key: 'transactions',  label: 'Transactions',   icon: '⇄',  real: false },
  { key: 'wager',         label: 'Wager',          icon: '🎫', real: true },
  { key: 'history',       label: 'History',        icon: '⌛', real: false },
  { key: 'communications',label: 'Communications', icon: '✉',  real: false },
  { key: 'changes',       label: 'Changes',        icon: '⟳',  real: false },
  { key: 'connections',   label: 'Connections',    icon: '⤵',  real: false },
  { key: 'casino',        label: 'Casino',         icon: '🎰', real: false },
  { key: 'backbone',      label: 'Backbone',       icon: '⚙',  real: false },
];

// ─── PUBLIC API ─────────────────────────────────────────────────────────────

export function initAgent(){
  if (!window.AGENT_MOCK) {
    console.warn('[agent] AGENT_MOCK fixture missing — using empty data');
    window.AGENT_MOCK = { id: '—', balance: 0, kpi:{active:0,yesterday:0,today:0,weekly:0}, players:[], recent:{wagers:[],logins:[],changes:[]} };
  }
  agentState.active = true;
  render();
}

export function toggleAgentView(){
  agentState.active = !agentState.active;
  agentState.subview = 'dashboard';
  applyMode();
  render();
}

export function isAgentActive(){ return agentState.active; }

// Legacy toggle path (kept for the original in-app overlay use case; not used
// by agent.html which always-renders).
function applyMode(){
  const playerEls = ['.disc', '.bet-tabs', '#main-layout', '#review-screen'];
  const agentEl = document.getElementById('agent-view');
  if (agentState.active) {
    playerEls.forEach(s => { const el = document.querySelector(s); if (el) el.classList.add('hidden'); });
    if (agentEl) agentEl.classList.remove('hidden');
  } else {
    playerEls.forEach(s => { const el = document.querySelector(s); if (el) el.classList.remove('hidden'); });
    if (agentEl) agentEl.classList.add('hidden');
  }
}

// ─── RENDER ROUTER ──────────────────────────────────────────────────────────

function render(){
  const root = document.getElementById('agent-view');
  if (!root) return;
  if (agentState.subview === 'management') return renderManagement(root);
  if (agentState.subview === 'detail') return renderDetail(root);
  if (agentState.subview === 'weekly') return renderWeekly(root);
  if (agentState.subview === 'pending') return renderPending(root);
  if (agentState.subview === 'placeholder') return renderPlaceholder(root);
  return renderDashboard(root);
}

// ─── DASHBOARD ──────────────────────────────────────────────────────────────

function renderDashboard(root){
  const m = window.AGENT_MOCK;
  const kpi = m.kpi;
  root.innerHTML = `
    <div class="ag-shell">
      ${agentHeaderBar(m, 'Dashboard')}
      <div class="ag-body">
        <div class="ag-main">
          <div class="ag-search">
            <input type="text" placeholder="Search account..." class="ag-search-inp" aria-label="Search account">
            <button class="ag-addnew">+ ADD NEW</button>
          </div>
          <div class="ag-kpi">
            ${kpiCell('Active', kpi.active)}
            ${kpiCell('Yesterday', fmtUSD(kpi.yesterday))}
            ${kpiCell('Today', fmtUSD(kpi.today))}
            ${kpiCell('Weekly', fmtUSD(kpi.weekly))}
          </div>
          <div class="ag-cs">CONTACT CUSTOMER SERVICE</div>
          <div class="ag-grid">
            ${tile('weekly',  '📊', 'Weekly Figures',  'tile-blue')}
            ${tile('pending', '🎫', 'Pending',         'tile-purple')}
            ${tile('cashier', '⇄$', 'Cashier',         'tile-amber')}
            ${tile('add',     '👤+', 'Add New',        'tile-red')}
            ${tile('mgmt',    '⛛',  'Management',     'tile-green')}
            ${tile('mass',    '✎≡', 'Mass Edit',       'tile-teal')}
            ${tile('position','⚖',  'Position',        'tile-navy')}
            ${tile('ticker',  '🎟', 'Bet Ticker',      'tile-teal')}
            ${tile('ip',      '🌐', 'IP Checker',      'tile-red')}
            ${tile('tx',      '💰', 'Transactions',    'tile-orange')}
            ${tile('mail',    '✉',  'Mailbox',         'tile-orange')}
          </div>
          <div class="ag-feedback">FEEDBACK</div>
          ${widgetWagers(m.recent.wagers)}
          ${widgetLogins(m.recent.logins)}
          ${widgetChanges(m.recent.changes)}
        </div>
        <div class="ag-rail">
          <div class="ag-rail-tabs">
            <span class="ag-rail-tab active">Hierarchy</span>
            <span class="ag-rail-tab">Settings</span>
          </div>
          <div class="ag-rail-body">
            <input type="text" placeholder="Search account" class="ag-rail-search" aria-label="Search hierarchy">
            <div class="ag-hier-row">
              <span class="ag-hier-name">${escapeHtml(m.id)}</span>
              <span class="ag-hier-cnt">(${m.players.length})</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  wireTiles();
}

function agentHeaderBar(m, crumb){
  return `
    <div class="ag-topbar">
      <div class="ag-id">${escapeHtml(m.id)}</div>
      <div class="ag-bal">BALANCE &gt; <span class="ag-bal-val">${fmtUSD(m.balance)}</span></div>
      <div class="ag-crumb" id="ag-crumb">${escapeHtml(crumb || 'Dashboard')}</div>
      <button class="ag-logout" onclick="logoutAgent()">⎋ Logout</button>
    </div>
  `;
}

function kpiCell(label, val){
  return `<div class="ag-kpi-cell"><label>${escapeHtml(label)}</label><div class="ag-kpi-val">${escapeHtml(String(val))}</div></div>`;
}

function tile(slug, icon, label, klass){
  return `<button class="ag-tile ${klass}" data-tile="${slug}"><span class="ag-tile-icon">${icon}</span><span class="ag-tile-label">${escapeHtml(label)}</span></button>`;
}

function widgetWagers(rows){
  const body = rows.length
    ? rows.map(r => `<div class="ag-wrow"><span>${escapeHtml(r.id)}</span><span class="ag-wmono">${escapeHtml(r.pw)}</span><span class="ag-wamt">${fmtUSD(r.amount)}</span><span class="ag-wdate">${fmtDate(r.when)}</span></div>`).join('')
    : '<div class="ag-empty">No recent wagers</div>';
  return `<details class="ag-widget" open><summary>RECENT WAGERS</summary>${body}</details>`;
}
function widgetLogins(rows){
  const body = rows.length
    ? rows.map(r => `<div class="ag-wrow"><span>${escapeHtml(r.id)}</span><span class="ag-wmono">${escapeHtml(r.pw)}</span><span class="ag-wdate">${fmtDate(r.when)}</span></div>`).join('')
    : '<div class="ag-empty">No recent logins</div>';
  return `<details class="ag-widget"><summary>LATEST LOGINS</summary>${body}</details>`;
}
function widgetChanges(rows){
  const body = rows.length
    ? rows.map(r => `<div class="ag-wrow"><span class="ag-wmono">${escapeHtml(r.who)}</span><span>${escapeHtml(r.what)}</span><span>${escapeHtml(r.target)}</span><span class="ag-wdate">${fmtDate(r.when)}</span></div>`).join('')
    : '<div class="ag-empty">No recent changes</div>';
  return `<details class="ag-widget"><summary>RECENT CHANGES</summary>${body}</details>`;
}

function wireTiles(){
  document.querySelectorAll('.ag-tile').forEach(btn => {
    btn.addEventListener('click', () => {
      const slug = btn.dataset.tile;
      if (slug === 'mgmt') {
        agentState.subview = 'management';
      } else if (slug === 'weekly') {
        agentState.subview = 'weekly';
      } else if (slug === 'pending') {
        agentState.subview = 'pending';
      } else {
        agentState.subview = 'placeholder';
        agentState.placeholderLabel = btn.querySelector('.ag-tile-label').textContent;
      }
      render();
    });
  });
}

// ─── MANAGEMENT (customer list) ─────────────────────────────────────────────

function renderManagement(root){
  const m = window.AGENT_MOCK;
  root.innerHTML = `
    <div class="ag-shell">
      ${agentHeaderBar(m, 'Management')}
      <div class="ag-subhdr">
        <button class="ag-back" data-back="dashboard">← Back</button>
        <div class="ag-crumb-sub">Figures &gt; <b>Management</b></div>
        <div class="ag-subhdr-actions">
          <button class="ag-action">EXPORT</button>
          <button class="ag-action">SETTINGS</button>
        </div>
      </div>
      <div class="ag-table-wrap">
        <table class="ag-table">
          <thead>
            <tr>
              <th>ID</th>
              <th class="num">Credit</th>
              <th class="num">Wager</th>
              <th class="num">Parlay</th>
              <th class="num">Teaser</th>
              <th>Casino</th>
              <th>Racing</th>
              <th class="num">Settle</th>
              <th>Last Wager</th>
              <th>Last Login</th>
              <th class="num">Pending</th>
              <th class="num">Balance</th>
            </tr>
          </thead>
          <tbody>
            ${m.players.map(playerRow).join('')}
          </tbody>
          <tfoot>
            <tr>
              <th>TOTAL (${m.players.length})</th>
              <td colspan="10"></td>
              <th class="num">${fmtUSD(m.balance)}</th>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  `;
  wireBack();
  wirePlayerRows();
}

function playerRow(p){
  return `
    <tr data-pid="${escapeHtml(p.id)}" class="ag-prow">
      <td class="ag-pid"><span class="ag-link">${escapeHtml(p.id)}</span> <span class="ag-mono">(${escapeHtml(p.pw)})</span></td>
      <td class="num"><span class="ag-link">${p.credit}</span></td>
      <td class="num"><span class="ag-link">${p.wager}</span></td>
      <td class="num"><span class="ag-link">${p.parlay}</span></td>
      <td class="num"><span class="ag-link">${p.teaser}</span></td>
      <td>${pillToggle(p.casino, 'casino')}</td>
      <td>${pillToggle(p.racing, 'racing')}</td>
      <td class="num"><span class="ag-link">${p.settle ? fmtUSD(p.settle) : 0}</span></td>
      <td>${fmtDate(p.lastWager) || '<span class="ag-dim">None</span>'}</td>
      <td>${fmtDate(p.lastLogin) || '<span class="ag-dim">None</span>'}</td>
      <td class="num">${p.pending}</td>
      <td class="num ${p.balance < 0 ? 'ag-neg' : p.balance > 0 ? 'ag-pos' : ''}"><span class="ag-link">${fmtUSD(p.balance)}</span></td>
    </tr>
  `;
}

function pillToggle(on, kind){
  return `<span class="ag-pill ${on ? 'on' : 'off'} ag-pill-${kind}">${on ? 'Yes' : 'No'}</span>`;
}

function wirePlayerRows(){
  document.querySelectorAll('.ag-prow').forEach(tr => {
    tr.addEventListener('click', () => {
      const pid = tr.dataset.pid;
      if (!pid) return;
      agentState.subview = 'detail';
      agentState.detail = { playerId: pid, tab: 'personal' };
      render();
    });
  });
}

// ─── WEEKLY FIGURES ─────────────────────────────────────────────────────────
// Per-player P/L report. Aggregates each player's wagers within the activity
// window. Agent P/L = -player.net (agent profits when player loses).
//
// Column-toggle modal mirrors LC797's WEEKLY > SETTINGS panel:
//   First Name / Last Name / Carry/Zero / Pending / Payments / Balance.
// Plus an Agent Info dropdown (default Balance) and Activity dropdown
// (This Week / Last 3 Weeks / Last 300 Days). Settings persist for the
// session via agentState.weekly.

function renderWeekly(root){
  const m = window.AGENT_MOCK;
  const w = agentState.weekly;
  const rows = aggregateWeekly(m.players, w.activity);
  const totals = sumWeekly(rows);

  const colHdr = (key, label, alwaysOn) => (alwaysOn || w.cols[key])
    ? `<th class="num">${escapeHtml(label)}</th>` : '';

  root.innerHTML = `
    <div class="ag-shell">
      ${agentHeaderBar(m, 'Weekly Figures')}
      <div class="ag-subhdr">
        <button class="ag-back" data-back="dashboard">← Back</button>
        <div class="ag-crumb-sub">Figures &gt; <b>Weekly Figures</b></div>
        <div class="ag-subhdr-actions">
          <select class="ag-action ag-select" aria-label="Period type">
            <option>Weekly</option>
            <option>Monthly</option>
            <option>Daily</option>
          </select>
          <button class="ag-action">EXPORT</button>
          <button class="ag-action" id="ag-wk-settings-btn">SETTINGS</button>
          <select class="ag-action ag-select" aria-label="Week picker">
            <option>Current Week</option>
            <option>Last Week</option>
            <option>2 Weeks Ago</option>
          </select>
        </div>
      </div>
      <div class="ag-table-wrap">
        <table class="ag-table ag-weekly-table">
          <thead>
            <tr>
              <th>ID</th>
              ${w.cols.firstName ? '<th>First Name</th>' : ''}
              ${w.cols.lastName ? '<th>Last Name</th>' : ''}
              <th class="num">${escapeHtml(w.activity)}</th>
              ${colHdr('carry', 'Carry/Zero')}
              ${colHdr('pending', 'Pending')}
              ${colHdr('payments', 'Payments')}
              ${colHdr('balance', 'Balance')}
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => weeklyRow(r, w.cols)).join('')}
          </tbody>
          <tfoot>
            <tr>
              <th>TOTAL (${rows.length})</th>
              ${w.cols.firstName ? '<td></td>' : ''}
              ${w.cols.lastName ? '<td></td>' : ''}
              <th class="num ${signClass(totals.activity)}">${fmtUSD(totals.activity)}</th>
              ${w.cols.carry ? `<th class="num ${signClass(totals.carry)}">${fmtUSD(totals.carry)}</th>` : ''}
              ${w.cols.pending ? `<th class="num">${fmtUSD(totals.pending)}</th>` : ''}
              ${w.cols.payments ? `<th class="num">${fmtUSD(totals.payments)}</th>` : ''}
              ${w.cols.balance ? `<th class="num ${signClass(totals.balance)}">${fmtUSD(totals.balance)}</th>` : ''}
            </tr>
          </tfoot>
        </table>
      </div>
      ${weeklySettingsModal(w)}
    </div>
  `;
  wireBack();
  wireWeekly();
}

function weeklyRow(r, cols){
  return `
    <tr data-pid="${escapeHtml(r.id)}" class="ag-prow">
      <td class="ag-pid"><span class="ag-link">${escapeHtml(r.id)}</span> <span class="ag-mono">(${escapeHtml(r.pw)})</span></td>
      ${cols.firstName ? `<td>${escapeHtml(r.firstName)}</td>` : ''}
      ${cols.lastName ? `<td>${escapeHtml(r.lastName)}</td>` : ''}
      <td class="num ${signClass(r.activity)}">${fmtUSD(r.activity)}</td>
      ${cols.carry ? `<td class="num ${signClass(r.carry)}">${fmtUSD(r.carry)}</td>` : ''}
      ${cols.pending ? `<td class="num">${fmtUSD(r.pending)}</td>` : ''}
      ${cols.payments ? `<td class="num">${fmtUSD(r.payments)}</td>` : ''}
      ${cols.balance ? `<td class="num ${signClass(r.balance)}">${fmtUSD(r.balance)}</td>` : ''}
    </tr>
  `;
}

function weeklySettingsModal(w){
  return `
    <div class="pmoverlay ${w.settingsOpen ? 'open' : ''}" id="ag-wk-overlay">
      <div class="pmodal">
        <div class="pmh">
          <span>WEEKLY &gt; SETTINGS</span>
          <button class="pmclose" data-wk-close>✕</button>
        </div>
        <div class="pmbody">
          <button class="ag-wk-info-btn">READ HOW THIS REPORT HAS CHANGED</button>
          <div class="ag-wk-row">
            <label class="ag-wk-lbl">COLUMNS</label>
            <div class="ag-wk-cols">
              ${colCheckbox('firstName', 'First Name', w.cols.firstName)}
              ${colCheckbox('lastName', 'Last Name', w.cols.lastName)}
              ${colCheckbox('carry', 'Carry/Zero', w.cols.carry)}
              ${colCheckbox('pending', 'Pending', w.cols.pending)}
              ${colCheckbox('payments', 'Payments', w.cols.payments)}
              ${colCheckbox('balance', 'Balance', w.cols.balance)}
            </div>
          </div>
          <div class="ag-wk-row">
            <label class="ag-wk-lbl" for="ag-wk-info">AGENT INFO</label>
            <select id="ag-wk-info" class="ag-wk-sel">
              ${optSel('Balance', w.agentInfo)}
              ${optSel('Credit', w.agentInfo)}
              ${optSel('Available', w.agentInfo)}
            </select>
          </div>
          <div class="ag-wk-row">
            <label class="ag-wk-lbl" for="ag-wk-act">ACTIVITY</label>
            <select id="ag-wk-act" class="ag-wk-sel">
              ${optSel('This Week', w.activity)}
              ${optSel('Last 3 Weeks', w.activity)}
              ${optSel('Last 300 Days', w.activity)}
            </select>
          </div>
          <div class="ag-wk-btns">
            <button class="rv-btn rv-cancel" data-wk-close>Cancel</button>
            <button class="rv-btn rv-confirm" data-wk-save>SAVE</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function colCheckbox(key, label, on){
  return `<label class="ag-wk-cb"><input type="checkbox" data-wk-col="${key}" ${on ? 'checked' : ''}>${escapeHtml(label)}</label>`;
}

function optSel(val, cur){
  return `<option ${val === cur ? 'selected' : ''}>${escapeHtml(val)}</option>`;
}

function wireWeekly(){
  const openBtn = document.getElementById('ag-wk-settings-btn');
  if (openBtn) openBtn.addEventListener('click', () => {
    agentState.weekly.settingsOpen = true;
    render();
  });

  document.querySelectorAll('[data-wk-close]').forEach(b => {
    b.addEventListener('click', () => {
      agentState.weekly.settingsOpen = false;
      render();
    });
  });

  const saveBtn = document.querySelector('[data-wk-save]');
  if (saveBtn) saveBtn.addEventListener('click', () => {
    document.querySelectorAll('[data-wk-col]').forEach(cb => {
      const key = cb.dataset.wkCol;
      agentState.weekly.cols[key] = cb.checked;
    });
    const info = document.getElementById('ag-wk-info');
    const act = document.getElementById('ag-wk-act');
    if (info) agentState.weekly.agentInfo = info.value;
    if (act) agentState.weekly.activity = act.value;
    agentState.weekly.settingsOpen = false;
    render();
  });

  // Row click → Customer Detail (same as Management)
  document.querySelectorAll('.ag-weekly-table .ag-prow').forEach(tr => {
    tr.addEventListener('click', () => {
      const pid = tr.dataset.pid;
      if (!pid) return;
      agentState.subview = 'detail';
      agentState.detail = { playerId: pid, tab: 'personal' };
      render();
    });
  });
}

// Aggregate per-player figures within the activity window.
// Agent P/L = -player.net (agent earns when player loses).
function aggregateWeekly(players, activity){
  const days = activity === 'Last 3 Weeks' ? 21 : activity === 'Last 300 Days' ? 300 : 7;
  const cutoff = Date.now() - days * 86400000;
  return players.map(p => {
    let activitySum = 0, pendingSum = 0;
    (p.wagers || []).forEach(w => {
      const t = new Date(w.placed).getTime();
      if (w.result === 'PENDING') {
        pendingSum += w.risk;
      } else if (t >= cutoff) {
        activitySum += -w.net; // negate: agent perspective
      }
    });
    // Carry/Zero: prior-period balance carried forward (synthetic — use a
    // deterministic value from balance for display purposes).
    const carry = Math.round((p.balance * 0.25) * 100) / 100;
    // Payments: settled $ moved this period (synthetic — half of settle field).
    const payments = p.settle > 0 ? +(p.settle * 0.5).toFixed(2) : 0;
    return {
      id: p.id,
      pw: p.pw,
      firstName: p.firstName,
      lastName: p.lastName,
      activity: +activitySum.toFixed(2),
      carry,
      pending: +pendingSum.toFixed(2),
      payments,
      balance: p.balance,
    };
  });
}

function sumWeekly(rows){
  return rows.reduce((acc, r) => ({
    activity: +(acc.activity + r.activity).toFixed(2),
    carry: +(acc.carry + r.carry).toFixed(2),
    pending: +(acc.pending + r.pending).toFixed(2),
    payments: +(acc.payments + r.payments).toFixed(2),
    balance: +(acc.balance + r.balance).toFixed(2),
  }), { activity: 0, carry: 0, pending: 0, payments: 0, balance: 0 });
}

function signClass(v){
  return v < 0 ? 'ag-neg' : v > 0 ? 'ag-pos' : '';
}

// ─── PENDING WAGERS (global) ────────────────────────────────────────────────
// Aggregates every wager with result === 'PENDING' across all 50 players.
// Read-only first pass — filters are static dropdowns.

function renderPending(root){
  const m = window.AGENT_MOCK;
  const rows = aggregatePending(m.players);
  const totalRisk = rows.reduce((s, r) => s + r.risk, 0);
  const totalWin = rows.reduce((s, r) => s + r.toWin, 0);

  root.innerHTML = `
    <div class="ag-shell">
      ${agentHeaderBar(m, 'Pending Wagers')}
      <div class="ag-subhdr">
        <button class="ag-back" data-back="dashboard">← Back</button>
        <div class="ag-crumb-sub">Wagers &gt; <b>Pending Wagers</b></div>
        <div class="ag-subhdr-actions">
          <button class="ag-action">EXPORT</button>
          <button class="ag-action">PRINT</button>
        </div>
      </div>
      <div class="ag-wfilters">
        <div class="ag-wf-lbl">FILTERS</div>
        <input type="text" placeholder="Ticket #" class="ag-wf-inp" aria-label="Ticket number">
        <div class="ag-wf-cell"><label for="ag-pf-cust">Customer</label><select id="ag-pf-cust" class="ag-wf-sel"><option>--ALL--</option>${m.players.map(p => `<option>${escapeHtml(p.id)}</option>`).join('')}</select></div>
        <div class="ag-wf-cell"><label for="ag-pf-sport">Sport</label><select id="ag-pf-sport" class="ag-wf-sel"><option>--ALL--</option><option>NBA</option><option>MLB</option><option>NHL</option><option>NFL</option></select></div>
        <div class="ag-wf-cell"><label for="ag-pf-amt">Amount</label><select id="ag-pf-amt" class="ag-wf-sel"><option>--ALL--</option><option>&gt;$100</option><option>&gt;$500</option></select></div>
      </div>
      ${rows.length === 0
        ? '<div class="ag-wager-empty">No Pending Wagers</div>'
        : `<div class="ag-table-wrap">
            <table class="ag-table ag-pending-table">
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Customer</th>
                  <th>Sport</th>
                  <th>Type</th>
                  <th>Line</th>
                  <th>Placed</th>
                  <th class="num">Risk</th>
                  <th class="num">To Win</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map(pendingRow).join('')}
              </tbody>
              <tfoot>
                <tr>
                  <th>TOTAL (${rows.length})</th>
                  <td colspan="5"></td>
                  <th class="num">${fmtUSD(totalRisk)}</th>
                  <th class="num">${fmtUSD(totalWin)}</th>
                </tr>
              </tfoot>
            </table>
          </div>`
      }
    </div>
  `;
  wireBack();
  wirePendingRows();
}

function pendingRow(r){
  return `
    <tr data-pid="${escapeHtml(r.playerId)}" class="ag-prow">
      <td class="ag-mono">${escapeHtml(r.ticket)}</td>
      <td><span class="ag-link">${escapeHtml(r.playerId)}</span></td>
      <td>${escapeHtml(r.sport)}</td>
      <td>${escapeHtml(r.type)}</td>
      <td class="ag-mono">${escapeHtml(r.line)}</td>
      <td class="ag-mono">${fmtDate(r.placed)}</td>
      <td class="num">${fmtUSD(r.risk)}</td>
      <td class="num">${fmtUSD(r.toWin)}</td>
    </tr>
  `;
}

function wirePendingRows(){
  document.querySelectorAll('.ag-pending-table .ag-prow').forEach(tr => {
    tr.addEventListener('click', () => {
      const pid = tr.dataset.pid;
      if (!pid) return;
      agentState.subview = 'detail';
      agentState.detail = { playerId: pid, tab: 'wager' };
      render();
    });
  });
}

function aggregatePending(players){
  const out = [];
  players.forEach(p => {
    (p.wagers || []).forEach(w => {
      if (w.result === 'PENDING') {
        out.push({ ...w, playerId: p.id });
      }
    });
  });
  // Newest first
  out.sort((a, b) => new Date(b.placed) - new Date(a.placed));
  return out;
}

// ─── CUSTOMER DETAIL ────────────────────────────────────────────────────────

function renderDetail(root){
  const m = window.AGENT_MOCK;
  const p = m.players.find(x => x.id === agentState.detail.playerId);
  if (!p) {
    agentState.subview = 'management';
    return render();
  }
  const tab = agentState.detail.tab;
  const tabDef = DETAIL_TABS.find(t => t.key === tab) || DETAIL_TABS[0];

  root.innerHTML = `
    <div class="ag-shell">
      ${agentHeaderBar(m, p.id)}
      <div class="ag-cust-hdr">
        <div class="ag-cust-id">${escapeHtml(p.id)}</div>
        <div class="ag-cust-pills">
          ${custPill('Balance', fmtUSD(p.balance), p.balance < 0 ? 'neg' : p.balance > 0 ? 'pos' : '')}
          ${custPill('Password', p.pw)}
          ${custPill('Pending', p.pending)}
          ${custPill('Agent', m.id)}
          ${custPill('Freeplay', fmtUSD(p.freeplay || 0))}
          ${custPill('Website', p.website)}
        </div>
        <button class="ag-cust-save" disabled title="Read-only first pass">SAVE</button>
      </div>
      <div class="ag-cust-tabs">
        ${DETAIL_TABS.map(t => `
          <button class="ag-cust-tab ${t.key === tab ? 'active' : ''} ${t.real ? '' : 'stub'}" data-tab="${t.key}">
            <span class="ag-cust-tab-icon">${t.icon}</span>
            <span>${escapeHtml(t.label)}</span>
          </button>
        `).join('')}
      </div>
      <div class="ag-cust-body">
        <div class="ag-back-row">
          <button class="ag-back" data-back="management">← Back to Management</button>
        </div>
        ${renderDetailTab(p, tab, tabDef)}
      </div>
    </div>
  `;
  wireBack();
  wireDetailTabs();
}

function custPill(label, val, mod){
  return `<div class="ag-cust-pill"><div class="ag-cust-pill-lbl">${escapeHtml(label)}</div><div class="ag-cust-pill-val ${mod ? 'ag-' + mod : ''}">${escapeHtml(String(val))}</div></div>`;
}

function wireDetailTabs(){
  document.querySelectorAll('.ag-cust-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      agentState.detail.tab = btn.dataset.tab;
      render();
    });
  });
}

function renderDetailTab(p, tab, tabDef){
  if (tab === 'personal') return renderTabPersonal(p);
  if (tab === 'limits') return renderTabLimits(p);
  if (tab === 'wager') return renderTabWager(p);
  return renderTabStub(tabDef);
}

// ─── DETAIL: PERSONAL ───────────────────────────────────────────────────────

function renderTabPersonal(p){
  const fullName = (p.firstName + ' ' + p.lastName).trim();
  return `
    <div class="ag-personal">
      <div class="ag-personal-col">
        <div class="ag-sect-hdr">IDENTITY</div>
        ${fieldRow('Website', p.website)}
        ${fieldRow('Password', p.pw)}
        ${fieldRow('Agent', window.AGENT_MOCK.id)}
        ${fieldRow('Bettor Type', p.bettorType)}
        ${fieldRow('Reputation', p.reputation)}

        <div class="ag-sect-hdr">SETTINGS</div>
        ${fieldRow('Status', statusBadge(p.status))}
        ${fieldRow('Racebook', pillToggle(p.racebook, 'racing'))}
        ${fieldRow('Mailbox', pillToggle(p.mailbox, 'mailbox'))}
        ${fieldRow('Main Casino', pillToggle(p.mainCasino, 'casino'))}
      </div>
      <div class="ag-personal-col">
        <div class="ag-sect-hdr">DEMOGRAPHICS</div>
        ${fieldRow('Nickname', p.nickname || '—')}
        ${fieldRow('First Name', p.firstName)}
        ${fieldRow('Last Name', p.lastName)}
        ${fieldRow('Email', p.email)}
        ${fieldRow('Phone', p.phone)}
        ${fieldRow('Referred By', p.referredBy || '—')}
        ${fieldRow('Notes', p.notes || '—')}

        <div class="ag-sect-hdr">LOCATION</div>
        ${fieldRow('City', p.city)}
        ${fieldRow('State', p.state)}
      </div>
    </div>
  `;
}

function fieldRow(label, val){
  const html = (val && val.startsWith && val.startsWith('<')) ? val : escapeHtml(String(val ?? ''));
  return `
    <div class="ag-frow">
      <div class="ag-flabel">${escapeHtml(label)}</div>
      <div class="ag-fsep">:</div>
      <div class="ag-fval">${html}</div>
    </div>
  `;
}

function statusBadge(status){
  const ok = status === 'ACTIVE';
  return `<span class="ag-status ${ok ? 'ok' : 'bad'}">${escapeHtml(status)}</span>`;
}

// ─── DETAIL: LIMITS ─────────────────────────────────────────────────────────

function renderTabLimits(p){
  return `
    <div class="ag-limits">
      <div class="ag-lim-cards">
        <div class="ag-lim-card">
          <div class="ag-lim-hdr">CREDIT LIMIT</div>
          ${limRow('Credit Limit', fmtUSD(p.credit))}
          ${limRow('Temp Credit', fmtUSD(p.tempCredit || 0))}
          ${limRow('Player Settle Figure', p.settle > 0 ? fmtUSD(p.settle) : '—')}
        </div>
        <div class="ag-lim-card">
          <div class="ag-lim-hdr">OTHER LIMIT</div>
          ${limRow('Max Risk', p.maxRisk > 0 ? fmtUSD(p.maxRisk) : '—')}
          ${limRow('Inet Minimum', fmtUSD(p.inetMinimum))}
          ${limRow('Early Limits', 'VAR')}
        </div>
      </div>

      <div class="ag-lim-chart">
        <div class="ag-lim-chart-hdr">LIMITS CHART</div>
        <table class="ag-lim-table">
          <thead>
            <tr>
              <th>Setting</th>
              <th>Selection</th>
              <th class="num">Amount</th>
              <th class="num">Max Teams</th>
              <th class="num">X-Limit</th>
              <th class="num">Max Payout</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>DEFAULT</td><td>Wager Limit</td><td class="num">${fmtUSD(p.wager)}</td><td class="num">—</td><td class="num">—</td><td class="num">—</td></tr>
            <tr><td>${p.parlay > 0 ? 'Yes' : 'No'}</td><td>Parlays</td><td class="num">${fmtUSD(p.parlay)}</td><td class="num">4</td><td class="num">1</td><td class="num">${fmtUSD(4000)}</td></tr>
            <tr><td>${p.teaser > 0 ? 'Yes' : 'No'}</td><td>Teasers</td><td class="num">${fmtUSD(p.teaser)}</td><td class="num">4</td><td class="num">1</td><td class="num">${fmtUSD(4000)}</td></tr>
            <tr><td>No</td><td>If Bets</td><td class="num">${fmtUSD(p.wager)}</td><td class="num">—</td><td class="num">—</td><td class="num">—</td></tr>
            <tr><td>No</td><td>Reverse Action</td><td class="num">${fmtUSD(p.wager)}</td><td class="num">—</td><td class="num">—</td><td class="num">—</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function limRow(label, val){
  return `<div class="ag-frow ag-lim-row"><div class="ag-flabel">${escapeHtml(label)}</div><div class="ag-fsep">:</div><div class="ag-fval ag-mono-num">${escapeHtml(String(val))}</div></div>`;
}

// ─── DETAIL: WAGER ──────────────────────────────────────────────────────────

function renderTabWager(p){
  const wagers = p.wagers || [];
  return `
    <div class="ag-wager">
      <div class="ag-wfilters">
        <div class="ag-wf-lbl">FILTERS</div>
        <input type="text" placeholder="Ticket #" class="ag-wf-inp" aria-label="Ticket number">
        <div class="ag-wf-cell"><label>Wagers</label><select class="ag-wf-sel"><option>All</option><option>Pending Only</option><option>Settled</option></select></div>
        <div class="ag-wf-cell"><label>Placed</label><select class="ag-wf-sel"><option>--ALL--</option><option>Today</option><option>Yesterday</option><option>This Week</option></select></div>
        <div class="ag-wf-cell"><label>Amount</label><select class="ag-wf-sel"><option>--ALL--</option><option>&gt;$100</option><option>&gt;$500</option></select></div>
      </div>
      ${wagers.length === 0
        ? '<div class="ag-wager-empty">No Wagers</div>'
        : `<table class="ag-wager-table">
            <thead>
              <tr>
                <th>Ticket</th>
                <th>Sport</th>
                <th>Type</th>
                <th>Line</th>
                <th>Placed</th>
                <th class="num">Risk</th>
                <th class="num">To Win</th>
                <th>Result</th>
                <th class="num">Net</th>
              </tr>
            </thead>
            <tbody>
              ${wagers.map(w => `
                <tr>
                  <td class="ag-mono">${escapeHtml(w.ticket)}</td>
                  <td>${escapeHtml(w.sport)}</td>
                  <td>${escapeHtml(w.type)}</td>
                  <td class="ag-mono">${escapeHtml(w.line)}</td>
                  <td class="ag-mono">${fmtDate(w.placed)}</td>
                  <td class="num">${fmtUSD(w.risk)}</td>
                  <td class="num">${fmtUSD(w.toWin)}</td>
                  <td><span class="ag-wres ag-wres-${w.result.toLowerCase()}">${escapeHtml(w.result)}</span></td>
                  <td class="num ${w.net < 0 ? 'ag-neg' : w.net > 0 ? 'ag-pos' : ''}">${fmtUSD(w.net)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>`
      }
    </div>
  `;
}

// ─── DETAIL: STUB ───────────────────────────────────────────────────────────

function renderTabStub(tabDef){
  return `
    <div class="ag-stub">
      <div class="ag-stub-icon">${tabDef ? tabDef.icon : '🏗'}</div>
      <div class="ag-stub-title">${escapeHtml(tabDef ? tabDef.label : 'Not implemented')}</div>
      <div class="ag-stub-msg">Stub for first pass. See AGENT_RECON.md for the LC797 recon on this tab.</div>
    </div>
  `;
}

// ─── PLACEHOLDER (tile-level stubs) ─────────────────────────────────────────

function renderPlaceholder(root){
  const m = window.AGENT_MOCK;
  root.innerHTML = `
    <div class="ag-shell">
      ${agentHeaderBar(m, agentState.placeholderLabel)}
      <div class="ag-subhdr">
        <button class="ag-back" data-back="dashboard">← Back</button>
        <div class="ag-crumb-sub">${escapeHtml(agentState.placeholderLabel)}</div>
      </div>
      <div class="ag-stub">
        <div class="ag-stub-icon">🏗</div>
        <div class="ag-stub-title">${escapeHtml(agentState.placeholderLabel)}</div>
        <div class="ag-stub-msg">Not implemented in this first pass. See AGENT_RECON.md for the recon notes.</div>
      </div>
    </div>
  `;
  wireBack();
}

function wireBack(){
  document.querySelectorAll('.ag-back').forEach(b => {
    b.addEventListener('click', () => {
      agentState.subview = b.dataset.back || 'dashboard';
      render();
    });
  });
}

// ─── helpers ────────────────────────────────────────────────────────────────

function fmtDate(d){
  if (!d) return null;
  const dt = new Date(d);
  if (isNaN(dt)) return escapeHtml(String(d));
  const mm = String(dt.getMonth()+1).padStart(2,'0');
  const dd = String(dt.getDate()).padStart(2,'0');
  if (String(d).length <= 10) return `${mm}/${dd}`;
  const hh = String(dt.getHours()).padStart(2,'0');
  const mi = String(dt.getMinutes()).padStart(2,'0');
  return `${mm}/${dd} ${hh}:${mi}`;
}
