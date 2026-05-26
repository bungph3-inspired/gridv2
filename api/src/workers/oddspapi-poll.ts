// OddsPapi polling worker — runbook 09 Phase B.
//
// This iteration is a STUB: polls /odds-by-tournaments every POLL_INTERVAL_MS
// and logs the response shape + counts. No DB writes yet — Phase D adds the
// parse + upsert path once we've seen real responses.
//
// Process model: long-lived Node process under systemd (gridv2-oddspapi.service,
// installed by runbook 09 Phase C). Designed for `node dist/workers/oddspapi-poll.js`
// after `tsc`. For manual testing pre-systemd: `npx tsx src/workers/oddspapi-poll.ts`.
//
// Env vars consumed:
//   ODDSPAPI_KEY              — API key (required; set on VPS at /etc/gridv2/env)
//   ODDSPAPI_BOOKMAKER        — default 'pinnacle'
//   ODDSPAPI_POLL_INTERVAL_MS — default 300_000 (5 min, matches the upstream refresh)
//   ODDSPAPI_SAMPLE_OUT       — optional path; on first successful poll, dumps
//                               the raw JSON here for shape inspection.
//                               Set to '/tmp/oddspapi-sample.json' for ad-hoc recon.
//
// SIGTERM / SIGINT trigger a graceful shutdown — cancels the in-flight poll
// and exits with code 0 so systemd considers it a clean stop.

import { writeFile } from "node:fs/promises";
import {
  OddsPapiError,
  fetchOddsByTournaments,
  summarizeShape,
} from "./oddspapi-client";

const POLL_INTERVAL_MS = Number(process.env.ODDSPAPI_POLL_INTERVAL_MS ?? 300_000);
const BOOKMAKER = process.env.ODDSPAPI_BOOKMAKER ?? "pinnacle";
const SAMPLE_OUT = process.env.ODDSPAPI_SAMPLE_OUT;

function log(...args: unknown[]) {
  console.log(`[oddspapi-poll]`, ...args);
}

function logErr(...args: unknown[]) {
  console.error(`[oddspapi-poll]`, ...args);
}

interface RunState {
  apiKey: string;
  controller: AbortController;
  sampleDumped: boolean;
  pollCount: number;
  shuttingDown: boolean;
}

async function runOnce(state: RunState): Promise<void> {
  const t0 = Date.now();
  state.pollCount += 1;
  const poll = state.pollCount;
  log(`poll #${poll}: GET /odds-by-tournaments?bookmaker=${BOOKMAKER}`);

  try {
    const body = await fetchOddsByTournaments(state.apiKey, {
      bookmaker: BOOKMAKER,
      signal: state.controller.signal,
    });

    const elapsed = Date.now() - t0;
    const shape = summarizeShape(body);
    const topLevelType = Array.isArray(body)
      ? `Array(${(body as unknown[]).length})`
      : typeof body;
    log(
      `poll #${poll} ok in ${elapsed}ms — top: ${topLevelType}, shape: ${shape}`,
    );

    // On first successful poll, optionally dump raw JSON to a file so we can
    // design the parse code from real data.
    if (!state.sampleDumped && SAMPLE_OUT) {
      try {
        await writeFile(SAMPLE_OUT, JSON.stringify(body, null, 2), "utf8");
        log(`poll #${poll} raw sample written to ${SAMPLE_OUT}`);
        state.sampleDumped = true;
      } catch (err) {
        logErr(`poll #${poll} failed to write sample to ${SAMPLE_OUT}:`, err);
      }
    }
  } catch (err) {
    if ((err as Error)?.name === "AbortError") {
      log(`poll #${poll} aborted (shutdown in progress)`);
      return;
    }
    if (err instanceof OddsPapiError) {
      logErr(`poll #${poll} upstream error: ${err.message}`);
    } else {
      logErr(`poll #${poll} unexpected error:`, err);
    }
  }
}

async function main(): Promise<void> {
  const apiKey = process.env.ODDSPAPI_KEY;
  if (!apiKey) {
    logErr("ODDSPAPI_KEY not set — refusing to start.");
    process.exit(1);
  }

  log(`starting — interval=${POLL_INTERVAL_MS}ms, bookmaker=${BOOKMAKER}`);
  if (SAMPLE_OUT) {
    log(`first-response sample will be written to ${SAMPLE_OUT}`);
  }

  const state: RunState = {
    apiKey,
    controller: new AbortController(),
    sampleDumped: false,
    pollCount: 0,
    shuttingDown: false,
  };

  // Graceful shutdown — abort the in-flight fetch and exit cleanly.
  const shutdown = (signal: string) => {
    if (state.shuttingDown) return;
    state.shuttingDown = true;
    log(`received ${signal}, shutting down`);
    state.controller.abort();
    // Give the in-flight poll a beat to log its abort before exiting.
    setTimeout(() => process.exit(0), 200);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // Kick off the first poll immediately, then settle into the interval.
  await runOnce(state);
  setInterval(() => {
    if (state.shuttingDown) return;
    void runOnce(state);
  }, POLL_INTERVAL_MS);
}

main().catch((err) => {
  logErr("fatal during boot:", err);
  process.exit(1);
});
