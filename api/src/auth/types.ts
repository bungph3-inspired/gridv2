// Shared Hono context types so middleware + routes agree on what's attached
// to the request context. Imported by index.ts (to type the Hono app) and by
// middleware + routes (to type their handlers).

import type { Agent, Session } from "../db/schema";

export type AuthVariables = {
  agent: Agent;
  session: Session;
};

export type AppEnv = {
  Variables: AuthVariables;
};
