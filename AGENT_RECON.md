# Agent Portal Recon — LeftCoast797 (LC797)

> Captured 2026-05-18 from a live LC797 agent login (NUBI004) for GridV2's Agent section build.
> Source URL pattern: `https://leftcoast797.com/partner/index.html#/...` (hash-based SPA, no full reloads).
> **Scope carve-out:** Live scoreboard / right-rail scoreboard tab is explicitly out of scope for GridV2 — do not mirror it.

## 1. Top-level IA — Sidebar nav

Vertical sidebar, dark navy (`#172d33`-adjacent), icon + label per row. Single-open accordion (clicking one item collapses the others). Submenu rows are lighter weight indented children.

```
DASHBOARD                        → #/ag-panel/main
FIGURES                          (expand)
  Weekly Figures                 → #/ag-legacy-figures-report
  Cust Management                → #/ag-management/?filter=4
  Inactive Customers
  Brand New Accounts
  Mass Edit
WAGERS                           (expand)
  Pending Wagers
  Pending By Customer
  Pending With Open
  Deleted Wagers
  Bet Ticker
  Wager Rules
MAILBOX                          (expand)
  Go To Mailbox
  Customer Service
  Report Error                   → modal (REPORT AN ERROR composer)
  Feedback
TRANSACTIONS                     (expand — items unread)
ACCOUNTS                         (expand)
CASINO                           (expand)
RACEBOOK                         (expand)
HISTORY                          (expand)
SCHEDULE                         (expand)
  Agent Management               → #/ag-reportmanagement
  Agent Order
PAYMENTS                         (expand)
DEFAULT SETTINGS                 (expand)
  Account Status
  Default Limits
  Change Password
  Other Default Settings
  Sport Max Limits
  Sport Early Limits
  Sport Juice Setup
  Sport Max Price
  Sport Max Contest
  Timezone
  Website Config
LOGOUT
V.2.2.13                         (version stamp at bottom)
```

Sidebar header (top): `NUBI004` (agent ID, large) + `BALANCE > $0.00` row. Both stay visible above the nav tree.

Responsive behavior: at ~<900px viewport the sidebar collapses to a top icon row (`MENU / HOME / SEARCH / MAILBOX / FAVORITES / SCORES`) and the body restacks to 3-wide tiles.

## 2. Dashboard (`#/ag-panel/main`) — main layout

Three columns:

**Left:** Sidebar (above).
**Center (~960px wide):**
1. Search bar (`Search Account...`) + clock-history icon + green **ADD NEW** pill button (top-right corner of body).
2. KPI strip — 4 boxes, mint-tinted background:
   `ACTIVE 0 | YESTERDAY $0.00 | TODAY $0.00 | WEEKLY $0.00`
3. Red banner: `CONTACT CUSTOMER SERVICE` (full-width, white text, salmon/red bg).
4. **3×4 tile grid** (3 columns × 4 rows = 11 tiles, last row has 2). Each tile is a white card with large icon and label below. Icons are line-art, multi-color (each tile its own color):
   - Row 1: **Weekly Figures** (blue bar chart) | **Pending** (purple receipt) | **Cashier** (yellow $ arrows)
   - Row 2: **Add New** (red person+) | **Management** (green org chart) | **Mass Edit** (teal pencil-list)
   - Row 3: **Position** (navy scales) | **Bet Ticker** (teal ticket) | **IP Checker** (red globe)
   - Row 4: **Transactions** (orange money bag) | **Mailbox** (orange paper plane)
5. Dark navy banner: `FEEDBACK` (full-width button).
6. Collapsible widget sections (chevron toggles):
   - `RECENT WAGERS`
   - `LATEST LOGINS`
   - `RECENT CHANGES`

**Right rail (~280px wide):** Tabs `SCOREBOARD | HIERARCHY | SETTINGS`.
- `SCOREBOARD` — **EXCLUDED from GridV2 build.**
- `HIERARCHY` — Search Account field + indented agent tree. Root row shows `NUBI004 (0)` (agent username, sub-agent count in parens). Click to drill down.
- `SETTINGS` — Dashboard preferences. SAVE button. Sections:
  - **ACCOUNT IDENTIFIER** — dropdown (default: Customer Info; falls back through Nickname → Firstname → Password).
  - **DASHBOARD > WIDGET TABLES** — toggles for Recent Changes / Recent Wagers / Latest Logins (Yes/No).
  - **DASHBOARD > WIDGET CHARTS** — toggles for Weekly Count / Daily Total (Yes/No).

## 3. Customer Management (`#/ag-management/?filter=4`)

Routed from the **Management** tile and from sidebar Figures > Cust Management.

**Top toolbar:** `Figures > All` breadcrumb (left), then filter row: `All ▾` (group/agent filter) | `EXPORT` (Excel icon) | `SETTINGS` (gear) | print icon | `All ▾` (right-side filter).

**Table** — striped white, hairline borders. Grouped by parent agent (collapsible row: `NUBI004:` with total balance on the right). Columns:

| Col | Notes |
|---|---|
| ID | `NUB400` link + `(RG71)` secondary code (looks like a 4-char random suffix — possibly the player password/PIN displayed inline). Click → customer detail. |
| Credit Limit | Underlined number (e.g. `500`) — inline-editable. |
| Wager Limit | Underlined number. |
| Parlay Max | Underlined number (often `0`). |
| Teaser Max | Underlined number (default `100`). |
| Casino | Pill toggle (off = grey, on = yellow). |
| Racing | Pill toggle (yellow when on). |
| Settle | Underlined number link → settle action. |
| Last Wager | `None` or date. |
| Last Login | `None` or date. |
| Pending | Count. |
| Balance ⇅ | Underlined `0.00` — sortable column. |

**Footer:** `TOTAL (50) CUSTOMERS / 50 / $0.00` (count + sum balance).

## 4. Customer Detail (`#/ag-accounts/customer/personal/<id>/false`)

Reached by clicking a customer ID. Multi-tab editor for a single player.

**Header bar (full width, dark navy):**
`NUB400` (left), then 6 metric pills: `BALANCE $0.00 | PASSWORD RG71 | PENDING $0 | AGENT NUBI004 | FREEPLAY $0 | WEBSITE LEFTCOAST797`. Big green `SAVE` button at far right.

**Tab bar** (under header — icon + label, 11 tabs):
`PERSONAL | LIMITS | LINESET | TRANSACTIONS | WAGER | HISTORY | COMMUNICATIONS | CHANGES | CONNECTIONS | CASINO | BACKBONE`

### 4a. PERSONAL tab
Two-column layout (~50/50 split).

**Left column — IDENTITY:**
- Website (read-only `LeftCoast797`)
- Password (text input, e.g. `RG71`)
- Agent (text + X to unassign, e.g. `NUBI004`)
- Bettor Type (dropdown — e.g. `NEW PLAYER NED`)
- Reputation (dropdown — e.g. `NEW`)

**Left column — SETTINGS:**
- Status (dropdown — e.g. `ACTIVE`, green tint + alert badge)
- Racebook (Yes/No pill toggle)
- Mailbox (Yes/No pill toggle)
- Main Casino (Yes/No pill toggle)

**Right column — DEMOGRAPHICS:**
- Nickname, First Name, Last Name, Email, Phone, Referred By (text inputs)
- Notes (textarea)
- `+ MORE PERSONAL DETAILS` expand link
- Below: **LOCATION** section (City, …)

Section headings are slate-bordered banners (`IDENTITY`, `DEMOGRAPHICS`, `SETTINGS`, `LOCATION`).

### 4b. LIMITS tab (`/limits/<id>`)
Two cards side-by-side:

**CREDIT LIMIT card** — teal banner header:
- Setting-type dropdown (`ZERO …`) | Credit Limit (info icon) | $500 input
- Temp Credit | $0 + Exp.Date date input
- Yes/No toggle | Player Settle Figure | $0

**OTHER LIMIT card** — teal banner header:
- Yes/No | Max Risk | $0
- Yes/No | Inet Minimum | $20
- (no toggle) | Early Limits | `VAR` indicator + `PROFILE` button
- `SELEC…` dropdown | Enforce Limit By

**LIMITS CHART table** (below both cards) — teal banner header.
Columns: `SETTING | SELECTION | AMOUNT | MAX TEAMS | X-LIMIT | MAX PAYOUT | DETAILS`
Rows: `Wager Limit`, `Parlays`, `Teasers`, `If Bets`, … each with Yes/No toggle + per-bet-type limits + `PROFILE` button on the right.

### 4c. WAGER tab (`/wager/<id>`)
**FILTERS panel** (collapsible, teal banner):
`Ticket # | Wagers [Pending Only ▾] | Placed [--ALL-- ▾] | Amount [--ALL-- ▾]`
Body: `No Wagers` empty state when none.

(Other tabs — Lineset / Transactions / History / Communications / Changes / Connections / Casino / Backbone — not deeply walked; same chrome pattern. Lineset and Backbone are sport-specific config tabs.)

## 5. Weekly Figures (`#/ag-legacy-figures-report`)

**Breadcrumb:** `Figures > Weekly Figures`
**Filter row (left → right):** `Weekly ▾` (period type) | `to` label | `EXPORT` | `SETTINGS` | print icon | (right) `Current Week ▾` (week picker)

**SETTINGS modal** (titled `WEEKLY > SETTINGS`):
- Top button: `READ HOW THIS REPORT HAS CHANGED` (info link).
- `COLUMNS:` dropdown → multi-check menu: `First Name | Last Name | Carry/Zero | Pending | Payments | Balance` (all toggleable).
- `AGENT INFO:` dropdown (default `Balance`).
- `ACTIVITY:` dropdown → options `This Week | Last 3 Weeks | Last 300 Days`.
- Cancel / SAVE (green) buttons.

Body table renders once data exists (empty state: `No information available`).

## 6. Agent Management (`#/ag-reportmanagement`)

Routed from sidebar **Schedule > Agent Management**. The "sub-agents" view.

**Header:** Title `AGENT MANAGEMENT` (with sub-agent icon) + filter funnel + green `GENERATE` button.
**Sub-tab bar:** `SETTLE FIGURES | PLAYER COUNT | AGENT DISTRIBUTION | WEEKLY FIGURES`

### Settle Figures table (default tab)
Columns: `AGENTS | PASSWORD | BALANCE | SETTLE | LAST WEEK | AGENT TYPE | PAYS TO | LAST TRANSACTION`
- `AGENTS` is a link to the agent's sub-account.
- `AGENT TYPE` and `LAST TRANSACTION` are dropdown filters (in the header row).
- Row example: `NUBI004 | 1234 | $0 | $0 | 0 | STANDARD | (blank) | (blank)`
- Footer: `Total Balance | $0` summary row.

## 7. Interaction patterns

- **Sidebar accordion:** single-open. Click a top item → expand its submenu, auto-collapse the previously open one.
- **Dashboard tiles:** 1-click → route to corresponding page (no hover preview).
- **Inline-edit numbers in Management table:** underlined cells appear to be click-to-edit (didn't test write path, but the affordance is clear).
- **Toggle pills:** `Yes/No` segmented control. Active side fills (green Yes / red No / yellow on-state for sport toggles like Racing/Casino).
- **Modals:** centered, dark navy title bar, X-close top-right, Cancel/SAVE button row at bottom. Backdrop dims body. Esc closes.
- **Multi-select dropdowns** (e.g. Weekly Figures column picker): native-styled menu with check marks left of each option, click to toggle.
- **Composer modals** (e.g. Report Error): To/Subject fields + rich-text textarea + B/I/U + attachment paperclip + Cancel/Send.
- **404 state:** decorative rainbow chevron background + centered card `Page not found / GO HOME`.

## 8. Visual notes / token equivalents

| LC797 surface | Approx hex | GridV2 token |
|---|---|---|
| Sidebar bg (dark navy) | `#1a2e35` | `--color-bet-darker` (already #172d33) |
| KPI strip bg (mint) | `#cfe1e6` | (new — `--color-bet-kpi`?) |
| Card / tile bg | `#ffffff` | `--color-bet-panel` |
| Body bg (slate) | `#c9d1d9` | `--color-bet-bg` |
| Section banner (cards) | teal | `--color-bet-brand` |
| Active primary (Save, ADD NEW, GENERATE) | green | `--color-bet-success` (new) |
| Alert banner (Contact CS) | salmon/red | `--color-bet-danger` (new) |
| Yes pill | green | `--color-bet-success` |
| No pill | red | `--color-bet-danger` |
| Toggle on (sport) | yellow | `--color-bet-warn` (new) |

Spacing: dense — table rows ~36px, sidebar rows ~46px, tile cards ~150px tall.
Typography: sans-serif (looks like a system stack — close to Barlow at body sizes). All-caps for labels (`ACTIVE`, `WEEKLY`, `PERSONAL`). Numbers right-aligned in tables.

## 9. GridV2 build implications (next session)

**Section name:** `Agent` (top-level tab alongside the existing board).
**First pass scope (now):** Dashboard layout only — KPI strip + tile grid + recent-activity widgets. Sidebar nav stub. **No live scoreboard.**
**Second pass (later):** Customer Management table (sortable, mock data 50 rows).
**Third pass:** Customer Detail tab shell (Personal + Limits tabs first).
**Out of scope:** Real settle math, real persistence, real comms, real casino — same entertainment-only / read-only rules as the rest of GridV2.

Mock data shape (proposed for `public/agent_mock.js`):
```js
export const agent = {
  id: "NUBI004",
  balance: 0,
  kpi: { active: 0, yesterday: 0, today: 0, weekly: 0 },
  players: [
    { id: "NUB400", pw: "RG71", credit: 500, wager: 100, parlay: 0, teaser: 100,
      casino: false, racing: true, settle: 0, lastWager: null, lastLogin: null,
      pending: 0, balance: 0 },
    // …49 more
  ],
};
```
