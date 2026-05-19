# GridV2 — HTML Audit (historical refs to BetSimV2 preserved below)

**Scope:** `index.html` and `index_mobile.html` only.
**Date:** 2026-05-13
**Reviewer pass:** code quality / convention / security / WCAG 2.1 AA.

Priorities: **P0** = broken or must-fix. **P1** = real bug or clear convention break. **P2** = polish, nits, semantics.

---

## Summary

No P0 issues. All inline `onclick` handlers resolve to functions exposed on `window` via `Object.assign(window, {...})` in `src/main.js:893` and `src/mobile/main.js:1441`. No orphan handlers, no missing IDs spot-checked.

The findings are concentrated in two areas:

1. **Accessibility** — interactive `<div>` elements, icon-only buttons without `aria-label`, unlabeled form inputs, and a `user-scalable=no` viewport on mobile.
2. **Convention drift** — small residue of inline `style="..."` attributes flagged as v1 holdover in PROJECT.md ("clean up as touched"), and one suspicious token misuse (`bg-bet-text-sm` applies a text-color token to a background).

Security on the HTML side is clean. No exposed secrets, no inline `javascript:` URLs, `autocomplete="off"` on the API-key input, and `onerror` on the mock-data script is defensive (sets a global flag, no network side-effects).

---

## P1 — Accessibility

### A11y-1. Interactive `<div>` elements lack keyboard/role semantics
Bet-type tabs and mobile sport tabs are clickable `<div>`s. Not focusable, no keyboard activation, no role.

- `index.html:69-72` — `.btab` Straight/Parlay/Teaser/If Bet tabs
- `index_mobile.html:41-46` — `.mob-stab` sport tabs

**Fix:** convert to `<button>` (preferred, free keyboard activation + focus ring), or add `role="tab"` + `tabindex="0"` + `keydown` Enter/Space handlers. Project already uses `<button>` for the mobile bottom-nav at `index_mobile.html:67-87`; reuse that pattern.

### A11y-2. Icon-only close buttons missing `aria-label`
Screen readers announce "✕ button" with no context.

- `index.html:191, 214, 229, 245` — modal close `✕` buttons (`.pmclose`)
- `index.html:267` — My Bets `✕` button
- `index.html:275` — Settings `✕` button
- `index_mobile.html:94` — Drawer `✕` button
- `index_mobile.html:51` — `↺` Update Lines button (mobile)

**Fix:** add `aria-label="Close"` (or "Refresh" for the update button).

### A11y-3. Form inputs have no programmatic label
`<label>` tags are siblings, not associated via `for=`/`id=`. Screen readers won't link them; clicking the label won't focus the input.

- `index.html:198, 200` — Parlay Bet Amount / Win
- `index.html:251, 253` — Teaser Bet Amount / Win
- `index.html:278, 283, 290, 297, 309, 314` — every `.set-row` label
- `index_mobile.html:96, 101, 108, 115, 124` — every `.mob-dsec` label

**Fix:** add `for="api-key-inp"` to the label and matching `id` on the input (the inputs already have IDs in most cases — just add `for`).

### A11y-4. Sport-filter `<select>` has no accessible name
- `index.html:87` — `<select class="sb-sel" onchange="filterSport(this.value)">` no `aria-label` or associated label.

**Fix:** `aria-label="Filter by sport"` on the select.

### A11y-5. Mobile viewport disables user zoom
- `index_mobile.html:5` — `maximum-scale=1.0, user-scalable=no`

WCAG 1.4.4 (Resize Text) requires up to 200% zoom. iOS users with low vision rely on pinch-zoom. The mobile layout is fixed at `max-w-[480px]`; disabling zoom isn't required to prevent the iOS focus-zoom-on-input behavior — bumping input `font-size` to 16px is the standard fix.

**Fix:** drop `maximum-scale` and `user-scalable=no`. If the iOS input-zoom is the concern, set `font-size: 16px` on the relevant inputs (`#api-key-inp`, `#pm-risk`, `#tm-risk`).

### A11y-6. Touch target size (manual verify)
Mobile sport tabs (`.mob-stab`) and the mobile update button (`.mob-upd-btn`) — visually compact. WCAG 2.5.5 (AA) wants 24×24 CSS px; 2.5.8 (AAA) wants 44×44. Worth a quick check against `src/style.css` for those selectors during the next mobile pass.

---

## P1 — Convention compliance

### Conv-1. Inline `style="..."` on production elements
PROJECT.md ("Conventions & Rules" → v2-specific): *Never inline `style="..."` on production elements. A few remain in modals as a v1 holdover — clean up as touched.*

- `index.html:168-171` — table column widths (`width:38%`, `18%`, `18%`, `16%`). Move to `colgroup` or per-`th` utility (`w-[38%]`).
- `index.html:213, 228` — `<div class="pmodal" style="max-width:380px">` / `520px`. These two modals (Teaser Payouts, If Bet) override the default `.pmodal` max-width. Either:
  - Add `.pmodal-sm` / `.pmodal-md` `@apply` variants in `@layer components`, or
  - Use Tailwind arbitrary value: `class="pmodal max-w-[380px]"`.
- `index.html:311` — `<div id="qbar" style="width:0%">` is **dynamic** (set by JS as quota fills). This one is acceptable; leave it.

### Conv-2. Long inline utility chains on repeated UI
PROJECT.md: *Inline utility chains over ~6 classes for repeated UI = refactor to `@layer components`.*

- `index.html:62, 63` — Settings and My Bets header buttons both carry the same 14-utility chain (`bg-transparent border border-white/30 text-white font-display text-xs font-semibold px-2.5 py-1 rounded-[3px] cursor-pointer uppercase tracking-[0.5px] hover:bg-white/10 transition-colors`). Refactor to a `.hbtn` `@apply` component in `style.css`.

### Conv-3. Suspicious token misuse — `bg-bet-text-sm`
- `index.html:317` — `<button class="set-save bg-bet-text-sm hover:bg-bet-text" onclick="resetBalance()">`

`--color-bet-text-sm` is defined in `style.css:62` as `#4a5a60`, a **text** color tier (the comment block calls them small-text/secondary-text greys). Using it as a `bg-` is technically valid Tailwind v4 but semantically misleading — anyone reading this thinks they're styling text, not a button surface. Recommend either:
  - Rename the tokens to neutral surface names (`--color-bet-neutral-mid` etc.), or
  - Promote this pattern to a `.set-save-secondary` `@apply` component so the misuse stays in one place.

### Conv-4. Hardcoded color outside the design system
- `index.html:84` — `<div class="ldot live bg-[#6de098]"></div>`

A specific green that's clearly part of the "PULSE LIVE" identity. Add `--color-bet-pulse: #6de098;` to `@theme` and replace with `bg-bet-pulse`.

---

## P2 — Code quality / polish

### Q-1. Two hide patterns coexist (`.hidden` vs `.h`)
- Tailwind's `.hidden` is used on `#sel-panel`, `#review-screen`, `#pend-stat`, `#bets-cnt`, `.mob-continue-bar`, `.mob-nbadge`, etc.
- A custom `.h` class (defined in `style.css:209` as `@apply hidden` for `.btab-badge.h, .continue-badge.h, .brd-continue-badge.h`) is used on the bet-tab badges.

Functionally equivalent. The `.h` pattern was needed in v1 (no Tailwind), but here it's just an alias. Either standardize on `.hidden` or document `.h` as the badge convention.

### Q-2. Duplicate `<title>` length disparity
- `index.html:6` — `BetSimV2 — Tailwind v4 build · Entertainment Only`
- `index_mobile.html:7` — `BetSimV2 Mobile — Entertainment Only`

Minor: the desktop title leaks build-tooling detail to the tab. Suggest `BetSim — Entertainment Only` for parity.

### Q-3. Mobile redirect script lacks a query-string opt-out
- `index.html:10-20` — narrow viewport / mobile UA → forced redirect to `index_mobile.html`.

Useful for power users testing the desktop layout from a phone, and for the verify harness. Suggest: `if (!location.search.includes('desktop=1')) { ... redirect ... }`.

### Q-4. CSP would break inline handlers
Every interactive control uses inline `onclick=`/`onchange=`/`oninput=`. If a stricter CSP is ever applied (e.g., when hosting on a domain with `Content-Security-Policy: script-src 'self'`), every handler breaks. Not a current bug — note for the day a CSP is added; replace with `addEventListener` wiring in init.

### Q-5. Stale `.set-mock` semantic
- `index.html:285-296` — Mock Mode + Alt Lines rows both use `class="set-mock"`. The class name implies "mock mode", but it's reused for the alt-lines toggle. Rename to `.set-toggle-row` or similar.

---

## Security — clean

Confirmed: no inline `javascript:` URLs, no hardcoded API keys, `autocomplete="off"` on the password-type API-key input, mock-data `onerror` handler is defensive only. No `<iframe>`. No `target="_blank"` external links. Google Fonts is loaded without SRI — acceptable given PROJECT.md's stated trade-off, but if you ever self-host the fonts you'll close that supply-chain seam.

---

## Wiring — clean

Every inline handler in both HTML files resolves to a function exposed on `window`. `src/main.js:893` (desktop) and `src/mobile/main.js:1441` (mobile) carry the full `Object.assign(window, {...})` block; handlers come from `bets.js`, `api.js`, and the entry files themselves. Spot-checked IDs (`pmlegs`, `tm-body`, `qbar`, `mob-sheet-body`, `set-bal`, etc.) all have matching `getElementById` calls in the JS modules. No dangling references found in this pass.

---

## Suggested next actions (in priority order)

1. Fix A11y-1 (button semantics on `.btab` and `.mob-stab`) — biggest a11y win, small diff.
2. Fix A11y-5 (drop `user-scalable=no`) — one-line change.
3. Sweep A11y-2 + A11y-3 (`aria-label`s + `for=`) — mechanical pass.
4. Refactor Conv-2 (`.hbtn` `@apply` component) — sets the pattern for future header buttons.
5. Address Conv-1 + Conv-3 + Conv-4 as part of the next style-touchup session.
