// Postgres connection + drizzle client. Imported by anything that hits the DB
// (seedMaster, auth routes, future business logic).
//
// Connection pool sized for the API's expected concurrency. AUTH_DESIGN doesn't
// spec a pool size; 10 is a safe starting point for a single-region invite-only
// site and well below Postgres's default max_connections of 100.

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL must be set in env (see /etc/gridv2/env on VPS)");
}

export const client = postgres(url, { max: 10 });
export const db = drizzle(client);
