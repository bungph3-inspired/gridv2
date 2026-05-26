// Postgres connection + drizzle client. Imported by anything that hits the DB
// (seedMaster, auth routes, future business logic).
//
// The exported `db` is a Proxy that delegates every property access (e.g.
// db.select, db.transaction) to:
//   - the ALS-stored transaction handle when one is active (during tests), OR
//   - the module-level realDb otherwise.
//
// This lets the test harness wrap each test in `realDb.transaction(tx => ...)`
// and have all route handlers transparently run against `tx`, then ROLLBACK
// when the test body throws a sentinel — full per-test isolation, zero route
// refactor. Production code path is unchanged (dbContext.getStore() returns
// undefined, so `db` resolves to realDb on every access).

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { AsyncLocalStorage } from "node:async_hooks";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL must be set in env (see /etc/gridv2/env on VPS)");
}

export const client = postgres(url, { max: 10 });

// `realDb` is the actual drizzle client. Exported for the test harness to use
// when opening the outer transaction; production code should keep using `db`.
export const realDb = drizzle(client);

type Db = typeof realDb;

// ALS storing the active test transaction. Empty in production.
export const dbContext = new AsyncLocalStorage<Db>();

export const db: Db = new Proxy(realDb, {
  get(target, prop, receiver) {
    const ctx = dbContext.getStore();
    return Reflect.get(ctx ?? target, prop, receiver);
  },
}) as Db;
