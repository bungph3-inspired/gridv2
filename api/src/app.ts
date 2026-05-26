// App factory. Pure construction — no seedMaster, no listener. Production boot
// happens in index.ts; tests import buildApp() directly so they can fetch the
// app via Hono's app.fetch() without spinning up a real server.

import { Hono } from "hono";
import { cors } from "hono/cors";
import type { AppEnv } from "./auth/types";
import { auth } from "./routes/auth";
import { agentsRoutes } from "./routes/agents";

export function buildApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // Wide-open CORS on /health only — locked down later when auth lands.
  app.use("/health", cors());

  app.get("/health", (c) =>
    c.json({
      status: "ok",
      service: "gridv2-api",
      version: "0.1.0",
      ts: new Date().toISOString(),
    }),
  );

  app.route("/api", auth);
  app.route("/api/agents", agentsRoutes);

  app.notFound((c) => c.json({ error: "not_found" }, 404));
  app.onError((err, c) => {
    console.error("[gridv2-api] unhandled error:", err);
    return c.json({ error: "internal_error" }, 500);
  });

  return app;
}
