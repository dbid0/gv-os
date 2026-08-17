import "server-only";

import { z } from "zod";

/**
 * Server-only environment contract.
 *
 * `import "server-only"` makes the build FAIL if any client component ever
 * imports this file, so a database credential cannot be bundled into browser
 * JavaScript by accident. Client-safe values live in src/env.ts.
 *
 * Parsed lazily rather than at module load, because `next build` imports
 * modules during static analysis on machines that legitimately have no
 * DATABASE_URL (for example a docs-only CI job).
 */

export const serverEnvSchema = z.object({
  /**
   * Pooled Postgres connection string.
   * Local + preview point at the STAGING Supabase project.
   * Production is set only in Vercel's environment settings.
   */
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required")
    .refine(
      (value) => value.startsWith("postgres://") || value.startsWith("postgresql://"),
      "DATABASE_URL must be a postgres:// or postgresql:// connection string",
    ),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/** Pure parser, exported so tests can exercise it without touching process.env. */
export function parseServerEnv(
  raw: NodeJS.ProcessEnv | Record<string, unknown>,
): ServerEnv {
  const result = serverEnvSchema.safeParse(raw);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid server environment variables:\n${details}`);
  }

  return result.data;
}

let cached: ServerEnv | undefined;

/** Validates on first use, then memoizes. */
export function serverEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}
