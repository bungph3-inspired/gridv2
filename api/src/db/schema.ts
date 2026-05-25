// Compatibility shim — real table definitions live in ./schema/.
//
// This file remains (rather than being deleted) because the Cowork filesystem
// mount disallows file deletes; we repurpose it as a re-export so drizzle.config
// can keep pointing here and any existing imports still resolve. New code
// should prefer `import { agents, sessions } from "./db/schema"` (which lands
// here and forwards) or `import ... from "./db/schema/index"` for clarity.

export * from "./schema/index";
