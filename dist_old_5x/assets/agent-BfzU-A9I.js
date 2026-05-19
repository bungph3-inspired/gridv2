import{f as i,h as e}from"./utils-DCdIuAwr.js";const l={subview:"dashboard",placeholderLabel:""};function m(){window.AGENT_MOCK||(console.warn("[agent] AGENT_MOCK fixture missing — using empty data"),window.AGENT_MOCK={id:"—",balance:0,kpi:{active:0,yesterday:0,today:0,weekly:0},players:[],recent:{wagers:[],logins:[],changes:[]}}),r()}function r(){const a=document.getElementById("agent-view");if(a)return l.subview==="management"?k(a):l.subview==="placeholder"?N(a):w(a)}function w(a){const t=window.AGENT_MOCK,s=t.kpi;a.innerHTML=`
    <div class="ag-shell">
      ${g(t)}
      <div class="ag-body">
        <div class="ag-main">
          <div class="ag-search">
            <input type="text" placeholder="Search account..." class="ag-search-inp" aria-label="Search account">
            <button class="ag-addnew">+ ADD NEW</button>
          </div>

          <div class="ag-kpi">
            ${o("Active",s.active)}
            ${o("Yesterday",i(s.yesterday))}
            ${o("Today",i(s.today))}
            ${o("Weekly",i(s.weekly))}
          </div>

          <div class="ag-cs">CONTACT CUSTOMER SERVICE</div>

          <div class="ag-grid">
            ${n("weekly","📊","Weekly Figures","tile-blue")}
            ${n("pending","🎫","Pending","tile-purple")}
            ${n("cashier","⇄$","Cashier","tile-amber")}
            ${n("add","👤+","Add New","tile-red")}
            ${n("mgmt","⛛","Management","tile-green")}
            ${n("mass","✎≡","Mass Edit","tile-teal")}
            ${n("position","⚖","Position","tile-navy")}
            ${n("ticker","🎟","Bet Ticker","tile-teal")}
            ${n("ip","🌐","IP Checker","tile-red")}
            ${n("tx","💰","Transactions","tile-orange")}
            ${n("mail","✉","Mailbox","tile-orange")}
          </div>

          <div class="ag-feedback">FEEDBACK</div>

          ${f(t.recent.wagers)}
          ${y(t.recent.logins)}
          ${E(t.recent.changes)}
        </div>

        <div class="ag-rail">
          <div class="ag-rail-tabs">
            <span class="ag-rail-tab active">Hierarchy</span>
            <span class="ag-rail-tab">Settings</span>
          </div>
          <div class="ag-rail-body">
            <input type="text" placeholder="Search account" class="ag-rail-search" aria-label="Search hierarchy">
            <div class="ag-hier-row">
              <span class="ag-hier-name">${e(t.id)}</span>
              <span class="ag-hier-cnt">(${t.players.length})</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,S()}function g(a){return`
    <div class="ag-topbar">
      <div class="ag-id">${e(a.id)}</div>
      <div class="ag-bal">BALANCE &gt; <span class="ag-bal-val">${i(a.balance)}</span></div>
      <div class="ag-crumb" id="ag-crumb">Dashboard</div>
      <button class="ag-logout" onclick="logoutAgent()">⎋ Logout</button>
    </div>
  `}function o(a,t){return`<div class="ag-kpi-cell"><label>${e(a)}</label><div class="ag-kpi-val">${e(String(t))}</div></div>`}function n(a,t,s,d){return`<button class="ag-tile ${d}" data-tile="${a}"><span class="ag-tile-icon">${t}</span><span class="ag-tile-label">${e(s)}</span></button>`}function f(a){return`<details class="ag-widget" open><summary>RECENT WAGERS</summary>${a.length?a.map(s=>`<div class="ag-wrow"><span>${e(s.id)}</span><span class="ag-wmono">${e(s.pw)}</span><span class="ag-wamt">${i(s.amount)}</span><span class="ag-wdate">${c(s.when)}</span></div>`).join(""):'<div class="ag-empty">No recent wagers</div>'}</details>`}function y(a){return`<details class="ag-widget"><summary>LATEST LOGINS</summary>${a.length?a.map(s=>`<div class="ag-wrow"><span>${e(s.id)}</span><span class="ag-wmono">${e(s.pw)}</span><span class="ag-wdate">${c(s.when)}</span></div>`).join(""):'<div class="ag-empty">No recent logins</div>'}</details>`}function E(a){return`<details class="ag-widget"><summary>RECENT CHANGES</summary>${a.length?a.map(s=>`<div class="ag-wrow"><span class="ag-wmono">${e(s.who)}</span><span>${e(s.what)}</span><span>${e(s.target)}</span><span class="ag-wdate">${c(s.when)}</span></div>`).join(""):'<div class="ag-empty">No recent changes</div>'}</details>`}function S(){document.querySelectorAll(".ag-tile").forEach(a=>{a.addEventListener("click",()=>{a.dataset.tile==="mgmt"?l.subview="management":(l.subview="placeholder",l.placeholderLabel=a.querySelector(".ag-tile-label").textContent),r()})})}function k(a){const t=window.AGENT_MOCK;a.innerHTML=`
    <div class="ag-shell">
      ${g(t)}
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
            ${t.players.map(T).join("")}
          </tbody>
          <tfoot>
            <tr>
              <th>TOTAL (${t.players.length})</th>
              <td colspan="10"></td>
              <th class="num">${i(t.balance)}</th>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  `,h()}function T(a){return`
    <tr>
      <td class="ag-pid"><span class="ag-link">${e(a.id)}</span> <span class="ag-mono">(${e(a.pw)})</span></td>
      <td class="num"><span class="ag-link">${a.credit}</span></td>
      <td class="num"><span class="ag-link">${a.wager}</span></td>
      <td class="num"><span class="ag-link">${a.parlay}</span></td>
      <td class="num"><span class="ag-link">${a.teaser}</span></td>
      <td>${u(a.casino,"casino")}</td>
      <td>${u(a.racing,"racing")}</td>
      <td class="num"><span class="ag-link">${a.settle?i(a.settle):0}</span></td>
      <td>${c(a.lastWager)||'<span class="ag-dim">None</span>'}</td>
      <td>${c(a.lastLogin)||'<span class="ag-dim">None</span>'}</td>
      <td class="num">${a.pending}</td>
      <td class="num ${a.balance<0?"ag-neg":a.balance>0?"ag-pos":""}"><span class="ag-link">${i(a.balance)}</span></td>
    </tr>
  `}function u(a,t){return`<span class="ag-pill ${a?"on":"off"} ag-pill-${t}">${a?"Yes":"No"}</span>`}function N(a){const t=window.AGENT_MOCK;a.innerHTML=`
    <div class="ag-shell">
      ${g(t)}
      <div class="ag-subhdr">
        <button class="ag-back" data-back="dashboard">← Back</button>
        <div class="ag-crumb-sub">${e(l.placeholderLabel)}</div>
      </div>
      <div class="ag-stub">
        <div class="ag-stub-icon">🏗</div>
        <div class="ag-stub-title">${e(l.placeholderLabel)}</div>
        <div class="ag-stub-msg">Not implemented in this first pass. See AGENT_RECON.md for the recon notes.</div>
      </div>
    </div>
  `,h()}function h(){document.querySelectorAll(".ag-back").forEach(a=>{a.addEventListener("click",()=>{l.subview=a.dataset.back||"dashboard",r()})})}function c(a){if(!a)return null;const t=new Date(a);if(isNaN(t))return e(String(a));const s=String(t.getMonth()+1).padStart(2,"0"),d=String(t.getDate()).padStart(2,"0");if(String(a).length<=10)return`${s}/${d}`;const b=String(t.getHours()).padStart(2,"0"),$=String(t.getMinutes()).padStart(2,"0");return`${s}/${d} ${b}:${$}`}function p(){const a=localStorage.getItem("bs_agent");a&&(v(),window.AGENT_MOCK&&(window.AGENT_MOCK.id=a),m())}function A(a){a.preventDefault();const t=(document.getElementById("login-id").value||"").trim();return t&&(localStorage.setItem("bs_agent",t),v(),window.AGENT_MOCK&&(window.AGENT_MOCK.id=t),m()),!1}function C(){confirm("Sign out of the agent portal?")&&(localStorage.removeItem("bs_agent"),location.reload())}function v(){const a=document.getElementById("login-splash");a&&a.classList.remove("show")}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",p):p();Object.assign(window,{submitAgentLogin:A,logoutAgent:C});
