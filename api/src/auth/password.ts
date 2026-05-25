// Argon2id wrapper — AUTH_DESIGN.md §2 row 8.
//
// @node-rs/argon2's defaults are argon2id with m=19456 KiB, t=2 iterations,
// p=1 lane. That hash format ($argon2id$v=19$m=19456,t=2,p=1$...) is captured
// in §11.2 example flow. Calling hash()/verify() with no options uses those
// defaults — keep it that way unless we have a measured reason to tune.
//
// Hashes are self-describing strings, so verifying never needs the original
// parameters. Future-proof: bumping m/t/p later won't break existing stored
// hashes; they'll just verify against their embedded params until rehashed
// on next login.

import { hash, verify } from "@node-rs/argon2";

export function hashPassword(plaintext: string): Promise<string> {
  return hash(plaintext);
}

export async function verifyPassword(stored: string, plaintext: string): Promise<boolean> {
  try {
    return await verify(stored, plaintext);
  } catch {
    // verify() throws on malformed stored hashes. Treat as failed verification
    // rather than a server error — callers shouldn't have to wrap every check.
    return false;
  }
}
