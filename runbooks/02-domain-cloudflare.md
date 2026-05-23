# 02 — Domain Setup (Cloudflare Registrar + DNS)

> Second runbook in the GridV2 Phase 0 series. Covers Cloudflare Registrar purchase, DNS records, and Pages custom-domain hookup.
>
> **Status:** ALL PHASES COMPLETE 2026-05-21.
>
> **Domain:** `azuresb.com` (Azure Sportsbook — user-facing brand). Internal codename stays `GridV2`.

## Decisions (locked)

| Question | Answer |
|---|---|
| Registrar | Cloudflare Registrar (wholesale, free WHOIS privacy) |
| Domain | `azuresb.com` |
| Annual cost | $10.46 |
| Auto-renew | Enabled (default) |
| Apex destination | Pages frontend (CNAME flattening) |
| Brand identity | User-facing: "Azure Sportsbook" / "Azure". Internal/repo: GridV2 |

## Prerequisites (all complete)

- [x] Cloudflare account with billing method on file
- [x] GridV2 deployed at `gridv2.pages.dev` (Cloudflare Pages project named `gridv2`)
- [x] VPS provisioned with IPv4 `178.105.154.183` (runbook 01)

## Phase A — Purchase (DONE 2026-05-21)

1. dash.cloudflare.com → Domain Registration → Register Domain
2. Searched `azuresb` → bought `.com` at $10.46/yr
3. WHOIS privacy auto-enabled (free)
4. Domain became live immediately (Cloudflare DNS is authoritative from minute zero)

## Phase B — Wire frontend (DONE 2026-05-21)

### B1. Pages custom domain — `app.azuresb.com`

1. Cloudflare Dashboard → **Pages** → opened project `gridv2`
2. **Custom domains** tab → **Set up a custom domain**
3. Entered `app.azuresb.com`
4. Cloudflare initially showed "Verifying" with manual CNAME instructions
5. CNAME `app → gridv2.pages.dev` (proxied/orange cloud) was auto-created by Cloudflare shortly after
6. Verification flipped to active
7. Verified: `https://app.azuresb.com` loads the GridV2 frontend with valid Cloudflare SSL

### B2. Apex `azuresb.com` — wired 2026-05-23

**Decision (2026-05-23):** Wire the apex so `azuresb.com` resolves to the same content as `app.azuresb.com`. Both serve the Pages site directly (no redirect in v1 — keep both URLs canonical). If we later want a canonical app URL, add a 301 redirect rule `azuresb.com/*` → `https://app.azuresb.com/$1` via Cloudflare Rules → Redirect Rules.

**Manual steps (John drives via Cloudflare dashboard):**

1. dash.cloudflare.com → **Pages** → open project `gridv2`
2. **Custom domains** tab → **Set up a custom domain**
3. Enter `azuresb.com` (no `app.` prefix, no `https://`)
4. Click **Continue → Activate domain**
5. Cloudflare creates a CNAME flattening record at the apex (`azuresb.com` → `gridv2.pages.dev`) automatically. You'll see it appear in the DNS tab as a `CNAME` (which is normally illegal at the apex; Cloudflare's CNAME flattening makes it work).
6. **Wait** for status to flip from "Verifying" to "Active" (typically 30–60 seconds; if stuck >10 min, remove and re-add).

**Verification:**

```bash
# DNS resolution
nslookup azuresb.com
# Expected: resolves to a Cloudflare IP (104.x.x.x or 172.x.x.x range)

# HTTPS reach
curl -I https://azuresb.com
# Expected: 200 OK, cf-ray header, valid TLS

# Same content as app.azuresb.com
curl -s https://azuresb.com | head -5
curl -s https://app.azuresb.com | head -5
# Expected: identical (both serve the Pages build)
```

**Verification checklist:**

- [ ] `https://azuresb.com` loads the GridV2 frontend in an incognito window
- [ ] Valid SSL cert (issued by Cloudflare; same cert chain as `app.azuresb.com`)
- [ ] No mixed-content warnings
- [ ] `nslookup azuresb.com` returns Cloudflare proxy IPs (proves CNAME flattening + orange cloud)
- [ ] Cloudflare DNS tab shows a `CNAME` record at the apex pointing to `gridv2.pages.dev`, proxied (orange cloud)

**Recovery:**

| Problem | Fix |
|---|---|
| "azuresb.com is already configured" error | Means a stale record exists in DNS. DNS tab → delete any existing apex A or AAAA record, then re-add via Pages. |
| Verification stuck >10 min | Remove the domain from Pages → wait 60s → re-add. |
| `https://azuresb.com` returns 522 / 524 | Apex got attached to the wrong Pages project. Confirm it's on the `gridv2` project, not a different one. |

### B3. Verification (Phase B)

- [x] `https://app.azuresb.com` loads frontend in incognito window
- [ ] (Pending Phase B2 execution) `https://azuresb.com` loads frontend
- [x] Valid SSL cert (issued by Cloudflare)
- [x] No mixed-content or CORS warnings in browser console

## Phase C — Wire backend `api` subdomain (DONE 2026-05-21)

### C1. A record added

Cloudflare Dashboard → `azuresb.com` → **DNS** → **Records** → **Add record**

| Field | Value |
|---|---|
| Type | A |
| Name | `api` |
| Content | `178.105.154.183` |
| Proxy status | **DNS only (grey cloud)** |
| TTL | Auto |

> **Critical:** grey cloud, not orange. Caddy on the VPS will request its own Let's Encrypt cert (runbook 03). Cloudflare's proxy interferes with that flow.

### C2. Verification (executed)

```powershell
PS C:\Users\bungp> nslookup api.azuresb.com
Server:  dsldevice.attlocal.net
Address: 192.168.1.254

Non-authoritative answer:
Name:    api.azuresb.com
Address: 178.105.154.183
```

Resolves correctly. Caddy not running yet — `curl https://api.azuresb.com` will fail until runbook 03.

### C3. Verification checklist (Phase C)

- [x] `nslookup api.azuresb.com` returns `178.105.154.183`
- [x] Grey cloud confirmed in Cloudflare DNS dashboard
- [ ] (Pending runbook 03) `curl https://api.azuresb.com/health` returns 200

## Final DNS state

| Record | Type | Content | Proxy | Purpose |
|---|---|---|---|---|
| `app.azuresb.com` | CNAME | `gridv2.pages.dev` | Orange | Frontend (canonical) |
| `api.azuresb.com` | A | `178.105.154.183` | **Grey** | Backend API |

## Updates triggered by this runbook (TODO)

When Phase B completes:

- [ ] `projects/GridV2/PROJECT.md` — add **Domains** section with the URLs
- [ ] `ClaudeWorkSpace/CLAUDE.md` Active Projects row — note new public URLs
- [ ] `ClaudeWorkSpace/CLAUDE.md` Open Threads — strike "domain (gridv2.app default)" from GridV2 Phase 0 decisions
- [ ] `projects/GridV2/GridV2_Roadmap.docx` — add section 11.7 addendum: "Domain locked: azuresb.com (Azure Sportsbook brand)"

These are documentation updates — defer until end of Phase 0 to batch.

## Recovery scenarios

| Problem | Fix |
|---|---|
| Wrong A record IP (typo) | DNS → Edit record → save. Propagates in seconds via Cloudflare. |
| Accidentally orange-clouded `api` | Click the orange cloud → toggle to grey. Caddy cert issuance will work on next renewal. If cert already broken, force renew on VPS. |
| Pages custom domain stuck on "Verifying" | Usually resolves in 60 sec. If stuck >10 min, remove and re-add. |
| Need to move registrar later (60-day ICANN lock) | Wait out the 60 days from 2026-05-21. After that, registrar transfer is standard. |

## Notes & gotchas log

- **2026-05-21** — Domain purchased ($10.46/yr).
- **2026-05-21** — Pages hookup initially showed manual CNAME instructions, then auto-created the record shortly after. `app.azuresb.com` live.
- **2026-05-21** — `api.azuresb.com` A record added, grey cloud confirmed. `nslookup` returns VPS IP.

## Next runbook

`03-stack-install.md` — Node 20, Postgres 16, Caddy install on `gridv2prod01`. Caddy reverse-proxies `api.azuresb.com` once the API server is running. Phase 1 starts after this.
