(() => {
  // src/utils.js
  var fmtUSD = (n) => "$" + Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  var _escDiv = document.createElement("div");
  var escapeHtml = (s) => {
    _escDiv.textContent = s == null ? "" : String(s);
    return _escDiv.innerHTML;
  };

  // src/agent.js
  var agentState = {
    active: false,
    subview: "dashboard",
    placeholderLabel: "",
    detail: { playerId: null, tab: "personal" },
    weekly: {
      cols: { firstName: true, lastName: true, carry: false, pending: true, payments: false, balance: true },
      agentInfo: "Balance",
      activity: "This Week",
      settingsOpen: false
    },
    mailbox: {
      tab: "ai",
      messages: [],
      emailSent: false
    }
  };
  var DETAIL_TABS = [
    { key: "personal", label: "Personal", icon: "\u{1F464}", real: true },
    { key: "limits", label: "Limits", icon: "\u23F1", real: true },
    { key: "lineset", label: "Lineset", icon: "\u270E", real: false },
    { key: "transactions", label: "Transactions", icon: "\u21C4", real: false },
    { key: "wager", label: "Wager", icon: "\u{1F3AB}", real: true },
    { key: "history", label: "History", icon: "\u231B", real: false },
    { key: "communications", label: "Communications", icon: "\u2709", real: false },
    { key: "changes", label: "Changes", icon: "\u27F3", real: false },
    { key: "connections", label: "Connections", icon: "\u2935", real: false },
    { key: "casino", label: "Casino", icon: "\u{1F3B0}", real: false },
    { key: "backbone", label: "Backbone", icon: "\u2699", real: false }
  ];
  function initAgent() {
    if (!window.AGENT_MOCK) {
      console.warn("[agent] AGENT_MOCK fixture missing \u2014 using empty data");
      window.AGENT_MOCK = { id: "\u2014", balance: 0, kpi: { active: 0, yesterday: 0, today: 0, weekly: 0 }, players: [], recent: { wagers: [], logins: [], changes: [] } };
    }
    agentState.active = true;
    render();
  }
  function render() {
    const root = document.getElementById("agent-view");
    if (!root) return;
    if (agentState.subview === "management") return renderManagement(root);
    if (agentState.subview === "detail") return renderDetail(root);
    if (agentState.subview === "weekly") return renderWeekly(root);
    if (agentState.subview === "pending") return renderPending(root);
    if (agentState.subview === "ticker") return renderTicker(root);
    if (agentState.subview === "tx") return renderTx(root);
    if (agentState.subview === "position") return renderPosition(root);
    if (agentState.subview === "ipcheck") return renderIpcheck(root);
    if (agentState.subview === "mailbox") return renderMailbox(root);
    if (agentState.subview === "placeholder") return renderPlaceholder(root);
    return renderDashboard(root);
  }
  function renderDashboard(root) {
    const m = window.AGENT_MOCK;
    const kpi = m.kpi;
    root.innerHTML = `
    <div class="ag-shell">
      ${agentHeaderBar(m, "Dashboard")}
      <div class="ag-body">
        <div class="ag-main">
          <div class="ag-search">
            <input type="text" placeholder="Search account..." class="ag-search-inp" aria-label="Search account">
            <button class="ag-addnew">+ ADD NEW</button>
          </div>
          <div class="ag-kpi">
            ${kpiCell("Active", kpi.active)}
            ${kpiCell("Yesterday", fmtUSD(kpi.yesterday))}
            ${kpiCell("Today", fmtUSD(kpi.today))}
            ${kpiCell("Weekly", fmtUSD(kpi.weekly))}
          </div>
          <div class="ag-cs">CONTACT CUSTOMER SERVICE</div>
          <div class="ag-grid">
            ${tile("weekly", "\u{1F4CA}", "Weekly Figures", "tile-blue")}
            ${tile("pending", "\u{1F3AB}", "Pending", "tile-purple")}
            ${tile("cashier", "\u21C4$", "Cashier", "tile-amber")}
            ${tile("add", "\u{1F464}+", "Add New", "tile-red")}
            ${tile("mgmt", "\u26DB", "Management", "tile-green")}
            ${tile("mass", "\u270E\u2261", "Mass Edit", "tile-teal")}
            ${tile("position", "\u2696", "Position", "tile-navy")}
            ${tile("ticker", "\u{1F39F}", "Bet Ticker", "tile-teal")}
            ${tile("ip", "\u{1F310}", "IP Checker", "tile-red")}
            ${tile("tx", "\u{1F4B0}", "Transactions", "tile-orange")}
            ${tile("mail", "\u2709", "Mailbox", "tile-orange")}
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
  function agentHeaderBar(m, crumb) {
    return `
    <div class="ag-topbar">
      <div class="ag-id">${escapeHtml(m.id)}</div>
      <div class="ag-bal">BALANCE &gt; <span class="ag-bal-val">${fmtUSD(m.balance)}</span></div>
      <div class="ag-crumb" id="ag-crumb">${escapeHtml(crumb || "Dashboard")}</div>
      <button class="ag-logout" onclick="logoutAgent()">\u238B Logout</button>
    </div>
  `;
  }
  function kpiCell(label, val) {
    return `<div class="ag-kpi-cell"><label>${escapeHtml(label)}</label><div class="ag-kpi-val">${escapeHtml(String(val))}</div></div>`;
  }
  function tile(slug, icon, label, klass) {
    return `<button class="ag-tile ${klass}" data-tile="${slug}"><span class="ag-tile-icon">${icon}</span><span class="ag-tile-label">${escapeHtml(label)}</span></button>`;
  }
  function widgetWagers(rows) {
    const body = rows.length ? rows.map((r) => `<div class="ag-wrow"><span>${escapeHtml(r.id)}</span><span class="ag-wmono">${escapeHtml(r.pw)}</span><span class="ag-wamt">${fmtUSD(r.amount)}</span><span class="ag-wdate">${fmtDate(r.when)}</span></div>`).join("") : '<div class="ag-empty">No recent wagers</div>';
    return `<details class="ag-widget" open><summary>RECENT WAGERS</summary>${body}</details>`;
  }
  function widgetLogins(rows) {
    const body = rows.length ? rows.map((r) => `<div class="ag-wrow"><span>${escapeHtml(r.id)}</span><span class="ag-wmono">${escapeHtml(r.pw)}</span><span class="ag-wdate">${fmtDate(r.when)}</span></div>`).join("") : '<div class="ag-empty">No recent logins</div>';
    return `<details class="ag-widget"><summary>LATEST LOGINS</summary>${body}</details>`;
  }
  function widgetChanges(rows) {
    const body = rows.length ? rows.map((r) => `<div class="ag-wrow"><span class="ag-wmono">${escapeHtml(r.who)}</span><span>${escapeHtml(r.what)}</span><span>${escapeHtml(r.target)}</span><span class="ag-wdate">${fmtDate(r.when)}</span></div>`).join("") : '<div class="ag-empty">No recent changes</div>';
    return `<details class="ag-widget"><summary>RECENT CHANGES</summary>${body}</details>`;
  }
  function wireTiles() {
    document.querySelectorAll(".ag-tile").forEach((btn) => {
      btn.addEventListener("click", () => {
        const slug = btn.dataset.tile;
        if (slug === "mgmt") {
          agentState.subview = "management";
        } else if (slug === "weekly") {
          agentState.subview = "weekly";
        } else if (slug === "pending") {
          agentState.subview = "pending";
        } else if (slug === "ticker") {
          agentState.subview = "ticker";
        } else if (slug === "tx") {
          agentState.subview = "tx";
        } else if (slug === "position") {
          agentState.subview = "position";
        } else if (slug === "ip") {
          agentState.subview = "ipcheck";
        } else if (slug === "mail") {
          agentState.subview = "mailbox";
        } else {
          agentState.subview = "placeholder";
          agentState.placeholderLabel = btn.querySelector(".ag-tile-label").textContent;
        }
        render();
      });
    });
  }
  function renderManagement(root) {
    const m = window.AGENT_MOCK;
    root.innerHTML = `
    <div class="ag-shell">
      ${agentHeaderBar(m, "Management")}
      <div class="ag-subhdr">
        <button class="ag-back" data-back="dashboard">\u2190 Back</button>
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
            ${m.players.map(playerRow).join("")}
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
  function playerRow(p) {
    return `
    <tr data-pid="${escapeHtml(p.id)}" class="ag-prow">
      <td class="ag-pid"><span class="ag-link">${escapeHtml(p.id)}</span> <span class="ag-mono">(${escapeHtml(p.pw)})</span></td>
      <td class="num"><span class="ag-link">${p.credit}</span></td>
      <td class="num"><span class="ag-link">${p.wager}</span></td>
      <td class="num"><span class="ag-link">${p.parlay}</span></td>
      <td class="num"><span class="ag-link">${p.teaser}</span></td>
      <td>${pillToggle(p.casino, "casino")}</td>
      <td>${pillToggle(p.racing, "racing")}</td>
      <td class="num"><span class="ag-link">${p.settle ? fmtUSD(p.settle) : 0}</span></td>
      <td>${fmtDate(p.lastWager) || '<span class="ag-dim">None</span>'}</td>
      <td>${fmtDate(p.lastLogin) || '<span class="ag-dim">None</span>'}</td>
      <td class="num">${p.pending}</td>
      <td class="num ${p.balance < 0 ? "ag-neg" : p.balance > 0 ? "ag-pos" : ""}"><span class="ag-link">${fmtUSD(p.balance)}</span></td>
    </tr>
  `;
  }
  function pillToggle(on, kind) {
    return `<span class="ag-pill ${on ? "on" : "off"} ag-pill-${kind}">${on ? "Yes" : "No"}</span>`;
  }
  function wirePlayerRows() {
    document.querySelectorAll(".ag-prow").forEach((tr) => {
      tr.addEventListener("click", () => {
        const pid = tr.dataset.pid;
        if (!pid) return;
        agentState.subview = "detail";
        agentState.detail = { playerId: pid, tab: "personal" };
        render();
      });
    });
  }
  function renderWeekly(root) {
    const m = window.AGENT_MOCK;
    const w = agentState.weekly;
    const rows = aggregateWeekly(m.players, w.activity);
    const totals = sumWeekly(rows);
    const colHdr = (key, label, alwaysOn) => alwaysOn || w.cols[key] ? `<th class="num">${escapeHtml(label)}</th>` : "";
    root.innerHTML = `
    <div class="ag-shell">
      ${agentHeaderBar(m, "Weekly Figures")}
      <div class="ag-subhdr">
        <button class="ag-back" data-back="dashboard">\u2190 Back</button>
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
              ${w.cols.firstName ? "<th>First Name</th>" : ""}
              ${w.cols.lastName ? "<th>Last Name</th>" : ""}
              <th class="num">${escapeHtml(w.activity)}</th>
              ${colHdr("carry", "Carry/Zero")}
              ${colHdr("pending", "Pending")}
              ${colHdr("payments", "Payments")}
              ${colHdr("balance", "Balance")}
            </tr>
          </thead>
          <tbody>
            ${rows.map((r) => weeklyRow(r, w.cols)).join("")}
          </tbody>
          <tfoot>
            <tr>
              <th>TOTAL (${rows.length})</th>
              ${w.cols.firstName ? "<td></td>" : ""}
              ${w.cols.lastName ? "<td></td>" : ""}
              <th class="num ${signClass(totals.activity)}">${fmtUSD(totals.activity)}</th>
              ${w.cols.carry ? `<th class="num ${signClass(totals.carry)}">${fmtUSD(totals.carry)}</th>` : ""}
              ${w.cols.pending ? `<th class="num">${fmtUSD(totals.pending)}</th>` : ""}
              ${w.cols.payments ? `<th class="num">${fmtUSD(totals.payments)}</th>` : ""}
              ${w.cols.balance ? `<th class="num ${signClass(totals.balance)}">${fmtUSD(totals.balance)}</th>` : ""}
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
  function weeklyRow(r, cols) {
    return `
    <tr data-pid="${escapeHtml(r.id)}" class="ag-prow">
      <td class="ag-pid"><span class="ag-link">${escapeHtml(r.id)}</span> <span class="ag-mono">(${escapeHtml(r.pw)})</span></td>
      ${cols.firstName ? `<td>${escapeHtml(r.firstName)}</td>` : ""}
      ${cols.lastName ? `<td>${escapeHtml(r.lastName)}</td>` : ""}
      <td class="num ${signClass(r.activity)}">${fmtUSD(r.activity)}</td>
      ${cols.carry ? `<td class="num ${signClass(r.carry)}">${fmtUSD(r.carry)}</td>` : ""}
      ${cols.pending ? `<td class="num">${fmtUSD(r.pending)}</td>` : ""}
      ${cols.payments ? `<td class="num">${fmtUSD(r.payments)}</td>` : ""}
      ${cols.balance ? `<td class="num ${signClass(r.balance)}">${fmtUSD(r.balance)}</td>` : ""}
    </tr>
  `;
  }
  function weeklySettingsModal(w) {
    return `
    <div class="pmoverlay ${w.settingsOpen ? "open" : ""}" id="ag-wk-overlay">
      <div class="pmodal">
        <div class="pmh">
          <span>WEEKLY &gt; SETTINGS</span>
          <button class="pmclose" data-wk-close>\u2715</button>
        </div>
        <div class="pmbody">
          <button class="ag-wk-info-btn">READ HOW THIS REPORT HAS CHANGED</button>
          <div class="ag-wk-row">
            <label class="ag-wk-lbl">COLUMNS</label>
            <div class="ag-wk-cols">
              ${colCheckbox("firstName", "First Name", w.cols.firstName)}
              ${colCheckbox("lastName", "Last Name", w.cols.lastName)}
              ${colCheckbox("carry", "Carry/Zero", w.cols.carry)}
              ${colCheckbox("pending", "Pending", w.cols.pending)}
              ${colCheckbox("payments", "Payments", w.cols.payments)}
              ${colCheckbox("balance", "Balance", w.cols.balance)}
            </div>
          </div>
          <div class="ag-wk-row">
            <label class="ag-wk-lbl" for="ag-wk-info">AGENT INFO</label>
            <select id="ag-wk-info" class="ag-wk-sel">
              ${optSel("Balance", w.agentInfo)}
              ${optSel("Credit", w.agentInfo)}
              ${optSel("Available", w.agentInfo)}
            </select>
          </div>
          <div class="ag-wk-row">
            <label class="ag-wk-lbl" for="ag-wk-act">ACTIVITY</label>
            <select id="ag-wk-act" class="ag-wk-sel">
              ${optSel("This Week", w.activity)}
              ${optSel("Last 3 Weeks", w.activity)}
              ${optSel("Last 300 Days", w.activity)}
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
  function colCheckbox(key, label, on) {
    return `<label class="ag-wk-cb"><input type="checkbox" data-wk-col="${key}" ${on ? "checked" : ""}>${escapeHtml(label)}</label>`;
  }
  function optSel(val, cur) {
    return `<option ${val === cur ? "selected" : ""}>${escapeHtml(val)}</option>`;
  }
  function wireWeekly() {
    const openBtn = document.getElementById("ag-wk-settings-btn");
    if (openBtn) openBtn.addEventListener("click", () => {
      agentState.weekly.settingsOpen = true;
      render();
    });
    document.querySelectorAll("[data-wk-close]").forEach((b) => {
      b.addEventListener("click", () => {
        agentState.weekly.settingsOpen = false;
        render();
      });
    });
    const saveBtn = document.querySelector("[data-wk-save]");
    if (saveBtn) saveBtn.addEventListener("click", () => {
      document.querySelectorAll("[data-wk-col]").forEach((cb) => {
        const key = cb.dataset.wkCol;
        agentState.weekly.cols[key] = cb.checked;
      });
      const info = document.getElementById("ag-wk-info");
      const act = document.getElementById("ag-wk-act");
      if (info) agentState.weekly.agentInfo = info.value;
      if (act) agentState.weekly.activity = act.value;
      agentState.weekly.settingsOpen = false;
      render();
    });
    document.querySelectorAll(".ag-weekly-table .ag-prow").forEach((tr) => {
      tr.addEventListener("click", () => {
        const pid = tr.dataset.pid;
        if (!pid) return;
        agentState.subview = "detail";
        agentState.detail = { playerId: pid, tab: "personal" };
        render();
      });
    });
  }
  function aggregateWeekly(players, activity) {
    const days = activity === "Last 3 Weeks" ? 21 : activity === "Last 300 Days" ? 300 : 7;
    const cutoff = Date.now() - days * 864e5;
    return players.map((p) => {
      let activitySum = 0, pendingSum = 0;
      (p.wagers || []).forEach((w) => {
        const t = new Date(w.placed).getTime();
        if (w.result === "PENDING") {
          pendingSum += w.risk;
        } else if (t >= cutoff) {
          activitySum += -w.net;
        }
      });
      const carry = Math.round(p.balance * 0.25 * 100) / 100;
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
        balance: p.balance
      };
    });
  }
  function sumWeekly(rows) {
    return rows.reduce((acc, r) => ({
      activity: +(acc.activity + r.activity).toFixed(2),
      carry: +(acc.carry + r.carry).toFixed(2),
      pending: +(acc.pending + r.pending).toFixed(2),
      payments: +(acc.payments + r.payments).toFixed(2),
      balance: +(acc.balance + r.balance).toFixed(2)
    }), { activity: 0, carry: 0, pending: 0, payments: 0, balance: 0 });
  }
  function signClass(v) {
    return v < 0 ? "ag-neg" : v > 0 ? "ag-pos" : "";
  }
  function renderPending(root) {
    const m = window.AGENT_MOCK;
    const rows = aggregatePending(m.players);
    const totalRisk = rows.reduce((s, r) => s + r.risk, 0);
    const totalWin = rows.reduce((s, r) => s + r.toWin, 0);
    root.innerHTML = `
    <div class="ag-shell">
      ${agentHeaderBar(m, "Pending Wagers")}
      <div class="ag-subhdr">
        <button class="ag-back" data-back="dashboard">\u2190 Back</button>
        <div class="ag-crumb-sub">Wagers &gt; <b>Pending Wagers</b></div>
        <div class="ag-subhdr-actions">
          <button class="ag-action">EXPORT</button>
          <button class="ag-action">PRINT</button>
        </div>
      </div>
      <div class="ag-wfilters">
        <div class="ag-wf-lbl">FILTERS</div>
        <input type="text" placeholder="Ticket #" class="ag-wf-inp" aria-label="Ticket number">
        <div class="ag-wf-cell"><label for="ag-pf-cust">Customer</label><select id="ag-pf-cust" class="ag-wf-sel"><option>--ALL--</option>${m.players.map((p) => `<option>${escapeHtml(p.id)}</option>`).join("")}</select></div>
        <div class="ag-wf-cell"><label for="ag-pf-sport">Sport</label><select id="ag-pf-sport" class="ag-wf-sel"><option>--ALL--</option><option>NBA</option><option>MLB</option><option>NHL</option><option>NFL</option></select></div>
        <div class="ag-wf-cell"><label for="ag-pf-amt">Amount</label><select id="ag-pf-amt" class="ag-wf-sel"><option>--ALL--</option><option>&gt;$100</option><option>&gt;$500</option></select></div>
      </div>
      ${rows.length === 0 ? '<div class="ag-wager-empty">No Pending Wagers</div>' : `<div class="ag-table-wrap">
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
                ${rows.map(pendingRow).join("")}
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
          </div>`}
    </div>
  `;
    wireBack();
    wirePendingRows();
  }
  function pendingRow(r) {
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
  function wirePendingRows() {
    document.querySelectorAll(".ag-pending-table .ag-prow").forEach((tr) => {
      tr.addEventListener("click", () => {
        const pid = tr.dataset.pid;
        if (!pid) return;
        agentState.subview = "detail";
        agentState.detail = { playerId: pid, tab: "wager" };
        render();
      });
    });
  }
  function aggregatePending(players) {
    const out = [];
    players.forEach((p) => {
      (p.wagers || []).forEach((w) => {
        if (w.result === "PENDING") {
          out.push({ ...w, playerId: p.id });
        }
      });
    });
    out.sort((a, b) => new Date(b.placed) - new Date(a.placed));
    return out;
  }
  function renderTicker(root) {
    const m = window.AGENT_MOCK;
    const rows = aggregateTicker(m.players);
    const totalRisk = rows.reduce((s, r) => s + r.risk, 0);
    const totalWin = rows.reduce((s, r) => s + r.toWin, 0);
    const totalNet = rows.reduce((s, r) => s + (r.net || 0), 0);
    root.innerHTML = `
    <div class="ag-shell">
      ${agentHeaderBar(m, "Bet Ticker")}
      <div class="ag-subhdr">
        <button class="ag-back" data-back="dashboard">\u2190 Back</button>
        <div class="ag-crumb-sub">Wagers &gt; <b>Bet Ticker</b></div>
        <div class="ag-subhdr-actions">
          <button class="ag-action">EXPORT</button>
          <button class="ag-action">PRINT</button>
        </div>
      </div>
      <div class="ag-wfilters">
        <div class="ag-wf-lbl">FILTERS</div>
        <input type="text" placeholder="Ticket #" class="ag-wf-inp" aria-label="Ticket number">
        <div class="ag-wf-cell"><label for="ag-tf-cust">Customer</label><select id="ag-tf-cust" class="ag-wf-sel"><option>--ALL--</option>${m.players.map((p) => `<option>${escapeHtml(p.id)}</option>`).join("")}</select></div>
        <div class="ag-wf-cell"><label for="ag-tf-sport">Sport</label><select id="ag-tf-sport" class="ag-wf-sel"><option>--ALL--</option><option>NBA</option><option>MLB</option><option>NHL</option><option>NFL</option></select></div>
        <div class="ag-wf-cell"><label for="ag-tf-res">Result</label><select id="ag-tf-res" class="ag-wf-sel"><option>--ALL--</option><option>PENDING</option><option>WIN</option><option>LOSS</option></select></div>
      </div>
      ${rows.length === 0 ? '<div class="ag-wager-empty">No Wagers</div>' : `<div class="ag-table-wrap">
            <table class="ag-table ag-ticker-table">
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
                  <th>Result</th>
                  <th class="num">Net</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map(tickerRow).join("")}
              </tbody>
              <tfoot>
                <tr>
                  <th>TOTAL (${rows.length})</th>
                  <td colspan="5"></td>
                  <th class="num">${fmtUSD(totalRisk)}</th>
                  <th class="num">${fmtUSD(totalWin)}</th>
                  <td></td>
                  <th class="num ${totalNet > 0 ? "ag-pos" : totalNet < 0 ? "ag-neg" : ""}">${fmtUSD(totalNet)}</th>
                </tr>
              </tfoot>
            </table>
          </div>`}
    </div>
  `;
    wireBack();
    wireTickerRows();
  }
  function tickerRow(r) {
    const net = r.net || 0;
    const netClass = net > 0 ? "ag-pos" : net < 0 ? "ag-neg" : "";
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
      <td><span class="ag-wres ag-wres-${r.result.toLowerCase()}">${escapeHtml(r.result)}</span></td>
      <td class="num ${netClass}">${fmtUSD(net)}</td>
    </tr>
  `;
  }
  function wireTickerRows() {
    document.querySelectorAll(".ag-ticker-table .ag-prow").forEach((tr) => {
      tr.addEventListener("click", () => {
        const pid = tr.dataset.pid;
        if (!pid) return;
        agentState.subview = "detail";
        agentState.detail = { playerId: pid, tab: "wager" };
        render();
      });
    });
  }
  function aggregateTicker(players) {
    const out = [];
    players.forEach((p) => {
      (p.wagers || []).forEach((w) => {
        out.push({ ...w, playerId: p.id });
      });
    });
    out.sort((a, b) => new Date(b.placed) - new Date(a.placed));
    return out;
  }
  function renderTx(root) {
    const m = window.AGENT_MOCK;
    const rows = aggregateTx(m.players);
    const totalAmt = rows.reduce((s, r) => s + r.amount, 0);
    const totalCr = rows.reduce((s, r) => r.amount > 0 ? s + r.amount : s, 0);
    const totalDr = rows.reduce((s, r) => r.amount < 0 ? s + r.amount : s, 0);
    root.innerHTML = `
    <div class="ag-shell">
      ${agentHeaderBar(m, "Transactions")}
      <div class="ag-subhdr">
        <button class="ag-back" data-back="dashboard">\u2190 Back</button>
        <div class="ag-crumb-sub">Wagers &gt; <b>Transactions</b></div>
        <div class="ag-subhdr-actions">
          <button class="ag-action">EXPORT</button>
          <button class="ag-action">PRINT</button>
        </div>
      </div>
      <div class="ag-wfilters">
        <div class="ag-wf-lbl">FILTERS</div>
        <div class="ag-wf-cell"><label for="ag-xf-cust">Customer</label><select id="ag-xf-cust" class="ag-wf-sel"><option>--ALL--</option>${m.players.map((p) => `<option>${escapeHtml(p.id)}</option>`).join("")}</select></div>
        <div class="ag-wf-cell"><label for="ag-xf-type">Type</label><select id="ag-xf-type" class="ag-wf-sel"><option>--ALL--</option><option>BET PLACED</option><option>BET SETTLED</option><option>FREEPLAY</option><option>SETTLEMENT</option></select></div>
        <div class="ag-wf-cell"><label for="ag-xf-dir">Direction</label><select id="ag-xf-dir" class="ag-wf-sel"><option>--ALL--</option><option>Credit</option><option>Debit</option></select></div>
        <div class="ag-wf-cell"><label for="ag-xf-amt">Amount</label><select id="ag-xf-amt" class="ag-wf-sel"><option>--ALL--</option><option>&gt;$100</option><option>&gt;$500</option></select></div>
      </div>
      ${rows.length === 0 ? '<div class="ag-wager-empty">No Transactions</div>' : `<div class="ag-table-wrap">
            <table class="ag-table ag-tx-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Type</th>
                  <th>Note</th>
                  <th class="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map(txRow).join("")}
              </tbody>
              <tfoot>
                <tr>
                  <th>TOTAL (${rows.length})</th>
                  <td colspan="2"></td>
                  <td class="num"><span class="ag-pos">${fmtUSD(totalCr)}</span> / <span class="ag-neg">${fmtUSD(totalDr)}</span></td>
                  <th class="num ${totalAmt > 0 ? "ag-pos" : totalAmt < 0 ? "ag-neg" : ""}">${fmtUSD(totalAmt)}</th>
                </tr>
              </tfoot>
            </table>
          </div>`}
    </div>
  `;
    wireBack();
    wireTxRows();
  }
  function txRow(r) {
    const amt = r.amount;
    const amtClass = amt > 0 ? "ag-pos" : amt < 0 ? "ag-neg" : "";
    const typeSlug = r.type.toLowerCase().replace(/\s+/g, "-");
    return `
    <tr data-pid="${escapeHtml(r.playerId)}" class="ag-prow">
      <td class="ag-mono">${fmtDate(r.date)}</td>
      <td><span class="ag-link">${escapeHtml(r.playerId)}</span></td>
      <td><span class="ag-tx-type ag-tx-${typeSlug}">${escapeHtml(r.type)}</span></td>
      <td>${escapeHtml(r.note)}</td>
      <td class="num ${amtClass}">${fmtUSD(amt)}</td>
    </tr>
  `;
  }
  function wireTxRows() {
    document.querySelectorAll(".ag-tx-table .ag-prow").forEach((tr) => {
      tr.addEventListener("click", () => {
        const pid = tr.dataset.pid;
        if (!pid) return;
        agentState.subview = "detail";
        agentState.detail = { playerId: pid, tab: "transactions" };
        render();
      });
    });
  }
  function aggregateTx(players) {
    const out = [];
    players.forEach((p) => {
      (p.wagers || []).forEach((w) => {
        if (w.result === "PENDING") {
          out.push({
            playerId: p.id,
            date: w.placed,
            type: "BET PLACED",
            note: `${w.sport} ${w.type} ${w.line} \xB7 ${w.ticket}`,
            amount: -Math.abs(w.risk)
          });
        } else {
          out.push({
            playerId: p.id,
            date: w.placed,
            type: "BET SETTLED",
            note: `${w.sport} ${w.type} ${w.line} \xB7 ${w.ticket} \xB7 ${w.result}`,
            amount: w.net || 0
          });
        }
      });
      if (p.freeplay && p.freeplay > 0) {
        out.push({
          playerId: p.id,
          date: p.lastLogin || p.lastWager || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
          type: "FREEPLAY",
          note: "Freeplay credit granted",
          amount: +p.freeplay
        });
      }
      if (p.settle && p.settle > 0) {
        out.push({
          playerId: p.id,
          date: p.lastWager || p.lastLogin || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
          type: "SETTLEMENT",
          note: "Settlement debit",
          amount: -p.settle
        });
      }
    });
    out.sort((a, b) => new Date(b.date) - new Date(a.date));
    return out;
  }
  function renderPosition(root) {
    const m = window.AGENT_MOCK;
    const rows = aggregatePosition(m.players);
    const totRisk = rows.reduce((s, r) => s + r.risk, 0);
    const totWin = rows.reduce((s, r) => s + r.toWin, 0);
    const totTickets = rows.reduce((s, r) => s + r.tickets, 0);
    root.innerHTML = `
    <div class="ag-shell">
      ${agentHeaderBar(m, "Position")}
      <div class="ag-subhdr">
        <button class="ag-back" data-back="dashboard">\u2190 Back</button>
        <div class="ag-crumb-sub">Wagers &gt; <b>Position</b></div>
        <div class="ag-subhdr-actions">
          <button class="ag-action">EXPORT</button>
          <button class="ag-action">PRINT</button>
        </div>
      </div>
      <div class="ag-wfilters">
        <div class="ag-wf-lbl">FILTERS</div>
        <div class="ag-wf-cell"><label for="ag-posf-grp">Group By</label><select id="ag-posf-grp" class="ag-wf-sel"><option>Sport</option><option>Type</option><option>Customer</option></select></div>
        <div class="ag-wf-cell"><label for="ag-posf-min">Min Liability</label><select id="ag-posf-min" class="ag-wf-sel"><option>--ALL--</option><option>&gt;$100</option><option>&gt;$500</option></select></div>
      </div>
      ${rows.length === 0 ? '<div class="ag-wager-empty">No Open Position</div>' : `<div class="ag-table-wrap">
            <table class="ag-table ag-position-table">
              <thead>
                <tr>
                  <th>Sport</th>
                  <th class="num">Tickets</th>
                  <th class="num">Risk Held</th>
                  <th class="num">To Win</th>
                  <th class="num">Worst Case</th>
                  <th class="num">Best Case</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map(positionRow).join("")}
              </tbody>
              <tfoot>
                <tr>
                  <th>TOTAL (${rows.length})</th>
                  <th class="num">${totTickets}</th>
                  <th class="num">${fmtUSD(totRisk)}</th>
                  <th class="num">${fmtUSD(totWin)}</th>
                  <th class="num ag-neg">${fmtUSD(-totWin)}</th>
                  <th class="num ag-pos">${fmtUSD(totRisk)}</th>
                </tr>
              </tfoot>
            </table>
          </div>`}
    </div>
  `;
    wireBack();
    wirePositionRows();
  }
  function positionRow(r) {
    return `
    <tr data-sport="${escapeHtml(r.sport)}" class="ag-prow">
      <td><b>${escapeHtml(r.sport)}</b></td>
      <td class="num">${r.tickets}</td>
      <td class="num">${fmtUSD(r.risk)}</td>
      <td class="num">${fmtUSD(r.toWin)}</td>
      <td class="num ag-neg">${fmtUSD(-r.toWin)}</td>
      <td class="num ag-pos">${fmtUSD(r.risk)}</td>
    </tr>
  `;
  }
  function wirePositionRows() {
    document.querySelectorAll(".ag-position-table .ag-prow").forEach((tr) => {
      tr.addEventListener("click", () => {
        agentState.subview = "pending";
        render();
      });
    });
  }
  function aggregatePosition(players) {
    const groups = /* @__PURE__ */ new Map();
    players.forEach((p) => {
      (p.wagers || []).forEach((w) => {
        if (w.result !== "PENDING") return;
        const g = groups.get(w.sport) || { sport: w.sport, tickets: 0, risk: 0, toWin: 0 };
        g.tickets += 1;
        g.risk += w.risk;
        g.toWin += w.toWin;
        groups.set(w.sport, g);
      });
    });
    return Array.from(groups.values()).sort((a, b) => b.risk - a.risk);
  }
  var IPCHECK_DEVICES = ["Desktop", "iPhone", "Android", "Mac", "iPad"];
  var IPCHECK_BROWSERS = ["Chrome", "Safari", "Firefox", "Edge"];
  function renderIpcheck(root) {
    const m = window.AGENT_MOCK;
    const rows = aggregateIpcheck(m.players);
    const sus = rows.filter((r) => r.status === "SUSPENDED").length;
    root.innerHTML = `
    <div class="ag-shell">
      ${agentHeaderBar(m, "IP Checker")}
      <div class="ag-subhdr">
        <button class="ag-back" data-back="dashboard">\u2190 Back</button>
        <div class="ag-crumb-sub">Accounts &gt; <b>IP Checker</b></div>
        <div class="ag-subhdr-actions">
          <button class="ag-action">EXPORT</button>
          <button class="ag-action">PRINT</button>
        </div>
      </div>
      <div class="ag-wfilters">
        <div class="ag-wf-lbl">FILTERS</div>
        <div class="ag-wf-cell"><label for="ag-ipf-cust">Customer</label><select id="ag-ipf-cust" class="ag-wf-sel"><option>--ALL--</option>${m.players.map((p) => `<option>${escapeHtml(p.id)}</option>`).join("")}</select></div>
        <div class="ag-wf-cell"><label for="ag-ipf-dev">Device</label><select id="ag-ipf-dev" class="ag-wf-sel"><option>--ALL--</option>${IPCHECK_DEVICES.map((d) => `<option>${d}</option>`).join("")}</select></div>
        <div class="ag-wf-cell"><label for="ag-ipf-status">Status</label><select id="ag-ipf-status" class="ag-wf-sel"><option>--ALL--</option><option>ACTIVE</option><option>SUSPENDED</option></select></div>
        <div class="ag-wf-cell"><label for="ag-ipf-days">Window</label><select id="ag-ipf-days" class="ag-wf-sel"><option>--ALL--</option><option>Today</option><option>7 Days</option><option>14 Days</option></select></div>
      </div>
      ${rows.length === 0 ? '<div class="ag-wager-empty">No Recent Logins</div>' : `<div class="ag-table-wrap">
            <table class="ag-table ag-ipcheck-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>IP</th>
                  <th>Device</th>
                  <th>Browser</th>
                  <th>Last Login</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map(ipcheckRow).join("")}
              </tbody>
              <tfoot>
                <tr>
                  <th>TOTAL (${rows.length})</th>
                  <td colspan="4"></td>
                  <th class="${sus > 0 ? "ag-neg" : ""}">${sus} SUSP</th>
                </tr>
              </tfoot>
            </table>
          </div>`}
    </div>
  `;
    wireBack();
    wireIpcheckRows();
  }
  function ipcheckRow(r) {
    const statusClass = r.status === "SUSPENDED" ? "ag-neg" : "ag-pos";
    return `
    <tr data-pid="${escapeHtml(r.playerId)}" class="ag-prow">
      <td><span class="ag-link">${escapeHtml(r.playerId)}</span></td>
      <td class="ag-mono">${escapeHtml(r.ip)}</td>
      <td>${escapeHtml(r.device)}</td>
      <td>${escapeHtml(r.browser)}</td>
      <td class="ag-mono">${fmtDate(r.lastLogin)}</td>
      <td><b class="${statusClass}">${escapeHtml(r.status)}</b></td>
    </tr>
  `;
  }
  function wireIpcheckRows() {
    document.querySelectorAll(".ag-ipcheck-table .ag-prow").forEach((tr) => {
      tr.addEventListener("click", () => {
        const pid = tr.dataset.pid;
        if (!pid) return;
        agentState.subview = "detail";
        agentState.detail = { playerId: pid, tab: "personal" };
        render();
      });
    });
  }
  function aggregateIpcheck(players) {
    const out = [];
    players.forEach((p) => {
      if (!p.lastLogin) return;
      const h = djb2(p.id);
      const h2 = djb2(p.id + (p.lastLogin || ""));
      const a = 24 + h % 200;
      const b = 4 + Math.floor(h / 256) % 250;
      const c = Math.floor(h / 65536) % 256;
      const d = h2 % 256;
      out.push({
        playerId: p.id,
        ip: `${a}.${b}.${c}.${d}`,
        device: IPCHECK_DEVICES[h % IPCHECK_DEVICES.length],
        browser: IPCHECK_BROWSERS[h2 % IPCHECK_BROWSERS.length],
        lastLogin: p.lastLogin,
        status: p.status
      });
    });
    out.sort((a, b) => new Date(b.lastLogin) - new Date(a.lastLogin));
    return out;
  }
  function djb2(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = (h << 5) + h + s.charCodeAt(i) >>> 0;
    return h;
  }
  var MAILBOX_FAQ = [
    { keywords: ["deposit", "fund", "add money", "load"], reply: "To deposit funds, contact your agent directly. Available funding methods (cashier, crypto, peer transfer) vary by region \u2014 your agent will walk you through what's set up for your account." },
    { keywords: ["withdraw", "payout", "cash out", "cashout"], reply: "Withdrawals are processed by your agent. Standard payouts complete within 24\u201348 hours. Please use the Email Support tab for withdrawal requests so we have a written record." },
    { keywords: ["password", "forgot", "reset", "sign in", "login"], reply: "Password resets are handled by your agent. Email support with your account ID (top-left of the screen) and we'll have your agent issue a new password within one business day." },
    { keywords: ["parlay"], reply: "A parlay combines 2 or more wagers into a single bet. ALL legs must win for the parlay to pay out \u2014 one loss voids the whole ticket. Payouts scale exponentially with leg count. See the PARLAY tab on the main board." },
    { keywords: ["teaser"], reply: "A teaser lets you adjust point spreads or totals in your favor across 2+ legs in exchange for a reduced payout. Standard NFL teaser is 6 points; NBA is 4 or 4.5. All legs must win." },
    { keywords: ["if bet", "ifbet", "if-bet"], reply: "An If Bet is a conditional sequence: leg 1 must win (or push, depending on rule) for leg 2 to be placed. If leg 1 loses, leg 2 never fires. Useful for managing bankroll across correlated games." },
    { keywords: ["reverse"], reply: "Reverse Action is two If Bets run both directions (A\u2192B and B\u2192A). On a push at the trigger, action carries forward to the next leg. Risk is 2\xD7 your per-play stake. Currently 2-leg only." },
    { keywords: ["settle", "settled", "when pay", "paid"], reply: "Wagers settle automatically when the game ends. Your account balance updates within minutes of the official final score. Pending wagers stay visible in your Bets list until settled." },
    { keywords: ["freeplay", "free play", "bonus", "promo"], reply: "Freeplays are credits granted by your agent. They risk no real money: a winning freeplay pays the net only (no stake returned); a losing freeplay costs nothing. Standard expiry is 30 days from grant." },
    { keywords: ["limit", "max", "wager limit"], reply: "Wager limits are set per account and vary by sport and bet type. Tap the LIMITS tab in your account view to see your current ceilings, or email support for an adjustment request." },
    { keywords: ["hours", "open", "available", "closed", "24"], reply: "The platform operates 24/7. Lines open as soon as they're posted by our oddsmakers, typically 12\u201324 hours before game start." },
    { keywords: ["cancel", "void", "remove bet", "take down"], reply: "Wager cancellations require agent approval and must be requested BEFORE the event starts. Email support with your ticket number and we'll review." },
    { keywords: ["hi", "hello", "hey", "help", "start", "test"], reply: "Hi! I'm the GridV2 support bot. Ask me about deposits, withdrawals, passwords, parlays, teasers, if bets, reverses, settlements, freeplays, limits, hours, or cancellations. For anything I can't answer, use the Email Support tab above." }
  ];
  var MAILBOX_GREETING = "Hi! I'm the GridV2 support bot. Ask me about deposits, withdrawals, passwords, parlays, teasers, settlements, freeplays, limits, or hours. For anything I can't answer, use the Email Support tab above.";
  function renderMailbox(root) {
    const m = window.AGENT_MOCK;
    const tab = agentState.mailbox.tab || "ai";
    const msgs = agentState.mailbox.messages;
    const bubbles = msgs.length === 0 ? `<div class="ag-mb-bubble ag-mb-bot">${escapeHtml(MAILBOX_GREETING)}</div>` : msgs.map((b) => `<div class="ag-mb-bubble ag-mb-${b.role}">${escapeHtml(b.text)}</div>`).join("");
    root.innerHTML = `
    <div class="ag-shell">
      ${agentHeaderBar(m, "Mailbox")}
      <div class="ag-subhdr">
        <button class="ag-back" data-back="dashboard">\u2190 Back</button>
        <div class="ag-crumb-sub">Support &gt; <b>Mailbox</b></div>
      </div>
      <div class="ag-mb-tabs">
        <button class="ag-mb-tab ${tab === "ai" ? "active" : ""}" data-mb-tab="ai">\u{1F4AC} AI Support</button>
        <button class="ag-mb-tab ${tab === "email" ? "active" : ""}" data-mb-tab="email">\u2709 Email Support</button>
      </div>
      <div class="ag-mb-body">
        ${tab === "ai" ? renderMailboxChat(bubbles) : renderMailboxEmail()}
      </div>
    </div>
  `;
    wireBack();
    wireMailbox();
    const log = document.getElementById("ag-mb-log");
    if (log) log.scrollTop = log.scrollHeight;
  }
  function renderMailboxChat(initialBubbles) {
    return `
    <div class="ag-mb-chat">
      <div class="ag-mb-log" id="ag-mb-log">${initialBubbles}</div>
      <div class="ag-mb-input-row">
        <input type="text" class="ag-mb-input" id="ag-mb-input" placeholder="Ask about deposits, withdrawals, parlay rules\u2026" aria-label="Type your question" autocomplete="off">
        <button class="ag-mb-send" id="ag-mb-send" type="button">SEND</button>
      </div>
      <div class="ag-mb-disclaimer">AI replies are based on a fixed FAQ. For anything else, use Email Support.</div>
    </div>
  `;
  }
  function renderMailboxEmail() {
    if (agentState.mailbox.emailSent) {
      return `
      <div class="ag-mb-email-success">
        <div class="ag-mb-success-icon">\u2713</div>
        <div class="ag-mb-success-title">Message sent</div>
        <div class="ag-mb-success-msg">Your message has been sent to <b>support@gridv2.test</b>. We'll reply within 24 hours.</div>
        <button class="ag-mb-email-reset-btn" id="ag-mb-email-reset" type="button">Send another</button>
      </div>
    `;
    }
    return `
    <form class="ag-mb-email-form" id="ag-mb-email-form">
      <div class="ag-mb-email-to">To: <span class="ag-mono">support@gridv2.test</span></div>
      <label class="ag-mb-email-lbl" for="ag-mb-email-sub">Subject</label>
      <input type="text" class="ag-mb-email-inp" id="ag-mb-email-sub" placeholder="Brief summary of your issue" required>
      <label class="ag-mb-email-lbl" for="ag-mb-email-body">Message</label>
      <textarea class="ag-mb-email-area" id="ag-mb-email-body" rows="6" placeholder="Describe your issue in detail\u2026" required></textarea>
      <button type="submit" class="ag-mb-email-send">SEND TO SUPPORT</button>
    </form>
  `;
  }
  function wireMailbox() {
    document.querySelectorAll(".ag-mb-tab").forEach((t) => {
      t.addEventListener("click", () => {
        agentState.mailbox.tab = t.dataset.mbTab;
        render();
      });
    });
    const input = document.getElementById("ag-mb-input");
    const sendBtn = document.getElementById("ag-mb-send");
    const handleSend = () => {
      const text = (input?.value || "").trim();
      if (!text) return;
      appendChat("user", text);
      if (input) {
        input.value = "";
        input.focus();
      }
      setTimeout(() => appendChat("bot", faqMatch(text)), 250);
    };
    if (sendBtn) sendBtn.addEventListener("click", handleSend);
    if (input) input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });
    const emForm = document.getElementById("ag-mb-email-form");
    if (emForm) emForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const sub = document.getElementById("ag-mb-email-sub")?.value.trim();
      const body = document.getElementById("ag-mb-email-body")?.value.trim();
      if (!sub || !body) return;
      agentState.mailbox.emailSent = true;
      render();
    });
    const resetBtn = document.getElementById("ag-mb-email-reset");
    if (resetBtn) resetBtn.addEventListener("click", () => {
      agentState.mailbox.emailSent = false;
      render();
    });
  }
  function appendChat(role, text) {
    agentState.mailbox.messages.push({ role, text, ts: (/* @__PURE__ */ new Date()).toISOString() });
    const log = document.getElementById("ag-mb-log");
    if (!log) return;
    const bubble = document.createElement("div");
    bubble.className = `ag-mb-bubble ag-mb-${role}`;
    bubble.textContent = text;
    log.appendChild(bubble);
    log.scrollTop = log.scrollHeight;
  }
  function faqMatch(text) {
    const lc = text.toLowerCase();
    for (const entry of MAILBOX_FAQ) {
      for (const kw of entry.keywords) {
        if (lc.includes(kw)) return entry.reply;
      }
    }
    return "I don't have an answer for that. Try Email Support (tab above) for a written reply within 24 hours, or rephrase using terms like 'deposit', 'withdraw', 'parlay', 'teaser', 'settle', 'freeplay', or 'limit'.";
  }
  function renderDetail(root) {
    const m = window.AGENT_MOCK;
    const p = m.players.find((x) => x.id === agentState.detail.playerId);
    if (!p) {
      agentState.subview = "management";
      return render();
    }
    const tab = agentState.detail.tab;
    const tabDef = DETAIL_TABS.find((t) => t.key === tab) || DETAIL_TABS[0];
    root.innerHTML = `
    <div class="ag-shell">
      ${agentHeaderBar(m, p.id)}
      <div class="ag-cust-hdr">
        <div class="ag-cust-id">${escapeHtml(p.id)}</div>
        <div class="ag-cust-pills">
          ${custPill("Balance", fmtUSD(p.balance), p.balance < 0 ? "neg" : p.balance > 0 ? "pos" : "")}
          ${custPill("Password", p.pw)}
          ${custPill("Pending", p.pending)}
          ${custPill("Agent", m.id)}
          ${custPill("Freeplay", fmtUSD(p.freeplay || 0))}
          ${custPill("Website", p.website)}
        </div>
        <button class="ag-cust-save" disabled title="Read-only first pass">SAVE</button>
      </div>
      <div class="ag-cust-tabs">
        ${DETAIL_TABS.map((t) => `
          <button class="ag-cust-tab ${t.key === tab ? "active" : ""} ${t.real ? "" : "stub"}" data-tab="${t.key}">
            <span class="ag-cust-tab-icon">${t.icon}</span>
            <span>${escapeHtml(t.label)}</span>
          </button>
        `).join("")}
      </div>
      <div class="ag-cust-body">
        <div class="ag-back-row">
          <button class="ag-back" data-back="management">\u2190 Back to Management</button>
        </div>
        ${renderDetailTab(p, tab, tabDef)}
      </div>
    </div>
  `;
    wireBack();
    wireDetailTabs();
  }
  function custPill(label, val, mod) {
    return `<div class="ag-cust-pill"><div class="ag-cust-pill-lbl">${escapeHtml(label)}</div><div class="ag-cust-pill-val ${mod ? "ag-" + mod : ""}">${escapeHtml(String(val))}</div></div>`;
  }
  function wireDetailTabs() {
    document.querySelectorAll(".ag-cust-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        agentState.detail.tab = btn.dataset.tab;
        render();
      });
    });
  }
  function renderDetailTab(p, tab, tabDef) {
    if (tab === "personal") return renderTabPersonal(p);
    if (tab === "limits") return renderTabLimits(p);
    if (tab === "wager") return renderTabWager(p);
    return renderTabStub(tabDef);
  }
  function renderTabPersonal(p) {
    const fullName = (p.firstName + " " + p.lastName).trim();
    return `
    <div class="ag-personal">
      <div class="ag-personal-col">
        <div class="ag-sect-hdr">IDENTITY</div>
        ${fieldRow("Website", p.website)}
        ${fieldRow("Password", p.pw)}
        ${fieldRow("Agent", window.AGENT_MOCK.id)}
        ${fieldRow("Bettor Type", p.bettorType)}
        ${fieldRow("Reputation", p.reputation)}

        <div class="ag-sect-hdr">SETTINGS</div>
        ${fieldRow("Status", statusBadge(p.status))}
        ${fieldRow("Racebook", pillToggle(p.racebook, "racing"))}
        ${fieldRow("Mailbox", pillToggle(p.mailbox, "mailbox"))}
        ${fieldRow("Main Casino", pillToggle(p.mainCasino, "casino"))}
      </div>
      <div class="ag-personal-col">
        <div class="ag-sect-hdr">DEMOGRAPHICS</div>
        ${fieldRow("Nickname", p.nickname || "\u2014")}
        ${fieldRow("First Name", p.firstName)}
        ${fieldRow("Last Name", p.lastName)}
        ${fieldRow("Email", p.email)}
        ${fieldRow("Phone", p.phone)}
        ${fieldRow("Referred By", p.referredBy || "\u2014")}
        ${fieldRow("Notes", p.notes || "\u2014")}

        <div class="ag-sect-hdr">LOCATION</div>
        ${fieldRow("City", p.city)}
        ${fieldRow("State", p.state)}
      </div>
    </div>
  `;
  }
  function fieldRow(label, val) {
    const html = val && val.startsWith && val.startsWith("<") ? val : escapeHtml(String(val ?? ""));
    return `
    <div class="ag-frow">
      <div class="ag-flabel">${escapeHtml(label)}</div>
      <div class="ag-fsep">:</div>
      <div class="ag-fval">${html}</div>
    </div>
  `;
  }
  function statusBadge(status) {
    const ok = status === "ACTIVE";
    return `<span class="ag-status ${ok ? "ok" : "bad"}">${escapeHtml(status)}</span>`;
  }
  function renderTabLimits(p) {
    return `
    <div class="ag-limits">
      <div class="ag-lim-cards">
        <div class="ag-lim-card">
          <div class="ag-lim-hdr">CREDIT LIMIT</div>
          ${limRow("Credit Limit", fmtUSD(p.credit))}
          ${limRow("Temp Credit", fmtUSD(p.tempCredit || 0))}
          ${limRow("Player Settle Figure", p.settle > 0 ? fmtUSD(p.settle) : "\u2014")}
        </div>
        <div class="ag-lim-card">
          <div class="ag-lim-hdr">OTHER LIMIT</div>
          ${limRow("Max Risk", p.maxRisk > 0 ? fmtUSD(p.maxRisk) : "\u2014")}
          ${limRow("Inet Minimum", fmtUSD(p.inetMinimum))}
          ${limRow("Early Limits", "VAR")}
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
            <tr><td>DEFAULT</td><td>Wager Limit</td><td class="num">${fmtUSD(p.wager)}</td><td class="num">\u2014</td><td class="num">\u2014</td><td class="num">\u2014</td></tr>
            <tr><td>${p.parlay > 0 ? "Yes" : "No"}</td><td>Parlays</td><td class="num">${fmtUSD(p.parlay)}</td><td class="num">4</td><td class="num">1</td><td class="num">${fmtUSD(4e3)}</td></tr>
            <tr><td>${p.teaser > 0 ? "Yes" : "No"}</td><td>Teasers</td><td class="num">${fmtUSD(p.teaser)}</td><td class="num">4</td><td class="num">1</td><td class="num">${fmtUSD(4e3)}</td></tr>
            <tr><td>No</td><td>If Bets</td><td class="num">${fmtUSD(p.wager)}</td><td class="num">\u2014</td><td class="num">\u2014</td><td class="num">\u2014</td></tr>
            <tr><td>No</td><td>Reverse Action</td><td class="num">${fmtUSD(p.wager)}</td><td class="num">\u2014</td><td class="num">\u2014</td><td class="num">\u2014</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
  }
  function limRow(label, val) {
    return `<div class="ag-frow ag-lim-row"><div class="ag-flabel">${escapeHtml(label)}</div><div class="ag-fsep">:</div><div class="ag-fval ag-mono-num">${escapeHtml(String(val))}</div></div>`;
  }
  function renderTabWager(p) {
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
      ${wagers.length === 0 ? '<div class="ag-wager-empty">No Wagers</div>' : `<table class="ag-wager-table">
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
              ${wagers.map((w) => `
                <tr>
                  <td class="ag-mono">${escapeHtml(w.ticket)}</td>
                  <td>${escapeHtml(w.sport)}</td>
                  <td>${escapeHtml(w.type)}</td>
                  <td class="ag-mono">${escapeHtml(w.line)}</td>
                  <td class="ag-mono">${fmtDate(w.placed)}</td>
                  <td class="num">${fmtUSD(w.risk)}</td>
                  <td class="num">${fmtUSD(w.toWin)}</td>
                  <td><span class="ag-wres ag-wres-${w.result.toLowerCase()}">${escapeHtml(w.result)}</span></td>
                  <td class="num ${w.net < 0 ? "ag-neg" : w.net > 0 ? "ag-pos" : ""}">${fmtUSD(w.net)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>`}
    </div>
  `;
  }
  function renderTabStub(tabDef) {
    return `
    <div class="ag-stub">
      <div class="ag-stub-icon">${tabDef ? tabDef.icon : "\u{1F3D7}"}</div>
      <div class="ag-stub-title">${escapeHtml(tabDef ? tabDef.label : "Not implemented")}</div>
      <div class="ag-stub-msg">Stub for first pass. See AGENT_RECON.md for the LC797 recon on this tab.</div>
    </div>
  `;
  }
  function renderPlaceholder(root) {
    const m = window.AGENT_MOCK;
    root.innerHTML = `
    <div class="ag-shell">
      ${agentHeaderBar(m, agentState.placeholderLabel)}
      <div class="ag-subhdr">
        <button class="ag-back" data-back="dashboard">\u2190 Back</button>
        <div class="ag-crumb-sub">${escapeHtml(agentState.placeholderLabel)}</div>
      </div>
      <div class="ag-stub">
        <div class="ag-stub-icon">\u{1F3D7}</div>
        <div class="ag-stub-title">${escapeHtml(agentState.placeholderLabel)}</div>
        <div class="ag-stub-msg">Not implemented in this first pass. See AGENT_RECON.md for the recon notes.</div>
      </div>
    </div>
  `;
    wireBack();
  }
  function wireBack() {
    document.querySelectorAll(".ag-back").forEach((b) => {
      b.addEventListener("click", () => {
        agentState.subview = b.dataset.back || "dashboard";
        render();
      });
    });
  }
  function fmtDate(d) {
    if (!d) return null;
    const dt = new Date(d);
    if (isNaN(dt)) return escapeHtml(String(d));
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const dd = String(dt.getDate()).padStart(2, "0");
    if (String(d).length <= 10) return `${mm}/${dd}`;
    const hh = String(dt.getHours()).padStart(2, "0");
    const mi = String(dt.getMinutes()).padStart(2, "0");
    return `${mm}/${dd} ${hh}:${mi}`;
  }

  // src/agent-main.js
  function boot() {
    const agentId = localStorage.getItem("bs_agent");
    if (!agentId) {
      return;
    }
    hideSplash();
    if (window.AGENT_MOCK) window.AGENT_MOCK.id = agentId;
    initAgent();
  }
  function submitAgentLogin(e) {
    e.preventDefault();
    const id = (document.getElementById("login-id").value || "").trim();
    if (!id) return false;
    localStorage.setItem("bs_agent", id);
    hideSplash();
    if (window.AGENT_MOCK) window.AGENT_MOCK.id = id;
    initAgent();
    return false;
  }
  function logoutAgent() {
    if (!confirm("Sign out of the agent portal?")) return;
    localStorage.removeItem("bs_agent");
    location.reload();
  }
  function hideSplash() {
    const sp = document.getElementById("login-splash");
    if (sp) sp.classList.remove("show");
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
  Object.assign(window, {
    submitAgentLogin,
    logoutAgent
  });
})();
