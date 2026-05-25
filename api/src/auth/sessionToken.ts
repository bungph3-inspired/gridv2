// Session token helpers — AUTH_DESIGN.md §4.
//
// The raw token is what we Set-Cookie back to the browser (64 hex chars = 256
// bits of entropy). The hash is what we store in the sessions.token_hash BYTEA
// column. A DB leak doesn't immediately compromise live sessions because an
// attacker would still need the raw token from a browser cookie.

import { createHash, randomBytes } from "node:crypto";

/**
 * Generate a fresh session token. 32 random bytes encoded as hex = 64 chars.
 * Use Node's crypto.randomBytes (CSPRNG-backed). Never substitute Math.random.
 */
export function generateToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * SHA-256 the raw token. Returns a 32-byte Buffer suitable for direct insert
 * into the sessions.token_hash BYTEA column (via drizzle's bytea customType
 * defined in db/schema/sessions.ts).
 */
export function hashToken(rawToken: string): Buffer {
  return createHash("sha256").update(rawToken, "utf8").digest();
}
