# Tailwind v4 — quick reference for GridV2

A focused tour of what changed from v3 → v4 and how this project uses it. Read alongside `src/style.css` to see each concept in real code.

---

## 1. The mental model shift

**v3:** JavaScript config (`tailwind.config.js`) defines tokens. PostCSS pipeline. `@tailwind base/components/utilities` directives.

**v4:** Everything lives in CSS. One `@import "tailwindcss"`. Tokens go in an `@theme` block. The Vite plugin handles the rest.

If you only remember one thing: **`@theme` is your design system**, and every CSS variable inside it auto-generates utility classes.

---

## 2. The four pieces of `src/style.css`

### a. `@import "tailwindcss";`
Pulls in the v4 engine plus the full default utility set. This single line replaces v3's three `@tailwind` directives.

### b. `@theme { --token: value; }`
The config-as-CSS block. Naming rule:

| Variable name pattern | Generates utilities |
|---|---|
| `--color-<name>` | `bg-<name>`, `text-<name>`, `border-<name>`, `fill-<name>`, etc. |
| `--font-<name>` | `font-<name>` |
| `--spacing-<name>` | `p-<name>`, `m-<name>`, `gap-<name>`, `w-<name>`, `h-<name>` |
| `--text-<name>` | `text-<name>` (font-size + line-height) |
| `--radius-<name>` | `rounded-<name>` |
| `--breakpoint-<name>` | `<name>:` responsive prefix |
| `--animate-<name>` | `animate-<name>` |

Look at `style.css` line ~50 for GridV2's full token block. Compare to v1's `:root` block — same values, renamed for the v4 generator.

### c. `@layer base { ... }`
Element-level resets and defaults. GridV2 uses it for `html, body` height/font/overflow defaults.

### d. `@layer components { ... }` with `@apply`
Reusable component patterns. Use when a chain of utilities repeats more than ~3 times. v1's `.obtn`, `.pbtn`, `.gblock` all live here.

```css
/* Instead of writing this on every odds button: */
<button class="bg-white border border-bet-border rounded-[3px] px-2 py-[3px] font-body text-[11px] text-bet-text cursor-pointer ... ">

/* Define once, use the short class everywhere: */
@layer components {
  .obtn { @apply bg-white border border-bet-border rounded-[3px] ...; }
}
```

---

## 3. Things that vanished from v3

| v3 thing | v4 replacement |
|---|---|
| `tailwind.config.js` | `@theme { ... }` in CSS |
| `content: ['./src/**/*.html']` | Auto-detected by Vite plugin |
| `@tailwind base; @tailwind components; @tailwind utilities;` | `@import "tailwindcss";` (one line) |
| `postcss.config.js` | Not needed — `@tailwindcss/vite` is the pipeline |
| `theme.extend.colors = {...}` | `--color-foo: #...;` inside `@theme` |

---

## 4. Useful arbitrary syntax (still works, comes up a lot)

When a value isn't in your theme, square brackets escape into raw CSS:

```html
<div class="text-[13px]">          <!-- font-size: 13px -->
<div class="bg-[#172d33]">          <!-- raw hex -->
<div class="grid grid-cols-[220px_1fr_1fr_1fr_1fr]">  <!-- raw grid template -->
<div class="min-w-[900px]">         <!-- raw min-width -->
```

If you find yourself reaching for arbitrary values for the same value 3+ times, that's a cue to add a token in `@theme`.

---

## 5. The discipline: when to use what

**Use a `@theme` token + utility class** for anything *visible and identity-defining* (colors, fonts, brand spacing). This keeps GridV2 looking like itself.

**Use stock Tailwind utilities** (`gap-2`, `mt-4`, `flex`, `grid-cols-2`) for one-off layout. Don't tokenize what you only use once.

**Use `@apply` components** for repeated UI patterns (buttons, cards, modal containers). Saves you from 200-character class strings and makes design changes a one-line edit.

**Avoid:** reaching for Tailwind's stock color palette (`slate-500`, `gray-200`, `blue-600`) on identity surfaces. That's the path to generic-looking AI-built dashboards. GridV2's identity comes from `bet-darker`, `bet-orange`, Barlow Condensed — keep them tokenized and visible in `@theme`.

---

## 6. Vite-specific gotchas in this project

**ES module globals.** v1 had everything in inline `<script>`, so functions defined at top level were globals. v2's `main.js` is an ES module, so `function setMode(){}` is *not* a global. Inline `onclick="setMode('straight')"` would break. Fix: at the bottom of `main.js`, every function called from inline handlers is explicitly attached to `window` via `Object.assign(window, _expose)`. If you add a new inline handler, add the function to that list.

**Public folder.** Anything in `public/` is served from the site root in dev and copied to `dist/` on build. That's where `mock_data.js` lives — `<script src="/mock_data.js">` works in both dev and prod.

**HMR (hot module reload).** Save any file → browser updates without full reload. CSS edits are nearly instant. Try it: change `--color-bet-orange` and watch every orange surface update live.

---

## 7. What a typical edit cycle looks like

1. Want to add a new bet type tab style? Add `.btab.is-new {@apply ...}` in `style.css` under `@layer components`.
2. Want to tweak the brand orange? Change `--color-bet-orange` in `@theme` — every utility using it updates.
3. Want a new spacing token? `--spacing-foo: 7px;` in `@theme`, then `p-foo`, `m-foo`, `w-foo`, etc. work everywhere.
4. Want a one-off layout fix in HTML? Inline utilities are fine — `class="flex gap-2 items-center"`.

---

## 8. ES module split (2026-05-10)

main.js grew past ~1400 lines and started hitting Edit-tool truncation. Split into 5 files:

| File | Purpose | Lines |
|---|---|---|
| `state.js` | Single `state` object + immutable configs (SPORT_CFG, TEASER_VARIANTS, etc.) | ~155 |
| `utils.js` | Pure functions: odds math, formatters, escapeHtml | ~90 |
| `api.js` | OddsPapi + mock + refresh cycle + status | ~335 |
| `bets.js` | All bet-type logic (parlay/teaser/ifbet/straight/settle/my-bets) | ~645 |
| `main.js` | Entry + board renderers + settings + UI helpers + init + expose | ~355 |

**State-sharing pattern.** All 23 mutable variables live in one `state` object exported from `state.js`. Every module imports `state` and reads/writes via `state.X`. Arrays and objects mutate in-place (live bindings handle propagation); primitives are reassigned directly (`state.balance -= risk`). No setters needed.

**Avoiding circular imports.** Board renderers (`renderBoard`, `buildGameBlock`, `showBoardMsg`, `showToast`, `updateBalDisp`) live in `main.js`. Both `api.js` and `bets.js` need to call them. Direct imports from main.js would create a circular dep (main → api → main). Solution: a hook pattern. `api.js` and `bets.js` each export a `setApiHooks()` / `setBetsHooks()` function that main.js calls during boot. Internally those modules use placeholder closures (`let _renderBoard = () => {};`) that the hook setter overwrites. Clean, no circular import, no module-load order issues.

**Why no `export default`?** Named exports are easier to audit. When `main.js` imports `{ setMode, onContinue, ... } from './bets.js'`, you can see every cross-module name in one place. With default exports you'd lose that visibility.

**Inline `onclick` handler caveat.** ES modules don't auto-globalize top-level declarations like a classic `<script>` does. Any function called from `onclick="..."` in `index.html` must be explicitly attached to `window` — handled in main.js's `Object.assign(window, { ... })` block at the bottom.

## 9. Useful links

- [Tailwind v4 docs](https://tailwindcss.com/docs/installation/using-vite)
- [v4 upgrade guide](https://tailwindcss.com/docs/upgrade-guide) — see what changed from v3
- [Vite docs](https://vite.dev/guide/) — dev server, build options, env vars
- The original BetSim v1 (`projects/BetSim/`) is the legacy visual reference. v2 should match it pixel-for-pixel until improvements are intentional.
