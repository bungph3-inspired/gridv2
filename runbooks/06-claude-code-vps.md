# 06 — Claude Code on VPS + Max 20x OAuth bind

> Sixth runbook in the GridV2 Phase 0 series (gap from 05 reserved for the future auth implementation runbook). Installs the Claude Code CLI on the VPS and binds it to John's personal Max 20x subscription via a long-lived OAuth token stored as an env var. After this runbook, the box can run `claude -p "..."` non-interactively — which is the runtime the agent fleet needs.
>
> **Status:** EXECUTED (rev 3, 2026-05-23) — Phase A + B + C complete on `gridv2prod01`. Phase D calendar reminder created. See revision history at the bottom for the rev 2 → rev 3 pivot rationale.
>
> **Starting state (from runbooks 03 + 04):**
> - VPS `gridv2prod01` at `178.105.154.183` running Ubuntu (version to be confirmed at execution; runbook 01 selected the latest LTS at provisioning time — verify with `lsb_release -a` before starting)
> - Node 20.20.2 + npm 10.8.2 installed globally (Phase B of runbook 03)
> - Non-root `gridv2` OS user exists, SSH-accessible with John's key
> - `/etc/gridv2/env` exists with `MASTER_USERNAME=Pisa`, mode 0640 root:gridv2 (API runtime — untouched by this runbook)
> - `/etc/gridv2/agents.paused` exists — fleet kill switch (will check before each agent run, runbook 07)
> - John has just upgraded to **Claude Max 20x** ($200/mo) on his personal account

## What this runbook builds

| Component | Purpose |
|---|---|
| `@anthropic-ai/claude-code` npm package | Claude Code CLI 2.1.150, installed globally so both `root` and `gridv2` can call it. |
| Completed onboarding state for `gridv2` | First-run interactive launch (theme picker etc.) — required gate before `-p` mode works. Persisted in `~gridv2/.claude.json`. |
| `~gridv2/.claude/.credentials.json` | Auth credentials written by interactive `claude /login`. Mode 0600, owned gridv2:gridv2, ~471 bytes. Read by both interactive and `-p` modes. Auto-refreshed by Claude Code while valid. |
| `/etc/gridv2/env.agents` | Env file (mode 0640 root:gridv2) holding `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`. Scoped separately from `/etc/gridv2/env` (API runtime) so the API process doesn't inherit agent runtime config. **No** `CLAUDE_CODE_OAUTH_TOKEN` — that path is broken in 2.1.150 `-p` mode (see Phase B). |
| `~gridv2/.bashrc` source line | Makes `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` present in any interactive gridv2 shell. Cron jobs in runbook 07 will source the file explicitly. |
| Smoke-test transcript | Proves `claude -p "Reply OK"` round-trips to Anthropic and returns output, including a non-TTY variant that mimics the cron environment. |

**Out of scope here (deferred to runbook 07):**
- Cron schedules for the 4-agent fleet (Architect/Coder/Tester/Reviewer)
- Spec file format for the night's work
- GitHub branch protection on `main` + CI gating
- Per-agent workspaces and prompt scaffolds
- Kill-switch wiring (cron reading `/etc/gridv2/agents.paused` before each run)
- Daily session-log file written by the Architect's morning task
- Wager-logger conflict avoidance (fleet pauses if wager-logger is in flight)
- `--worktree` trust-folder pre-acceptance (if runbook 07 ends up using git worktrees for parallel agents, the trust prompt still fires for those — `-p` alone doesn't skip it. Address there.)

## Prerequisites

- [x] Runbook 03 complete (Node 20 + Postgres 16 + Caddy + gridv2 user)
- [x] Runbook 04 complete (API skeleton live at `https://api.azuresb.com/health`)
- [x] John's Anthropic account upgraded to **Max 20x** — verify in claude.ai/settings/billing before starting
- [x] Local browser available on John's machine (needed for the `/login` OAuth flow — the VPS prints a URL you open in any browser logged into the Max 20x account)
- [x] SSH access to `root@178.105.154.183` working (key auth) — gridv2 access is via `sudo -u gridv2 -i` from root, since direct SSH for gridv2 is disabled

## Phase A — Install Claude Code globally on the VPS

> Install as root so it lands in `/usr/lib/node_modules/` and is available to every user, including `gridv2`. Credentials are per-user (Phase B) — only the binary is shared.

```bash
ssh root@178.105.154.183

# Install globally — pulls @anthropic-ai/claude-code from npm
npm install -g @anthropic-ai/claude-code

# Verify
which claude            # expected: /usr/bin/claude or /usr/local/bin/claude
claude --version        # expected: a version string like 1.x.x
```

### Verification (Phase A)

- [ ] `which claude` returns a path under `/usr/` (not `/root/`, not under a home dir)
- [ ] `claude --version` prints a version (any version is fine — just confirms binary works)
- [ ] `sudo -u gridv2 claude --version` works for the gridv2 user (PATH inherited)
- [ ] `sudo -u gridv2 claude --help` shows help text without error

## Phase B — Authenticate gridv2 via interactive `claude /login`

> **Why this approach (rev 3, executed 2026-05-23):** Rev 2 planned to use `claude setup-token` to produce a long-lived OAuth token and store it as `CLAUDE_CODE_OAUTH_TOKEN`. **That path is non-functional in Claude Code 2.1.150 `-p` mode.** The env var IS recognized inside the interactive REPL (`/status` shows "Claude Max account"), but `claude -p` invocations reject the same auth with "Not logged in · Please run /login". Confirmed against GitHub issues [#37402](https://github.com/anthropics/claude-code/issues/37402) and [#55356](https://github.com/anthropics/claude-code/issues/55356).
>
> The workaround is interactive `/login`, which writes proper credentials to `~/.claude/.credentials.json`. Both interactive and `-p` modes read that file. One-time setup per VPS; Anthropic auto-refreshes the credential transparently while valid.
>
> **Hidden prerequisite (also discovered 2026-05-23):** Claude Code requires interactive **onboarding to complete** before `-p` mode works. On first run, claude prompts for a theme. If you skip onboarding (e.g., `claude -p ...` before ever running interactive claude), you get a misleading "Not logged in" error even when auth is fine. So Phase B starts with an onboarding pass.

### B.1 — Complete onboarding interactively (one-time per VPS)

```bash
# As root on the VPS, drop into gridv2 with a real interactive shell (TTY required)
ssh root@178.105.154.183
sudo -u gridv2 -i

# Confirm you're gridv2
whoami    # expected: gridv2
pwd       # expected: /home/gridv2

# Launch claude — no -c wrapper. Bare `claude` opens the REPL with a real TTY.
claude
```

Claude Code shows first-run onboarding:

1. **Theme picker** — accept the highlighted Dark mode (or pick another) and press Enter
2. Any other onboarding screens — accept defaults
3. You land in the REPL with a `>` prompt

Type `/status` once to confirm slash commands work, then proceed to B.2. Don't run `claude -p` from another shell before B.2 — the credential isn't on disk yet, so it'll fail and confuse you.

### B.2 — Run `/login` to write credentials to disk

Still inside the REPL as gridv2:

```
/login
```

OAuth flow:

1. REPL prints an authorization URL — open in any browser logged into the Max 20x account
2. Approve on the Anthropic consent page
3. Browser shows a short one-time code (NOT a `sk-ant-...` token — just a short opaque string) — copy it
4. Paste back into the REPL → "Login successful" or equivalent

Verify inside the REPL:

```
/status
```

Expected in the status panel:
- Version: 2.1.150 (or newer)
- Login method: **Claude Max account**
- Email: <your account email>
- Model: Default (Opus 4.7 with 1M context · …)

Then:

```
/exit
```

You should land back at `gridv2@gridv2prod01:~$`. Confirm the credentials file landed:

```bash
ls -la ~/.claude/.credentials.json
# Expected: -rw------- 1 gridv2 gridv2 ~471 ... .credentials.json
```

### B.3 — Create the minimal `/etc/gridv2/env.agents`

> With file-based credentials, env.agents is no longer the credential store. It still has one job: hold the headless-mode flag so cron jobs don't hit interactive prompts (telemetry / survey / feedback). Kept as a separate file (not added to `/etc/gridv2/env`) so the API systemd unit doesn't inherit agent runtime config.

```bash
# As root on the VPS (exit the gridv2 shell first if you're still in it)
exit       # back to root@gridv2prod01:~#

cat > /etc/gridv2/env.agents <<'EOF'
# Agent runtime env vars (Claude Code headless mode).
# Mode 0640 root:gridv2. Sourced by gridv2 .bashrc and cron jobs (runbook 07).
# Auth credentials live separately in ~gridv2/.claude/.credentials.json,
# written by interactive `claude /login` (see Phase B.2).
# Rotation = re-run `claude /login` when credentials expire (auto-refresh
# happens transparently while valid).
CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
EOF
chown root:gridv2 /etc/gridv2/env.agents
chmod 0640 /etc/gridv2/env.agents
```

### B.4 — Source env.agents from gridv2's `.bashrc`

> So interactive SSH sessions get `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` automatically. Cron jobs in runbook 07 will source the file explicitly in each entry.

```bash
sudo -u gridv2 tee -a ~gridv2/.bashrc > /dev/null <<'EOF'

# Source agent runtime env vars (Claude Code headless mode).
# File is mode 0640 root:gridv2; only gridv2 (and root) can read it.
if [ -r /etc/gridv2/env.agents ]; then
  set -a
  . /etc/gridv2/env.agents
  set +a
fi
EOF
```

### B.5 — Verify

```bash
# Credentials file landed (this is the load-bearing artifact)
sudo -u gridv2 ls -la ~gridv2/.claude/.credentials.json
# Expected: -rw------- 1 gridv2 gridv2 ~471 ... .credentials.json

# env.agents is in place and minimal
ls -la /etc/gridv2/env.agents          # -rw-r----- 1 root gridv2
cat /etc/gridv2/env.agents             # comments + one line

# .bashrc sources the file
sudo -u gridv2 -i bash -lc 'env | grep -E "^CLAUDE_CODE_"'
# Expected: CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1

# Other users still locked out of env.agents
sudo -u caddy cat /etc/gridv2/env.agents 2>&1 | head -1
# Expected: cat: /etc/gridv2/env.agents: Permission denied

# No API-key env vars overriding subscription auth
sudo -u gridv2 -i bash -lc 'env | grep -iE "anthropic_(api_key|auth_token)"'
# Expected: empty
```

### Verification (Phase B)

- [ ] Interactive `claude` as gridv2 completed onboarding (theme picker accepted; landed in `>` REPL)
- [ ] `/login` walked the OAuth flow under the Max 20x account; `/status` showed "Claude Max account" with correct email
- [ ] `~gridv2/.claude/.credentials.json` exists, mode 0600, owned `gridv2 gridv2`, ~471 bytes
- [ ] `/etc/gridv2/env.agents` exists, mode 0640 root:gridv2, contains **only** `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` (no `CLAUDE_CODE_OAUTH_TOKEN` line — that path is broken in 2.1.150)
- [ ] `sudo -u caddy cat /etc/gridv2/env.agents` → `Permission denied`
- [ ] `~gridv2/.bashrc` has the source block; a fresh gridv2 login shell has `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` in env
- [ ] No `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN` leaked into gridv2 env
- [ ] `/etc/gridv2/env` unchanged (API systemd unit untouched)

## Phase C — Smoke test: non-interactive `claude -p` (interactive + cron-equivalent)

> This is the actual "fleet runtime" call shape. If `claude -p "..."` returns text, the fleet's cron jobs will work.
>
> Per Anthropic docs (verified 2026-05-22), the `-p` flag **disables trust-folder verification automatically**, so the cron jobs in runbook 07 won't get stuck on a "do you trust this folder?" prompt as long as they avoid `--worktree` (the one mode where trust still fires).

### C.1 — Interactive smoke test (login shell)

```bash
# As the gridv2 user with a fresh login shell (so .bashrc sources env.agents)
sudo -u gridv2 -i

# Inside the gridv2 shell:
claude -p "Reply with the single word OK and nothing else."

# Expected output: OK
# (May take 5-15 seconds — first call pays connection setup cost)
```

A slightly longer test to confirm tool use also works (the fleet will need tool calling):

```bash
claude -p "List the files in the current directory using bash. Print just the file names."

# Expected: a list of files in /home/gridv2 (Claude decides to invoke its
# bash tool to satisfy the request)
```

### C.2 — Non-TTY smoke test (mimics cron exactly)

> Cron runs commands without a TTY, doesn't load login shell rc files, and inherits a minimal env. Reproduce that explicitly here — if this passes, runbook 07's cron entries will work.
>
> **Gotcha discovered 2026-05-23:** piping anything to claude's stdin (e.g. `echo | claude -p "..."`) breaks `-p` mode. Claude appears to wait on stdin instead of using the prompt argument, and the call returns no output. Cron entries in runbook 07 must call `claude -p "PROMPT"` directly with no stdin redirection.

```bash
# Run as gridv2 with no TTY, minimal env, sourcing env.agents explicitly.
# Note: NO `echo |` piped into claude — that breaks -p mode.
sudo -u gridv2 env -i HOME=/home/gridv2 PATH=/usr/bin:/bin \
  bash -c '. /etc/gridv2/env.agents && claude -p "Reply with the single word OK and nothing else." 2>&1; echo "EXIT_CODE=$?"'

# Expected output:
#   OK
#   EXIT_CODE=0
```

### Verification (Phase C)

- [ ] C.1 interactive: `claude -p "Reply OK..."` returns `OK`
- [ ] C.1 returns within 30 seconds on cold start, ~5 seconds warm
- [ ] C.1 tool-use test returns an actual file list (not a refusal or hallucination)
- [ ] C.2 non-TTY: same `claude -p` call returns `OK` under stripped env + no TTY (this is the *real* fleet-runtime test)
- [ ] No "usage limit reached" warning during smoke tests
- [ ] No interactive prompt (trust folder, telemetry, survey) fires during C.2 — if one does, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` or the `-p` trust-skip behavior is not working as expected; investigate before continuing

## Phase D — Credential liveness check + lifecycle

> With file-based credentials written by `/login`, Anthropic auto-refreshes the underlying token transparently while it's valid — there's no hard 1-year deadline like there is with `setup-token`. The lifecycle concern shifts from "rotate on schedule" to "verify the credential still works periodically".

```bash
# Note the /login date — record it in the gotchas section below
date -u
sudo -u gridv2 stat -c '%y' ~gridv2/.claude/.credentials.json
```

**Liveness check (every ~6 months):**
- As root on VPS: `sudo -u gridv2 bash -c 'claude -p "Reply OK" 2>&1; echo "EXIT_CODE=$?"'`
- Expected: `OK` + `EXIT_CODE=0`
- If "Not logged in": re-run `/login` per Phase B.2

**If John changes his Anthropic password:**
- The credentials keep working until explicit revocation (OAuth, not password-based)
- Only invalidated by revoking the OAuth grant in claude.ai/settings/security

**If John ever downgrades from Max 20x:**
- `claude -p` calls start hitting the lower plan's limits
- No code change needed — just billing — but the agent fleet's overnight throughput drops

### Verification (Phase D)

- [ ] `/login` date logged in this runbook's gotchas section
- [ ] Calendar reminder set ~6 months out: "Verify VPS Claude Code /login credentials still valid (GridV2 fleet)" with the diagnostic command + recovery steps in the description

## Full verification checklist (end of runbook 06)

- [x] `claude --version` works as root and as gridv2 (Phase A) — 2.1.150
- [x] gridv2 onboarding completed (theme picker accepted via interactive `claude` first run)
- [x] `~gridv2/.claude/.credentials.json` exists, mode 0600 gridv2:gridv2, ~471 bytes (Phase B.2 — written by `/login`)
- [x] `/etc/gridv2/env.agents` exists, mode 0640 root:gridv2, contains **only** `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` (no token line)
- [x] `sudo -u gridv2 -i bash -lc 'env | grep ^CLAUDE_CODE_'` prints the headless flag (interactive shells sourcing via `.bashrc`)
- [x] Phase C.1 `claude -p "Reply OK"` returns `OK` from interactive gridv2 shell
- [x] Phase C.2 non-TTY `claude -p "Reply OK"` returns `OK` + `EXIT_CODE=0` under stripped env (real cron-equivalent test)
- [x] Neither `ANTHROPIC_API_KEY` nor `ANTHROPIC_AUTH_TOKEN` leaked into gridv2 env
- [x] `/etc/gridv2/env` unchanged (API runtime untouched)
- [x] `/login` date documented in gotchas log + calendar reminder set ~6 months out (2026-11-23)

## Recovery scenarios

| Problem | Fix |
|---|---|
| `claude /login` returns an OAuth error | Re-run, ensure you paste the short code within ~2 min of approving in the browser. Codes expire fast. |
| `claude -p` returns "Not logged in · Please run /login" | Three causes, in order of likelihood: (1) gridv2's onboarding never completed — run interactive `claude` once as gridv2 and walk through the theme picker. (2) `~gridv2/.claude/.credentials.json` is missing or wrong perms — `ls -la ~gridv2/.claude/.credentials.json` should show mode 0600 gridv2:gridv2. If missing, re-run `/login` per Phase B.2. (3) Credentials expired — re-run `/login`. |
| `claude -p` hangs or returns nothing | You're probably piping stdin to it (`echo \| claude -p ...` or similar). Remove the pipe — `claude -p "PROMPT"` must be called with no stdin redirection. |
| `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN` set somewhere (shell profile, systemd unit) | Unset it. Per Anthropic docs, both env vars override subscription auth and bill to API instead. `unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN` in current shell, then audit `~/.bashrc`, `~/.profile`, `/etc/environment`, and any systemd `EnvironmentFile=` directives. |
| Credentials file got committed to git or copied to an untrusted location | Revoke immediately: claude.ai → Settings → Security → revoke OAuth grant. Re-run `/login` per Phase B.2 for a new credentials file. |
| `~gridv2/.claude/.credentials.json` accidentally deleted | Re-run `/login` interactively as gridv2 per Phase B.2. No password manager backup needed — `/login` issues a fresh credential each time. |
| `/etc/gridv2/env.agents` accidentally deleted | Recreate per Phase B.3 (one-line file, no secrets in it now). |
| First-run prompt fires during C.2 (trust folder, telemetry, survey) | Verify `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` is actually in the inherited env (`env \| grep DISABLE_NONESSENTIAL`). Trust-folder specifically should not fire under `-p`; if it does, run `npm update -g @anthropic-ai/claude-code` and retry. |

## Notes & gotchas log

_(Entries added during walkthrough — format: `YYYY-MM-DD HH:MM PST` followed by observation.)_

- **2026-05-23 13:00 PST** — Phase A executed cleanly on first try. Ubuntu 26.04 LTS "resolute" confirmed (matches rev 1 assumption, no drift). `claude --version` = 2.1.150, `which claude` = `/usr/bin/claude` for both root and gridv2.
- **2026-05-23 13:30 PST** — Phase B (rev 2 env-var model) executed but `claude -p` returned "Not logged in · Please run /login" despite token being correctly set in env. Spent ~45 min troubleshooting: token format, leading whitespace, file content, env propagation, stale `.claude.json`. All clean. Pivoted to rev 3 (file-based credentials via `/login`) after confirming GitHub issues #37402, #55356.
- **2026-05-23 14:00 PST** — Hidden onboarding gate discovered: `claude -p` returns "Not logged in" not only on auth failure but also when **first-run onboarding (theme picker) hasn't been completed** for that user. Misleading error message. Documented as Phase B.1 prerequisite.
- **2026-05-23 14:05 PST** — `/login` succeeded under bungph3@gmail.com Max 20x account. Credentials file written to `~gridv2/.claude/.credentials.json`, mode 0600, 471 bytes.
- **2026-05-23 14:08 PST** — C.1 + C.2 both return `OK` + `EXIT_CODE=0`. Note: rev 2's C.2 used `echo | claude -p ...` which **breaks `-p` mode** — claude appears to wait on stdin instead of using the prompt arg. Removed the `echo |` in rev 3. Cron entries in runbook 07 must call `claude -p "PROMPT"` directly with no piped stdin.
- **2026-05-23 14:10 PST** — env.agents cleaned up (dead `CLAUDE_CODE_OAUTH_TOKEN` line removed). Sanity smoke test still passes post-cleanup.
- **2026-05-23 14:11 PST** — Google Calendar reminder created for 2026-11-23 09:00 PT: "Verify VPS Claude Code /login credentials still valid (GridV2 fleet)". Description has the diagnostic command + recovery steps.

## Revision history

- **Rev 3 (2026-05-23)** — Executed against `gridv2prod01`. Rev 2's env-var auth model proved non-functional in Claude Code 2.1.150 `-p` mode (verified against GitHub issues #37402, #55356). Pivoted to file-based credentials. Changes:
  - Phase B fully rewritten around interactive `claude /login` (writes `~gridv2/.claude/.credentials.json` automatically). Sub-phases B.1 (complete onboarding), B.2 (`/login`), B.3 (minimal env.agents), B.4 (.bashrc source), B.5 (verify).
  - Added Phase B.1 "complete onboarding" as a documented prereq — discovered that `claude -p` returns "Not logged in" not only on auth failure but also when the user's first-run onboarding flags aren't set in `~/.claude.json`.
  - `/etc/gridv2/env.agents` slimmed to a single `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` line. No OAuth token in env files anywhere on the VPS.
  - Phase C.2 fixed: removed `echo | claude -p ...` which was found to break `-p` mode (claude waits on stdin instead of using the prompt arg). Cron entries in runbook 07 must call `claude -p "PROMPT"` directly.
  - Phase D calendar reminder repurposed: with auto-refreshing credentials there's no hard expiry, so the 6-month reminder is now a *liveness check* rather than a rotation deadline. Reminder created on Google Calendar for 2026-11-23 09:00 PT.
  - Token-format prefix `sk-ant-oat01-` (no hyphen between "oat" and "01") confirmed by inspection during the failed env-var attempt — would have been a rev 2 documentation fix anyway. Now moot.
  - Onboarding-state file `~gridv2/.claude.json` documented (auto-created on first claude invocation; holds migration flags and a local userID, no auth).
- **Rev 2 (2026-05-22)** — Audited against current docs.claude.com after Max 20x upgrade. Changes:
  - Phase B rewritten: `setup-token` doesn't save to disk; switched to env-var auth model via new `/etc/gridv2/env.agents` (mode 0640 root:gridv2, scoped separately from API runtime's `/etc/gridv2/env`).
  - Phase C split into C.1 (interactive) + C.2 (non-TTY cron-equivalent) — non-TTY test is the real signal for runbook 07.
  - Dropped `/status` verification (REPL-only slash command, not a one-shot CLI).
  - Dropped credentials.json path checks (no file exists with `setup-token`).
  - Added `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` to env.agents to suppress telemetry / survey / feedback prompts in headless mode.
  - Expanded env-leak grep to include `ANTHROPIC_AUTH_TOKEN` alongside `ANTHROPIC_API_KEY` (both override subscription auth per docs).
  - Trust-folder prompt downgraded from hidden gotcha to non-issue under `-p` (per docs); deferred `--worktree` caveat to runbook 07's out-of-scope list.
  - Ubuntu version reference softened — verify at execution time with `lsb_release -a` instead of asserting `26.04`.
  - Findings sourced from docs.claude.com authentication, security, data-usage, and SDK permissions pages.
- **Rev 1 (initial draft)** — Original draft assuming credentials-file auth via `setup-token`. Superseded by rev 2.

## Next runbook

**`07 — Agent fleet orchestration`** — wires the 4-agent fleet on top of this runtime:

- Cron schedules for Architect (11pm), Coder (12am–5am), Tester (on PR open), Reviewer (5am)
- Per-agent prompt scaffolds + spec file format John commits before each night
- Kill switch: cron reads `/etc/gridv2/agents.paused` before starting; pauses if file exists
- GitHub branch protection on `main`: require PR + passing CI before merge
- GitHub Actions workflow: `npm test` + `npm run build` on every PR
- Daily session-log file written by Architect's morning task (→ feeds the briefing aggregator)
- Wager-logger conflict avoidance: cron pauses fleet if wager-logger has run in the last hour (reserved token budget)

After runbook 07, the "I wake up to a PR queue, not a blank slate" workflow from Roadmap §5 is real.
