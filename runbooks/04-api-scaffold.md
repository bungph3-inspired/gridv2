# 04 — API Scaffold (Hono + Drizzle + first deploy)

> Fourth runbook in the GridV2 Phase 0 series. Builds the minimal Node API on top of the stack from runbook 03 and proves the end-to-end HTTPS path works through Caddy.
>
> **Status:** EXECUTED 2026-05-21 (UTC 2026-05-22).
>
> **Starting state (from runbook 03):**
> - VPS has Node 20, Postgres 16, Caddy 2.11 alive
> - `https://api.azuresb.com` returns the placeholder `gridv2 api - stack alive, server pending`
> - `/etc/gridv2/env` has `DATABASE_URL`, `SESSION_SECRET`, `MASTER_USERNAME=Pisa`, `PORT=3000`
> - `gridv2.service` systemd unit installed but disabled (binary doesn't exist yet)

## What this runbook builds

| Component | Purpose |
|---|---|
| `projects/GridV2/api/` monorepo subdir | TypeScript + Hono server, Drizzle ORM, postgres driver |
| `GET /health` endpoint | Returns `{status:"ok", service:"gridv2-api"}` — used by Caddy upstream + future uptime checks |
| Drizzle config + empty schema | Migration tooling wired up; real tables added when AUTH_DESIGN.md implements |
| `/home/gridv2/repo` clone on VPS | Git checkout of the GridV2 repo; `api/` subdir is what gridv2.service runs |
| Updated `gridv2.service` paths | Points at `/home/gridv2/repo/api/dist/index.js` instead of the placeholder `/home/gridv2/api/...` |
| Caddyfile flipped to `reverse_proxy` | Caddy now proxies `api.azuresb.com` to `localhost:3000` instead of responding with the placeholder string |

**Out of scope:**
- Auth (MASTER + subagents) — that's AUTH_DESIGN.md plus the auth implementation runbook after this
- Real DB tables — empty schema for now; first migration is essentially `CREATE SCHEMA` housekeeping
- OddsPapi worker — runbook 05 or later
- CORS allowlist hardening — basic `*` for now on `/health`, real allowlist when auth lands

## Decisions (locked)

| Question | Answer |
|---|---|
| Repo layout | **Monorepo** — `projects/GridV2/api/` subdir, separate `package.json` |
| Deploy method | **Git clone on VPS** to `/home/gridv2/repo` (HTTPS, public repo) |
| Module system | **CommonJS** — simplest, most reliable for a Node 20 server |
| Runtime | **`@hono/node-server`** wraps Hono's fetch handler for Node |
| DB driver | **`postgres`** (porsager/postgres) — Drizzle's recommended PG client |
| Build | `tsc` → `dist/` ; systemd runs `node dist/index.js` |
| Migration tool | `drizzle-kit` |

## Prerequisites

- [x] Runbook 03 complete (stack alive, env file populated)
- [x] Local: Node 20 + npm 10 on Windows (matches VPS version)
- [x] Git CLI installed locally with GitHub auth (push works to `bungph3-inspired/gridv2`)
- [x] SSH access to `root@178.105.154.183` working
- [x] **GitHub repo public** — initially private; flipped to public mid-runbook so the VPS could `git clone` over HTTPS without auth. See gotchas log.

## Phase A — Scaffold `projects/GridV2/api/` locally

From Windows PowerShell, in the GridV2 project root:

```powershell
cd C:\Users\bungp\Documents\ClaudeWorkSpace\projects\GridV2
mkdir api
cd api

# Initialize package.json
npm init -y
```

Then **manually edit** `projects/GridV2/api/package.json` to look like this (overwrite what npm init produced):

```json
{
  "name": "gridv2-api",
  "version": "0.1.0",
  "private": true,
  "description": "GridV2 backend API (Hono + Drizzle)",
  "main": "dist/index.js",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate"
  },
  "dependencies": {
    "@hono/node-server": "^1.13.0",
    "drizzle-orm": "^0.36.0",
    "hono": "^4.6.0",
    "postgres": "^3.4.5"
  },
  "devDependencies": {
    "@types/node": "^20.16.0",
    "drizzle-kit": "^0.28.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0"
  }
}
```

Install the deps:

```powershell
npm install
```

Add a `.gitignore` at `projects/GridV2/api/.gitignore`:

```
node_modules
dist
.env
*.log
```

## Phase B — TypeScript config + Hono `/health` endpoint

Create `projects/GridV2/api/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "sourceMap": true,
    "declaration": false,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

Create `projects/GridV2/api/src/index.ts`:

```typescript
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';

const app = new Hono();

// Wide-open CORS on /health only — locked down later when auth lands
app.use('/health', cors());

app.get('/health', (c) =>
  c.json({
    status: 'ok',
    service: 'gridv2-api',
    version: '0.1.0',
    ts: new Date().toISOString(),
  }),
);

// 404 catch-all so we don't leak stack traces
app.notFound((c) => c.json({ error: 'not_found' }, 404));

app.onError((err, c) => {
  console.error('[gridv2-api] unhandled error:', err);
  return c.json({ error: 'internal_error' }, 500);
});

const port = Number(process.env.PORT ?? 3000);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[gridv2-api] listening on http://localhost:${info.port}`);
});
```

## Phase C — Drizzle config + empty schema

Create `projects/GridV2/api/src/db/schema.ts`:

```typescript
// Empty for runbook 04 — first real tables land in AUTH_DESIGN.md
// (agents, sessions, etc.). This file exists so drizzle-kit has a target
// even before there's a schema to introspect.
export {};
```

Create `projects/GridV2/api/drizzle.config.ts`:

```typescript
import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config;
```

We don't run `drizzle-kit generate` yet — there's nothing to generate without schema definitions. The first migration will be created in the auth implementation step.

## Phase D — Local smoke test

```powershell
# Build
npm run build

# Verify dist/index.js exists
dir dist

# Run locally (won't talk to DB — Phase E ships it to VPS)
$env:PORT = "3000"
node dist/index.js
```

In another PowerShell window, hit it:

```powershell
curl http://localhost:3000/health
```

Expected: `{"status":"ok","service":"gridv2-api","version":"0.1.0","ts":"..."}`

Stop the local server with Ctrl-C.

## Phase E — Commit + push

```powershell
cd C:\Users\bungp\Documents\ClaudeWorkSpace\projects\GridV2
git status   # should show api/ as untracked
git add api/
git commit -m "Add api/ scaffold: Hono + Drizzle, /health endpoint"
git push origin main
```

Confirm the push by checking `https://github.com/bungph3-inspired/gridv2` — the `api/` directory should appear in the file tree.

> **Cloudflare Pages will rebuild on this push.** The frontend build command (`npm run build` at repo root) does not touch `api/` because the Vite config doesn't include it. Pages deploy should succeed unchanged. Verify in the Cloudflare dashboard that the deploy goes green before continuing.

## Phase F — Clone repo on VPS

```bash
ssh root@178.105.154.183
```

```bash
# Clean up the empty placeholder dir from runbook 03
# (we'll redirect the systemd unit at the cloned path instead)
rm -rf /home/gridv2/api

# Clone the repo as the gridv2 user so file ownership is right
sudo -u gridv2 git clone https://github.com/bungph3-inspired/gridv2.git /home/gridv2/repo

# Verify
ls -la /home/gridv2/repo/api/
```

You should see `package.json`, `tsconfig.json`, `src/`, `drizzle.config.ts`, etc.

## Phase G — Install deps + build on VPS

```bash
# As gridv2 user, in the api subdir
sudo -u gridv2 bash <<'BASH'
cd /home/gridv2/repo/api
npm install
npm run build
BASH

# Verify the build artifact
ls -la /home/gridv2/repo/api/dist/
```

You should see `index.js`, `index.js.map`. If `db/` subdirs are missing it's because the schema is empty — that's fine.

> **Gotcha to watch for:** if `npm install` fails on the VPS with `ENOSPC` or similar, check `df -h`. CPX32 has 160 GB so this is extremely unlikely.

## Phase H — Update systemd unit paths

The unit we installed in runbook 03 points at `/home/gridv2/api/dist/index.js`. The repo now lives at `/home/gridv2/repo/api/`, so we update the unit. Edit `/etc/systemd/system/gridv2.service`:

```bash
cat > /etc/systemd/system/gridv2.service <<'EOF'
[Unit]
Description=GridV2 API server (Hono + Drizzle)
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=gridv2
Group=gridv2
WorkingDirectory=/home/gridv2/repo/api
EnvironmentFile=/etc/gridv2/env
ExecStart=/usr/bin/node /home/gridv2/repo/api/dist/index.js
Restart=on-failure
RestartSec=5
StandardOutput=append:/var/log/gridv2/api.log
StandardError=append:/var/log/gridv2/api.err.log

# Hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=/var/log/gridv2 /home/gridv2/repo
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemd-analyze verify /etc/systemd/system/gridv2.service
```

Only diff from runbook 03 unit: `WorkingDirectory`, `ExecStart`, and `ReadWritePaths` updated to point at `/home/gridv2/repo/...` instead of `/home/gridv2/api`.

## Phase I — Enable + start gridv2.service

```bash
systemctl enable --now gridv2.service

# Wait a couple seconds for startup
sleep 3

# Status (expect: active running)
systemctl status gridv2.service --no-pager | head -15

# Did it actually bind port 3000?
ss -tlnp | grep 3000

# Logs from the first few seconds
tail -20 /var/log/gridv2/api.log
tail -20 /var/log/gridv2/api.err.log

# Hit /health locally on the VPS (bypassing Caddy)
curl -s http://localhost:3000/health
```

Expected:
- `systemctl status` → `Active: active (running)`
- `ss` shows `LISTEN 0 ... 127.0.0.1:3000` (or `*:3000` depending on Hono's bind — `@hono/node-server` binds `::` by default which shows as `*:3000`)
- `api.log` shows `[gridv2-api] listening on http://localhost:3000`
- `curl localhost:3000/health` returns the JSON payload

If status shows `failed`, common causes:
- Build artifact missing → re-run Phase G's `npm run build`
- Wrong path in unit → check `journalctl -u gridv2.service` for the actual error
- Env file missing or unreadable by gridv2 → re-check Phase G of runbook 03

## Phase J — Flip Caddy: respond → reverse_proxy

```bash
cat > /etc/caddy/Caddyfile <<'EOF'
{
  email bungph3@gmail.com
}

api.azuresb.com {
  encode zstd gzip

  reverse_proxy localhost:3000 {
    header_up X-Real-IP {remote_host}
    header_up X-Forwarded-Proto {scheme}
  }

  log {
    output file /var/log/caddy/api.azuresb.com.log {
      roll_size 10mb
      roll_keep 5
    }
  }
}
EOF

caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy

# Verify Caddy reloaded cleanly
systemctl status caddy --no-pager | head -10
journalctl -u caddy --no-pager --since "30 sec ago" | tail -10
```

## Phase K — End-to-end verification

Run from any terminal (local Windows or VPS):

```bash
# Public HTTPS through Caddy → Node API
curl -sI https://api.azuresb.com/health | head -5
echo "---"
curl -s https://api.azuresb.com/health
echo ""

# Whole-stack health
echo "--- gridv2.service ---"
ssh root@178.105.154.183 'systemctl is-active gridv2.service caddy postgresql'
```

Expected:
- `curl -sI` → `HTTP/2 200`, `content-type: application/json`, `server: Caddy`
- `curl -s` → `{"status":"ok","service":"gridv2-api","version":"0.1.0","ts":"..."}`
- All three services report `active`

If the body is still the placeholder `gridv2 api - stack alive, server pending`, Caddy didn't actually reload — re-run `systemctl reload caddy`.

If you get `HTTP/2 502 Bad Gateway`, the Node API isn't responding on `localhost:3000` — check `systemctl status gridv2.service` and `/var/log/gridv2/api.err.log`.

## Full verification checklist (end of runbook 04)

- [x] `projects/GridV2/api/` scaffolded with package.json, tsconfig, src/index.ts, drizzle.config.ts, src/db/schema.ts, .gitignore
- [x] Local `npm install` → 26 packages, no errors (5 transitive-dep vulnerabilities deferred)
- [x] Local `npm run build` produces `dist/index.js` (952 B) + sourcemap + `dist/db/schema.js`
- [x] Local `curl http://localhost:3000/health` returns the JSON payload
- [x] Code pushed to `bungph3-inspired/gridv2` as commit `455d1a3` — 7 files, 1803 insertions
- [x] `/home/gridv2/repo/` cloned (305 objects, 6.76 MiB), owned by gridv2:gridv2
- [x] `/home/gridv2/repo/api/dist/index.js` built on VPS (byte-identical to local: 952 B)
- [x] `systemctl is-active gridv2.service` → `active` (PID 8186, 12.1 MB memory)
- [x] `ss -tlnp` shows Node bound on `*:3000`
- [x] Caddyfile uses `reverse_proxy localhost:3000`, no placeholder `respond` block
- [x] `https://api.azuresb.com/health` returns the JSON payload through Caddy (HTTP/2 200, `content-type: application/json`)
- [x] All three services (`gridv2.service`, `caddy`, `postgresql`) report `active`

## Recovery scenarios

| Problem | Fix |
|---|---|
| Cloudflare Pages frontend deploy fails after the `api/` commit | Almost certainly unrelated — check the build log. The `api/` subdir has its own package.json and doesn't affect root `npm run build`. |
| `gridv2.service` won't start, journal shows `MODULE_NOT_FOUND` | `node_modules/` missing on VPS — re-run `npm install` inside `/home/gridv2/repo/api` |
| `systemctl status gridv2.service` → `Failed at step EXEC spawning ... Permission denied` | The `dist/index.js` was created with wrong ownership — `chown -R gridv2:gridv2 /home/gridv2/repo` |
| Caddy reload fails with the log permission issue from runbook 03 | The override at `/etc/systemd/system/caddy.service.d/override.conf` should still be in place. If `/var/log/caddy/api.azuresb.com.log` is owned by root again, `rm` it and `systemctl restart caddy`. |
| `npm install` on VPS hits network errors | Check `curl https://registry.npmjs.org` — if it fails, DNS or firewall issue. ufw allows outgoing, should be fine. |

## Notes & gotchas log

- **2026-05-21 18:55 PST (01:55 UTC 2026-05-22)** — Phase A–C: api/ subdir scaffolded locally via direct file writes (Claude wrote the 6 files; John ran npm install + build). Six source files: package.json, tsconfig.json, .gitignore, src/index.ts, src/db/schema.ts, drizzle.config.ts.
- **2026-05-21 18:58 PST** — Phase D: local smoke test passed. `node dist/index.js` → `[gridv2-api] listening on http://localhost:3000`. `curl.exe -s http://localhost:3000/health` returned the JSON payload as expected. **PowerShell `curl` is aliased to `Invoke-WebRequest`** which has a different output format — use `curl.exe` for Unix-style behavior, or `Invoke-RestMethod` for parsed JSON.
- **2026-05-21 19:01 PST** — Phase E: committed as `455d1a3` (7 files, 1803 insertions; lion's share is `package-lock.json`). Push to `main` succeeded. Cloudflare Pages rebuild triggered automatically — frontend deploy unaffected because Vite ignores `api/`.
- **2026-05-21 19:03 PST — Gotcha** — `sudo -u gridv2 git clone https://github.com/bungph3-inspired/gridv2.git` prompted for a GitHub username on the VPS. **Root cause:** repo was private; HTTPS clone of a private repo requires auth. **Fix chosen:** flipped repo to public via GitHub Settings → Danger Zone → Change visibility. No secrets in the repo (those live in `/etc/gridv2/env` on the VPS), and the frontend is already publicly served via Cloudflare Pages. Re-ran the clone after the flip — succeeded immediately, no auth prompt.
- **2026-05-21 19:06 PST** — Phase F + G: clone succeeded, 305 objects/6.76 MiB at 46.76 MiB/s (Hetzner network is excellent). `npm install` on VPS: same 26 packages, same 5 vulnerabilities + npm version notice as local (harmless noise). `npm run build` produced byte-identical `dist/index.js` (952 B) — confirming reproducibility.
- **2026-05-21 19:08 PST** — Phase H: rewrote `/etc/systemd/system/gridv2.service` to point at `/home/gridv2/repo/api/` (was `/home/gridv2/api/` from runbook 03's placeholder). systemd-analyze verify clean (only unrelated `xfs_scrub` warnings).
- **2026-05-21 19:09 PST** — Phase I: `systemctl enable --now gridv2.service` → `Active: active (running)`, PID 8186, 12.1 MB memory. Direct `curl localhost:3000/health` returns the JSON payload. No errors in `api.err.log`.
- **2026-05-21 19:12 PST** — Phase J: Caddyfile flipped from `respond "..."` to `reverse_proxy localhost:3000` with `header_up X-Real-IP` + `header_up X-Forwarded-Proto`. `caddy validate` → `Valid configuration`. `systemctl reload caddy` succeeded cleanly (no log-permission issues this time — the override + recreated log file from runbook 03 are still in place).
- **2026-05-21 19:13 PST** — Phase K: end-to-end public HTTPS hit. `curl -sI https://api.azuresb.com/health` → `HTTP/2 200`, `content-type: application/json`, `server: Caddy`, `access-control-allow-origin: *`, HTTP/3 advertised. Body matches Node API output exactly.
- **End state:** Full stack live and publicly reachable. Frontend at `app.azuresb.com` (Cloudflare), API at `api.azuresb.com` (Caddy → Hono on localhost:3000). All three services (gridv2.service, caddy, postgresql) under systemd with auto-restart.

### Followups (not blocking)

- `npm audit fix` — 5 transitive-dep vulnerabilities (4 moderate, 1 high) on both local and VPS. Likely need `--force` to bump major versions of drizzle-kit/tsx. Defer until post-MVP.
- npm version notice → 11.15.0 available. Not urgent; npm 10.8.2 works fine.
- `caddy fmt --overwrite /etc/caddy/Caddyfile` — formatting warning. Cosmetic only.
- Consider adding `ClientAliveInterval 60` to `/etc/ssh/sshd_config` so idle SSH doesn't drop (followup from runbook 03).

## Next steps after runbook 04

Once `https://api.azuresb.com/health` returns the JSON payload through Caddy, the API skeleton is alive and runbook 04 is complete.

The next document is **AUTH_DESIGN.md** (not a runbook — a design spec). It locks down:

- `agents` table schema: `id`, `username` (unique), `password_hash` (Argon2), `role` enum (`master` | `subagent`), `created_by` (FK self), `created_at`, `disabled_at`
- `sessions` table schema: `id`, `agent_id` (FK), `expires_at`, `last_seen_at`, signed cookie token
- Endpoints: `POST /api/login`, `POST /api/logout`, `GET /api/agents` (master-only), `POST /api/agents` (master-only, creates subagent), `PATCH /api/agents/:id/disable`
- MASTER seeder: reads `MASTER_USERNAME` + `MASTER_PASSWORD` from `/etc/gridv2/env` on each startup; creates the row if absent, no-op if present
- `agent.html` UI changes: real password field, MASTER-only admin panel showing subagent list + create form

After AUTH_DESIGN.md is approved, a follow-up runbook (`05-auth.md`) implements it: Drizzle schema additions, migration, Hono routes, Argon2 hashing, session cookie middleware, the agent.html panel.
