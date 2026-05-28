# GridV2 — Open Threads

> Split out from workspace `CLAUDE.md` on 2026-05-24 to keep that file lean. This file holds the live GridV2 implementation state; workspace CLAUDE.md retains only a one-line pointer.

---

## Phase 0 — COMPLETE 2026-05-23

All eight items resolved or deferred.

**Done:**
- (a) Max 20x upgrade
- (b) Runbook 06 executed (Claude Code runtime on VPS)
- (c) **Runbook 07 EXECUTED end-to-end** — agent fleet operational + Phase G smoke test passed (Architect filed issue #4 in 35s, Coder opened PR #5 in 45s with `npm ci && build` green, Reviewer left comment-only review in 56s; total compute 2m 16s). Fleet currently **kill-switched** (`/etc/gridv2/agents.paused` armed) pending real-spec go-live.
- (d) OddsPapi purchased + integrated
- (e) AUTH_DESIGN.md LOCKED
- (f) Apex `azuresb.com` runbook expanded — manual Cloudflare dashboard execution still pending (John drives any time, no code coupling)

**Deferred:**
- (g) `anthropic-bug-report` files in GridV2 root — uninvestigated
- (h) Revisit teammate decision post-MVP

**Go-live procedure when ready:** drop `/specs/YYYY-MM-DD-night.md` on main + `rm /etc/gridv2/agents.paused` on VPS. Next 11pm PT cron tick (Architect) will fire.

---

## Phase 1 — In Progress (runbook 08, auth implementation per AUTH_DESIGN.md)

Sessions 2026-05-23 cont 2/3/4 scaffolded the runbook + executed Phases A/B/C code-only (9 endpoints, tsc + build clean).

### 2026-05-24 — Phase A + Phase D.1/D.2/D.3 DONE end-to-end locally

- Postgres 16.14 installed on Windows (matched VPS prod)
- A.3 migration + `has_children` trigger applied to `gridv2_dev`
- A.7 case 1 confirmed
- Phase B + C runtime smoke = **11/11 pass** (login + cookie + `/api/me` + create-child + has_children-trigger + 404 leak + downline-CTE + logout + stale-cookie-401)
- **bigint serialization fix** landed in `listDownline()` via `normalizeRow` helper (both list endpoints now return numeric ids)
- **Phase D frontend cutover:** NEW `src/agent-api.js` (shared apiFetch/apiBase/getMe/setMe), REWROTE `src/agent-main.js` (real `/api/login` + `/api/me` flow replacing bs_agent localStorage gate), REWROTE `agent.html` (GridV2 brand + error slot), added Vite dev proxy for same-origin `/api` in dev
- **Phase D.3 admin panel:** Subagents tile + 241-line subagents subview in `src/agent.js` covering create form (POST `/api/agents`), children/downline table with depth indent, per-row Reset PW / Disable|Enable / Unlock actions via PATCH, scope toggle children↔downline
- Spec divergence locked: admin panel always-visible (not gated on `has_children`, since that creates a catch-22 for fresh agents)
- Browser smoke = **11/11 pass**: hard-refresh splash, login, tile, dup-username 409, regex client-fail, disable/enable round-trip, pw reset verified via re-login, downline toggle with grandchild renders indented tree

### Remaining in Phase 1

- A.7 cases 2-4 (non-blocking)
- ~~A.8 commit through protected-main PR~~ — **DONE 2026-05-25 cont** (PR #8 squash-merged as commit `3d7cfad` — previous session's "merged" claim was wrong, see correction below)
- ~~VPS-side Phase A walkthrough~~ — **DONE 2026-05-25 cont** (migration applied, MASTER seeded as Pisa id=1, password cleared from env, `/health` 200 stable)
- ~~Phase B/C end-to-end smoke against prod~~ — **DONE 2026-05-25 cont 2** (all 6 surfaces green on both localhost + api.azuresb.com; see entry below)
- ~~D.5 401 interceptor~~ — **DONE 2026-05-28** (PR #29 squash-merged as commit `f0bcc30` — adds 401 interceptor in src/api.js that redirects to /agent.html?expired=1 instead of bubbling as console error)
- ~~D.6 `verify_agent.cjs` update~~ — **DONE 2026-05-25 (already in tree from recovery, 6/6 verify pass)**
- ~~D.7 commit Phase D as PR~~ — **DONE 2026-05-25 (PR #7 squash-merged)**
- Phase E integration tests + manual e2e

### 2026-05-25 — D.6, D.7, A.8 shipped + Cowork mount lessons

**Three PRs merged to main today:**
- PR #7 (squash) — Phase D frontend cutover (10 files, +962/-102)
- PR #8 (squash) — Phase A/B/C backend (22 files, +2315/-1356) — **see 2026-05-25 cont correction: this claim was false at wrap-up time; PR #8 was not actually squash-merged until 2026-05-25 cont**
- Plus the CSS fix folded into #7

**Cowork mount fragility encountered (memories saved):**
- `.git/HEAD` corruption — stray trailing NULL byte caused "branch appears to be broken". Fix: `git symbolic-ref HEAD refs/heads/<branch>`. See `[[feedback_head_null_byte_corruption]]`.
- Phantom `.git/index.lock` — FUSE held a file Windows couldn't see. Fix: PowerShell `New-Item -Force` then `Remove-Item -Force` to materialize+delete. See `[[feedback_cowork_phantom_lock_files]]`.
- `src/style.css` recovery splice — the 18 `.ag-sa-*` rules from yesterday's recovery had been inserted INTO the opening doc comment instead of inside `@layer components { ... }`. Nested `/*` confused the CSS parser → `Missing opening {`. Caught by CI on PR #7, fixed by relocating the rules.

**Auto-merge fleet-logs workflow finally working** — the `GH_PAT_FLEET_LOGS` secret was set 2026-05-23 with the `github_pat_` prefix dropped during paste (`[[feedback_gh_token_paste_prefix]]`). Re-pasted with full prefix on 2026-05-25, workflow now ff-merging cleanly on its 12:30/13:30 UTC schedule. Merger PAT expiry now tracked in `[[reference_gridv2_fleet_operational]]` (rotate with `gridv2-fleet` on 2026-08-21).

### New open items uncovered today

- **Branch-protection ruleset audit** before agent-fleet go-live. The "Review required" block on PR #7 came from a **Ruleset** (newer system at Settings → Rules → Rulesets), not the classic Branch rule (which had "Require a pull request" already unchecked). John disabled the rule to merge. Agents will trip on whatever ruleset still requires reviews — audit + carve out before flipping the kill switch. (PR #8 squash-merged via `mcp__github__github_merge_pull` on 2026-05-25 cont without a ruleset block — verify state is consistent before fleet go-live.)
- **CI gap: `api/` never typechecked or tested by `.github/workflows/ci.yml`** — only the frontend `vite build` runs. PR #8 got green CI without exercising any backend code. Should add an `api/` job that runs `npm ci && npm run build` (tsc) at minimum. Ideally a Postgres-backed smoke that exercises login + create-child + downline.
- **PROJECT.md / SESSION_LOG.md docs PR still overdue.** Local Cowork clone has CRLF line endings vs LF in origin/main, producing ~550 line/550-line noise diffs that make any PR review impossible. Worth a dedicated CRLF→LF normalization PR (set `.gitattributes` `* text=auto eol=lf`, `git add --renormalize .`, commit, push) before adding more content to these files. Today's session log entries can land in that PR.
- **App stdout missing from journald.** During VPS Phase A walkthrough, `journalctl -u gridv2` showed systemd lifecycle messages but **no `console.log` / `console.error` from the API itself** — including the expected `[seedMaster]` lines. Service stability had to be inferred from absence of `Failed with result 'exit-code'`. Check whether `gridv2.service` is missing `StandardOutput=journal` / `StandardError=journal`, or whether the API never writes to console. Low urgency (Phase A succeeded) but blocks debugging future boot failures.

### 2026-05-25 cont — VPS Phase A walkthrough complete + PR #8 verification lesson

**What shipped to prod:**
- PR #8 actually squash-merged (commit `3d7cfad`) — previous session's "PR #8 merged" claim was wrong (see correction below)
- `0000_auth_bootstrap.sql` applied to prod `gridv2` Postgres via `npm run db:migrate` (drizzle-kit). `agents` + `sessions` tables, `has_children` trigger + function, `master_no_parent` CHECK constraint all present.
- MASTER row seeded: `id=1, username=Pisa, parent_id=NULL, created_by=NULL, has_children=false, failed_logins=0, password_hash` argon2id 97 chars, `created_at` 2026-05-25 22:53:42+00 (15:53 PST)
- `MASTER_PASSWORD` cleared from `/etc/gridv2/env` post-seed (per runbook §A.7 step 4); only `MASTER_USERNAME=Pisa` remains. Service restart confirmed no re-seed (active, no failure lines).
- `https://api.azuresb.com/health` returns 200.

**Correction to previous wrap-up:** OPEN_THREADS and the 2026-05-25 session note both claimed "PR #8 squash-merged" but the PR was actually still **open** when this session resumed. VPS `git pull` brought down PR #7 (frontend) but no `api/` files, exposing the lie. Always verify via `mcp__github__github_get_pull` before acting on a "PR merged" claim. Memory saved: `[[feedback_pr_merge_verification]]`.

**Env file paste hazard encountered:** First nano edit of `/etc/gridv2/env` saved `MASTER_PASSWORD=` with empty value (paste didn't land, or save fired before paste completed). Boot loop with `MASTER absent, MASTER_PASSWORD not set — refusing to start.` Fix: replace nano with `read -rs` + `sed` + `tee -a` flow that goes through bash variable expansion (handles `!`, `#`, `$`, spaces literally and never touches shell history). Worth promoting to a runbook 08 sub-section if we add another env secret later.

**Edit-tool truncation re-confirmed:** while writing this OPEN_THREADS update, the Cowork Edit tool silently truncated the file from ~108 lines to 64 lines (cut off mid-word "Merg" on the `Auto-merge fleet-logs` line). Recovered via `bash scripts/safe-edit.sh OPEN_THREADS.md --rewrite /tmp/<full>.md`. Re-confirms `[[feedback_cowork_edit_truncation]]`; use safe-edit.sh for any non-trivial OPEN_THREADS / PROJECT.md / SESSION_LOG.md edit.

### 2026-05-25 cont 2 — Phase B/C end-to-end smoke against prod (all green)

**Surfaces validated** (both localhost:3000 and https://api.azuresb.com):
- `POST /api/login` (Pisa, correct password) → **200** with `{ok:true}` + Set-Cookie
- `GET /api/me` → **200** with full Pisa row (`has_children:true` once children exist)
- `POST /api/agents` (create child) → **201** with new row
- `GET /api/agents?scope=children` → **200** with array, `depth:1` on each child
- `GET /api/agents?scope=downline` → **200** (same one-level result with only direct children present; CTE not deep-tested yet)
- `POST /api/logout` → **204**
- Stale-cookie `GET /api/me` → **401** `{"error":"unauthenticated"}`
- Stale-cookie `GET /api/agents` → **401**

**Cookie attrs verified (api.azuresb.com response headers):**
```
set-cookie: gridv2_session=<hex>; Path=/; HttpOnly; Secure; SameSite=Lax
```
Matches AUTH_DESIGN §4 exactly. No `Max-Age` (session cookie). Cloudflare passes the cookie through untouched.

**Ingress chain discovered:** `via: 1.1 Caddy` header on every response. Real chain is Cloudflare → Caddy (probably on VPS port 80/443) → Node API on `:3000`. Worth a memory entry — wasn't documented in runbooks 01-03 IIRC.

**PR #8 description vs runbook 08 §C.3** — first prod-smoke attempt 404'd on `/api/agents/children` because I trusted the PR #8 bullet-pointed paraphrase ("`GET /api/agents/children` — direct children") over the actual runbook spec. **Runbook 08 §C.3 correctly says `GET /api/agents?scope=children|downline` and the implementation matches.** Only the PR description used the misleading shorthand. No code or runbook fix needed; just a future-reader trap in the squash commit's body (which is immutable post-merge). Lesson: trust the runbook spec over the PR description when they conflict.

**Failed login = 401 root cause:** First public-path login attempt 401'd because the originally-seeded password (the user-chosen passphrase pasted via the `read -rs` flow) didn't match what was typed at the curl prompt. Re-seeded with clean ASCII `Pisa20260525test` via the seedMaster reset path (set `MASTER_PASSWORD` → restart → clear → restart). Login worked on the next attempt. Cause was likely typo, not env-file parsing or auth code bug — clean ASCII + retry isolated it cleanly. **`failed_logins` counter increment behavior on 401 NOT verified this session** — worth a follow-up smoke (try wrong password 5x against `smoketest1`, confirm lock at 5).

**Test data left in prod db:**
- `id=2, smoketest1, parent_id=1, password=ChildPw123`
- `id=3, smoketest2, parent_id=1, password=ChildPw456`
- Pisa `has_children=t` now (trigger fired on first child create)
- Master password is currently `Pisa20260525test` — **rotate before any real users land**

**MASTER password rotation procedure (validated this session):**
```
echo "MASTER_PASSWORD=<new>" | sudo tee -a /etc/gridv2/env >/dev/null
sudo systemctl restart gridv2   # triggers reset path
sudo sed -i '/^MASTER_PASSWORD=/d' /etc/gridv2/env
sudo systemctl restart gridv2   # confirm no-op seed
```

---

## 2026-05-24 — DATA LOSS + FULL RECOVERY

Late-day commit-prep session triggered the Cowork mount branch-name truncation bug (`[[feedback_branch_name_truncation]]`), which created an orphan HEAD. Recovery commands included `git checkout -f main` (`[[feedback_git_checkout_f_destroys_work]]`) which discarded every uncommitted modification — Phase A + Phase B/C + Phase D code all gone from the working tree.

Reconstruction completed end-to-end via session-transcript forensics:
- `tmp/` files for Phase A+B+C backend
- Bash-heredoc extraction from `local_ff3b0cce` session JSONL for Phase D (`[[feedback_safe_edit_bash_heredoc_recovery]]`)
- `agent.js` subagents subview, `.ag-sa-*` CSS, vite proxy, argon2 dep, `agent-main.js`, `agent.html` all restored byte-for-byte against expected sizes

`verify/check_integrity.cjs` passes; `npm install` regenerated `package-lock.json`. **All Phase D markers verified present.**

---

## Active memories referenced

- `[[feedback_powershell_curl_http_smoke]]`
- `[[feedback_no_prod_token_screenshots]]`
- `[[feedback_cowork_edit_truncation]]`
- `[[feedback_git_checkout_f_destroys_work]]`
- `[[feedback_branch_name_truncation]]`
- `[[feedback_safe_edit_bash_heredoc_recovery]]`
- `[[feedback_pr_merge_verification]]`
- `[[feedback_cowork_phantom_lock_files]]`

## Local dev env

- Postgres `gridv2_dev` on `localhost:5432`
- MASTER = `Pisa/temp1234`
- API on `:3000`, Vite on `:5173` with `/api` proxy

## Prod state (2026-05-25 cont 2)

- API: `https://api.azuresb.com` (Cloudflare → Caddy → Node on `:3000`)
- DB: Postgres `gridv2` on VPS localhost
- MASTER: `Pisa` — password rotated 2026-05-26 (stored in password manager; never logged in chat or session notes)
- API logs: `/var/log/gridv2/api.log` (stdout) + `/var/log/gridv2/api.err.log` (stderr) — written via systemd `StandardOutput=append:` directives in `/etc/systemd/system/gridv2.service`. Logrotate active via `/etc/logrotate.d/gridv2` (weekly, 4 weeks retention, compress+delaycompress, copytruncate).
- Children present: `smoketest1 (id=2)`, `smoketest2 (id=3)` — leave for now per 2026-05-25 cont 2 cleanup decision; delete during pre-launch sweep
- Service unit: `/etc/systemd/system/gridv2.service` with `EnvironmentFile=/etc/gridv2/env` + `ExecStart=/usr/bin/node /home/gridv2/repo/api/dist/index.js`

## Next session candidates

1. **Phase E test harness** — regression coverage for the auth flow (login, `/api/me`, create-child, downline CTE, logout, lockout, unlock). Scope first: runner choice (vitest / node:test / playwright?), VPS-driven or CI-driven, db fixture strategy. Promoted to top now that CRLF, audit, CI api/ job, and logrotate all shipped.
2. **agent-*.log cleanup policy** — `/var/log/gridv2/agent-YYYY-MM-DD.log` files self-rotate via date-stamped filenames but never get deleted. Add `find -mtime +30 -delete` cron or extend the logrotate stanza with daterotate/dateformat. Low urgency (~9 KB total today).
3. **Optional protection hardening** — require PR reviews (when collaborators join), enable admin enforcement, signed commits. All deferred since solo dev.

## 2026-05-26 — MASTER password rotation + lockout counter verified

- MASTER password rotated via the seedMaster reset path (set env var → restart → clear env var → restart). Service stayed active through both restarts.
- New password stored in John's password manager; never logged.
- Login with new password against api.azuresb.com → 200. Login with old password → 401 (after a one-off transient 404 from Cloudflare — not reproduced on retry against either the public surface or localhost, no failed_logins increment for that one).
- `failed_logins` counter behavior verified: increments by 1 per real auth failure that reaches the handler. Reset to 0 manually after smoke (Pisa was at 2/5).
- Source-read of `api/src/routes/auth.ts` confirms the login handler returns only **400/401/423/200** — no 404 in the handler. The transient 404 was edge / proxy noise.


## 2026-05-26 cont — Lockout smoke + unlock flow validated

- 5x wrong-password attempts against `smoketest1` → all returned HTTP 401 `{"error":"unauthenticated"}`. `failed_logins` counter incremented 0→5 across the attempts, `locked_at` set to NOW() on attempt 5 (per `auth.ts` line 100: `nextCount >= 5 ? new Date() : null`).
- Correct password against locked account → HTTP 423 `{"error":"locked"}`. The lockedAt check at `auth.ts:80` returns 423 **before** verifying the password, so attackers can't burn additional attempts after lockout.
- Logged in as Pisa, `PATCH /api/agents/2/unlock` → HTTP 204. `requireDescendant()` middleware allowed Pisa to unlock smoketest1 (parent → child).
- Post-unlock psql state: `failed_logins=0`, `locked_at=null` — both reset.
- smoketest1 re-login with correct password → HTTP 200 `{ok:true}`. Full cycle validated end-to-end on `api.azuresb.com`.


## 2026-05-26 cont 2 — Logging "blind spot" was actually a documentation gap

Investigating the "app stdout missing from journald" thread revealed `gridv2.service` is set with `StandardOutput=append:/var/log/gridv2/api.log` and `StandardError=append:/var/log/gridv2/api.err.log` — logs were captured the entire time, just to files instead of journald. Files contain everything: the original Phase A seed, the early empty-`MASTER_PASSWORD` boot loop (20+ "refusing to start" lines in api.err.log), every "MASTER present, no seeding action" no-op, both password reset paths fired today.

**Decision:** keep file-based logging (no unit change). Document the paths in prod-state above. Debug command going forward: `sudo tail -f /var/log/gridv2/api.log` (or `api.err.log`).

**Follow-up filed:** logrotate config — files currently 4 KB each but no rotation in place; left untouched they'll grow indefinitely.

## 2026-05-26 cont 3 — VPS-only pivot, branch protection audit, CI api/ job, logrotate installed

**Big decision: local Cowork clone is now display-only for GridV2 git work.** Today's PR #14 wrap-up surfaced silent FUSE truncation on `git checkout` / `git reset --hard` — `OPEN_THREADS.md` came back 174/202 lines despite a clean `git status`. Same family as `[[feedback_cowork_edit_truncation]]` but bites git, not the Edit tool. New memories: `[[feedback_cowork_git_checkout_truncation]]` + `[[feedback_gridv2_vps_only_git]]`. Going forward: all GridV2 git ops happen on `/home/gridv2/repo` (VPS); local clone is read-only context. Pure repo-side work (branch protection, PR ops, file fetches) can use GitHub MCP. The Cowork sandbox can't SSH to the VPS — John runs VPS commands from PowerShell.

**Branch-protection audit (VPS curl against GitHub API):**
- Classic protection on `main` (no rulesets configured).
- Required check: `build-and-test`, strict (up-to-date branch required before merge).
- Force-push: blocked. Deletion: blocked. Conversation resolution: required before merge.
- Required PR reviews: **none configured** — self-merge allowed (acceptable solo; flag when collaborators join).
- Admin enforcement: off. Signed commits: not required. Linear history: not required.
- PAT scope lesson: `Administration: Read` lets you audit, `Administration: Read and write` lets you PATCH. Fine-grained PATs split Read/Write per permission. Memory updated: `[[feedback_pat_workflow_scope]]`.

**PR #15 (squash-merged as `cfd61e6`): CI `api/` job.** Adds `api (build)` as a parallel job to `.github/workflows/ci.yml`. Scoped npm cache key on `api/package-lock.json`. Existing `build-and-test` job unchanged in name (preserves the required-check binding). All three checks (`build-and-test`, `api (build)`, Cloudflare Pages) green on the merge-triggered run. PATCHed `required_status_checks` to include `api (build)` alongside `build-and-test`.

**Logrotate installed** at `/etc/logrotate.d/gridv2`. Weekly rotation, 4 weeks retention, `compress` + `delaycompress`, `missingok` + `notifempty`, **`copytruncate`** (chosen over postrotate-restart because systemd's `StandardOutput=append:` holds the fd open for the service lifetime — `copytruncate` preserves the fd, no service blip). Force-rotate validated: `.1` files created with original sizes, originals truncated to 0, service still `active`.

**Workflow tooling lessons:**
- PowerShell here-strings piped through ssh hang forever if the SSH key has a passphrase — stdin is the pipe, so ssh can't read passphrase from the terminal. Fix: encode the script as base64 and pass as a single ssh command argument (no stdin pipe). ssh-agent would also work but needs Administrator to enable on Windows.
- The `gridv2` user has no sudo. `ssh root@VPS` directly for any system admin work. New memory: `[[reference_gridv2_vps_ssh_users]]`.

**Follow-up filed:** agent fleet logs at `/var/log/gridv2/agent-YYYY-MM-DD.log` self-rotate via date-stamped filenames but never get deleted. Add `find -mtime +30 -delete` cron or extend the logrotate stanza with daterotate/dateformat. Low urgency (~9 KB total).
## 2026-05-28 — Tournament wiring (NBA + WNBA) + token rotation + doc preempt

**4 PRs squash-merged to main (PR # → repo PR # → commit):**

| Session PR | Repo PR | Commit | Title |
|---|---|---|---|
| PR11 | #32 | `07c52d4` | strip dead `state.apiKey` paths + remove unreachable 'key' splash |
| PR12 | #33 | `c29f00a` | NBA + WNBA backend (participants maps + TOURNAMENT_MAP + PARTICIPANTS_BY_SPORT merge) |
| PR13 | #34 | `fd3406f` | WNBA frontend (SPORT_CFG, LEAGUES_LIST, getActiveSportKey, teams.js) + bonus `startAuto` fix |
| PR15 | #35 | `c33bef7` | `runbooks/10-add-league.md` (preempt — closes Tournament wiring umbrella) |

**VPS-side changes (no PR; deploy steps):**
- Fleet `GH_TOKEN` rotated. Old PAT leaked via `git push -u "https://x-access-token:$TOKEN@github.com/..."` — the `-u` flag persisted the token URL to `.git/config` AND git's success line printed it. New PAT generated, env file updated, `.git/config` scrubbed (5 branch URLs across pr7/pr8/pr9/pr10/pr11), old PAT revoked before rotation.
- `/etc/gridv2/env`: appended `ODDSPAPI_TOURNAMENT_IDS=109,132,486` (NBA + WNBA + existing MLB).
- `/etc/systemd/system/gridv2-oddspapi.service`: **removed** `Environment=ODDSPAPI_TOURNAMENT_IDS=109` override — it was shadowing the env file. Env file is now single source of truth.
- main pulled, `api/` rebuilt (`unset NODE_ENV && npm ci && npm run build`), both services restarted.
- First poll confirmed: `[oddspapi-poll] starting — tournamentIds=[109,132,486]` → `poll #1 fixtures=19 markets=615 prices=1230 (total 1079ms)`.

**Live state (post-deploy, 2026-05-28 PT):**
- `app.azuresb.com` sidebar shows NBA + WNBA labels (PR #34 Cloudflare Pages auto-build).
- DB has rows for tournament_id 109 (MLB), 132 (NBA), 486 (WNBA).
- Active fixtures at probe time: 1 NBA (OKC vs SAS), 2 WNBA (DAL/IND, LV/GSV).

**New memory saved:**
- `[[feedback_scan_script_output_tokens]]` — **CRITICAL** — John's "run script → paste output to Claude" workflow leaks PATs when scripts use `git push -u <url-with-token>`. Scan paste output for `github_pat_` / `:x-access-token:` before sending. Claude side: never use `-u` with URL-embedded tokens; pipe `2>&1 | grep -v 'x-access-token'` or use a credential helper.

**Threads closed this session:**
- D.5 401 interceptor (earlier session) → strike-noted above
- Tournament wiring (NBA / NHL / NCAA umbrella) → done. Active leagues wired (NBA + WNBA). Offseason leagues (NHL, NCAAB, NCAAF, NFL) deferred until in-season per `runbooks/10-add-league.md` checklist.

**Follow-ups (queued for next session):**
- **Logo PNGs** — `scripts/fetch_logos.py` for the 12 new MLB teams (PR10 carryover) + 13 new WNBA teams (PR13). Until then board renders with monogram fallback (clean — no broken images).
- **`BS_GAME_META` purge or rewire** — entries are stale NBA demo data ("Los Angeles Lakers @ Oklahoma City Thunder" with hardcoded series state "OKC leads 2-1"). Matches are now participant-driven, so the demo data is dead noise. Either delete the static map or replace with real per-fixture meta from a future API.
- **Player account creation + end-to-end smoke** (started this session, continues separately).

**Lessons captured (memory + this doc):**
1. Memory: paste-output token leaks. See `[[feedback_scan_script_output_tokens]]`.
2. Runbook 10: end-to-end checklist for the next league wiring. Future NHL/NCAA/NFL work is a ~30-min checklist.
3. `gridv2-oddspapi.service` is a **separate** systemd unit from `gridv2.service` — restarting the API alone doesn't pick up new tournament IDs. Both services need restart on backend changes.
4. `Environment=` in systemd unit overrides `EnvironmentFile=`. Now resolved by removing the unit override.
5. `NODE_ENV=production` in `/etc/gridv2/env` causes `npm ci` to skip devDeps (drizzle-kit, tsc). Always `unset NODE_ENV` before building.
