// ════════════════════════════════════════════════════════════════════════════
//  agent-main.js — Entry script for agent.html
//  ────────────────────────────────────────────────────────────────────────────
//  Loaded by agent.html. Two responsibilities:
//
//    1. Gate access on a fake "agent login" stored in localStorage as
//       `bs_agent` (the agent ID, e.g. "NUBI004"). If absent, the
//       login splash shows; on submit we set the key and boot.
//    2. After login, hand off to the existing src/agent.js renderer.
//
//  Mirrors LC797's `/partner/` SPA pattern: separate entry, separate bundle,
//  no overlap with the player-facing index.html. See AGENT_RECON.md.
// ════════════════════════════════════════════════════════════════════════════

import './style.css';
import { initAgent } from './agent.js';

function boot(){
  const agentId = localStorage.getItem('bs_agent');
  if (!agentId) {
    // Splash already visible by default (show class baked into agent.html).
    return;
  }
  hideSplash();
  // Patch the mock dataset's displayed ID so the header reflects the login.
  if (window.AGENT_MOCK) window.AGENT_MOCK.id = agentId;
  initAgent();
}

function submitAgentLogin(e){
  e.preventDefault();
  const id = (document.getElementById('login-id').value || '').trim();
  if (!id) return false;
  localStorage.setItem('bs_agent', id);
  hideSplash();
  if (window.AGENT_MOCK) window.AGENT_MOCK.id = id;
  initAgent();
  return false;
}

function logoutAgent(){
  if (!confirm('Sign out of the agent portal?')) return;
  localStorage.removeItem('bs_agent');
  location.reload();
}

function hideSplash(){
  const sp = document.getElementById('login-splash');
  if (sp) sp.classList.remove('show');
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
