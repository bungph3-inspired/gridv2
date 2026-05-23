# GridV2 briefing — 2026-05-21

> Generated end of session, ~3:00pm PST. Supersedes 2026-05-20 briefing.

## TL;DR
Phase 0 infrastructure is live. Domain `azuresb.com` bought (user-facing brand: Azure Sportsbook, internal codename stays GridV2). Hetzner CPX32 in Falkenstein up and hardened at `178.105.154.183`. Cloudflare wiring done — `app.azuresb.com` serves the frontend, `api.azuresb.com` points at the VPS waiting for Caddy. Expense tracker built. Still blocked on OddsPapi ToS reply before paying $57.

## Needs your decision (carried over)
- **OddsPapi ToS reply** — submitted via oddspapi.io/us/contact today. Watch inbox.
- **Teammate y/n/maybe** — still open, defer until Phase 0 closes.
- **Apex `azuresb.com`** — bare domain isn't wired to Pages yet. Optional; can add anytime via Pages → Custom domains.

## Review queue
- `runbooks/01-vps-provisioning.md` — done, archived as reference.
- `runbooks/02-domain-cloudflare.md` — done.
- `runbooks/03-stack-install.md` — **not written yet**. First thing to draft next session if continuing Phase 0.
- `gridv2-expenses.xlsx` — verify Claude Max tier ($100/mo assumed) and start date (2026-04-21 assumed) are correct.

## In flight
- OddsPapi ToS clarification email (no reply yet).

## Done this session (2026-05-21)
- Roadmap reviewed end-to-end.
- Domain `azuresb.com` purchased via Cloudflare Registrar ($10.46/yr).
- Cloudflare Pages custom domain `app.azuresb.com` → frontend live, valid SSL.
- Hetzner CPX32 / Falkenstein / Ubuntu 26.04 provisioned. Backups enabled. Total $20.39/mo.
- Server hardened: `ufw` 22/80/443, password auth disabled, key-only SSH.
- DNS A record `api.azuresb.com` → 178.105.154.183 (grey cloud, ready for Caddy).
- OddsPapi ToS clarification email sent.
- Expense tracker built (`gridv2-expenses.xlsx`): ~$121/mo active burn.
- Runbooks 01 + 02 written and marked complete.
- Fleet path A locked (overnight 2-agent on Max 5x, $0 add-on).

## Status flags / risks
- OddsPapi reply hasn't arrived. Reasonable wait is 3–4 business days; ping their Discord if no reply by 2026-05-26.
- Claude Max plan price in expense tracker is an assumption ($100/mo for Max 5x). Verify against Anthropic billing dashboard.
- `anthropic-bug-report` / `anthropic-bug-impact-summary` files in project root still uninvestigated — flagged in last briefing too.
- PROJECT.md still references `gridv2.app` as default domain in Open Threads. Needs editing to reflect locked decision.

## Recommended next action
**Option A — continue Phase 0:** draft `runbooks/03-stack-install.md` and execute Node 20 + Postgres 16 + Caddy install on the VPS. ~1 hour of work. After this, `api.azuresb.com` returns a 200 from a basic health endpoint and you're ready for Phase 1 backend code.

**Option B — admin cleanup:** update PROJECT.md and root CLAUDE.md to reflect locked Phase 0 decisions (domain, fleet path, VPS). Strike completed items from Open Threads. ~10 minutes.

**Option C — wait for OddsPapi:** stop here, resume once their reply arrives. Avoids risk of installing the stack only to discover you need to pivot data providers.

Suggested order: B (10 min cleanup) → A (stack install) → buy OddsPapi when reply lands.
