// CORS middleware tests for /api/*.
//
// Verifies that:
//   - Preflight OPTIONS requests from app.azuresb.com return the right
//     Access-Control-Allow-* headers
//   - The same from a disallowed origin gets no allow-origin echo
//   - Allow-Credentials is set so the gridv2_session cookie ships
//   - /health stays wide-open for ops health checks

import { describe, expect, test } from "vitest";
import { buildApp } from "../app";

const app = buildApp();

async function preflight(path: string, origin: string): Promise<Response> {
  return app.fetch(
    new Request(`http://test${path}`, {
      method: "OPTIONS",
      headers: {
        Origin: origin,
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "Content-Type",
      },
    }),
  );
}

describe("CORS — /api/*", () => {
  test("allows preflight from app.azuresb.com with credentials", async () => {
    const res = await preflight("/api/login", "https://app.azuresb.com");
    expect(res.status).toBeLessThan(300);
    expect(res.headers.get("access-control-allow-origin")).toBe(
      "https://app.azuresb.com",
    );
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
    expect((res.headers.get("access-control-allow-methods") ?? "").toUpperCase()).toContain(
      "POST",
    );
  });

  test("allows preflight from localhost:5173 dev origin", async () => {
    const res = await preflight("/api/me", "http://localhost:5173");
    expect(res.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:5173",
    );
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
  });

  test("rejects preflight from a disallowed origin", async () => {
    const res = await preflight("/api/login", "https://evil.example.com");
    // Hono's cors() omits the allow-origin header entirely on disallowed
    // origins. Browser then blocks the response by CORS policy.
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  test("CORS covers /api/oddspapi/* as well", async () => {
    const res = await preflight(
      "/api/oddspapi/tournaments",
      "https://app.azuresb.com",
    );
    expect(res.headers.get("access-control-allow-origin")).toBe(
      "https://app.azuresb.com",
    );
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
  });

  test("CORS covers /api/agents/* as well", async () => {
    const res = await preflight("/api/agents", "https://app.azuresb.com");
    expect(res.headers.get("access-control-allow-origin")).toBe(
      "https://app.azuresb.com",
    );
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
  });

  test("Vary: Origin is set so caches respect per-origin responses", async () => {
    const res = await preflight("/api/login", "https://app.azuresb.com");
    const vary = (res.headers.get("vary") ?? "").toLowerCase();
    expect(vary).toContain("origin");
  });
});

describe("CORS — /health", () => {
  test("stays wide-open for ops health checks", async () => {
    const res = await app.fetch(
      new Request("http://test/health", {
        method: "OPTIONS",
        headers: {
          Origin: "https://random.example.com",
          "Access-Control-Request-Method": "GET",
        },
      }),
    );
    // Wide-open CORS echoes the origin (or emits *) regardless.
    const allow = res.headers.get("access-control-allow-origin");
    expect(allow === "*" || allow === "https://random.example.com").toBe(true);
  });
});
