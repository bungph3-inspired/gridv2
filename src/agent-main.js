// ════════════════════════════════════════════════════════════════════════════
//  agent-main.js — Entry script for agent.html
//  ────────────────────────────────────────────────────────────────────────────
//  Three responsibilities:
//
//    1. On boot, GET /api/me to check session. 200 → render dashboard;
//       401 → leave the login splash visible (default state in agent.html).
//    2. Handle the login form submit — POST /api/login with credentials,
//       parse 200 / 400 / 401 / 423, and display a human error inline.
//    3. After auth succeeds, hand off to src/agent.js renderer. Patches
//       window.AGENT_MOCK.id with the authenticated agent's username so
//       the dashboard's header chip reflects the real session.
//
//  Replaces the bs_agent localStorage gate (runbook 08 Phase D.1 + D.2,
//  cut over 2026-05-24). No localStorage reads or writes for auth — the
//  session cookie (HttpOnly) is the only auth surface, and the /api/me
//  response is cached in agent-api.js's module-level _me variable.
// ════════════════════════════════════════════════════════════════════════════

import './style.css';
import { initAgent } from './agent.js';
import { apiFetch, getMe, setMe } from './agent-api.js';

async function boot() {
  // Try to resume an existing session. If the server says we're authed,
  // skip the splash entirely and render the dashboard.
  try {
    const r = await apiFetch('/api/me');
    if (r.ok) {
      setMe(await r.json());
      startDashboard();
      return;
    }
    // 401 → fall through to the splash (already visible by default in HTML).
  } catch (e) {
    const errEl = document.getElementById('login-error');
    if (errEl) errEl.textContent = 'Could not reach the server. Check your connection and try again.';
  }
}

async function submitAgentLogin(e) {
  e.preventDefault();
  const errEl = document.getElementById('login-error');
  if (errEl) errEl.textContent = '';

  const username = (document.getElementById('login-id').value || '').trim();
  const password = document.getElementById('login-pw').value || '';
  if (!username || !password) {
    if (errEl) errEl.textContent = 'Enter a username and password.';
    return false;
  }

  const btn = document.querySelector('#login-form .login-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Signing in…'; }

  let r;
  try {
    r = await apiFetch('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  } catch (netErr) {
    if (btn) { btn.disabled = false; btn.textContent = 'Sign In'; }
    if (errEl) errEl.textContent = 'Could not reach the server. Try again.';
    return false;
  }

  if (r.status === 200) {
    // Cookie is set. Fetch /api/me to populate the dashboard.
    const meR = await apiFetch('/api/me');
    if (!meR.ok) {
      if (btn) { btn.disabled = false; btn.textContent = 'Sign In'; }
      if (errEl) errEl.textContent = 'Signed in but could not load your profile. Try again.';
      return false;
    }
    setMe(await meR.json());
    startDashboard();
    return false;
  }

  // Failure paths — restore the button and surface a friendly message.
  if (btn) { btn.disabled = false; btn.textContent = 'Sign In'; }
  if (!errEl) return false;
  if (r.status === 401) {
    errEl.textContent = 'Incorrect username or password.';
  } else if (r.status === 423) {
    errEl.textContent = 'Account locked. Contact your agent to unlock.';
  } else if (r.status === 400) {
    errEl.textContent = 'Username must be 3–32 letters, digits, or underscores. Password must be at least 3 characters.';
  } else {
    errEl.textContent = `Sign-in failed (HTTP ${r.status}). Try again.`;
  }
  return false;
}

async function logoutAgent() {
  if (!confirm('Sign out of the agent portal?')) return;
  try {
    await apiFetch('/api/logout', { method: 'POST' });
  } catch {
    // ignore network error — reload back to splash either way
  }
  setMe(null);
  location.reload();
}

function startDashboard() {
  const splash = document.getElementById('login-splash');
  if (splash) splash.classList.remove('show');

  const me = getMe();
  // The existing dashboard chrome reads window.AGENT_MOCK.id for its header
  // chip. Patch the mock fixture's displayed ID to the authenticated agent's
  // username. Other mock fields (players, wagers, balances) stay mock until
  // later phases wire real data.
  if (window.AGENT_MOCK && me) {
    window.AGENT_MOCK.id = me.username;
  }

  initAgent();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

Object.assign(window, {
  submitAgentLogin,
  logoutAgent,
});
