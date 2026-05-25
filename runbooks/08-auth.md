# 08 — Auth implementation (AUTH_DESIGN.md → code)

> Eighth runbook in the GridV2 series and the first runbook of **Phase 1**. Translates the locked design in `AUTH_DESIGN.md` (LOCKED 2026-05-23) into a working schema, API, and front-end on top of the Hono + Drizzle scaffold from runbook 04.
>
> **Status:** SCAFFOLD 2026-05-23 — Phase A detailed; B–E outlined. Phases will be filled in line-by-line as we walk them. No code committed yet.
>
> **Predecessor docs:**
> - `AUTH_DESIGN.md` — design source of truth. Every decision in this runbook traces back to a section there. **If a discrepancy appears, AUTH_DESIGN.md wins.**
> - `runbooks/03-stack-install.md` — provisioned `/etc/gridv2/env` with `DATABASE_URL`, `SESSION_SECRET`, `MASTER_USERNAME=Pisa`, `PORT=3000`.
> - `runbooks/04-api-scaffold.md` — Hono server live at `https://api.azuresb.com`, Drizzle wired (empty schema), `gridv2.service` running `/home/gridv2/repo/api/dist/index.js`.
> - `PROJECT.md` — Argon2id + cookie attrs (HttpOnly, Secure, SameSite=Lax) declared at the project level.
>
> **Starting state:**
> - Hono + Drizzle skeleton compiles and deploys; `GET /health` returns 200 via Caddy
> - `agents` / `sessions` tables do **not** exist yet (drizzle schema is empty)
> - `agent.html` still uses the `bs_agent` localStorage mock from BetSim — no real auth, no `/api/me` call
> - Agent fleet on the VPS is operational but kill-switched (`/etc/gridv2/agents.paused`). Spec-driven work for runbook 08 is allowed under that switch — see "Fleet handoff option" below.

## What this runbook builds

| Component | Purpose | AUTH_DESIGN ref |
|---|---|---|
| Drizzle migration: `agents` table | Self-referential tree with `parent_id`, `has_children`, lockout fields | §3.1 |
| Drizzle migration: `sessions` table | SHA-256 token hash → agent_id, session-cookie lifetime | §3.2 |
| Postgres trigger: `agents_set_has_children` | Maintain `has_children` on INSERT/DELETE | §3.3 |
| Recursive CTE helper (`isDescendant(actorId, targetId)`) | Access-control primitive used by every `/api/agents/:id/*` endpoint | §3.4 |
| Argon2id wrapper (`@node-rs/argon2`) | Password hash + verify | §2 row 8 |
| MASTER seeder (runs in API boot, before `serve()`) | Idempotent insert/reset from `MASTER_USERNAME` / `MASTER_PASSWORD` env vars | §5 |
| Cookie middleware (`hono/cookie`) | Read/write `gridv2_session` with locked attrs | §4 |
| Session-auth middleware: `requireSession`, `requireActive`, `requireDescendant` | Centralized access control on every protected route | §7 |
| Endpoints: login, logout, me | Public login + session bootstrap | §6 rows 1–3 |
| Endpoints: agent CRUD + state mgmt | List children/downline, create child, set password, disable/enable, unlock | §6 rows 4–9 |
| Lockout policy (5 fails → `locked_at`) | Counter never decays; ancestor clears | §8 |
| Front-end: login card on `agent.html` | Replaces the `bs_agent` localStorage gate | §9.1 |
| Front-end: admin panel (children table + create + manage drawer) | Any agent with `has_children = true` sees it | §9.2 |
| Front-end: sign-out + 401-redirect interceptor | Wires logout button + handles stale sessions | §9.3–9.4 |
| Integration tests | Seeder, login success/fail, lockout/unlock, downline scope, max-1-session, disable cascade | §12 |
| E2E smoke (manual once) | Real MASTER login on `app.azuresb.com`, create subagent, log in as subagent | §12 |

**Out of scope (deferred):**
- Self-service password reset / "forgot password" — §1 out-of-scope. Parent always resets.
- Email verification — no email field at all in MVP.
- 2FA, OAuth, SSO, API keys.
- Audit log table (operational, additive later, no schema break).
- Wager limits per agent — future `LIMITS_DESIGN.md`, separate runbook.
- Move/reparent agent — §3.3 note. No UPDATE trigger; not in MVP.
- Per-session expiry cron — §3.2 note. Add post-MVP.

## Prerequisites

- [x] `AUTH_DESIGN.md` LOCKED (header dated 2026-05-23, §10 small items resolved)
- [x] Runbook 04 deployed — Hono + Drizzle live at `https://api.azuresb.com/health`
- [ ] `/etc/gridv2/env` confirmed to hold `MASTER_USERNAME=Pisa` (per runbook 03)
- [ ] John picks the first-boot `MASTER_PASSWORD` value (set in env before deploy, cleared after first successful seed). Recovery hatch flow documented in §5.
- [ ] Decide whether to walk the runbook **manually** (John drives every commit) or hand it to the **agent fleet** as a `/specs/YYYY-MM-DD-night.md` file. See "Fleet handoff option" below.

### Fleet handoff option

The runbook 07 fleet is wired and currently kill-switched. Two paths to executing runbook 08:

**Path 1 — John-driven, manual.** Walk Phases A→E by hand on a feature branch, PR into `main`, deploy via the normal flow. Highest control; slowest. Pick this for Phase A (schema + seeder + boot wiring) since a botched migration is the easiest way to brick the API.

**Path 2 — Fleet-driven, per spec.** Write `/specs/2026-MM-DD-night.md` describing one phase at a time (Phase B or later, after the schema is in). Architect files an issue; Coder implements; Reviewer reviews; John merges. Pick this for Phases B–D once the foundation is in. Phase E (tests) can go either way.

**Recommended split:** Phase A manual (one sitting); Phases B–E by spec, one per night. Document the chosen path in the Session Log entry per phase.

## Phase A — Schema, seeder, and boot wiring

> Goal: after Phase A, the API boots, ensures the MASTER row exists in Postgres, and serves `/health` exactly as before. No HTTP behavior changes yet. No login route, no cookie middleware. Just the foundation.

### A.1 — Install runtime dependencies

In `projects/GridV2/api/`:

```bash
npm install @node-rs/argon2
npm install --save-dev @types/pg  # only if drizzle's postgres driver needs it; check before adding
```

`@node-rs/argon2` is the AUTH_DESIGN.md §12 pick — native Rust binding, fast, no native-compile pain on Ubuntu 26.04. Verify the prebuilt binary for `linux-x64-gnu` resolves by running `node -e "require('@node-rs/argon2')"` after install.

### A.2 — Drizzle schema files

Create `api/src/db/schema/agents.ts`:

```ts
import { bigint, boolean, index, pgTable, smallint, text, timestamp } from "drizzle-orm/pg-core";

export const agents = pgTable(
  "agents",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    username: text("username").notNull(),
    usernameLower: text("username_lower").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    parentId: bigint("parent_id", { mode: "number" }).references((): any => agents.id),
    hasChildren: boolean("has_children").notNull().default(false),
    createdBy: bigint("created_by", { mode: "number" }).references((): any => agents.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    failedLogins: smallint("failed_logins").notNull().default(0),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  },
  (t) => ({
    parentIdx: index("idx_agents_parent").on(t.parentId),
    usernameLowerIdx: index("idx_agents_username_lower").on(t.usernameLower),
  }),
);
```

Create `api/src/db/schema/sessions.ts`:

```ts
import { bigint, customType, index, inet, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { agents } from "./agents";

const bytea = customType<{ data: Buffer; default: false }>({
  dataType() { return "bytea"; },
});

export const sessions = pgTable(
  "sessions",
  {
    tokenHash: bytea("token_hash").primaryKey(),
    agentId: bigint("agent_id", { mode: "number" })
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    userAgent: text("user_agent"),
    ip: inet("ip"),
  },
  (t) => ({
    agentIdx: index("idx_sessions_agent").on(t.agentId),
  }),
);
```

Re-export from `api/src/db/schema/index.ts`:

```ts
export * from "./agents";
export * from "./sessions";
```

Update `api/drizzle.config.ts` if needed so `schema:` points at `./src/db/schema/index.ts`.

### A.3 — Generate the migration

```bash
cd projects/GridV2/api
npm run db:generate
```

Inspect `drizzle/0000_<name>.sql` (or next numbered file). Verify:
- `CREATE TABLE agents` and `CREATE TABLE sessions` look right
- Indexes match §3.1 (`idx_agents_parent`, `idx_agents_username_lower`)
- `sessions.token_hash` is `BYTEA PRIMARY KEY`

Then **manually append** the trigger from §3.3 and the `master_no_parent` CHECK constraint from §3.1 to the generated SQL file (Drizzle doesn't model PG triggers or check constraints with subqueries well — hand-edit and commit):

```sql
-- master_no_parent: pin MASTER to id=1
ALTER TABLE agents
  ADD CONSTRAINT master_no_parent
  CHECK ((parent_id IS NULL) = (id = 1));

-- has_children maintenance trigger
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

### A.4 — Argon2 wrapper

Create `api/src/auth/password.ts`:

```ts
import { hash, verify } from "@node-rs/argon2";

// AUTH_DESIGN §2 row 8 — Argon2id is the default for @node-rs/argon2
export async function hashPassword(plaintext: string): Promise<string> {
  return hash(plaintext);
}

export async function verifyPassword(stored: string, plaintext: string): Promise<boolean> {
  try {
    return await verify(stored, plaintext);
  } catch {
    return false;
  }
}
```

### A.5 — MASTER seeder

Create `api/src/auth/seedMaster.ts`. Logic mirrors AUTH_DESIGN §5 exactly:

```ts
import { sql } from "drizzle-orm";
import { db } from "../db/client";
import { agents } from "../db/schema";
import { hashPassword } from "./password";

export async function seedMaster(): Promise<void> {
  const username = process.env.MASTER_USERNAME;
  const password = process.env.MASTER_PASSWORD ?? "";

  if (!username) {
    throw new Error("MASTER_USERNAME must be set in env");
  }

  const existing = await db.execute(sql`SELECT id, username FROM agents WHERE id = 1`);
  const row = existing.rows[0] as { id: number; username: string } | undefined;

  if (!row) {
    if (!password) {
      console.error("MASTER absent, MASTER_PASSWORD not set — refusing to start.");
      process.exit(1);
    }
    const hash = await hashPassword(password);
    await db.execute(sql`
      INSERT INTO agents (id, username, username_lower, password_hash, parent_id, created_by)
      VALUES (1, ${username}, ${username.toLowerCase()}, ${hash}, NULL, NULL)
    `);
    // NOTE: id=1 is explicit here. After seeding, the BIGSERIAL sequence must be advanced
    // so the next INSERT doesn't collide. Drizzle's generatedAlwaysAsIdentity means we may
    // need: ALTER TABLE agents ALTER COLUMN id RESTART WITH 2;
    // Verify behavior with a smoke test before going live.
    console.log(`MASTER seeded as '${username}'`);
    return;
  }

  if (password) {
    const hash = await hashPassword(password);
    await db.execute(sql`
      UPDATE agents SET password_hash = ${hash}, locked_at = NULL, failed_logins = 0
      WHERE id = 1
    `);
    console.log("MASTER password reset from env.");
  } else {
    console.log("MASTER present, no seeding action");
  }

  if (row.username !== username) {
    console.warn(
      `MASTER_USERNAME in env ('${username}') differs from DB ('${row.username}'). Keeping DB value. Rename via UI.`,
    );
  }
}
```

### A.6 — Wire seeder into boot

In `api/src/index.ts`, before `serve()`:

```ts
import { seedMaster } from "./auth/seedMaster";

async function main() {
  await seedMaster();
  serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3000) });
}

main().catch((err) => {
  console.error("Fatal during boot:", err);
  process.exit(1);
});
```

### A.7 — Smoke test (local + VPS)

**Local (against local Postgres):**
1. `MASTER_USERNAME=Pisa MASTER_PASSWORD=temp1234 npm run dev`
2. Confirm log line `MASTER seeded as 'Pisa'`
3. `psql -c "SELECT id, username, username_lower, parent_id, created_by FROM agents;"` → one row, id=1, parent_id NULL
4. Stop server. Restart with `MASTER_PASSWORD` unset. Confirm log line `MASTER present, no seeding action`. Row unchanged.
5. Restart with `MASTER_PASSWORD=temp1234` again. Confirm log line `MASTER password reset from env.`. Re-hash present in row (compare `password_hash` strings).
6. Manually `DELETE FROM agents WHERE id = 1;` and restart with empty `MASTER_PASSWORD`. Confirm exit 1 with the refusing-to-start log line.

**VPS (after deploy):**
1. SSH to VPS, `sudo -u gridv2 vim /etc/gridv2/env`, set `MASTER_PASSWORD=<chosen value>` (one-time).
2. `git pull` in `/home/gridv2/repo`, `cd api && npm ci && npm run build`, `sudo systemctl restart gridv2`.
3. `sudo journalctl -u gridv2 -n 30` → confirm `MASTER seeded as 'Pisa'`.
4. **Clear `MASTER_PASSWORD` from `/etc/gridv2/env`**, restart again, confirm `MASTER present, no seeding action`.
5. `curl https://api.azuresb.com/health` still returns 200.

### A.8 — Commit

One PR for Phase A:
- New: `api/src/db/schema/{agents,sessions,index}.ts`, `api/src/auth/{password,seedMaster}.ts`, `api/drizzle/<NNNN>_auth_bootstrap.sql` (with hand-appended trigger + check constraint)
- Modified: `api/src/index.ts` (seeder hook), `api/drizzle.config.ts` (schema path if changed), `api/package.json` (+ argon2)

Commit message: `Phase A — auth schema + MASTER seeder (no HTTP changes yet)`

Update `PROJECT.md` Session Log with phase completion and a one-line gotcha note (e.g., sequence-restart-after-explicit-id-1, if confirmed).

## Phase B — Cookie middleware + auth endpoints

> Goal: `POST /api/login`, `POST /api/logout`, `GET /api/me` work end-to-end. Cookie sets correctly with locked attrs (§4). Lockout counter increments on failure and locks at 5 (§8). Max-1-session enforced (§10 row 5).

### B.1 — Session token helpers

`api/src/auth/sessionToken.ts`:
- `generateToken()` — `crypto.randomBytes(32).toString("hex")` (64 hex chars, §4)
- `hashToken(raw: string): Buffer` — `crypto.createHash("sha256").update(raw).digest()` (32 bytes)

### B.2 — Cookie helpers

Use `hono/cookie` built-in. Wrapper in `api/src/auth/cookie.ts`:
- `setSessionCookie(c, rawToken)` — name `gridv2_session`, HttpOnly, Secure, SameSite=Lax, Path=/, no Max-Age (session cookie)
- `clearSessionCookie(c)` — Max-Age=0, same name + path

### B.3 — `requireSession` middleware

`api/src/auth/middleware.ts`:
- Read `gridv2_session` cookie. If missing → 401.
- SHA-256 hash, `SELECT * FROM sessions JOIN agents ON ...`. If no row → 401.
- Attach `c.set("agent", agentRow)` and `c.set("session", sessionRow)`.
- `UPDATE sessions SET last_seen_at = NOW(), ip = $1, user_agent = $2 WHERE token_hash = $hash` (fire-and-forget OK).

### B.4 — `requireActive` middleware

Runs after `requireSession`. If `agent.disabledAt || agent.lockedAt`:
- `DELETE FROM sessions WHERE token_hash = $hash`
- Clear cookie
- 401

### B.5 — Endpoints (`api/src/routes/auth.ts`)

- `POST /api/login`
  - Validate body: `{username: string, password: string}`. Username regex `/^[A-Za-z0-9_]{3,32}$/` (§10 row 1). Password length ≥ 3 (§10 row 2).
  - Look up by `usernameLower = lower(username)`.
  - If not found → increment a global counter? No — §8 says only existing rows have a counter. If not found, just return 401 with same delay as a bad-password path (timing-attack guard with `argon2.verify` against a dummy hash).
  - If `lockedAt` set → 423.
  - Verify password. On fail → `UPDATE failed_logins + 1`, if new value ≥ 5 also `SET locked_at = NOW()`. Return 401.
  - On success → `DELETE FROM sessions WHERE agent_id = $id` (max-1-session), `INSERT INTO sessions ...`, set cookie, `UPDATE failed_logins = 0, last_login_at = NOW()`. Return 200.
- `POST /api/logout` — `DELETE FROM sessions WHERE token_hash = $hash`, clear cookie, 204.
- `GET /api/me` — return `{id, username, parent_id, has_children, disabled_at, created_at}`.

### B.6 — Smoke test

`curl` script (or a quick `*.http` file) that walks: login (200 + cookie), me (200 + json), logout (204 + cookie cleared), me again (401). Plus: login with bad password 5× → 5th attempt returns 401 *and* 6th attempt returns 423.

### B.7 — Commit

One PR for Phase B. Update Session Log.

## Phase C — Downline endpoints

> Goal: tree management works. MASTER can list/create/manage everyone; sub-agents only see their downline. 404-vs-403 leak rule enforced.

### C.1 — Recursive CTE helper

`api/src/auth/downline.ts`:
- `isDescendant(actorId, targetId): Promise<boolean>` — runs §3.4 CTE.
- `listChildren(actorId)` — direct children only.
- `listDownline(actorId)` — full recursive set.

### C.2 — `requireDescendant` middleware factory

`requireDescendant(req, paramName = "id")` — extracts `c.req.param(paramName)`, runs `isDescendant`. On false → **404** (not 403; §6 leak-prevention rule).

### C.3 — Endpoints (`api/src/routes/agents.ts`)

- `GET /api/agents?scope=children|downline` — default `children` (§10 row 3).
- `POST /api/agents` — `{username, password}`, validate per §10 rows 1/2, check `username_lower` uniqueness → 409 on conflict, insert with `parent_id = actor.id`, `created_by = actor.id`, return 201 + new row.
- `PATCH /api/agents/:id/password` — `requireDescendant`, hash, update.
- `PATCH /api/agents/:id/disable` — `requireDescendant`, transaction: `UPDATE disabled_at = NOW()` + `DELETE FROM sessions WHERE agent_id = :id` (§10 row 6).
- `PATCH /api/agents/:id/enable` — `requireDescendant`, `UPDATE disabled_at = NULL`.
- `PATCH /api/agents/:id/unlock` — `requireDescendant`, `UPDATE locked_at = NULL, failed_logins = 0`.

### C.4 — Smoke test

Three-agent scenario:
- MASTER (Pisa) creates AgentA (child of MASTER).
- AgentA creates PlayerA1.
- AgentA tries to GET `/api/agents/<MASTER_ID>/anything` → 404.
- MASTER GETs `/api/agents?scope=downline` → sees both AgentA and PlayerA1.

### C.5 — Commit

One PR for Phase C. Update Session Log.

## Phase D — Front-end cutover (`agent.html`)

> Goal: `agent.html` uses real auth. The `bs_agent` localStorage gate is gone. Sub-agents and MASTER see the right admin panel.

### D.1 — Login card

Replace splash with centered card: username, password, submit. POSTs to `/api/login` with `credentials: "include"`. On 200 → load dashboard. On 401 → "Incorrect username or password." On 423 → "Account locked. Contact your agent to unlock."

### D.2 — Remove `bs_agent` localStorage

Sweep `agent.html` + `src/agent-main.js` for `bs_agent` references. Replace with a single `GET /api/me` call at dashboard init; cache result in JS module-level variable (not localStorage).

### D.3 — Admin panel

New dashboard tile (or tab — decide during impl) visible iff `me.has_children === true`. Components:
- Table of direct children (paginate at 50; AUTH_DESIGN doesn't spec pagination, default to none for v1).
- "Create subagent" form: username + password + submit.
- Per-row [Manage] → drawer with rename / reset password / disable-enable toggle / unlock button.

### D.4 — MASTER-only: "view full downline"

Toggle that swaps `?scope=children` for `?scope=downline`, renders indented tree. Implementation note: keep the tree render dumb — flat list with `depth` prefix derived from `parent_id`-chain client-side, or compute depth in the CTE and return it.

### D.5 — Sign-out + 401 interceptor

- Header gets `Sign out` button → `POST /api/logout` → navigate to login screen.
- Global `fetch` wrapper in `agent-main.js` — any 401 response triggers a redirect to the login screen.

### D.6 — Verify suite update

`verify_agent.cjs` already covers the splash gate, dashboard render, tile routing. Add cases for: login form interactions, admin panel render based on `has_children`, sign-out → login redirect, 401 interceptor.

### D.7 — Commit

One PR for Phase D. Update Session Log.

## Phase E — Tests + e2e smoke

> Goal: a single `npm test` covers every §12 case, and a one-time manual e2e proves the live site works.

### E.1 — Integration test framework

Pick `vitest` (Hono's recommended companion) or `node:test`. Add `npm test` script.

Test DB: spin up a throwaway Postgres via `pg-mem` or a per-test schema in the real DB. Pick `pg-mem` only if it supports the recursive CTE and BYTEA; otherwise use the real DB with a per-test transaction rolled back.

### E.2 — Cases

Mapped to AUTH_DESIGN §12:
- MASTER seed: empty DB + env → row inserted + sequence advanced; second boot is a no-op.
- Login success: cookie set, `/api/me` returns the right agent.
- Login fail: bad password 5× → 5th returns 401, 6th returns 423; `failed_logins` and `locked_at` set correctly.
- Unlock by ancestor: ancestor PATCH clears `locked_at` + `failed_logins`.
- Downline scope rejection: 404 (not 403) when target not in actor's downline.
- Session cookie behavior: HttpOnly + Secure + SameSite=Lax attrs present, no Max-Age.
- Max-1-session: two sequential logins for the same agent → first session row is gone after second login.
- Disable cascade: disabling an agent kills their sessions (next request 401).
- 404-vs-403 leak: GET non-descendant returns 404 with no body distinguishing "doesn't exist" from "not in your downline."

### E.3 — Manual e2e

1. Open `https://app.azuresb.com/agent.html` in fresh browser.
2. Log in as Pisa.
3. Create subagent `TestA` with password `testapass`.
4. Open incognito, log in as `TestA`, see empty admin panel (no children yet) or no admin panel at all (depending on initial `has_children`).
5. As `TestA`, create `PlayerA1`. Confirm `has_children` flips for `TestA` (re-fetch `/api/me`).
6. As MASTER, disable `PlayerA1`. Confirm `PlayerA1` immediately can't log in.
7. As MASTER, delete the test agents via direct SQL (no delete endpoint in MVP).

### E.4 — Commit

PR for tests. After merge, run the e2e by hand and add a one-liner result to the Session Log entry.

## Done criteria

Phase 1 auth is "done" when:
- All five phases merged to `main`.
- `npm test` is green in CI.
- Manual e2e walked once and logged.
- `bs_agent` localStorage references are gone from `agent.html` and `src/`.
- MASTER row exists in prod Postgres; `MASTER_PASSWORD` env var has been cleared post-seed.
- `agent.html` on `app.azuresb.com` shows a real login screen; logging in lands on the dashboard.

After done, the next runbook is the OddsPapi proxy / cron worker (Phase 1 continues — see `GridV2_Roadmap.docx` §6).

## Session log (this runbook)

| Date | Phase | Notes |
|------|-------|-------|
| 2026-05-23 | scaffold | Runbook created with Phase A detailed, B–E outlined. AUTH_DESIGN.md inconsistency (refs to runbook 05) fixed in same session. |
