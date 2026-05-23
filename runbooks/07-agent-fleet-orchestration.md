# 07 — Agent fleet orchestration

> Seventh runbook in the GridV2 Phase 0 series. Wires the 4-agent overnight fleet (Architect / Coder / Tester / Reviewer) on top of the Claude Code runtime that runbook 06 established. After this runbook, the "I wake up to a PR queue, not a blank slate" workflow from `GridV2_Roadmap.docx` §5 is real.
>
> **Status:** ARTIFACTS STAGED 2026-05-23, execution pending. All in-repo artifact files referenced by this runbook now exist on `main` (pending commit + push):
>   - `.github/workflows/ci.yml` (Phase A)
>   - `.github/workflows/fleet-logs-merge.yml` (Phase D.5)
>   - `.fleet/prompts/{architect,coder,reviewer}.md` (Phase D.1–D.4)
>   - `specs/SPEC_TEMPLATE.md` (Phase C.1)
>   - `scripts/gridv2-fleet-run` (Phase E.1; installs to VPS at `/usr/local/bin/gridv2-fleet-run` mode 0755)
>
> Three open design decisions resolved with John on 2026-05-23 before drafting was finalized — see "Locked decisions" below. Remaining manual work is in `John executes` punch list below; ready to walk when John clears the schedule.
>
> **Locked decisions (2026-05-23):**
> - **Machine-account model = Option B** — fine-grained PAT issued from John's own `bungph3-inspired` account, scoped to one repo (`bungph3-inspired/gridv2`). No separate `gridv2-fleet` GitHub account.
> - **Session-log destination = `fleet-logs` branch + auto-merge GitHub Action.** Architect pushes its daily log to a non-protected `fleet-logs` branch; a GH Action cron-merges `fleet-logs → main` at 05:30 PT after Reviewer finishes. Keeps `main` strictly PR-only with no CODEOWNERS bypass.
> - **Wager-logger conflict avoidance = SKIPPED for v1.** Temporal separation (fleet 23:00–05:00 PT vs wager-logger daytime) + Max 20x headroom make collision unlikely. The wrapper script does NOT include a wager-logger lock check. If a real collision ever shows up in the logs as a `claude exit=1` + rate-limit error, add F.2 (gist-via-gh) retroactively; pattern noted in the recovery section. Phase F kept in the runbook for context but is a no-op.
>
> **John executes — manual punch list (artifacts are staged; these are the steps I cannot perform from a Claude session):**
> 1. `git add . && git status && git commit -m "Phase 0 artifacts: fleet workflows, prompts, spec template, wrapper" && git push origin main` (or via a PR if branch protection is already on)
> 2. **PAT for VPS fleet** — GitHub → Settings → Developer settings → Fine-grained PAT, scope `bungph3-inspired/gridv2`, perms Contents/Issues/PRs read+write, name `gridv2-fleet`, 90-day expiry. Store in password manager.
> 3. **PAT for fleet-logs auto-merge** — second fine-grained PAT, same repo scope, only `Contents: write`, name `GH_PAT_FLEET_LOGS`. Repo Settings → Secrets and variables → Actions → new repo secret `GH_PAT_FLEET_LOGS` with that value.
> 4. **Branch protection on `main`** — Repo Settings → Branches → Add rule per Phase A.2 checklist. Confirm `bungph3-inspired` (your own user) is an allowed bypasser so the auto-merge action can push.
> 5. **Create the `fleet` label once** — `gh label create fleet --color FBCA04 --description "Agent fleet work"` (or any color you like).
> 6. **VPS install** — SSH to `root@178.105.154.183` and walk Phase B (gh CLI + GH_TOKEN), Phase C.2 (clone three agent workdirs), Phase E.1 (install wrapper script — `install -m 0755 -o root -g root /var/lib/gridv2/agent-work/architect/scripts/gridv2-fleet-run /usr/local/bin/gridv2-fleet-run`), Phase E timezone + crontab.
> 7. **Smoke test** — Phase G dry run.
>
> **Starting state (from runbook 06):**
> - VPS `gridv2prod01` at `178.105.154.183` running Ubuntu 26.04 LTS
> - `@anthropic-ai/claude-code` 2.1.150 installed globally; `claude --version` works as root and as gridv2
> - gridv2 onboarding complete; `~gridv2/.claude/.credentials.json` written by interactive `/login` under bungph3@gmail.com Max 20x (mode 0600, ~471 bytes)
> - `/etc/gridv2/env.agents` exists (mode 0640 root:gridv2) holding only `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`
> - `~gridv2/.bashrc` sources env.agents for interactive shells
> - Phase C smoke tests pass: `claude -p "Reply OK"` returns `OK` + `EXIT_CODE=0` under stripped-env / no-TTY (the real cron-equivalent environment)
> - GitHub repo `bungph3-inspired/gridv2` exists; `main` is currently unprotected and auto-deploys to Cloudflare Pages on every push
> - `/etc/gridv2/agents.paused` exists as the kill-switch sentinel (created in runbook 03 Phase D — empty flag file, presence means "fleet stop")

## What this runbook builds

| Component | Purpose |
|---|---|
| GitHub branch protection on `main` | Requires PR + passing CI before merge. Prevents agents from pushing directly to production. Only John can merge. |
| GitHub Actions CI workflow (`.github/workflows/ci.yml`) | Runs `npm ci`, `npm run build`, `npm test` on every PR. Tester agent reads its result on the PR; merge gate requires green. |
| `gh` CLI installed on VPS + auth token for the `gridv2-fleet` machine account | Lets agents call `gh issue create`, `gh pr create`, `gh pr review` from their bash tool. Scoped token, no repo admin. |
| `/specs/YYYY-MM-DD-night.md` directory + format | Where John writes the night's work brief before sleeping. Committed to `main`. Architect reads the latest by mtime. |
| `.fleet/prompts/{architect,coder,tester,reviewer}.md` (versioned in the repo) | Prompt scaffolds the cron jobs feed to `claude -p`. Edited via PR like any other code, so behavior changes are auditable. |
| `/var/lib/gridv2/agent-work/{architect,coder,reviewer}/` | Per-agent working clones of the repo (one per agent, sequential — no worktrees in v1). Mode 0700 gridv2:gridv2. |
| `/var/log/gridv2/agent-YYYY-MM-DD.log` | Per-day combined log of every agent invocation (start ts, prompt hash, exit code, stdout tail). Rotated weekly via logrotate. |
| `/usr/local/bin/gridv2-fleet-run` wrapper script | Single entrypoint cron calls. Handles: kill-switch check, env sourcing, working-dir setup, logging, exit-code propagation. (Wager-logger conflict check is skipped in v1 — see Phase F.) |
| Crontab entries (Architect 11pm, Coder 12am–5am, Reviewer 5am, all PT) | The actual schedule. Each entry is a one-liner calling `gridv2-fleet-run <agent>`. |
| Daily session log written by Architect's morning task | Markdown file committed to `projects/GridV2/briefings/agents-YYYY-MM-DD.md` summarizing the night's PRs. Feeds the workspace briefing aggregator. |

**Out of scope here (deferred to a later runbook):**
- Auth implementation (login routes, password hashing, session cookies) — that's the AUTH_DESIGN.md → implementation runbook, runs separately
- OddsPapi proxy / cron worker — separate Phase 1 runbook once OddsPapi is purchased
- Production database migrations from the agents — agents work only on app code; DB schema changes require a John-driven runbook
- Live odds in the agent prompts — Architect doesn't need odds data to plan; Tester doesn't need real OddsPapi calls (fixtures only)
- Per-PR preview deploys — Cloudflare Pages already does this on every branch push; no extra wiring needed
- Git worktrees for parallel Coder runs — v1 is strictly sequential (one issue at a time). Revisit once we see how throughput shakes out.
- Slack / Discord notifications on PR open — out of scope; John reviews via GitHub email + morning briefing

## Prerequisites

- [x] Runbook 06 complete — `claude -p "Reply OK"` works as gridv2 in stripped-env / no-TTY
- [ ] GitHub repo `bungph3-inspired/gridv2` is the source of truth (it is; Cloudflare Pages auto-deploys from `main`)
- [x] Machine-account model = **Option B** (fine-grained PAT from John's account, scoped to one repo). Locked 2026-05-23.
- [x] Session-log destination = **`fleet-logs` branch + auto-merge GH Action at 05:30 PT**. Locked 2026-05-23.
- [x] Wager-logger lock = **skipped for v1**. Locked 2026-05-23.
- [ ] John writes a first spec file `/specs/2026-MM-DD-night.md` to dry-run against before the cron schedule goes live. Even a "no-op: confirm fleet wiring with a 1-issue test" spec is enough.
- [ ] Cloudflare Pages confirmed to ignore `/specs/**` and `/.fleet/**` (they should — no build step touches them, but verify by pushing a spec file as a no-op and watching the build log).

## Phase A — GitHub branch protection + CI workflow

> Before any agent touches the repo, lock `main` so the agents can only land changes via PR + passing CI + your merge. This is the load-bearing safety rail.

### A.1 — Add the CI workflow

In the repo, create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - run: npm test --if-present
```

**Notes:**
- `npm test --if-present` — repo doesn't have a test script yet. Once Tester starts writing tests, drop the `--if-present` flag so missing-tests is a CI failure (forces test coverage to grow alongside code).
- No deploy step here — Cloudflare Pages handles deploy independently on push to `main`.
- Build time is ~60–90 seconds. Acceptable for PR feedback.

Push this on a feature branch first to confirm the action fires before turning on branch protection (otherwise you can lock yourself out).

### A.2 — Enable branch protection on `main`

GitHub repo → Settings → Branches → Add rule for `main`:

- [x] Require a pull request before merging
  - [x] Require approvals: **1** (you)
  - [x] Dismiss stale pull request approvals when new commits are pushed
- [x] Require status checks to pass before merging
  - [x] Require branches to be up to date before merging
  - Required check: `build-and-test` (the CI job name above)
- [x] Require conversation resolution before merging
- [x] Do not allow bypassing the above settings (so John can't accidentally merge a red PR)
- [ ] Allow force pushes — **OFF**
- [ ] Allow deletions — **OFF**

### A.3 — Issue the fleet machine-account PAT

Per the locked decision (Option B): fine-grained PAT issued from John's `bungph3-inspired` account, scoped to one repo. PRs and issues filed by the fleet will show John's username as author — acceptable for audit since the activity-log header line in each issue/PR body identifies it as agent-filed.

GitHub → Settings (top-right avatar) → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token:

- Token name: `gridv2-fleet`
- Expiration: 90 days (set calendar reminder for rotation)
- Repository access: Only select repositories → `bungph3-inspired/gridv2`
- Permissions (Repository):
  - Contents: Read and write (to push branches)
  - Issues: Read and write (to file + comment)
  - Pull requests: Read and write (to open + review)
  - Metadata: Read (auto-granted)
  - Actions: Read (so Reviewer can see CI status on a PR)
- Permissions (Account): none

Copy the token. Next phase puts it on the VPS.

### Verification (Phase A)

- [ ] `.github/workflows/ci.yml` exists on `main` and a test PR shows the workflow ran green
- [ ] Settings → Branches shows the `main` rule with the bullets above
- [ ] Attempting to push directly to `main` from a clean clone returns `! [remote rejected] main -> main (protected branch hook declined)`
- [ ] Fine-grained PAT created, scoped to one repo, copied to a password manager entry titled `gridv2-fleet PAT (rotates YYYY-MM-DD)`

## Phase B — Install `gh` + auth on the VPS

```bash
ssh root@178.105.154.183

# Install gh from the official apt repo
(type -p wget >/dev/null || apt install -y wget) \
  && mkdir -p -m 755 /etc/apt/keyrings \
  && wget -qO- https://cli.github.com/packages/githubcli-archive-keyring.gpg | tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null \
  && chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
  && apt update \
  && apt install gh -y

gh --version    # confirm install
```

Store the PAT in env.agents (mode 0640 already protects it from `caddy` and other users):

```bash
# Append to existing /etc/gridv2/env.agents
cat >> /etc/gridv2/env.agents <<'EOF'

# GitHub fleet machine-account PAT (fine-grained, scoped to bungph3-inspired/gridv2 only).
# Used by gh CLI inside agent prompts. Rotate every 90 days — calendar reminder set.
GH_TOKEN=ghp_REPLACE_WITH_REAL_TOKEN
EOF
# Verify perms still 0640 root:gridv2
ls -la /etc/gridv2/env.agents
```

Test auth as gridv2:

```bash
sudo -u gridv2 -i bash -lc 'gh auth status'
# Expected: "Logged in to github.com as bungph3-inspired (GH_TOKEN)"

sudo -u gridv2 -i bash -lc 'gh repo view bungph3-inspired/gridv2 --json name,defaultBranchRef -q .name'
# Expected: "gridv2"
```

### Verification (Phase B)

- [ ] `gh --version` ≥ 2.40
- [ ] `gh auth status` as gridv2 returns "Logged in" with `GH_TOKEN` source
- [ ] `gh repo view` returns the repo name (proves token has read scope)
- [ ] `gh issue create --title 'fleet smoke test'` works from a one-off interactive shell, then `gh issue close <#>` to clean up (proves write scope)

## Phase C — Spec format + agent workspaces

### C.1 — Spec file format

Specs live in `/specs/` at the repo root. Architect reads the most recently modified file matching `YYYY-MM-DD-night.md` (alphabetic + mtime tiebreak).

Skeleton (`/specs/SPEC_TEMPLATE.md`):

```markdown
# Night spec — YYYY-MM-DD

## Goal
One sentence — what should be true at 5am tomorrow that wasn't true at 11pm tonight.

## Out of scope
Hard limits. Things the agents should refuse to touch even if related.

## Tasks
Each block becomes one GitHub issue. Architect breaks the block into a title +
2–6 acceptance criteria. Coder picks them up in order.

### Task 1 — <title>
- Context: …
- Acceptance: …
- Touch: paths/files the agent is allowed to modify

### Task 2 — <title>
…

## Notes for the fleet
- Anything unusual — pin a library version, skip a directory, etc.
- Leave blank for normal nights.
```

**Hard rules baked into the Architect prompt (Phase D):**
- Architect never edits code — only files issues
- Architect refuses to plan tasks that touch `/specs/`, `.fleet/`, `.github/workflows/`, `runbooks/`, `PROJECT.md`, `CLAUDE.md`, or anything under `/api/auth/` (auth code is John-only until AUTH_DESIGN.md is implemented)
- If the spec has no goal or no tasks, Architect writes a no-op session log and exits 0

### C.2 — Per-agent working clones

```bash
# As root on the VPS
mkdir -p /var/lib/gridv2/agent-work
chown gridv2:gridv2 /var/lib/gridv2/agent-work
chmod 0700 /var/lib/gridv2/agent-work

# As gridv2 — clone three separate copies (one per agent that touches the repo).
# Tester runs in GitHub Actions, not here, so no clone needed for it.
sudo -u gridv2 -i bash <<'EOF'
cd /var/lib/gridv2/agent-work
for agent in architect coder reviewer; do
  git clone https://github.com/bungph3-inspired/gridv2.git "$agent"
  cd "$agent"
  git config user.name  "gridv2-fleet"
  git config user.email "fleet@azuresb.com"
  cd ..
done
EOF
```

Each cron run will:
1. `cd /var/lib/gridv2/agent-work/<agent>`
2. `git fetch --all --prune && git reset --hard origin/main && git clean -fd`
3. Run the agent prompt
4. Push any branches with `git push -u origin <branch>` (Coder only) — token from env.agents handles auth

**Trust-folder note:** `claude -p` skips the trust prompt automatically (verified in runbook 06 Phase C). These three clones live under `/var/lib/gridv2/agent-work/` and are owned by gridv2 — no surprise prompts expected. If one fires, follow runbook 06's recovery section.

### Verification (Phase C)

- [ ] `/specs/SPEC_TEMPLATE.md` committed to `main` via PR
- [ ] `/var/lib/gridv2/agent-work/{architect,coder,reviewer}/` exist, mode 0700 gridv2:gridv2
- [ ] `git -C /var/lib/gridv2/agent-work/architect rev-parse HEAD` matches origin/main
- [ ] `git -C /var/lib/gridv2/agent-work/coder config user.email` returns `fleet@azuresb.com`

## Phase D — Agent prompt scaffolds

Prompts live in `.fleet/prompts/` in the repo (versioned, PR-editable). Each is a Markdown file with a single SYSTEM-style prompt the cron wrapper feeds to `claude -p`.

### D.1 — Architect prompt (`.fleet/prompts/architect.md`)

```markdown
You are the Architect agent for the GridV2 project.

Your job tonight, in order:

1. Read `/specs/$(ls /specs/ -t | grep -E '^[0-9]{4}-[0-9]{2}-[0-9]{2}-night\.md$' | head -1)`. If the file is missing or has no `## Tasks` section, skip to step 4.
2. For each `### Task N — <title>` block in the spec, file a GitHub issue using `gh issue create`:
   - Title: the block title
   - Body: the block's Context + Acceptance + Touch sections, plus a footer line `Filed by Architect agent on $(date -u +%Y-%m-%dT%H:%M:%SZ).`
   - Label: `fleet`
3. After all issues are filed, write a session log to `projects/GridV2/briefings/agents-$(date +%Y-%m-%d).md` containing: the spec filename, the issue numbers filed, any tasks you refused (and why), and the timestamp range. Commit and push to the **`fleet-logs`** branch (`git checkout -B fleet-logs origin/main && git add ... && git commit -m "fleet log YYYY-MM-DD" && git push -f origin fleet-logs`). The auto-merge GH Action (Phase D.5) will rebase + fast-forward this onto `main` at 05:30 PT, after Reviewer finishes. Do NOT push to `main` directly — `main` is protected.
4. Exit.

Hard rules:
- Do not edit code. Issues only.
- Refuse to file any task that targets `/specs/`, `.fleet/`, `.github/workflows/`, `runbooks/`, `PROJECT.md`, `CLAUDE.md`, or `/api/auth/`. Log the refusal in the session log.
- If you cannot parse the spec, exit cleanly with a session-log entry explaining why. Do not invent tasks.
```

**Session-log destination is locked**: Architect pushes to `fleet-logs` (force-push allowed since it's an ephemeral docs branch); the auto-merge GH Action in Phase D.5 fast-forwards it to `main` at 05:30 PT after Reviewer is done. `main` stays PR-only with no CODEOWNERS bypass.

### D.2 — Coder prompt (`.fleet/prompts/coder.md`)

```markdown
You are the Coder agent for the GridV2 project.

Your job:

1. `gh issue list --label fleet --state open --json number,title,body --jq '.[0]'` — pick the lowest-numbered open issue with the `fleet` label.
2. If none, write a one-line note to the session log file at `projects/GridV2/briefings/agents-$(date +%Y-%m-%d).md` ("Coder: no open fleet issues at $(date -u)") and exit.
3. Create a branch `agent/issue-<#>` from origin/main, implement the issue's Acceptance criteria, restricting edits to the paths listed under Touch.
4. Run `npm ci && npm run build` locally. If the build fails, append a note to the session log explaining the failure and exit — do NOT push a broken branch.
5. `git push -u origin agent/issue-<#>` then `gh pr create --base main --head agent/issue-<#> --title "Closes #<#>: <title>" --body "<your work summary>\n\nCloses #<#>." --label fleet`.
6. Append a session-log line: PR URL + issue # + files changed.
7. Exit. (Coder runs once per cron tick — five sequential issues over five hours, not five parallel.)

Hard rules:
- Touch only the files listed in the issue's Touch section. If the work requires touching files outside Touch, comment on the issue explaining and exit without a PR.
- Never edit `/specs/`, `.fleet/`, `.github/workflows/`, `runbooks/`, `PROJECT.md`, `CLAUDE.md`, anything under `/api/auth/`, or any `*.lock` / `package-lock.json` (lockfile bumps go through John).
- Do not amend, rebase, or force-push. One branch, one PR, one commit chain.
- If `npm test` fails on your branch locally, fix it before pushing. Don't push expecting Tester to fix it.
```

### D.3 — Tester (CI-driven, no prompt file)

Tester is implemented as the existing `build-and-test` GitHub Action from Phase A. It runs `npm ci && npm run build && npm test --if-present` on every PR. No `claude -p` invocation, no cron entry. Its "judgment" is just the exit code of `npm test`.

Once we want LLM-judged tests (e.g. "did Coder actually meet the Acceptance criteria?"), a `tester.md` prompt + a separate GitHub Action calling `claude -p` against the PR diff goes here. Out of scope for v1.

### D.4 — Reviewer prompt (`.fleet/prompts/reviewer.md`)

```markdown
You are the Reviewer agent for the GridV2 project.

Your job, once per morning at 5am PT:

1. `gh pr list --label fleet --state open --base main --json number,headRefName,title` — list every open fleet PR.
2. For each PR (in number order):
   a. `gh pr view <#> --json files,statusCheckRollup,reviewDecision` to fetch metadata.
   b. `gh pr diff <#>` to read the actual diff.
   c. Skip the PR if CI hasn't reported yet (statusCheckRollup is null/pending) — Reviewer waits for Tester.
   d. If CI failed: leave a single review comment with `gh pr comment <#> --body` summarizing the failure. Do not request changes; do not approve. Move on.
   e. If CI passed: review the diff against the linked issue's Acceptance criteria. Leave a `gh pr review <#> --comment --body "<review>"` with three sections — what looks right, what looks risky, suggestions. Never `--approve` and never `--request-changes` — John does the merge call.
3. Append to the session log: per-PR one-line summary (PR #, CI status, review verdict).
4. Exit.

Hard rules:
- Comment only. Never merge, approve, or request changes (which would dismiss approvals on amendment).
- Never push to the branch. Reviewer is read + comment only.
- If the diff touches any file outside the issue's Touch list, flag it as a hard "do not merge" in the review comment.
```

### D.5 — `fleet-logs` auto-merge GitHub Action

`.github/workflows/fleet-logs-merge.yml`:

```yaml
name: Auto-merge fleet-logs to main

on:
  schedule:
    # 05:30 PT — runs in UTC. 12:30 UTC during PDT, 13:30 UTC during PST.
    # Use both to cover the DST switch; the no-op branch handles "no changes".
    - cron: '30 12 * * *'
    - cron: '30 13 * * *'
  workflow_dispatch:

permissions:
  contents: write

jobs:
  merge:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: main
          fetch-depth: 0
          token: ${{ secrets.GH_PAT_FLEET_LOGS }}
      - name: Fast-forward main from fleet-logs
        run: |
          git config user.name  "gridv2-fleet-merger"
          git config user.email "fleet@azuresb.com"
          git fetch origin fleet-logs:fleet-logs || { echo "fleet-logs missing — nothing to merge"; exit 0; }
          # Only fast-forward; refuse if fleet-logs has diverged from main
          if git merge-base --is-ancestor main fleet-logs; then
            git merge --ff-only fleet-logs
            git push origin main
          else
            echo "fleet-logs is not a fast-forward of main — manual review required"
            exit 1
          fi
```

**Required setup:**
- Create a repo secret `GH_PAT_FLEET_LOGS` — fine-grained PAT scoped to this repo with `Contents: write`. Distinct from `GH_TOKEN` (which lives on the VPS) so revoking one doesn't kill the other.
- Update branch-protection rule on `main`: in "Restrict who can push to matching branches", add `bungph3-inspired` (the PAT's owning user) as an allowed bypasser — OR (cleaner) configure the `GH_PAT_FLEET_LOGS` token under a GitHub App or deploy key with bypass rights. v1 takes the simpler "owner can bypass" route since John is sole admin anyway.
- Architect's `git push -f origin fleet-logs` is acceptable because `fleet-logs` is treated as ephemeral; only the latest log matters, and previous days' logs are already on `main` via prior merges.

**Failure mode**: if Coder or Reviewer ever creates commits on `fleet-logs` (they shouldn't — they push to `agent/issue-N` branches only), the fast-forward check fails and the action exits 1. John inspects manually.

### Verification (Phase D)

- [ ] `.fleet/prompts/{architect,coder,reviewer}.md` committed to `main` via PR
- [ ] Each prompt file ≤ ~80 lines (longer prompts drift from the brief and burn tokens)
- [ ] `.github/workflows/fleet-logs-merge.yml` committed via PR; test-run via `workflow_dispatch` succeeds (no-op on a fresh `fleet-logs`)
- [ ] `GH_PAT_FLEET_LOGS` secret set in repo settings
- [ ] Branch-protection rule allows the auto-merge action to push to `main` (either owner bypass or deploy-key route)

## Phase E — `gridv2-fleet-run` wrapper + cron entries

### E.1 — The wrapper script

`/usr/local/bin/gridv2-fleet-run`:

```bash
#!/usr/bin/env bash
# gridv2-fleet-run <agent>
# Single entrypoint for every cron-driven agent invocation.
# Handles: kill switch, env, working dir, logging, exit code.

set -euo pipefail
umask 0027

AGENT="${1:?usage: gridv2-fleet-run <architect|coder|reviewer>}"
case "$AGENT" in
  architect|coder|reviewer) ;;
  *) echo "unknown agent: $AGENT" >&2; exit 2 ;;
esac

LOG_DIR=/var/log/gridv2
LOG_FILE="$LOG_DIR/agent-$(date +%Y-%m-%d).log"
mkdir -p "$LOG_DIR"

log() { printf '[%s] [%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$AGENT" "$*" | tee -a "$LOG_FILE" ; }

# --- Kill switch ---
if [ -e /etc/gridv2/agents.paused ]; then
  log "kill switch present (/etc/gridv2/agents.paused) — skipping"
  exit 0
fi

# Wager-logger conflict avoidance: SKIPPED for v1 per locked decision 2026-05-23.
# Temporal separation (fleet 23:00-05:00 PT vs wager-logger daytime) +
# Max 20x headroom make collision unlikely. If a real collision ever shows up
# in the logs as `claude exit=1` with a rate-limit error, add F.2 (gist-via-gh)
# retroactively — see Phase F.

# --- Env + working dir ---
set -a
. /etc/gridv2/env.agents
set +a

WORKDIR=/var/lib/gridv2/agent-work/$AGENT
PROMPT_FILE=$WORKDIR/.fleet/prompts/$AGENT.md

cd "$WORKDIR"
log "syncing $WORKDIR with origin/main"
git fetch --all --prune --quiet
git reset --hard origin/main --quiet
git clean -fd --quiet

if [ ! -r "$PROMPT_FILE" ]; then
  log "missing prompt file: $PROMPT_FILE — aborting"
  exit 3
fi

PROMPT=$(cat "$PROMPT_FILE")

# --- Run claude -p ---
# Note: no piped stdin (runbook 06 gotcha 2026-05-23). Prompt passed as arg.
log "starting claude -p (prompt $(wc -c < "$PROMPT_FILE") bytes)"
set +e
claude -p "$PROMPT" >> "$LOG_FILE" 2>&1
EXIT=$?
set -e
log "claude exit=$EXIT"
exit "$EXIT"
```

```bash
# Install
sudo install -m 0755 -o root -g root /tmp/gridv2-fleet-run /usr/local/bin/gridv2-fleet-run
mkdir -p /var/log/gridv2
chown gridv2:gridv2 /var/log/gridv2
chmod 0750 /var/log/gridv2
```

### E.2 — Crontab for the `gridv2` user

All times are **server-local PT** (VPS is configured to America/Los_Angeles — verify with `timedatectl`; if the VPS is on UTC, convert: 11pm PT = 07:00 UTC the next day).

```bash
# As root
crontab -u gridv2 -e
```

```cron
# GridV2 agent fleet — see runbook 07
# All times America/Los_Angeles. Server tz must match (timedatectl set-timezone America/Los_Angeles if needed).

# Architect — 11:00 PT, reads tonight's spec, files issues
0 23 * * * /usr/local/bin/gridv2-fleet-run architect

# Coder — five sequential ticks 00:00, 01:00, 02:00, 03:00, 04:00 PT.
# Each tick picks the lowest open fleet issue and opens one PR.
0 0,1,2,3,4 * * * /usr/local/bin/gridv2-fleet-run coder

# Reviewer — 05:00 PT, reviews every open fleet PR with CI green
0 5 * * * /usr/local/bin/gridv2-fleet-run reviewer
```

**Server timezone:**
```bash
# Hetzner CPX images default to UTC. Set explicitly to America/Los_Angeles.
sudo timedatectl set-timezone America/Los_Angeles
timedatectl     # confirm "Time zone: America/Los_Angeles (PST/PDT, ...)"
```

### Verification (Phase E)

- [ ] `gridv2-fleet-run architect` (run manually as gridv2) completes without error against a real spec file
- [ ] `touch /etc/gridv2/agents.paused && gridv2-fleet-run coder; rm /etc/gridv2/agents.paused` — wrapper logs "kill switch present" and exits 0
- [ ] `timedatectl` reports America/Los_Angeles
- [ ] `crontab -u gridv2 -l` shows the four entries above
- [ ] `/var/log/gridv2/agent-YYYY-MM-DD.log` is created and readable by gridv2

## Phase F — Wager-logger conflict avoidance

**Status: SKIPPED for v1** (locked 2026-05-23). The wrapper script does not check for a wager-logger lock — that block was removed from `gridv2-fleet-run` in Phase E.1.

**Rationale:**
- Wager-logger runs ad-hoc during John's daytime audit sessions; fleet runs 23:00–05:00 PT overnight. Almost no temporal overlap by design.
- Max 20x usage cap is roomy. Fleet load is modest (Architect 1 call, Coder 5 calls across 5 hours, Reviewer 1 call). Wager-logger at ~250K tokens/day is concentrated daytime burst usage. Even if both fire in the same 5-hour rolling window, headroom is unlikely to be exhausted.
- Building plumbing for an unrealized risk locks in complexity. YAGNI bet.

**If a real collision ever happens** (look for `claude exit=1` + a rate-limit error in `/var/log/gridv2/agent-YYYY-MM-DD.log`):

1. Add the lock retroactively via the **F.2 (gist-via-gh)** pattern — cheaper than F.1, no auth-runbook dependency:
   - Wager-logger client writes `{"inflight": true, "since": <ts>}` to a private gist on start, clears it on finish.
   - `gridv2-fleet-run` wrapper's first action becomes `gh gist view <id> --raw -q .inflight`; if `true` and `since` < 1h ago, skip the run.
   - Build cost: ~20 lines total. Adds 3 `gh` calls per night (one per agent) — trivial.
2. If F.2 itself proves flaky, escalate to **F.1 (VPS endpoint)** — a tiny `/internal/wager-logger/start` and `/done` route on the API that touches `/var/lib/gridv2/wager-logger.inflight`. Re-add the lock check to the wrapper script.

### Verification (Phase F)

- [x] Decision documented (skipped for v1)
- [x] WAGER_LOCK block removed from wrapper script (see Phase E.1)
- [ ] Calendar reminder: check `/var/log/gridv2/agent-*.log` for rate-limit errors weekly for the first month after fleet goes live; revisit Phase F if any appear

## Phase G — Smoke test + dry run

Don't enable the cron schedule until a manual dry-run passes.

```bash
# 1. Confirm kill switch works (create + remove)
sudo touch /etc/gridv2/agents.paused
sudo -u gridv2 /usr/local/bin/gridv2-fleet-run architect
# Expected: log line "kill switch present" + exit 0
sudo rm /etc/gridv2/agents.paused

# 2. Drop a minimal spec
cat > /tmp/2026-05-24-night.md <<'EOF'
# Night spec — 2026-05-24

## Goal
Confirm fleet wiring with a single throwaway issue.

## Out of scope
Everything else.

## Tasks
### Task 1 — Add fleet-smoketest.md
- Context: dry-run for runbook 07
- Acceptance: file `fleet-smoketest.md` exists at repo root with a single line "fleet smoke ok"
- Touch: fleet-smoketest.md
EOF
# Copy spec into the architect's clone /specs/ + commit + push via gridv2-fleet
sudo -u gridv2 bash -c '
  cd /var/lib/gridv2/agent-work/architect &&
  git checkout -b smoke-test-spec &&
  mkdir -p specs &&
  cp /tmp/2026-05-24-night.md specs/ &&
  git add specs/2026-05-24-night.md &&
  git commit -m "smoke-test spec" &&
  git push -u origin smoke-test-spec
'
# Merge the smoke-test-spec PR via John's normal review path before continuing.

# 3. Run the agents in order
sudo -u gridv2 /usr/local/bin/gridv2-fleet-run architect    # should file 1 issue
sudo -u gridv2 /usr/local/bin/gridv2-fleet-run coder        # should open 1 PR
# Wait for CI to go green on the PR (≈90s)
sudo -u gridv2 /usr/local/bin/gridv2-fleet-run reviewer     # should leave 1 review comment

# 4. Inspect the log
less /var/log/gridv2/agent-$(date +%Y-%m-%d).log
```

If all three runs produced their expected GitHub artifacts (issue, PR, review comment) and the log is clean, enable cron by leaving the crontab in place from Phase E. The next 11pm PT tick runs Architect for real.

### Verification (Phase G)

- [ ] Kill switch test passes
- [ ] Architect dry-run files exactly 1 issue with the `fleet` label
- [ ] Coder dry-run opens 1 PR that touches only `fleet-smoketest.md`
- [ ] CI passes on the PR (build is fine since no test exists yet)
- [ ] Reviewer dry-run leaves exactly 1 review comment (`--comment`, not `--approve`)
- [ ] No interactive prompt fires (theme, telemetry, trust-folder) at any step
- [ ] `agents-YYYY-MM-DD.md` session-log file lands on `fleet-logs` (or main, per Phase D decision)

## Full verification checklist (end of runbook 07)

- [ ] Phase A: branch protection enabled, CI workflow green on a probe PR, PAT issued + stored
- [ ] Phase B: gh CLI installed, `gh auth status` returns logged-in as the fleet account
- [ ] Phase C: spec template committed, three per-agent clones exist with correct git config
- [ ] Phase D: three prompt files committed, session-log destination decided (`fleet-logs` vs direct-t