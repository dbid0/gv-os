import { z } from "zod";

/**
 * Environment contract.
 *
 * Every variable the app needs is declared here and parsed once, at module load.
 * A missing or malformed variable fails the BUILD, not a request at 2am.
 *
 * Rules:
 * - Only NEXT_PUBLIC_* values may live in this file today, because it is safe to
 *   import from client components. When the first server-only secret arrives
 *   (DATABASE_URL in PR 3), split this into env.server.ts / env.client.ts so a
 *   secret can never be bundled into browser JS.
 * - Add a variable here in the same commit that starts using it, and add it to
 *   .env.example at the same time.
 */

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  /** Which deployment this is. Drives banners, log tagging, and safety checks. */
  NEXT_PUBLIC_APP_ENV: z.enum(["local", "preview", "production"]).default("local"),

  /** Public origin of this deployment, used for auth redirects and absolute URLs. */
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Pure parser, exported so tests can exercise it without touching process.env.
 * Throws a readable, aggregated error listing every invalid key at once.
 */
export function parseEnv(raw: NodeJS.ProcessEnv | Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${details}`);
  }

  return result.data;
}

export const env = parseEnv(process.env);
