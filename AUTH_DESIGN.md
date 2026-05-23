# AUTH_DESIGN.md

> Design spec for the Azure Sportsbook (internal: GridV2) authentication system. Locks the data model, session strategy, MASTER seeder behavior, endpoints, and access control rules before any auth code is written. Implementation lands in `runbooks/05-auth.md` after this is approved.
>
> **Status:** LOCKED 2026-05-23 — all §10 small items resolved with John. Implementation can begin in runbook 08.
>
> **Predecessor docs:** PROJECT.md (sets Argon2 + cookie attrs), `runbooks/03-stack-install.md` (provisions `/etc/gridv2/env` with `MASTER_USERNAME` slot), `runbooks/04-api-scaffold.md` (Hono server + Drizzle config in place).

## 1. Scope

In-scope:
- Hierarchical agent tree with one MASTER at the root
- Password-based auth, cascading parent-creates-child password lifecycle
- Session-cookie auth (dies on browser close)
- Endpoints for login, logout, current-user, downline management
- Access control: every agent only sees/modifies their downline
- Lockout policy and parent-unlock flow
- MASTER seeder from env vars
- UI changes to `agent.html` (login form, MASTER admin panel)

Out-of-scope (deferred):
- Self-service password reset (no "forgot password" flow — parent always resets)
- Email verification (no email field at all in MVP)
- Two-factor authentication (no real money, private invite-only — add post-MVP if needed)
- OAuth / SSO
- API keys for programmatic access (humans-only in MVP)
- Audit log table (operational concern, can be added later without schema break)
- Wager limits / financial caps per agent (separate domain — covered in a future LIMITS_DESIGN.md)

## 2. Locked decisions (recap from 2026-05-22 session)

| # | Decision | Choice |
|---|---|---|
| 1 | Schema model | Option 1 — one `agents` table with `parent_id` self-FK |
| 2 | Hierarchy | Tree; agents see only their descendants |
| 3 | MASTER count | One main MASTER, seeded from env |
| 4 | Password lifecycle | Parent creates child's password. No self-service reset. |
| 5 | Session lifetime | Session cookie only — dies on browser close |
| 6 | Lockout | 5 failed attempts → locked; any upline agent unlocks |
| 7 | Account state | Soft-disable only (`disabled_at`); no hard delete |
| 8 | Password hashing | Argon2id (per PROJECT.md) |
| 9 | Cookie attributes | HttpOnly, Secure, SameSite=Lax (per PROJECT.md) |

## 3. Data model

### 3.1 `agents` table

Single table. Self-referential parent FK. Role derived from tree position (`has_children` boolean maintained by trigger for O(1) leaf queries).

```sql
CREATE TABLE agents (
  id              BIGSERIAL PRIMARY KEY,
  username        TEXT NOT NULL,
  username_lower  TEXT NOT NULL UNIQUE,           -- lowercased copy for case-insensitive login
  password_hash   TEXT NOT NULL,                  -- argon2id encoded ($argon2id$v=19$...)
  parent_id       BIGINT REFERENCES agents(id),   -- NULL for MASTER only
  has_children    BOOLEAN NOT NULL DEFAULT FALSE, -- maintained by AFTER INSERT/DELETE trigger
  created_by      BIGINT REFERENCES agents(id),   -- agent who created this row (NULL for MASTER, seeded)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  disabled_at     TIMESTAMPTZ,                    -- non-null = can't log in
  locked_at       TIMESTAMPTZ,                    -- non-null = locked out (cleared by upline)
  failed_logins   SMALLINT NOT NULL DEFAULT 0,    -- consecutive failures since last success
  last_login_at   TIMESTAMPTZ,
  CONSTRAINT master_no_parent CHECK ((parent_id IS NULL) = (id = 1))  -- enforced for the seeded MASTER
);

CREATE INDEX idx_agents_parent ON agents(parent_id);
CREATE INDEX idx_agents_username_lower ON agents(username_lower);
```

Notes:
- `username_lower` enforces case-insensitive uniqueness (`john` and `John` collide). Login query matches on `username_lower`. UI displays the original `username` casing.
- `has_children` is maintained by trigger (see 3.3). Avoids `SELECT COUNT(*)` on parent_id every time a UI needs to render "is leaf" badges.
- `master_no_parent` constraint pins the MASTER to id=1 to make the seeder's idempotent upsert deterministic.

### 3.2 `sessions` table

Random 32-byte token (hex-encoded) returned in cookie. Server stores SHA-256 of the token as the primary key — never the raw token.

```sql
CREATE TABLE sessions (
  token_hash      BYTEA PRIMARY KEY,              -- sha256(raw_token), 32 bytes
  agent_id        BIGINT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_agent      TEXT,                           -- for the agent's "active sessions" UI
  ip              INET                            -- last-seen IP for the same UI
);

CREATE INDEX idx_sessions_agent ON sessions(agent_id);
```

Notes:
- No `expires_at` — session cookies (no `Max-Age` on the cookie) die on browser close, and the server can prune any session not seen in N days via a cron (out of scope, post-MVP).
- Storing token *hash* means a DB leak doesn't immediately compromise sessions. Attacker would still need the raw token from a browser cookie.
- `ON DELETE CASCADE` ensures disabling/deleting an agent kills all their sessions (though delete is technically out of scope; cascade still useful for any future cleanup).

### 3.3 Triggers

```sql
-- Maintain has_children automatically
CREATE OR REPLACE FUNCTION agents_set_has_children() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.parent_id IS NOT NULL THEN
    UPDATE agents SET has_children = TRUE WHERE id = NEW.parent_id;
  ELSIF TG_OP = 'DELETE' AND OLD.parent_id IS NOT NULL THEN
    UPDATE agents SET has_children = (
      EXISTS (SELECT 1 FROM agents WHERE parent_id = OLD.parent_id AND id <> OLD.id)
    ) WHERE id = OLD.parent_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER agents_has_children_after_insert
  AFTER INSERT ON agents FOR EACH ROW EXECUTE FUNCTION agents_set_has_children();
CREATE TRIGGER agents_has_children_after_delete
  AFTER DELETE ON agents FOR EACH ROW EXECUTE FUNCTION agents_set_has_children();
```

(No UPDATE trigger needed because `parent_id` should never change after insert — move/reparent is out of scope for MVP.)

### 3.4 Recursive downline view

For access checks. Cached per-request, never materialized.

```sql
-- Used by middleware: "is target_id a descendant of acting_id (or acting_id itself)?"
WITH RECURSIVE downline AS (
  SELECT id FROM agents WHERE id = $acting_id
  UNION ALL
  SELECT a.id FROM agents a INNER JOIN downline d ON a.parent_id = d.id
)
SELECT EXISTS (SELECT 1 FROM downline WHERE id = $target_id) AS is_descendant;
```

## 4. Cookie + session strategy

| Attribute | Value | Why |
|---|---|---|
| Name | `gridv2_session` | Namespaced, not generic |
| Value | hex(random_bytes(32)) = 64 hex chars | 256 bits of entropy; SHA-256 hash stored in DB |
| HttpOnly | `true` | JS can't read it → XSS can't exfil session |
| Secure | `true` | HTTPS only (Caddy serves https://api.azuresb.com) |
| SameSite | `Lax` | CSRF protection; allows top-level navigation from app.azuresb.com → api.azuresb.com |
| Domain | unset (host-only on `api.azuresb.com`) | Tighter scope than `.azuresb.com` |
| Path | `/` | All API routes |
| Max-Age / Expires | **unset** | Session cookie — dies when browser closes |

Flow:
1. `POST /api/login` validates credentials, **deletes any existing `sessions` rows for that agent_id** (max-1-session policy — see §10), generates a fresh 32-byte token, inserts new `sessions` row with SHA-256(token), `Set-Cookie: gridv2_session=<token>; HttpOnly; Secure; SameSite=Lax; Path=/`
2. Every subsequent request: middleware reads cookie, SHA-256 it, `SELECT * FROM sessions WHERE token_hash = $hash`. If found, `UPDATE sessions SET last_seen_at = NOW(), ip = $req_ip` and attach agent to request context.
3. `POST /api/logout` deletes the row and `Set-Cookie: gridv2_session=; Max-Age=0` to clear.

## 5. MASTER seeder behavior

Runs on every API server boot, before HTTP listener starts.

```
env MASTER_USERNAME=Pisa
env MASTER_PASSWORD=<plaintext or empty>
```

Logic:
1. Look up agent with `id=1`.
2. If absent:
   - If `MASTER_PASSWORD` is non-empty: hash it (argon2id), insert MASTER row with `id=1`, `username=$MASTER_USERNAME`, `username_lower=lower($MASTER_USERNAME)`, `password_hash=$hash`, `parent_id=NULL`, `created_by=NULL`. Log "MASTER seeded".
   - If `MASTER_PASSWORD` is empty: fatal error. Log "MASTER absent, MASTER_PASSWORD not set — refusing to start." Exit 1.
3. If present:
   - If `MASTER_PASSWORD` is empty: do nothing. (Normal case after first boot — MASTER manages own password in UI.)
   - If `MASTER_PASSWORD` is non-empty: hash it, `UPDATE agents SET password_hash = $hash, locked_at = NULL, failed_logins = 0 WHERE id = 1`. Log "MASTER password reset from env." (Recovery hatch — set env, restart, clear env, restart again.)
4. If `MASTER_USERNAME` differs from the existing row: warn but do not change. Username changes via UI only.

Recovery hatch: if MASTER forgets password, John SSHes to VPS, sets `MASTER_PASSWORD` in `/etc/gridv2/env`, restarts gridv2.service, logs in, clears the env var, restarts again. The double-restart pattern means the env-set password isn't persistent after the next deploy.

## 6. Endpoints

All under `/api/`. Caddy reverse-proxies `api.azuresb.com` to localhost:3000 (per runbook 04). All requests except `POST /api/login` require a valid session cookie.

| Method | Path | Body | Auth | Returns |
|---|---|---|---|---|
| POST | `/api/login` | `{username, password}` | none | 200 + Set-Cookie on success; 401 on bad creds; 423 (Locked) if `locked_at` set |
| POST | `/api/logout` | — | session | 204 + cookie clear |
| GET | `/api/me` | — | session | `{id, username, parent_id, has_children, disabled_at, created_at}` |
| GET | `/api/agents` | query: `?scope=children\|downline` | session | list of `{id, username, has_children, disabled_at, locked_at, last_login_at, created_at}` |
| POST | `/api/agents` | `{username, password}` | session | creates child under requester; 201 + new agent row; 409 if username taken |
| PATCH | `/api/agents/:id/password` | `{new_password}` | session, requester must be ancestor of `:id` | 204 |
| PATCH | `/api/agents/:id/disable` | — | session, ancestor | 204 + cascade-kill all sessions for that agent |
| PATCH | `/api/agents/:id/enable` | — | session, ancestor | 204 |
| PATCH | `/api/agents/:id/unlock` | — | session, ancestor | 204; clears `locked_at` + `failed_logins` |

Notes:
- `GET /api/agents?scope=children` returns direct children only (one tree level down). `?scope=downline` returns all descendants via the recursive CTE. UI defaults to `children` for the table view, fetches `downline` only when expanding to "show all descendants."
- `POST /api/agents` cannot create a sibling — the requester is always the parent. No `parent_id` field in the request.
- All PATCH endpoints reject with 403 if `:id` is not in the requester's downline. (MASTER's downline is everyone.)
- 404 vs 403 leak: prefer 404 when the target isn't in the requester's downline (don't reveal whether the agent exists outside their visibility).

## 7. Access control rules

Centralized in middleware. Every authenticated endpoint runs these checks:

1. **`requireSession(req)`** — extract `gridv2_session` cookie, hash, look up in `sessions`. If missing/invalid → 401. Attach `req.agent` (full row).
2. **`requireActive(req)`** — additionally check `req.agent.disabled_at IS NULL` and `req.agent.locked_at IS NULL`. If either set, log out and 401. (Belt-and-suspenders — login already prevents this, but covers the case where a session was issued and the agent was disabled afterward.)
3. **`requireDescendant(req, targetId)`** — runs the recursive CTE in section 3.4. Returns true if `targetId` is in `req.agent`'s downline (inclusive of self). Used by all `/api/agents/:id/*` endpoints.

Permission summary:
- MASTER sees and manages everyone (since everyone is in their downline).
- Any agent sees and manages their descendants only.
- No agent can see siblings, ancestors, or branches outside their downline.

## 8. Lockout policy

- On failed `POST /api/login`: `UPDATE agents SET failed_logins = failed_logins + 1 WHERE username_lower = $username`. If new value >= 5, `SET locked_at = NOW()`. Return 401 (don't reveal whether the username exists vs the password was wrong).
- On successful login: `UPDATE agents SET failed_logins = 0, last_login_at = NOW() WHERE id = $id`.
- On `PATCH /api/agents/:id/unlock`: `UPDATE agents SET locked_at = NULL, failed_logins = 0 WHERE id = $id` (after ancestor check).
- Failed-attempt counter does NOT decay on its own (no time-window reset). Five failures, ever-since-last-success, = locked. Forces explicit unlock by ancestor, which is fine for an invite-only group.

## 9. UI changes (`agent.html`)

### 9.1 Login form (replaces the mock `bs_agent` localStorage gate)

- Splash screen replaced with a centered card: username input, password input, submit button.
- Submit → `POST /api/login`. On 200: navigate to dashboard. On 401: show "Incorrect username or password" (generic — don't leak which). On 423: show "Account locked. Contact your agent to unlock."
- Remove all `localStorage.setItem('bs_agent', ...)` usage. The dashboard reads `GET /api/me` instead.

### 9.2 MASTER / agent admin panel

A new dashboard tile (or tab — TBD during implementation) reachable by any agent with `has_children = true`. Shows:
- Table of direct children: username, has_children, disabled status, locked status, last_login_at, [Manage] button
- "Create subagent" form: username + password + submit. POSTs to `/api/agents`.
- [Manage] opens a detail view per child: rename, reset password, disable/enable, unlock.
- For MASTER (and any agent with deep downline): an optional "view full downline" toggle that fetches `?scope=downline` and renders as an indented tree.

### 9.3 Logout

- Header gains a "Sign out" button. Calls `POST /api/logout`, navigates to login screen.

### 9.4 Session handling

- All API calls include cookie automatically (browser handles it). No bearer tokens, no auth headers.
- On any 401 response from the API, the SPA navigates back to login. (Stale or invalid session.)

## 10. Locked small items (resolved 2026-05-23)

These were left as open questions in the original draft. Locked with John 2026-05-23.

| # | Item | Decision | Implementation note |
|---|------|----------|---------------------|
| 1 | Username format | ASCII letters + digits + underscore, 3–32 chars, case-insensitive | Validator regex: `/^[A-Za-z0-9_]{3,32}$/`. Lowercased copy in `username_lower` enforces uniqueness. Reject anything else with 400. |
| 2 | Password format | Minimum 3 characters, no other rules | Validator checks `password.length >= 3`. No complexity, no max length (Argon2 caps at ~1KB anyway). |
| 3 | `GET /api/agents` default scope | `children` | When `?scope=` is missing, return direct children only. UI explicitly passes `?scope=downline` when expanding to all descendants. |
| 4 | MASTER username changes | UI-only after first seed | Env-var `MASTER_USERNAME` is consulted on first boot only. On subsequent boots, if the env value differs from the DB row, log a warning and keep the DB value. Rename happens via admin panel. |
| 5 | Concurrent sessions per agent | Max 1 — kill all others on login | On successful `POST /api/login`, run `DELETE FROM sessions WHERE agent_id = $id` *before* inserting the new session row. Side effect: logging in from a new device boots all other devices on the next API call. UX: SPA gets 401, redirects to login. Enforces "no shared accounts." |
| 6 | Disable behavior on existing sessions | Kill all sessions immediately | `PATCH /api/agents/:id/disable` is two SQL statements in a transaction: `UPDATE agents SET disabled_at = NOW() WHERE id = $id; DELETE FROM sessions WHERE agent_id = $id;`. Disabled agent's next request returns 401. |

## 11. Reference: example flows

### 11.1 First boot (MASTER seeding)

```
[env: MASTER_USERNAME=Pisa, MASTER_PASSWORD=correcthorsebatterystaple]
gridv2.service start
  → seeder: agent id=1 not found, MASTER_PASSWORD set
  → INSERT INTO agents (id, username, username_lower, password_hash, parent_id, created_by)
                VALUES (1, 'Pisa', 'pisa', '$argon2id$...', NULL, NULL)
  → log: "MASTER seeded as 'Pisa'"
[admin clears MASTER_PASSWORD in /etc/gridv2/env, restarts]
gridv2.service start
  → seeder: agent id=1 found, MASTER_PASSWORD empty → no-op
  → log: "MASTER present, no seeding action"
[server begins serving HTTP]
```

### 11.2 MASTER creates a subagent

```
[MASTER POSTs /api/login {username:"Pisa", password:"correcthorse..."}]
  → 200, Set-Cookie: gridv2_session=abc...
[MASTER POSTs /api/agents {username:"AgentA", password:"agentapassword"}]
  → middleware: requireSession ok (MASTER)
  → INSERT INTO agents (username, username_lower, password_hash, parent_id, created_by)
                VALUES ('AgentA', 'agenta', '$argon2id$...', 1, 1)
  → AFTER INSERT trigger: UPDATE agents SET has_children=TRUE WHERE id=1
  → 201, returns new agent row
[AgentA can now log in with username "AgentA" + password "agentapassword"]
```

### 11.3 Player locked out, agent unlocks

```
[Player A1 fails login 5 times]
  → 5th attempt: UPDATE agents SET failed_logins=5, locked_at=NOW() WHERE username_lower='playera1'
  → response: 423 Locked
[Player contacts Agent A]
[Agent A POSTs /api/login, then PATCH /api/agents/<player_a1_id>/unlock]
  → middleware: requireSession ok (Agent A), requireDescendant ok (Player A1 is child of Agent A)
  → UPDATE agents SET locked_at=NULL, failed_logins=0 WHERE id=<player_a1_id>
  → 204
[Player A1 can log in again]
```

## 12. Implementation runbook handoff

After this design is approved, `runbooks/05-auth.md` will:
- Drizzle migration: agents + sessions tables, indexes, triggers
- Argon2id wrapper (`bcrypt`? no — `@node-rs/argon2` is the npm pick for Node, native, fast)
- Hono routes for every endpoint in §6
- Cookie middleware (`hono/cookie` is built-in)
- Recursive CTE helper for downline checks
- MASTER seeder hook in API server startup (before `serve()`)
- Front-end: login form, `/api/me` bootstrap call, MASTER admin panel scaffold
- Integration tests covering: MASTER seed, login success, login fail, lockout at 5, unlock by ancestor, downline scope rejection, session cookie behavior
- End-to-end: log into `app.azuresb.com`, see your agent panel, create a subagent, log in as that subagent
