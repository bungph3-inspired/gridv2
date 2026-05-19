# GridV2 — Audit To-Do

Derived from `AUDIT.md` (2026-05-13). Ordered by impact. Check off as you go.

> **Next session pickup (2026-05-14):** Quick wins ✅, Accessibility ✅, Convention compliance ✅, Polish ✅. All AUDIT.md items closed except the two Deferred entries (CSP, font self-host). Default to `bash scripts/safe-edit.sh` (or an inline `python3` heredoc) for any non-trivial edit on `index.html`, `index_mobile.html`, `src/style.css`, `src/bets.js`, or `PROJECT.md` — these all hit the Edit-tool size cap during the cont. 3/4/5 batches.

## Quick wins (small diffs, high value)

- [x] **Drop `user-scalable=no`** — `index_mobile.html:5`. Remove `maximum-scale=1.0, user-scalable=no`. If iOS input-focus zoom becomes a problem, bump input `font-size` to 16px.
- [x] **Add `aria-label="Close"`** to all modal `✕` buttons — `index.html:191, 214, 229, 245, 267, 275`; `index_mobile.html:94`.
- [x] **Add `aria-label="Refresh"`** to mobile update button — `index_mobile.html:51`.
- [x] **Add `aria-label="Filter by sport"`** to sidebar `<select>` — `index.html:87`.
- [x] **Promote `bg-[#6de098]` to `@theme`** — add `--color-bet-pulse: #6de098;` to `style.css`, replace usage at `index.html:84`. _Note: `style.css:181, 188` still use raw `#6de098` (out of original audit scope — fold into next CSS pass)._

## Accessibility (bigger, but mechanical)

- [x] **Convert `.btab` to `<button>`** — `index.html:69-72`. Free keyboard activation + focus ring. _CSS reset added: `bg-transparent border-0` then re-apply right + bottom borders._
- [x] **Convert `.mob-stab` to `<button>`** — `index_mobile.html:41-46`. Same fix. _Same CSS reset pattern._
- [x] **Associate every `<label>` with its input** via `for=`/`id=`. _Orphan labels (Win/API Quota/Virtual Balance — no real input) converted to `<span class="lbl">`; CSS selectors `.pmcell .lbl`, `.set-row .lbl`, `.mob-dsec .lbl` added to mirror existing `.lbl` convention._
  - [x] `index.html:197, 201` (Parlay modal — `for="pm-risk"`, Win → span.lbl)
  - [x] `index.html:250, 254` (Teaser modal — `for="tm-risk"`, Win → span.lbl)
  - [x] `index.html:278, 284, 291, 298, 310, 315` (Settings rows — for=api-key-inp/mock-cbx/alt-cbx/book-sel; Quota+Balance → span.lbl)
  - [x] `index_mobile.html:96, 101, 108, 115, 125` (Drawer sections — for=api-key-inp/mock-cbx/alt-cbx/book-sel; Balance → span.lbl)
- [x] **Verify touch-target sizes** for `.mob-stab` and `.mob-upd-btn` against WCAG 2.5.5 (24×24 min). _Both pass AA: `.mob-stab` ≈ 60×32 (px-4 py-2 + 12px text), `.mob-upd-btn` = 28×28 (w-7 h-7). `.mob-upd-btn` borderline — bump to w-8 h-8 for AAA comfort if desired._

## Convention compliance

- [x] **Refactor header buttons to `.hbtn` `@apply` component** — killed the 14-utility duplication at `index.html:62-63`. Added `.hbtn` to `@layer components` in `style.css` (after `.hbadge`).
- [x] **Replace inline `style="width:X%"` on review-table headers** — `index.html:168-171` now use `w-[38%]` / `w-[18%]` / `w-[18%]` / `w-[16%]` utilities.
- [x] **Replace inline `style="max-width:380px/520px"` on modals** — `index.html:213, 228` now use `pmodal max-w-[380px]` and `pmodal max-w-[520px]`.
- [x] **Fix `bg-bet-text-sm` semantic misuse** — added `.set-save-secondary` `@apply` component to `style.css`; `index.html:317` now just `class="set-save-secondary"`. Comment in the CSS notes the bet-text-sm/bet-text tokens are reused as neutral surface here intentionally.
- [x] **Standardize hide pattern** — picked `.hidden` (Tailwind). Retired the custom `.h` marker: removed the `.btab-badge.h, .continue-badge.h, .brd-continue-badge.h` rule from `style.css`; swept index.html (5 sites: par/tea/if badges + continue badge + brd-continue badge) and `src/bets.js` (7 sites: 5× `toggle("h",...)` → `toggle("hidden",...)`, 1× `add("h")` → `add("hidden")`, 2× vestigial `"sel-combined h" / "sel-continue h"` strings stripped of `h`). Side effect: fixed a latent bug where `#corr` ("same-game legs" warning in parlay modal) had `class="hidden"` baked in but JS was toggling `.h` — `.h` had no global selector so the warning was permanently hidden. Now toggles `.hidden` correctly and surfaces when same-game legs are present. Comment added to `.btab-badge` CSS block documenting the standard.

## Polish

- [x] Tighten desktop `<title>` — `index.html:6` now reads `BetSimV2 · Entertainment Only`.
- [x] Add `?desktop=1` opt-out to mobile redirect — `index.html:15` adds `var forceDesktop = /[?&]desktop=1\b/.test(location.search);` and `!forceDesktop` to the bounce condition. Verified the regex with word boundary so `?desktop=11` doesn't match.
- [x] Rename `.set-mock` → `.set-toggle-row` — `style.css:956` + `index.html:286, 293`. Single-pass Python rewrite (heredoc) to avoid Edit-tool truncation.

## Unresolved visual items (raised this session, not closed)

- [x] **Mobile page background reads "too white."** _Closed 2026-05-15 cont. 5: `.mob-gcard` + `.mob-prop-section` switched from `bg-white` to `bg-bet-bg`._ John flagged on 2026-05-14 that the mobile build's outer bg looks flat / overly bright next to the desktop. Body uses `bg-bet-bg` (#c9d1d9 cool slate) but `.mob-gcard` defaults to `bg-white`, so most of the scroll surface is white — the "panel" tone of the desktop is lost on mobile. Easiest fix: change `.mob-gcard` to `bg-bet-panel` (#eef1f3 light gray) and let the bg-bet-bg show through as a subtle separator between cards. Bigger fix: re-evaluate the mobile bg/card/border palette as a system.
- [x] **Player-prop button vig is washed out.** _Closed 2026-05-15 cont. 6: bumped `text-bet-text-xs` (#7a8a90) → `text-bet-text-sm` (#4a5a60) across `.ovig`, `.alt-pop-vig`, `.prop-alt-pop-vig`, `.mob-ovig`, `.mob-prop-vig`._ `.ovig` / `.pvig` / `.alt-pop-vig` / `.prop-alt-pop-vig` and their mobile twins use 10px `--color-bet-text-xs` (#7a8a90). Variant C (12px bold condensed line + 11px mono dark vig) was tried and reverted. Lighter-touch alternatives to try next: (a) just darken to `--color-bet-text-sm` (#4a5a60), no font/size change, (b) bump 10px → 11px without changing color/font, (c) both. Make each as a single one-line CSS change so the diff is easy to A/B.

## Deferred (note for later)

- [ ] If a CSP is ever added: replace all inline `onclick=` with `addEventListener` wiring at init.
- [ ] If self-hosting fonts becomes worthwhile, close the Google Fonts third-party seam.
- [x] **Rename misnomer tokens from the 2026-05-14 cyan switch.** _Closed 2026-05-18: 138 replacements across src/style.css, src/mobile/main.js, index.html, mockup-hold-display.html, logo_preview.html. `--color-bet-orange` → `--color-bet-accent`, `--color-bet-orange-dk` → `--color-bet-accent-dk`, `--color-bet-teal` → `--color-bet-brand`._ `--color-bet-orange` (now `#22d3ee` cyan-400) and `--color-bet-orange-dk` (now `#0891b2` cyan-600) are factually cyan but still named "orange". Same for `--color-bet-teal` (now `#2a5a78` cool steel — still teal-adjacent but no longer the original mid-teal). Suggested rename: `--color-bet-orange` → `--color-bet-accent`, `--color-bet-orange-dk` → `--color-bet-accent-dk`, `--color-bet-teal` → `--color-bet-brand` (or leave `-teal` if the steel-blue still reads close enough). Scope: every `bg-bet-orange` / `text-bet-orange` / `border-bet-orange` / `bg-bet-teal` / etc. reference across `src/*`, `verify/bundle.js`, and the `index*.html` files (60+ sites — do as a single safe-edit-driven find/replace pass, not piecemeal). Big diff, zero behavior change — defer until the misnomer actively confuses someone or until a third theme experiment forces semantic naming. Session log entry for 2026-05-14 (cont.) has the full rationale.
