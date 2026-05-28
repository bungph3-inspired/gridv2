# 10. Add a New League

Step-by-step procedure for wiring a new tournament (league) end-to-end:
OddsPapi discovery → backend participant maps → frontend SPORT_CFG →
systemd env update. Captures every gotcha hit during the NBA + WNBA
wiring session (2026-05-28, PR #33 + PR #34).

Use this when: NHL Stanley Cup returns in fall, NCAAB March Madness
ramp-up, NFL preseason kicks off, or adding a new bookmaker market
filter for an existing tournament.

## TL;DR — 10-step checklist

1. **Probe** `/v4/tournaments?sportId=N` for the league's `tournamentId`.
2. **Probe** `/v4/participants?sportId=N` to dump all sport participants.
3. **Filter + classify** participants by team-mascot regex + cross-reference
   against `/v4/odds-by-tournaments?tournamentIds=<id>` active fixtures.
4. **Write** `api/src/data/<league>-participants.ts` (participant ID → ESPN abbr).
5. **Add entry** to `api/src/data/tournament-map.ts` `TOURNAMENT_MAP[<id>]`.
6. **Merge** the new participants into `api/src/routes/oddspapi.ts`
   `PARTICIPANTS_BY_SPORT[<sportId>]`.
7. **Frontend**: `src/state.js` (`SPORT_CFG` + `LEAGUES_LIST`),
   `src/api.js` (`getActiveSportKey`), `src/teams.js` (`TEAM_DATA` +
   `LEAGUE_ICONS`).
8. **PR** backend + frontend; merge to main.
9. **VPS**: pull main, rebuild api (`unset NODE_ENV && npm ci && npm run build`),
   append the tournament ID to `ODDSPAPI_TOURNAMENT_IDS` in `/etc/gridv2/env`.
10. **Restart** `gridv2-oddspapi.service` + `gridv2.service`; verify the
    first poll's `tournamentIds=[...]` line and a `psql` row for the new ID.

## Detail

### Step 1 — Tournament discovery

OddsPapi's `/v4/tournaments?sportId=N` returns hundreds of tournaments
per sport (5540 entries for basketball, 569 for sportId 11). Filter to
active (`upcomingFixtures > 0 OR liveFixtures > 0`) and look for the
league by `tournamentName` + `categorySlug='usa'`.

Reference probe (run on VPS as `gridv2`, so `ODDSPAPI_KEY` is in scope
after sourcing `/etc/gridv2/env`):

```bash
curl -sS -G "https://api.oddspapi.io/v4/tournaments" \
  --data-urlencode "sportId=$SPORT_ID" \
  --data-urlencode "apiKey=$ODDSPAPI_KEY" \
| jq '[.[] | select(.upcomingFixtures > 0 or .liveFixtures > 0)]'
```

OddsPapi sportIds we use:
| sportId | sport | Leagues |
|---|---|---|
| 11 | basketball | NBA (132), WNBA (486), NCAAB |
| 13 | baseball | MLB (109) |
| 14 | american-football | NFL, NCAAF |
| 15 | ice-hockey | NHL |

Free tier is rate-limited (~1 req/sec). Bake `sleep 1.5` between calls.

### Step 2-3 — Participant discovery + classification

`/v4/participants?sportId=N` returns the full sport catalog as a
`{id: name}` object. For basketball this is ~5540 entries (every team
worldwide). Two passes:

**(a) Dump + cache**. Hit `/v4/participants?sportId=N` once, save to
`/tmp/<sport>_participants.json`. This is the slow expensive call.

**(b) Classify offline**. Run a Python filter that walks the cache and
matches team-mascot patterns (`Celtics|Lakers|...` for NBA,
`Dream|Aces|Sky|...` for WNBA, etc.). Cross-reference with the live
fixture participant IDs from `/v4/odds-by-tournaments?tournamentIds=<id>`
to nail the gold-standard handful.

The 2026-05-28 session shipped `probe_basketball_participants.sh` +
`extract_basketball_teams.py` under `projects/GridV2/scripts/`. Copy
the pattern when adding the next sport.

### Step 4 — `<league>-participants.ts`

Follow the existing pattern (`api/src/data/mlb-participants.ts`,
`nba-participants.ts`, `wnba-participants.ts`):

```ts
// OddsPapi participant ID → ESPN-style 3-letter team abbreviation, <LEAGUE> only.
//
// Sourced <YYYY-MM-DD> from a one-shot dump of OddsPapi
//   /v4/participants?sportId=<N>
// run from the VPS with the production ODDSPAPI_KEY. Coverage: <K>/<K>
// confirmed against /v4/odds-by-tournaments?tournamentIds=<id> active fixtures.

export const <LEAGUE>_PARTICIPANTS: Record<number, string> = {
  <id>: "<ABBR>", // <Full Team Name>
  ...
};
```

Abbrs match ESPN (`NYY`, `KC`, `LAL`, `OKC`, etc.) and **must match the
slug column in `src/teams.js` `TEAM_DATA`**. The slug is the lowercase
abbr unless ESPN uses a quirk (e.g. NBA `LAL` slug `lal`, MLB
`Athletics` slug `oak`).

### Step 5 — `TOURNAMENT_MAP`

Edit `api/src/data/tournament-map.ts`:

```ts
<id>: {
  sportId: <N>,
  tournamentName: "<LEAGUE>",
  league: "<LEAGUE>",
  categorySlug: "usa",
  categoryName: "USA",
},
```

`tournamentName` is what the proxy returns to the frontend; `league` is
the canonical sport key (matches `SPORT_CFG.key`).

### Step 6 — `PARTICIPANTS_BY_SPORT` merge

`api/src/routes/oddspapi.ts`:

```ts
import { <LEAGUE>_PARTICIPANTS } from "../data/<league>-participants";

const PARTICIPANTS_BY_SPORT: Record<number, Record<number, string>> = {
  // Spread-merge when multiple leagues share an OddsPapi sportId.
  // Participant IDs are globally unique within OddsPapi, so safe.
  <sportId>: { ...EXISTING_PARTICIPANTS, ...<LEAGUE>_PARTICIPANTS },
  ...
};
```

NBA + WNBA share sportId 11 — `PARTICIPANTS_BY_SPORT[11]` spread-merges
both. ESPN abbrs *can* overlap (ATL Hawks vs ATL Dream); the frontend
disambiguates by active sport key.

### Step 7 — Frontend wiring

Three files:

**`src/state.js`** — add to `SPORT_CFG`:
```js
{ key:'<LEAGUE>', label:'<LEAGUE>', sportId:<N>, tournamentId:<id> },
```

And add `LEAGUES_LIST` entries (sidebar labels — purely cosmetic,
multiple labels can map to the same SPORT_CFG entry):
```js
{sport:'<LEAGUE>',name:'<LEAGUE> – Regular Season'},
{sport:'<LEAGUE>',name:'<LEAGUE> – Playoffs'},
```

**`src/api.js`** — add `getActiveSportKey` branch (order doesn't matter
unless there's a `startsWith` collision; check explicitly):
```js
if(state.activeLeague.startsWith('<LEAGUE>')) return '<LEAGUE>';
```

**`src/teams.js`** — add to `TEAM_DATA`:
```js
<LEAGUE>: [
  ["<Full Team Name>", "<slug>", "<ABBR>"],
  ...
],
```

And `LEAGUE_ICONS` (basketball / football / baseball / puck SVG mark):
```js
<LEAGUE>: _BASKETBALL,
```

### Step 8 — PRs

Split backend + frontend into two PRs unless the change is tiny. Use
short branch names (≤8 chars: `pr<N>`) to dodge the Cowork mount
HEAD-truncation bug.

**Safe push pattern** (avoids the 2026-05-28 token leak):
```bash
git push "https://x-access-token:${GH_TOKEN}@github.com/<owner>/<repo>.git" pr<N> 2>&1 \
  | grep -v 'x-access-token'
```

Do **not** use `git push -u` with a URL-embedded token — it persists
the token URL to `.git/config` AND echoes it on stdout.

### Step 9 — VPS env update

After the PRs merge to main, on VPS:

```bash
# As gridv2: pull + rebuild
cd /home/gridv2/repo
git fetch origin && git reset --hard origin/main
cd api && unset NODE_ENV && npm ci && npm run build

# As root: append the new tournament ID
sudo sed -i \
  's/^ODDSPAPI_TOURNAMENT_IDS=.*/&,<new_id>/' \
  /etc/gridv2/env
# Verify:
grep ODDSPAPI_TOURNAMENT_IDS /etc/gridv2/env
```

`/etc/gridv2/env` is mode `0640 root:gridv2`. Always use an atomic write
(`mktemp` + `awk` + `mv`) for non-interactive edits — sed `-i` is fine
for one-off appends but loses the mode/owner on cross-filesystem moves.

### Step 10 — Restart + verify

```bash
sudo systemctl restart gridv2-oddspapi.service gridv2.service
sleep 8
sudo systemctl is-active gridv2-oddspapi.service gridv2.service

# Look for the new tournamentIds in the first poll line:
sudo tail -n 25 /var/log/gridv2/oddspapi.log

# Confirm the DB:
sudo -u postgres psql gridv2 -c "
  SELECT tournament_id, sport, COUNT(*)
  FROM fixtures
  WHERE status IN ('open','live')
  GROUP BY tournament_id, sport
  ORDER BY tournament_id;
"
```

The poll worker fires once immediately on boot (`await runOnce(state)`
in `main()`) then every 5 min. The first cycle should show the new
`tournamentId` in the parsed-fixtures log line. The DB query should
show a row for the new tournament within ~15s of restart.

## Gotchas (2026-05-28)

1. **The poller is `gridv2-oddspapi.service`, not `gridv2.service`.** The
   latter is the Hono API. Restarting only the API picks up new
   `TOURNAMENT_MAP` + `PARTICIPANTS_BY_SPORT` (since both modules are
   imported by the proxy route), but doesn't refresh the poll worker's
   tournament list. **Restart both.**

2. **`ODDSPAPI_TOURNAMENT_IDS` lives only in `/etc/gridv2/env`** as of
   2026-05-28. The earlier `Environment=ODDSPAPI_TOURNAMENT_IDS=109`
   line in the unit file was removed — it shadowed the env file.
   Single source of truth.

3. **`NODE_ENV=production` is set in `/etc/gridv2/env`.** After
   `source /etc/gridv2/env`, `npm ci` / `npm install` skip devDeps
   (including `tsc`). Always `unset NODE_ENV` before rebuilding.

4. **Local Cowork clone is display-only.** All git work happens on the
   VPS at `/home/gridv2/repo`. Never trust the local clone's contents;
   trust GitHub MCP or VPS state.

5. **OddsPapi free tier rate limit** (~1 req/sec per endpoint). Probes
   that hit multiple sports in a loop need `sleep 1.5` between calls or
   a 429 retry handler.

6. **`/v4/participants?sportId=N` response is an object map**
   (`{id: name}`), not an array of objects. jq filters like
   `.[].participantId` blow up. Use `to_entries` or write Python.

7. **NBA + WNBA share OddsPapi sportId 11.** Different leagues can
   share a sportId. `PARTICIPANTS_BY_SPORT` keys by sportId, so
   spread-merge per-league maps: `11: { ...NBA, ...WNBA }`.

8. **Logo PNGs are bundled separately.** Adding `TEAM_DATA` entries
   doesn't ship logos; the board uses monogram fallback until
   `scripts/fetch_logos.py` is extended + run for the new slugs.

9. **`src/api.js` `startAuto`** previously only auto-refreshed NBA +
   MLB; other sports went stale until manual refresh. Fixed in PR #34
   (2026-05-28) — active sport now always refreshes + NBA/MLB warm in
   background.

10. **Build artifact lives at `api/dist/`.** Source is `api/src/`. The
    systemd ExecStart points at `dist/workers/oddspapi-poll.js` (poll
    worker) and `dist/index.js` (API). Rebuild before restart on any
    backend change.

## Reference — NBA + WNBA wiring lineage (2026-05-28)

| Step | Artifact |
|---|---|
| Backend PR | #33 — squash `c29f00a` |
| Frontend PR | #34 — squash `fd3406f` |
| Env update | `/etc/gridv2/env: ODDSPAPI_TOURNAMENT_IDS=109,132,486` |
| Unit edit | `/etc/systemd/system/gridv2-oddspapi.service` — removed `Environment=ODDSPAPI_TOURNAMENT_IDS=109` |
| First poll | `[oddspapi-poll] starting — tournamentIds=[109,132,486], dryRun=false` → `poll #1 fixtures=19 markets=615 prices=1230` |

Helper scripts (local workspace, **not in repo**):
`projects/GridV2/scripts/probe_tournaments.{ps1,sh}`,
`probe_basketball_participants.{ps1,sh}`,
`extract_basketball_teams.{ps1,py}`,
`pr12_patch.sh`, `pr13_patch.sh`,
`update_oddspapi_tournament_ids.{ps1,sh}`,
`pr14_fix.{ps1,sh}`,
`diag_poll_worker.{ps1,sh}`.

Copy/adapt for the next league.
