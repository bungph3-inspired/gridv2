# Home view theme palettes — 2026-05-28

Source-of-truth tokens for the 4 home-view palette options explored during
the PR19–PR21 home-page sessions. Frozen here so a future Settings →
"Skin" picker can wire them up without re-deriving the colors.

Currently live: **B (dark navy)** matching the header `#172d33`.

Future direction: surface these as a player-selectable theme in the
Settings modal. Each palette is a complete token set (bg, surface,
border, two text levels, accent, off-season variants). A single
CSS class on `<body>` (e.g. `theme-b`) plus per-class overrides for
the `.hv-*` tokens is enough — no JS rebuild needed.

---

## Shared tokens (unchanged across all palettes)

| Token | Value | Used by |
|---|---|---|
| Accent (teal) | `#14b8a6` | Tile icon (active), hover border, BETSIM logo span |
| Off-season opacity | `0.5` | `.hv-tile-off` |
| Tile radius | `12px` | `.hv-tile` |
| Tile padding | `28px 20px` | `.hv-tile` |
| Tile gap | `16px` | `.hv-tiles` grid |
| Tile min-col | `220px` | `.hv-tiles` grid `repeat(auto-fit, minmax(...))` |
| Header font | Barlow Condensed 700 28px | `.hv-hdr`, `.hv-tile-name` (24px) |
| Hover lift | `translateY(-2px)` | `.hv-tile:hover:not(.hv-tile-off)` |

---

## A — Bright gray (initial PR19 implementation)

Clean, default web-app feel. Bright surface. Currently superseded by B
but useful as a "light mode" skin.

| Token | Value | Description |
|---|---|---|
| `#home-view` bg | `#f3f4f6` | Page surface (Tailwind gray-100) |
| `.hv-hdr` color | `#1f2937` | "Pick a sport" (gray-800) |
| `.hv-tile` bg | `#ffffff` | Tile background |
| `.hv-tile` border | `#e5e7eb` | Tile border (gray-200) |
| `.hv-tile-name` color | `#1f2937` | Sport name |
| `.hv-tile-count` color | `#6b7280` | Game count + "Off-season" |
| `.hv-tile-off .hv-tile-icon` | `#9ca3af` | Off-season icon |
| `.hv-foot` color | `#9ca3af` | Footer text |
| Hover shadow alpha | `0.15` | `rgba(20, 184, 166, 0.15)` |

Pros: high readability, easy on print/screenshots, looks like a clean
admin tool. Cons: jarring against the dark navy header — reads as two
stacked apps.

---

## B — Dark navy (current LIVE; PR20 + PR21)

Matches the header `#172d33` exactly so header → home → board flows as
one continuous brand color.

| Token | Value | Description |
|---|---|---|
| `#home-view` bg | `#172d33` | Same as header (per PR21) |
| `.hv-hdr` color | `#e6f0f2` | "Pick a sport" (pale cyan-tinted white) |
| `.hv-tile` bg | `#1f3b42` | Tile surface (one stop lighter than bg) |
| `.hv-tile` border | `#2a4d56` | Tile border (subtle teal-tinted gray) |
| `.hv-tile-name` color | `#f0f6f7` | Sport name (near-white) |
| `.hv-tile-count` color | `#a7c0c4` | Game count + "Off-season" |
| `.hv-tile-off .hv-tile-icon` | `#6b8a8f` | Off-season icon |
| `.hv-foot` color | `#6b8a8f` | Footer text |
| Hover shadow alpha | `0.25` | Bumped for dark-bg visibility |

Pros: brand-consistent, immersive, matches header. Cons: low light
environments may want even lower brightness.

---

## C — Azure literal blue (mockup only — not built)

Explored as a "lean into the literal Azure Sportsbook name" direction.
Diverges from the existing teal accent — would require rebranding the
header + buttons + tabs too, not just the home view.

| Token | Value | Description |
|---|---|---|
| `#home-view` bg | `#0b3556` | Deep azure (Tailwind blue-900 with extra blue) |
| `.hv-hdr` color | `#e6f0fb` | "Pick a sport" (pale blue-tinted white) |
| `.hv-tile` bg | `#134268` | Tile surface |
| `.hv-tile` border | `#1d567f` | Tile border |
| `.hv-tile-name` color | `#f0f6fd` | Sport name |
| `.hv-tile-count` color | `#aac4dd` | Game count + "Off-season" |
| `.hv-tile-off .hv-tile-icon` | `#708ea8` | Off-season icon |
| `.hv-foot` color | `#aac4dd` | Footer text |
| Accent override | `#38bdf8` | Sky blue (Tailwind sky-400) replaces teal |
| Logo "Sim" span color | `#38bdf8` | Match accent |

Pros: literal brand reinforcement, fresh look. Cons: full rebrand needed
(not just home view), loses the existing teal identity established
across the board.

---

## D — Slate charcoal (mockup only — not built)

Modern dev-tool dashboard aesthetic. Neutral dark, no brand color
commitment. Generic — loses the BetSim identity.

| Token | Value | Description |
|---|---|---|
| `#home-view` bg | `#0f172a` | Slate-900 |
| `.hv-hdr` color | `#e2e8f0` | "Pick a sport" (slate-200) |
| `.hv-tile` bg | `#1e293b` | Slate-800 |
| `.hv-tile` border | `#334155` | Slate-700 |
| `.hv-tile-name` color | `#f1f5f9` | Sport name (slate-100) |
| `.hv-tile-count` color | `#94a3b8` | Game count + "Off-season" |
| `.hv-tile-off .hv-tile-icon` | `#64748b` | Off-season icon |
| `.hv-foot` color | `#94a3b8` | Footer text |
| Accent override | `#2dd4bf` | Teal-400 (slightly brighter than `#14b8a6` for contrast on slate) |

Pros: clean, accessible, plays well with most monitors. Cons: looks
like every other admin UI — no distinctiveness.

---

## Implementation sketch for future skin picker

Settings modal already exists (see `index.html` `set-overlay`). Add a
new `set-row` with a 4-option select or radio group:

```html
<div class="set-row">
  <label for="theme-sel">Theme</label>
  <select id="theme-sel" onchange="setTheme(this.value)">
    <option value="b">Dark navy (default)</option>
    <option value="a">Light gray</option>
    <option value="c">Azure blue</option>
    <option value="d">Slate</option>
  </select>
</div>
```

Wire `setTheme(name)` in `main.js`:
```js
function setTheme(name) {
  document.body.classList.remove('theme-a', 'theme-b', 'theme-c', 'theme-d');
  document.body.classList.add('theme-' + name);
  localStorage.setItem('bs_theme', name);
  state.theme = name;
}
```

Boot it in `init()`:
```js
const saved = localStorage.getItem('bs_theme') || 'b';
setTheme(saved);
```

In `style.css`, scope each palette to its theme class:
```css
body.theme-a #home-view { background: #f3f4f6; }
body.theme-a .hv-hdr   { color: #1f2937; }
body.theme-a .hv-tile  { background: #ffffff; border-color: #e5e7eb; }
/* ...etc per palette... */
```

For C and D, the accent override means the header logo span and
LIVE-dot color also flip — those rules need to land in the body-theme
selector too.

---

## Cross-references

- PR19 `c29f00a` — initial home view + Option A
- PR20 `ce64c83` — swap to Option B
- PR21 (in flight) — fix bg to match header exactly
- `src/style.css` PR19 `.hv-*` block — current live tokens (Option B)
- `index.html` `set-overlay` — where the skin picker UI lands
