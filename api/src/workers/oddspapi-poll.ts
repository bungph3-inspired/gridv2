// OddsPapi polling worker — runbook 09 Phase B + D.
//
// Long-lived Node entrypoint under systemd (gridv2-oddspapi.service, installed
// per runbook 09 Phase C). Fetches /v4/odds-by-tournaments every POLL_INTERVAL_MS,
// parses, upserts into fixtures/markets/prices.
//
// Env vars consumed:
//   ODDSPAPI_KEY              — API key (required)
//   ODDSPAPI_BOOKMAKER        — default 'pinnacle'
//   ODDSPAPI_TOURNAMENT_IDS   — required; CSV of upstream tournament IDs.
//                               Examples: "109" (MLB only), "109,17" (MLB+PL).
//   ODDSPAPI_POLL_INTERVAL_MS — default 300_000 (5 min, matches upstream refresh)
//   ODDSPAPI_DRY_RUN          — if "1", parse only, no DB writes (recon mode)

import {
  OddsPapiError,
  fetchOddsByTournaments,
  summarizeShape,
} from "./oddspapi-client";
import { parseOddsResponse } from "./oddspapi-parser";
import { upsertOddsBatch } from "./oddspapi-upsert";
import { tournamentLeagueMap } from "../data/tournament-map";

const POLL_INTERVAL_MS = Number(process.env.ODDSPAPI_POLL_INTERVAL_MS ?? 300_000);
const BOOKMAKER = process.env.ODDSPAPI_BOOKMAKER ?? "pinnacle";
const TOURNAMENT_IDS_RAW = process.env.ODDSPAPI_TOURNAMENT_IDS ?? "";
const TOURNAMENT_IDS = TOURNAMENT_IDS_RAW
  .split(",")
  .map((s) => s.trim())
  .filter((s) => s.length > 0)
  .map((s) => Number(s))
  .filter((n) => Number.isFinite(n));
const DRY_RUN = process.env.ODDSPAPI_DRY_RUN === "1";

// Derived once at module load. Used to give parsed fixtures a human-readable
// league string ("MLB" instead of "tournament-109"). Static — adding a new
// tournament means updating tournament-map.ts.
const TOURNAMENT_LEAGUE = tournamentLeagueMap();

function log(...args: unknown[]) {
  console.log(`[oddspapi-poll]`, ...args);
}
function logErr(...args: unknown[]) {
  console.error(`[oddspapi-poll]`, ...args);
}

interface RunState {
  apiKey: string;
  controller: AbortController;
  pollCount: number;
  shuttingDown: boolean;
}

async function runOnce(state: RunState): Promise<void> {
  const t0 = Date.now();
  state.pollCount += 1;
  const poll = state.pollCount;
  log(`poll #${poll}: GET /v4/odds-by-tournaments?bookmaker=${BOOKMAKER}&tournamentIds=${TOURNAMENT_IDS.join(",")}`);

  try {
    const body = await fetchOddsByTournaments(state.apiKey, {
      bookmaker: BOOKMAKER,
      tournamentIds: TOURNAMENT_IDS,
      signal: state.controller.signal,
    });

    const fetchMs = Date.now() - t0;
    log(`poll #${poll} fetched in ${fetchMs}ms — shape: ${summarizeShape(body)}`);

    const { fixtures, stats } = parseOddsResponse(body, {
      bookmaker: BOOKMAKER,
      tournamentLeague: TOURNAMENT_LEAGUE,
    });
    log(
      `poll #${poll} parsed — fixtures=${stats.fixturesParsed} markets=${stats.marketsParsed} (skipped=${stats.marketsSkipped}) outcomes=${stats.outcomesParsed} (skipped=${stats.outcomesSkipped})`,
    );
    if (Object.keys(stats.skippedReasons).length > 0) {
      log(`poll #${poll} skipped reasons:`, stats.skippedReasons);
    }

    if (DRY_RUN) {
      log(`poll #${poll} dry-run — skipping DB upsert`);
      return;
    }

    const upsertStats = await upsertOddsBatch(fixtures);
    const totalMs = Date.now() - t0;
    log(
      `poll #${poll} upserted in ${totalMs - fetchMs}ms — fixtures=${upsertStats.fixturesUpserted} markets=${upsertStats.marketsUpserted} prices=${upsertStats.pricesInserted} (total ${totalMs}ms)`,
    );
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
  if (TOURNAMENT_IDS.length === 0) {
    logErr("ODDSPAPI_TOURNAMENT_IDS not set or empty — refusing to start. Example: ODDSPAPI_TOURNAMENT_IDS=109");
    process.exit(1);
  }

  log(
    `starting — interval=${POLL_INTERVAL_MS}ms, bookmaker=${BOOKMAKER}, tournamentIds=[${TOURNAMENT_IDS.join(",")}], dryRun=${DRY_RUN}`,
  );

  const state: RunState = {
    apiKey,
    controller: new AbortController(),
    pollCount: 0,
    shuttingDown: false,
  };

  const shutdown = (signal: string) => {
    if (state.shuttingDown) return;
    state.shuttingDown = true;
    log(`received ${signal}, shutting down`);
    state.controller.abort();
    setTimeout(() => process.exit(0), 200);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

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
