// Production boot — seed MASTER first, then start the HTTP listener. The app
// itself is built in app.ts so the test harness can import it without dragging
// in seedMaster or the server.

import { serve } from "@hono/node-server";
import { buildApp } from "./app";
import { seedMaster } from "./auth/seedMaster";

const port = Number(process.env.PORT ?? 3000);

async function main() {
  // Boot sequence: seed MASTER first (idempotent — exits the process if MASTER
  // is absent and MASTER_PASSWORD isn't set). Only start the HTTP listener
  // after the auth foundation is verified. Any boot-time exception kills the
  // process so systemd can restart cleanly — better to crash loudly than serve
  // broken state.
  await seedMaster();

  const app = buildApp();
  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`[gridv2-api] listening on http://localhost:${info.port}`);
  });
}

main().catch((err) => {
  console.error("[gridv2-api] fatal during boot:", err);
  process.exit(1);
});
