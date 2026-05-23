# 01 — VPS Provisioning (Hetzner CPX32)

> First runbook in the GridV2 Phase 0 series. Covers Hetzner signup, server purchase, SSH hardening. Stops before stack install (that's runbook 03).
>
> **Status:** EXECUTED 2026-05-21.

## What actually got built

| Field | Value |
|---|---|
| Server type | **CPX32** (x86 AMD, 4 vCPU / 8 GB / 160 GB NVMe) |
| Location | **Falkenstein (FSN1)** |
| Image | **Ubuntu 26.04 LTS** |
| Server name | `gridv2prod01` |
| Public IPv4 | `178.105.154.183` |
| Public IPv6 | `2a01:4f8:c015:fc35::1` |
| Backups | Enabled (20% surcharge) |
| Monthly cost | $20.39 (server $16.49 + IPv4 $0.60 + backups $3.30) |
| User-facing brand | Azure Sportsbook |
| Internal codename | GridV2 |

## Choice & rationale — why we deviated from the original plan

Original plan was CAX21 ARM in Falkenstein for the spec-per-dollar advantage. Hit two blockers:

1. **CAX21 out of stock** across Falkenstein, Helsinki, and Nuremberg.
2. **Only CAX11 available** (2 vCPU / 4 GB) — at that tier the ARM cost advantage evaporated (4 GB RAM matches CPX22, fewer vCPU).

Pivoted to **CPX32 in Falkenstein** because:
- John wanted to keep the server in EU (kept Falkenstein over Hillsboro).
- 4 vCPU / 8 GB matches the spec target that CAX21 was meant to hit.
- x86 means no architecture-specific debugging surprises.
- Cost ~$20/mo with backups — well within the Recommended-tier budget.

## Prerequisites (all complete)

- [x] SSH key generated on Windows: `~/.ssh/id_ed25519`
- [x] Credit card on file with Hetzner
- [x] OddsPapi ToS confirmation email sent (still awaiting reply — does not block VPS)

## Hetzner signup & purchase

1. **hetzner.com/cloud** → signup → email verify.
2. Identity verification not required for this account (already cleared).
3. Cloud Console → **+ New Project** → name `gridv2`.
4. **+ Add Server**.

### Final config used

| Field | Value |
|---|---|
| Location | Falkenstein (FSN1) |
| Image | Ubuntu 26.04 |
| Type | Regular Performance → CPX32 (x86 AMD) |
| IPv4 + IPv6 | Both enabled |
| SSH key | `john-windows-2026` (~/.ssh/id_ed25519.pub) — default for project |
| Backups | Enabled |
| Name | `gridv2prod01` |

> **Gotcha encountered:** Hetzner rejected the hostname `gridv2-prod-01` (hyphens?). `gridv2prod01` accepted on retry.

> **Gotcha encountered:** ARM (CAX) series out of stock across all EU regions tried (Falkenstein, Helsinki, Nuremberg). Only CAX11 available in Nuremberg. Pivoted to CPX32 x86.

## First SSH + harden

```bash
# From local Windows PowerShell
ssh root@178.105.154.183

# Once in:
apt update && apt upgrade -y      # 0 updates pending — fresh image
apt install -y ufw
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# Disable password SSH
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart ssh
```

### Safety check (executed)

Opened a second PowerShell window, ran `ssh root@178.105.154.183`. Key auth worked, no password prompt. Original session closed safely.

## Verification checklist

- [x] `ssh root@178.105.154.183` works from a fresh terminal (key auth, no password prompt)
- [x] `ufw status` shows `active` with rules for 22/80/443
- [x] `grep PasswordAuthentication /etc/ssh/sshd_config` shows `PasswordAuthentication no`
- [x] `uname -m` returns `x86_64`
- [x] `/etc/os-release` shows Ubuntu 26.04 LTS
- [x] Hetzner dashboard shows server Running, backups Enabled

## Recovery scenarios

| Problem | Fix |
|---|---|
| Locked out of SSH (key lost) | Hetzner Cloud Console → server → **Console** (web-based, password access) → restore key or reset password |
| Server unresponsive | Console → **Power** → reset |
| Need to undo a bad config change | Console → **Backups** → restore most recent snapshot (loses changes since last snapshot) |
| Want to test changes safely | Console → **Snapshot** → take manual snapshot before risky work (counts against backup quota) |

## Notes & gotchas log

- **2026-05-21 14:30 PST** — Server provisioned. CPX32 / Falkenstein / Ubuntu 26.04 / `gridv2prod01`.
- **2026-05-21 14:35 PST** — First SSH success. 0 pending updates on fresh image. ufw active with 22/80/443. Password auth disabled.
- **2026-05-21 14:40 PST** — Second-session verification passed. Box considered hardened.

## Next runbook

`02-domain-cloudflare.md` — already complete (executed in parallel).
`03-stack-install.md` — Node 20, Postgres 16, Caddy, Drizzle. Phase 1 starts after this.
