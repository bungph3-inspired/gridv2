// Test harness — per-test transaction rollback + Hono request helper.
//
// Usage:
//   import { txTest, request, extractSessionCookie } from "./helpers";
//
//   txTest("login success", async () => {
//     // seed/setup happens INSIDE the transaction
//     const res = await request("POST", "/api/login", { body: { ... } });
//     expect(res.status).toBe(200);
//   });
//
// Each txTest opens an outer drizzle transaction via realDb.transaction(),
// runs the body inside dbContext.run(tx) so all route handlers (which use the
// `db` Proxy) transparently route to `tx`, then throws a sentinel to force
// ROLLBACK. The catch outside swallows the sentinel; any other error rethrows.

import { test } from "vitest";
import { realDb, dbContext } from "../db/client";
import { buildApp } from "../app";

const app = buildApp();

class Rollback extends Error {
  constructor() {
    super("__rollback__");
  }
}

export function txTest(name: string, body: () => Promise<void>): void {
  test(name, async () => {
    let intentional = false;
    try {
      await realDb.transaction(async (tx) => {
        await dbContext.run(tx as unknown as typeof realDb, async () => {
          await body();
          intentional = true;
          throw new Rollback();
        });
      });
    } catch (err) {
      if (intentional && err instanceof Rollback) return;
      throw err;
    }
  });
}

export type RequestInitMinimal = {
  body?: unknown;
  headers?: Record<string, string>;
  cookie?: string;
};

export async function request(
  method: string,
  path: string,
  init: RequestInitMinimal = {},
): Promise<Response> {
  const headers: Record<string, string> = { ...(init.headers ?? {}) };
  if (init.cookie) headers["cookie"] = init.cookie;
  let body: BodyInit | undefined;
  if (init.body !== undefined) {
    headers["content-type"] = headers["content-type"] ?? "application/json";
    body =
      typeof init.body === "string" ? init.body : JSON.stringify(init.body);
  }
  return app.fetch(new Request(`http://test${path}`, { method, headers, body }));
}

// Convenience for grabbing the session cookie value from a Set-Cookie header.
export function extractSessionCookie(res: Response): string | null {
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) return null;
  const match = setCookie.match(/gridv2_session=([^;]+)/);
  return match ? `gridv2_session=${match[1]}` : null;
}
