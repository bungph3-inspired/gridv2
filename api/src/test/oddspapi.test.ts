// OddsPapi client tests. Parser is covered separately in oddspapi-parser.test.ts.

import { describe, expect, test, beforeEach, afterEach, vi } from "vitest";
import {
  OddsPapiError,
  fetchOddsByTournaments,
  summarizeShape,
} from "../workers/oddspapi-client";

describe("oddspapi-client", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  test("fetchOddsByTournaments returns parsed JSON on 2xx", async () => {
    const payload = [{ fixtureId: "abc", participant1Id: 1, participant2Id: 2 }];
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ) as typeof globalThis.fetch;

    const result = await fetchOddsByTournaments("test-key", { tournamentIds: [109] });
    expect(result).toEqual(payload);
    expect(globalThis.fetch).toHaveBeenCalledOnce();
    const callArgs = (globalThis.fetch as any).mock.calls[0];
    const url = String(callArgs[0]);
    expect(url).toMatch(/\/v4\/odds-by-tournaments/);
    expect(url).toMatch(/bookmaker=pinnacle/);
    expect(url).toMatch(/tournamentIds=109/);
    expect(url).toMatch(/apiKey=test-key/);
    // Auth is a query param now, not a Bearer header.
    expect(callArgs[1].headers.Authorization).toBeUndefined();
  });

  test("fetchOddsByTournaments throws when tournamentIds is empty", async () => {
    globalThis.fetch = vi.fn() as typeof globalThis.fetch;
    await expect(
      fetchOddsByTournaments("k", { tournamentIds: [] }),
    ).rejects.toThrowError(/tournamentIds is required/);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  test("fetchOddsByTournaments joins multiple tournamentIds with commas", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response("[]", { status: 200 }),
    ) as typeof globalThis.fetch;

    await fetchOddsByTournaments("k", { tournamentIds: [109, 17, 8] });
    const url = String((globalThis.fetch as any).mock.calls[0][0]);
    // encodeURIComponent("109,17,8") = "109%2C17%2C8"
    expect(url).toMatch(/tournamentIds=109%2C17%2C8/);
  });

  test("fetchOddsByTournaments honors the bookmaker override", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response("[]", { status: 200 }),
    ) as typeof globalThis.fetch;

    await fetchOddsByTournaments("k", { tournamentIds: [109], bookmaker: "fanduel" });
    const url = String((globalThis.fetch as any).mock.calls[0][0]);
    expect(url).toMatch(/bookmaker=fanduel/);
  });

  test("fetchOddsByTournaments throws OddsPapiError on non-2xx", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response("nope", { status: 503, statusText: "Service Unavailable" }),
    ) as typeof globalThis.fetch;

    await expect(
      fetchOddsByTournaments("k", { tournamentIds: [109] }),
    ).rejects.toThrowError(OddsPapiError);

    globalThis.fetch = vi.fn(async () =>
      new Response("nope", { status: 503, statusText: "Service Unavailable" }),
    ) as typeof globalThis.fetch;
    try {
      await fetchOddsByTournaments("k", { tournamentIds: [109] });
    } catch (err) {
      expect(err).toBeInstanceOf(OddsPapiError);
      expect((err as OddsPapiError).status).toBe(503);
      expect((err as OddsPapiError).message).toMatch(/503/);
    }
  });

  test("fetchOddsByTournaments forwards an AbortSignal", async () => {
    let captured: AbortSignal | undefined;
    globalThis.fetch = vi.fn(async (_url: any, init: any) => {
      captured = init.signal;
      return new Response("[]", { status: 200 });
    }) as typeof globalThis.fetch;

    const ctrl = new AbortController();
    await fetchOddsByTournaments("k", { tournamentIds: [109], signal: ctrl.signal });
    expect(captured).toBe(ctrl.signal);
  });
});

describe("summarizeShape", () => {
  test("primitives", () => {
    expect(summarizeShape("hi")).toBe("string");
    expect(summarizeShape(42)).toBe("number");
    expect(summarizeShape(true)).toBe("boolean");
    expect(summarizeShape(null)).toBe("null");
    expect(summarizeShape(undefined)).toBe("undefined");
  });

  test("array of one shape", () => {
    expect(summarizeShape([1, 2, 3])).toBe("Array(3)<number>");
    expect(summarizeShape([])).toBe("Array(0)");
  });

  test("object keys + nested array", () => {
    const shape = summarizeShape({ events: [{ id: "x", home: "A" }] });
    expect(shape).toMatch(/events:.*Array\(1\)/);
    expect(shape).toMatch(/id:.*string/);
  });

  test("depth cap to keep output bounded", () => {
    const deep = { a: { b: { c: { d: { e: 1 } } } } };
    const shape = summarizeShape(deep);
    expect(shape).toMatch(/Object/);
  });
});
