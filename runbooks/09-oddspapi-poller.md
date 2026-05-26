# Runbook 09 — OddsPapi polling worker

> Wires up the `$57/mo OddsPapi feed (purchased + smoke-tested 2026-05-23) into a
> long-lived poller that hydrates the `fixtures` / `markets` / `prices` tables.
> Smoke test confirmed: bookmaker=pinnacle returns ~92 markets on a single NBA
> fixture with ~5min upstream refresh.

## Scope decisions (locked 2026-05-26)

- **Process model**: separate Node process under systemd. Decoupled from the
  API lifecycle — restarting the API doesn't pause polling, and worker crashes
  don't take down `/api`.
- **Poll cadence**: 5 minutes (matches upstream refresh). Tunable via
  `ODDSPAPI_POLL_INTERVAL_MS` env var.
- **Scope**: single sweep call to `/odds-by-tournaments?bookmaker=pinnacle`.
  Store whatever comes back. Filter later if needed.
- **Schema**: three tables (`fixtures`, `markets`, `prices`). Prices are
  append-only snapshots; retention policy deferred to Phase D.

## Phases

| Phase | PR | Status | Description |
|---|---|---|---|
| A | #19 | this PR | Schema (drizzle TS + migration) + stub worker that polls + logs + dumps first response. NO DB writes. |
| B | #19 | this PR | Worker module + tests (parse path covered by mocks; real parse code lands in Phase D). |
| C | #20 | pending | Install `gridv2-oddspapi.service` to `/etc/systemd/system/`. Wire log path `/var/log/gridv2/oddspapi.log` via `StandardOutput=append:` + logrotate stanza. Enable + start. |
| D | #21 | pending | Parse response → `ParsedFixture[]` / `ParsedMarket[]` / `ParsedPrice[]`. Upsert: fixtures by `oddspapi_event_id`, markets by `(fixture_id, market_type, period)`, prices append-only. |
| E | #22 | pending | Retention policy (keep last N days of prices, aggregate older). Read API surface (`/api/odds`). Observability / dashboards. |

## Phase A — Schema

Three tables under `api/src/db/schema/odds.ts`:

- **`fixtures`** — one row per upstream event. Identified by `oddspapi_event_id` for upserts. Indexed by `starts_at`, `(sport, league)`, and `status`.
- **`markets`** — `(fixture_id × market_type × period)` unique. `oddspapi_market_id` optional (falls back to the natural key for upserts).
- **`prices`** — append-only snapshots. `(market_id, captured_at)` index supports "latest price per market" queries.

Migration generated on the VPS during deploy via `npx drizzle-kit generate` (sandbox network can't reach the registry, so generation happens where `npm ci` already ran). Both the schema TS files and the generated `.sql` + journal land in the same PR.

## Phase B — Stub worker (this PR)

`api/src/workers/oddspapi-poll.ts` is a long-lived Node entrypoint:

1. Reads `ODDSPAPI_KEY` from env (refuses to boot if missing).
2. Kicks off an immediate poll, then `setInterval(POLL_INTERVAL_MS)`.
3. Each poll: GET `/odds-by-tournaments?bookmaker=pinnacle`, log response shape + counts.
4. On the **first** successful poll, if `ODDSPAPI_SAMPLE_OUT` is set, writes the raw JSON to that path — used as a one-shot recon dump for designing the parse code in Phase D.
5. SIGTERM / SIGINT trigger a graceful shutdown (aborts in-flight fetch, exits 0).

No DB writes. No upserts. Logging only.

### Run manually

```bash
# On VPS, post-deploy:
cd /home/gridv2/repo/api
sudo -u gridv2 bash -c '
  set -a; source /etc/gridv2/env; set +a;
  export ODDSPAPI_SAMPLE_OUT=/tmp/oddspapi-sample.json;
  npx tsx src/workers/oddspapi-poll.ts
'
# Ctrl-C to stop. Inspect /tmp/oddspapi-sample.json for the response shape.
```

## Phase C — systemd install (next PR)

Unit file (drafted, not in this PR — lands in PR #20):

```ini
[Unit]
Description=GridV2 OddsPapi polling worker
After=network-online.target postgresql.service gridv2.service
Wants=network-online.target

[Service]
Type=simple
User=gridv2
Group=gridv2
WorkingDirectory=/home/gridv2/repo/api
EnvironmentFile=/etc/gridv2/env
ExecStart=/usr/bin/node /home/gridv2/repo/api/dist/workers/oddspapi-poll.js
Restart=on-failure
RestartSec=10s
StandardOutput=append:/var/log/gridv2/oddspapi.log
StandardError=append:/var/log/gridv2/oddspapi.err.log

[Install]
WantedBy=multi-user.target
```

Logrotate stanza to add to `/etc/logrotate.d/gridv2` (same pattern as the API):

```
/var/log/gridv2/oddspapi.log /var/log/gridv2/oddspapi.err.log {
    weekly
    rotate 4
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
}
```

## Phase D — Parse + upsert (PR #21)

Design TBD pending the Phase A/B recon dump.

## Phase E — Retention + read API (PR #22)

Design TBD.

## Env vars consumed (Phase A/B)

| Var | Required | Default | Notes |
|---|---|---|---|
| `ODDSPAPI_KEY` | yes | — | Set on VPS at `/etc/gridv2/env` (mode 0640 root:gridv2). |
| `ODDSPAPI_BOOKMAKER` | no | `pinnacle` | Single-bookmaker filter for `/odds-by-tournaments`. |
| `ODDSPAPI_POLL_INTERVAL_MS` | no | `300000` | 5 minutes. Tunable per environment. |
| `ODDSPAPI_SAMPLE_OUT` | no | — | If set, first successful poll dumps the raw JSON here. |
