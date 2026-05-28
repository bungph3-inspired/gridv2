// ════════════════════════════════════════════════════════════════════════════
//  agent-api.js — Shared API client for the agent portal
//  ────────────────────────────────────────────────────────────────────────────
//  Used by both agent-main.js (auth flow) and agent.js (post-auth fetches
//  from the dashboard subviews). Single source of truth for:
//
//    - apiBase()  — dev vs prod URL resolution (Vite proxy in dev, absolute
//                   https://api.azuresb.com in prod)
//    - apiFetch() — always includes credentials so the session cookie ships
//                   on every call; default JSON Content-Type
//    - getMe() / setMe() — module-level cache of the authenticated agent
//                          record from GET /api/me. Cleared on logout.
//
//  No imports from agent.js or agent-main.js — keeps the dependency tree
//  acyclic (agent-main → agent-api ← agent.js; agent-main → agent.js for
//  initAgent only).
// ════════════════════════════════════════════════════════════════════════════

let _me = null;

export function getMe() { return _me; }
export function setMe(v) { _me = v; }

export function apiBase() {
  // Prod (app.azuresb.com) — explicit cross-origin API URL.
  // Dev (anything else, typically localhost:5173) — relative path; Vite's
  // server.proxy forwards /api/* to http://localhost:3000.
  return location.hostname === 'app.azuresb.com'
    ? 'https://api.azuresb.com'
    : '';
}

// PR8 (D.5): post-auth 401 -> /agent.html?expired=1. Gated on getMe() so the
// boot-time /api/me probe and the /api/login POST don't trigger redirects —
// neither calls setMe before they may receive a 401, so getMe() returns null
// in those paths and the response just falls through to the caller normally.
// _redirecting401 guards against parallel calls firing redundant navigations.
let _redirecting401 = false;
export async function apiFetch(path, opts = {}) {
  const res = await fetch(apiBase() + path, {
    ...opts,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  if (res.status === 401 && getMe() && !_redirecting401) {
    _redirecting401 = true;
    setMe(null);
    location.replace('/agent.html?expired=1');
  }
  return res;
}