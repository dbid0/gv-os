import { z } from "zod";

/**
 * Client-safe environment contract.
 *
 * Every variable the browser is allowed to see is declared here and parsed
 * once, at module load. A missing or malformed variable fails the BUILD, not a
 * request at 2am.
 *
 * Server-only secrets live in env.server.ts, which is guarded by `server-only`
 * so it cannot be imported into a client bundle. The pure schema for those
 * lives in env.schema.ts, because standalone scripts need it too.
 */

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  /** Which deployment this is. Drives banners, log tagging, and safety checks. */
  NEXT_PUBLIC_APP_ENV: z.enum(["local", "preview", "production"]).default("local"),

  /** Public origin of this deployment, used for auth redirects and absolute URLs. */
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),

  /**
   * Supabase project, for auth. The anon key is PUBLIC by design: it carries no
   * privileges of its own and every request is still checked against row-level
   * security and the user's own session. The service-role key is a different
   * thing entirely and must never appear in this file.
   */
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20, "anon key looks truncated"),
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

/** Alias used by the auth clients, to read as "the public half" at the call site. */
export const publicEnv = env;
