# Night spec — YYYY-MM-DD

> Drop this file at `/specs/YYYY-MM-DD-night.md` (use the actual date) and commit to `main` before 11pm PT. The Architect agent reads the latest spec at 11pm PT, files an issue per Task block, then the Coder agent works them sequentially across 5 cron ticks (midnight–4am PT).

## Goal

One sentence — what should be true at 5am tomorrow that wasn't true at 11pm tonight.

## Out of scope

Hard limits. Things the agents should refuse to touch even if related. The Architect's hard rules already forbid `/specs/`, `.fleet/`, `.github/workflows/`, `runbooks/`, `PROJECT.md`, `CLAUDE.md`, and `/api/auth/` — list anything additional here.

## Tasks

Each block becomes one GitHub issue. Architect breaks the block into a title + 2–6 acceptance criteria. Coder picks them up in order.

### Task 1 — <title>

- **Context:** Background — why this matters, what the user-visible problem is.
- **Acceptance:** Bullet list of concrete, testable criteria. E.g. "When user clicks the X button, the modal closes within 200ms" — not "make X work."
- **Touch:** Paths or glob patterns the agent is allowed to modify. E.g. `src/components/Modal.jsx`, `src/styles/modal.css`. Be specific. If a task needs to touch tests, list the test paths too.

### Task 2 — <title>

- **Context:** …
- **Acceptance:** …
- **Touch:** …

## Notes for the fleet

- Anything unusual — pin a library version, skip a directory, etc.
- Leave blank for normal nights.

## After-the-fact

The Architect logs the issues it filed to `projects/GridV2/briefings/agents-YYYY-MM-DD.md` on the `fleet-logs` branch. The auto-merge GH Action fast-forwards that to `main` at 05:30 PT.
