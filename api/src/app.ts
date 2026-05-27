// App factory. Pure construction — no seedMaster, no listener. Production boot
// happens in index.ts; tests import buildApp() directly so they can fetch the
// app via Hono's app.fetch() without spinning up a real server.

import { Hono } from "hono";
import { cors } from "hono/cors";
import type { AppEnv } from "./auth/types";
import { auth } from "./routes/auth";
import { agentsRoutes } from "./routes/agents";
import { oddspapiRoutes } from "./routes/oddspapi";

// Origins allowed to make credentialed (cookie-bearing) requests to /api/*.
// app.azuresb.com  — Cloudflare Pages frontend (prod)
// localhost:5173    — Vite dev server default
// 127.0.0.1:5173    — same, explicit (some browsers distinguish)
// Add new origins here as we ship more frontends.
const ALLOWED_ORIGINS = [
  "https://app.azuresb.com",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

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

  // CORS for all /api/* routes. Credentials must be allowed so the
  // gridv2_session cookie is honored on cross-origin fetches from the
  // Cloudflare Pages frontend on app.azuresb.com. `origin` MUST be an
  // explicit allowlist (not '*'), because credentialed requests require
  // a specific Access-Control-Allow-Origin value per the CORS spec.
  app.use(
    "/api/*",
    cors({
      origin: (origin) => (ALLOWED_ORIGINS.includes(origin) ? origin : null),
      credentials: true,
      allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type"],
      maxAge: 600, // preflight cache for 10 min — small enough to evolve, big enough to matter
    }),
  );

  app.route("/api", auth);
  app.route("/api/agents", agentsRoutes);
  app.route("/api/oddspapi", oddspapiRoutes);

  app.notFound((c) => c.json({ error: "not_found" }, 404));
  app.onError((err, c) => {
    console.error("[gridv2-api] unhandled error:", err);
    return c.json({ error: "internal_error" }, 500);
  });

  return app;
}
