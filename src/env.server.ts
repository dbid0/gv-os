import "server-only";

import { parseServerEnv, type ServerEnv } from "@/env.schema";

/**
 * The application's accessor for server environment variables.
 *
 * `import "server-only"` makes the build FAIL if any client component ever
 * imports this file, so a database credential cannot be bundled into browser
 * JavaScript by accident.
 *
 * Validated lazily on first use, then memoized, because `next build` imports
 * modules during static analysis where the variable may legitimately be absent.
 *
 * Standalone Node scripts import @/env.schema instead. See the note there.
 */

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}

export { parseServerEnv, serverEnvSchema, type ServerEnv } from "@/env.schema";
