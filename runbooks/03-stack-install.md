# 03 — Stack Install (Node 20 + Postgres 16 + Caddy)

> Third runbook in the GridV2 Phase 0 series. Installs the runtime stack on `gridv2prod01` so the API server (runbook 04) and the auth layer (AUTH_DESIGN.md, after this) have a place to live.
>
> **Status:** EXECUTED 2026-05-21 (UTC 2026-05-22).
>
> **Starting state (from runbooks 01–02):**
> - Hetzner CPX32, Ubuntu 26.04 LTS, `gridv2prod01`, IP `178.105.154.183`
> - ufw active with 22/80/443 open, password SSH disabled, key auth only
> - DNS: `api.azuresb.com` (A, grey cloud) → `178.105.154.183`
> - Frontend live at `app.azuresb.com` (Cloudflare Pages, unrelated to this runbook)

## What this runbook builds

| Component | Version | Why |
|---|---|---|
| Non-root OS user `gridv2` | n/a | Runs the API + cron worker; never run Node as root |
| Node | 20.x LTS | Hono API server runtime |
| Postgres | 16.x | Accounts, balances, bets, odds snapshots |
| Caddy | 2.x | Auto-HTTPS reverse proxy in front of the Node API |
| `/etc/gridv2/` | — | Config + secrets dir (env file, `agents.paused` flag) |
| `/var/log/gridv2/` | — | Log dir for API server + agent fleet |
| `gridv2.service` systemd unit | — | Scaffold only — actual binary lands in runbook 04 |

**Out of scope here:**
- Drizzle ORM (Node dep — installed via npm when the API server is scaffolded in runbook 04)
- The API server itself (runbook 04)
- The MASTER seeder (AUTH_DESIGN.md + auth implementation, after 04)
- The cron worker for OddsPapi polling (runbook 05)

## Prerequisites

- [x] Runbook 01 complete (VPS provisioned + SSH hardened)
- [x] Runbook 02 complete (`api.azuresb.com` A record live, grey cloud)
- [x] Local SSH access verified: `ssh root@178.105.154.183` works
- [x] MASTER username: **`Pisa`** (used later by the auth seeder — env-var lands in `/etc/gridv2/env` in Phase G)
- [x] Caddy / Let's Encrypt contact email: **`bungph3@gmail.com`** (LE uses this for cert-expiry warnings if auto-renewal ever fails)

## Phase A — Create non-root `gridv2` OS user

> The API server runs as `gridv2`, never as root. systemd unit later sets `User=gridv2`.

```bash
ssh root@178.105.154.183

# Create system user with no login shell, no home password
adduser --system --group --shell /bin/bash --home /home/gridv2 gridv2

# Allow ssh-key login as gridv2 (copy root's authorized_keys for now;
# rotate to a dedicated deploy key later if multiple people need access)
mkdir -p /home/gridv2/.ssh
cp /root/.ssh/authorized_keys /home/gridv2/.ssh/authorized_keys
chown -R gridv2:gridv2 /home/gridv2/.ssh
chmod 700 /home/gridv2/.ssh
chmod 600 /home/gridv2/.ssh/authorized_keys

# Verify
sudo -u gridv2 whoami         # → gridv2
sudo -u gridv2 ls /home/gridv2 # works
```

### Verification (Phase A)

- [x] `id gridv2` shows `uid=100(gridv2) gid=107(gridv2) groups=107(gridv2)`
- [x] `ssh gridv2@178.105.154.183` from local works (key auth, no password)
- [x] `sudo -u gridv2 whoami` returns `gridv2`

## Phase B — Install Node 20 LTS

> NodeSource repo gives the cleanest current Node 20 on Ubuntu. Don't use the distro's `nodejs` package — too old.

```bash
# As root
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Verify
node --version    # → v20.x.x (LTS)
npm --version     # → 10.x.x
```

### Optional: pnpm

Not required, but if you prefer pnpm over npm later:
```bash
npm install -g pnpm
```

### Verification (Phase B)

- [x] `node --version` → `v20.20.2`
- [x] `npm --version` → `10.8.2`
- [x] `which node` → `/usr/bin/node`
- [x] `sudo -u gridv2 node --version` → `v20.20.2` (PATH inherited)

## Phase C — Install Postgres 16

> Use the PGDG (PostgreSQL Global Development Group) repo to pin version 16 explicitly. Ubuntu 26.04's stock postgresql package may default to 17 — we want 16 to match PROJECT.md.

```bash
# Add PGDG repo
apt install -y curl ca-certificates gnupg lsb-release
install -d /usr/share/postgresql-common/pgdg
curl -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
  --fail https://www.postgresql.org/media/keys/ACCC4CF8.asc
echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] \
  https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
  > /etc/apt/sources.list.d/pgdg.list

apt update
apt install -y postgresql-16

# Verify service running
systemctl status postgresql
sudo -u postgres psql -c "SELECT version();"
```

### Verification (Phase C)

- [x] `systemctl is-active postgresql` → `active`
- [x] `systemctl is-active postgresql@16-main` → `active`
- [x] `SELECT version();` → `PostgreSQL 16.14 (Ubuntu 16.14-1.pgdg26.04+1) on x86_64`
- [x] `ss -tlnp | grep 5432` shows `127.0.0.1:5432` and `[::1]:5432` only (no 0.0.0.0)

## Phase D — Postgres: create gridv2 DB + role

```bash
# Generate a strong password for the gridv2 DB user
# (Save this — it goes into /etc/gridv2/env in Phase G)
openssl rand -base64 32

# Create role + database
sudo -u postgres psql <<EOF
CREATE ROLE gridv2 WITH LOGIN PASSWORD 'PASTE_GENERATED_PASSWORD_HERE';
CREATE DATABASE gridv2 OWNER gridv2 ENCODING 'UTF8';
GRANT ALL PRIVILEGES ON DATABASE gridv2 TO gridv2;
EOF

# Lock down listen_addresses (should already be localhost only — verify)
grep "^listen_addresses" /etc/postgresql/16/main/postgresql.conf
# Expected: listen_addresses = 'localhost'  (or commented out, which defaults to localhost)

# Test login as gridv2 over Unix socket
sudo -u gridv2 psql -h localhost -U gridv2 -d gridv2 -c "SELECT current_user, current_database();"
# Should prompt for password, then return: gridv2 | gridv2
```

### Verification (Phase D)

- [x] `\du gridv2` shows role with default attributes (login-only)
- [x] `\l gridv2` shows database owned by `gridv2`, encoding `UTF8`, locale `en_US.UTF-8`
- [x] Password generated by `openssl rand -hex 32` (64 hex chars) — saved out of band
- [x] `listen_addresses` commented out (defaults to localhost-only)
- [x] `pg_hba.conf` uses `scram-sha-256` for TCP, `peer` for local socket
- [x] DB connection test from `gridv2` OS user → `gridv2` DB role returns `connection works|gridv2|gridv2`

## Phase E — Install Caddy

> Caddy 2.x from the official repo. Handles HTTPS automatically via Let's Encrypt — that's why `api.azuresb.com` is grey-clouded in Cloudflare (runbook 02).

```bash
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | \
  gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | \
  tee /etc/apt/sources.list.d/caddy-stable.list

apt update
apt install -y caddy

systemctl status caddy
caddy version
```

### Verification (Phase E)

- [x] `caddy version` → `v2.11.3 h1:vFbdjcs2DtzcWTIxHybf5R5TspYFFThlZffChyBFHg=`
- [x] `systemctl is-active caddy` → `active`
- [x] `curl -sI http://localhost` → `HTTP/1.1 200 OK` (default Caddy welcome page)
- [x] `ss -tlnp` shows Caddy on `:80` only (no `:443` yet — Caddy binds 443 once a site with TLS is configured in Phase F)

## Phase F — Caddyfile for `api.azuresb.com`

> Reverse-proxies HTTPS traffic on `api.azuresb.com` to the Node API on `localhost:3000`. The Node API doesn't exist yet — we add a temporary `respond` block to verify the cert + DNS flow end-to-end, then swap to `reverse_proxy` once runbook 04 lands.

```bash
# Back up the stock Caddyfile
cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak

# Write the gridv2 Caddyfile
cat > /etc/caddy/Caddyfile <<'EOF'
{
  # Global options
  email bungph3@gmail.com
}

api.azuresb.com {
  encode zstd gzip

  # TEMPORARY — until runbook 04 lands the Node API server.
  # Swap this `respond` block for the `reverse_proxy` block below
  # once `localhost:3000` is serving.
  respond "gridv2 api — stack alive, server pending" 200

  # reverse_proxy localhost:3000 {
  #   header_up X-Real-IP {remote_host}
  # }

  log {
    output file /var/log/caddy/api.azuresb.com.log {
      roll_size 10mb
      roll_keep 5
    }
  }
}
EOF

# Validate config before reload
caddy validate --config /etc/caddy/Caddyfile

# Reload
systemctl reload caddy

# Watch the log as Caddy requests the LE cert (first request takes a few seconds)
journalctl -u caddy -f
# Look for: "certificate obtained successfully" for api.azuresb.com
# Ctrl-C out of the journal once you see it
```

### Verification (Phase F)

- [x] `curl -s https://api.azuresb.com` → `gridv2 api - stack alive, server pending` (note: em-dash dropped to a regular hyphen during execution to avoid SSH/heredoc encoding surprises)
- [x] `curl -sI https://api.azuresb.com` → `HTTP/2 200`, `server: Caddy`, valid LE cert (HTTP/2 implies cert OK — TLS handshake succeeded)
- [x] `journalctl -u caddy` shows `"msg":"certificate obtained successfully","identifier":"api.azuresb.com","issuer":"acme-v02.api.letsencrypt.org-directory"`
- [x] `ss` confirms Caddy now on both `:80` and `:443`
- [ ] Browser cross-origin fetch from `https://app.azuresb.com` — deferred to runbook 04 (CORS lives in the Node API)

> **CORS not configured yet.** When the Node API server lands in runbook 04, it owns CORS — Caddy passes the request through unchanged.

### Caddyfile log permission gotcha (encountered during Phase F)

`systemctl reload caddy` failed with `open /var/log/caddy/api.azuresb.com.log: permission denied`. Two contributing causes — the first one fixed half the problem, the second was the actual blocker:

1. Caddy's systemd unit hardens with `ProtectSystem=full`. The default `ReadWritePaths` does not include `/var/log/caddy`. Fixed with a drop-in override at `/etc/systemd/system/caddy.service.d/override.conf`:
   ```
   [Service]
   ReadWritePaths=/var/log/caddy
   ```
   (systemd merges this with the unit's existing `ReadWritePaths` rather than replacing it.)
2. **The actual blocker** — an earlier failed reload attempt had touched the log file as **root:root mode 0600** before bailing. The override fix didn't fix the existing file's ownership, so Caddy still couldn't open it for writing. Fix:
   ```bash
   rm /var/log/caddy/api.azuresb.com.log
   systemctl restart caddy
   ```
   Caddy then recreated the file as `caddy:caddy` on startup, and it's worked ever since.

The override at `/etc/systemd/system/caddy.service.d/override.conf` is left in place — it's good hardening hygiene even though the immediate trigger was the stale root-owned file.

## Phase G — Config + log directories

```bash
# Config dir — readable by gridv2 group only
mkdir -p /etc/gridv2
chown root:gridv2 /etc/gridv2
chmod 0750 /etc/gridv2

# Env file — placeholder secrets, locked down
cat > /etc/gridv2/env <<'EOF'
# /etc/gridv2/env — sourced by gridv2.service systemd unit
# Mode: 0640 root:gridv2 — keep secrets out of git, out of the home dir

# Postgres connection (gridv2 role, password from Phase D)
DATABASE_URL=postgresql://gridv2:PASTE_GENERATED_PASSWORD_HERE@localhost:5432/gridv2

# OddsPapi (paste real key once the subscription is active)
ODDSPAPI_KEY=

# Session signing secret — generate fresh with: openssl rand -hex 32
SESSION_SECRET=PASTE_OPENSSL_RAND_HEX_32_OUTPUT_HERE

# MASTER seed (read by API server on first boot — see AUTH_DESIGN.md, post-04)
# Leaving these blank now is fine; auth implementation reads + validates later.
MASTER_USERNAME=Pisa
MASTER_PASSWORD=

# Node runtime
NODE_ENV=production
PORT=3000
EOF

chown root:gridv2 /etc/gridv2/env
chmod 0640 /etc/gridv2/env

# Agent-fleet kill switch (referenced in PROJECT.md safety rails)
touch /etc/gridv2/agents.paused
chmod 0644 /etc/gridv2/agents.paused
# Currently exists (paused) — remove the file to enable the fleet once it ships

# Log dir
mkdir -p /var/log/gridv2 /var/log/caddy
chown gridv2:gridv2 /var/log/gridv2
chown caddy:caddy /var/log/caddy
chmod 0755 /var/log/gridv2 /var/log/caddy
```

### Verification (Phase G)

- [x] `/etc/gridv2/` is `drwxr-x--- root gridv2` (mode 0750)
- [x] `/etc/gridv2/env` is `-rw-r----- root gridv2` (mode 0640), contains `MASTER_USERNAME=Pisa`, `NODE_ENV=production`, `PORT=3000`
- [x] `/etc/gridv2/agents.paused` exists (kill switch present = fleet paused — delete the file later to enable)
- [x] `sudo -u gridv2 cat /etc/gridv2/env` succeeds (group read works)
- [x] `sudo -u caddy cat /etc/gridv2/env` fails with `Permission denied` (other users blocked)
- [x] `/var/log/gridv2` is `drwxr-xr-x gridv2 gridv2` (mode 0755), writable by the gridv2 user
- [x] DB connection from gridv2 OS user using credentials in `/etc/gridv2/env` returns `connection works|gridv2|gridv2`

## Phase H — systemd unit scaffold for the API server

> The unit references a binary that doesn't exist yet (`/home/gridv2/api/dist/index.js`). We install the unit now, leave it **disabled**, and runbook 04 enables + starts it after building the API.

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
WorkingDirectory=/home/gridv2/api
EnvironmentFile=/etc/gridv2/env
ExecStart=/usr/bin/node /home/gridv2/api/dist/index.js
Restart=on-failure
RestartSec=5
StandardOutput=append:/var/log/gridv2/api.log
StandardError=append:/var/log/gridv2/api.err.log

# Hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=/var/log/gridv2 /home/gridv2/api
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

# Don't enable/start yet — there's nothing to run
systemctl daemon-reload
systemctl status gridv2.service   # expected: "inactive (dead)" — unit loaded, not started

# Sanity check the unit file
systemd-analyze verify /etc/systemd/system/gridv2.service
```

### Verification (Phase H)

- [x] `systemctl status gridv2.service` shows `Loaded: loaded (/etc/systemd/system/gridv2.service; disabled; preset: enabled)` and `Active: inactive (dead)` — both expected
- [x] `systemctl list-unit-files gridv2.service` → `gridv2.service disabled enabled`
- [x] `systemd-analyze verify` returns no errors for `gridv2.service` (only unrelated warnings about `xfs_scrub_all.service` `CPUAccounting=` — system-level, not ours)
- [x] `/home/gridv2/api` pre-created as empty dir owned by `gridv2:gridv2` (runbook 04 populates)
- [ ] Runbook 04 will run `systemctl enable --now gridv2.service` after the binary is in place

## Full verification checklist (end of runbook 03)

- [x] `ssh gridv2@178.105.154.183` works (Phase A)
- [x] `node --version` → v20.20.2 (Phase B)
- [x] `SELECT version();` → PostgreSQL 16.14 (Phase C)
- [x] `gridv2` OS user → `gridv2` DB role connection: `connection works|gridv2|gridv2` (Phase D)
- [x] `curl https://api.azuresb.com` → `HTTP/2 200` with placeholder string + LE cert (Phase F)
- [x] `/etc/gridv2/env` exists, mode 0640, root:gridv2, contains `MASTER_USERNAME=Pisa` (Phase G)
- [x] `systemctl status gridv2.service` → loaded + inactive/dead (Phase H)

## Recovery scenarios

| Problem | Fix |
|---|---|
| Caddy can't get a cert (LE rate limit, DNS not propagated) | Wait 5–10 min, then `systemctl reload caddy`. If still failing, check `journalctl -u caddy`; common cause is `api.azuresb.com` still cached as orange-cloud somewhere. |
| Postgres won't start after Phase D | `journalctl -u postgresql`. Usually a syntax error in postgresql.conf or pg_hba.conf. Roll back the offending change. |
| Forgot the gridv2 DB password | `sudo -u postgres psql -c "ALTER ROLE gridv2 WITH PASSWORD 'new-password';"` then update `/etc/gridv2/env` to match. |
| Locked out of SSH | Hetzner Cloud Console → web console → password access fallback (set in runbook 01). |
| Need to roll back the whole stack | Hetzner Cloud Console → Backups → restore last snapshot (taken automatically since runbook 01 enabled backups). Loses changes since snapshot. |

## Notes & gotchas log

- **2026-05-21 18:18 PST (01:18 UTC 2026-05-22)** — Session opened. Baseline confirmed: Ubuntu 26.04 LTS, x86_64, `gridv2prod01`, fresh.
- **2026-05-21 18:19 PST** — Phase A done. `gridv2` system user uid=100/gid=107. Second-window SSH as gridv2 verified before continuing.
- **2026-05-21 18:21 PST** — Phase B done. NodeSource auto-detected via `nodistro` channel (distro-agnostic) — no Ubuntu 26.04 codename mismatch. Node v20.20.2 / npm 10.8.2.
- **2026-05-21 18:25 PST** — Phase C done via PGDG repo. PG 16.14, build tag `pgdg26.04+1` confirms PGDG has Ubuntu 26.04 (codename `questing`) packages. Listening on localhost only.
- **2026-05-21 18:28 PST — Gotcha** — `sudo -u postgres psql -c "SELECT version();"` opened the result in a `less`-style pager. Sitting in the pager idle dropped the SSH connection (`client_loop: send disconnect: Connection reset`). Reconnected; rerun used `psql -tA` to suppress the pager. **Followup:** consider adding `ClientAliveInterval 60` to `/etc/ssh/sshd_config` in a future hardening pass so idle SSH doesn't drop on us.
- **2026-05-21 18:32 PST** — Phase D done. DB password generated with `openssl rand -hex 32` and stored out of band. Held in shell var `$PGPASS` for Phase G chaining.
- **2026-05-21 18:36 PST** — Phase E done. Caddy 2.11.3 installed via Cloudsmith repo. Default Caddyfile serves a `:80` welcome page.
- **2026-05-21 18:39 PST — Gotcha** (twice) — `systemctl reload caddy` failed twice with `permission denied` on `/var/log/caddy/api.azuresb.com.log`. See "Caddyfile log permission gotcha" under Phase F for root cause + fix. Override file left in place at `/etc/systemd/system/caddy.service.d/override.conf`.
- **2026-05-21 18:44 PST** — Phase F done. After fix, LE cert issued successfully on first try (~15s after restart). `curl https://api.azuresb.com` returns the placeholder. End-to-end HTTPS path is live.
- **2026-05-21 18:47 PST** — Phase G done. `/etc/gridv2/env` populated with DATABASE_URL (real password), SESSION_SECRET (freshly generated, never logged), MASTER_USERNAME=Pisa, MASTER_PASSWORD=blank (filled by auth implementation later). Permission boundaries verified: gridv2 reads, caddy denied.
- **2026-05-21 18:49 PST** — Phase H done. `gridv2.service` unit installed, loaded, disabled. Binary path `/home/gridv2/api/dist/index.js` doesn't exist yet — runbook 04 populates. `systemd-analyze verify` clean (only unrelated `xfs_scrub_all` warnings).
- **End state:** Stack is alive and publicly reachable on `https://api.azuresb.com`. Postgres 16 ready. Node 20 ready. systemd unit waiting for a binary. All Phase 0 infra done.

## Next runbook

`04-api-scaffold.md` — Hono + Drizzle skeleton on the VPS:
- `git clone` the repo to `/home/gridv2/api`
- `npm install`, `npm run build`
- Drizzle config + initial migration (empty schema)
- `systemctl enable --now gridv2.service`
- Swap Caddy's `respond` block for `reverse_proxy localhost:3000`
- `GET https://api.azuresb.com/health` → 200

After 04, **AUTH_DESIGN.md** is the next document (not a runbook — a design spec). It locks down:
- `agents` + `sessions` table schemas
- `/api/login`, `/api/logout`, `/api/agents` endpoints
- MASTER seeder (env-var on first boot — recommended)
- `agent.html` UI changes (real password field, MASTER admin panel)

Then runbook 05 implements that auth on top of the scaffold.
