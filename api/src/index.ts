import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { seedMaster } from './auth/seedMaster';
import type { AppEnv } from './auth/types';
import { auth } from './routes/auth';
import { agentsRoutes } from './routes/agents';

const app = new Hono<AppEnv>();

// Wide-open CORS on /health only — locked down later when auth lands
app.use('/health', cors());

app.get('/health', (c) =>
  c.json({
    status: 'ok',
    service: 'gridv2-api',
    version: '0.1.0',
    ts: new Date().toISOString(),
  }),
);

// Mount auth routes under /api (so the handlers see /login, /logout, /me).
app.route('/api', auth);

// Mount agent CRUD under /api/agents (handlers see /, /:id/password, etc.).
app.route('/api/agents', agentsRoutes);

// 404 catch-all so we don't leak stack traces
app.notFound((c) => c.json({ error: 'not_found' }, 404));

app.onError((err, c) => {
  console.error('[gridv2-api] unhandled error:', err);
  return c.json({ error: 'internal_error' }, 500);
});

const port = Number(process.env.PORT ?? 3000);

// Boot sequence: seed MASTER first (idempotent — exits the process if MASTER is
// absent and MASTER_PASSWORD isn't set). Only start the HTTP listener after the
// auth foundation is verified. Any boot-time exception kills the process so
// systemd can restart cleanly — better to crash loudly than serve broken state.
async function main() {
  await seedMaster();

  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`[gridv2-api] listening on http://localhost:${info.port}`);
  });
}

main().catch((err) => {
  console.error('[gridv2-api] fatal during boot:', err);
  process.exit(1);
});
