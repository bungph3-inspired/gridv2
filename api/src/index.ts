import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';

const app = new Hono();

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

// 404 catch-all so we don't leak stack traces
app.notFound((c) => c.json({ error: 'not_found' }, 404));

app.onError((err, c) => {
  console.error('[gridv2-api] unhandled error:', err);
  return c.json({ error: 'internal_error' }, 500);
});

const port = Number(process.env.PORT ?? 3000);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[gridv2-api] listening on http://localhost:${info.port}`);
});
