// Session cookie helpers — AUTH_DESIGN.md §4 (full attr table).
//
//   Name:       gridv2_session   (namespaced, not the generic 'session')
//   Value:      64 hex chars from generateToken()
//   HttpOnly:   true            (JS can't read it → XSS can't exfil)
//   Secure:     true            (HTTPS only — Caddy serves https://api.azuresb.com)
//   SameSite:   Lax             (CSRF protection; allows top-level nav from app → api)
//   Domain:     unset           (host-only on api.azuresb.com — tighter than .azuresb.com)
//   Path:       /
//   Max-Age:    unset           (session cookie — dies when browser closes)
//
// hono/cookie's setCookie/deleteCookie are the built-in helpers — no extra dep.

import type { Context } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";

export const SESSION_COOKIE_NAME = "gridv2_session";

export function setSessionCookie(c: Context, rawToken: string): void {
  setCookie(c, SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    // No maxAge / expires — session cookie. Dies on browser close.
  });
}

export function clearSessionCookie(c: Context): void {
  // deleteCookie sends Set-Cookie with Max-Age=0 + empty value, matching the
  // §4 step-3 logout flow.
  deleteCookie(c, SESSION_COOKIE_NAME, { path: "/" });
}
