// ════════════════════════════════════════════════════════════════════════════
//  agent.js — Agent (bookie-side) portal view
//  ────────────────────────────────────────────────────────────────────────────
//  Routed sub-views:
//    'dashboard'    — KPI strip + tile grid + recent-activity widgets
//    'management'   — players table (50 rows)
//    'detail'       — single player, 11-tab editor (3 real + 8 stubs)
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
