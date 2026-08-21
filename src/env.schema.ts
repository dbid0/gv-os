import { z } from "zod";

/**
 * Server environment SCHEMA. Pure, no side effects, no `server-only` guard.
 *
 * Kept separate from env.server.ts on purpose: standalone Node scripts (the
 * migration runner, seeds, backups) need to validate the same variables, and
 * `server-only` throws outside React's react-server condition, so a script that
 * imports it crashes at startup.
 *
 * The rule stays intact: the app reaches the environment through env.server.ts,
 * which IS guarded. Scripts use this schema directly.
 */

const postgresUrl = (label: string) =>
  z
    .string()
    .min(1, `${label} is required`)
    .refine(
      (value) => value.startsWith("postgres://") || value.startsWith("postgresql://"),
      `${label} must be a postgres:// or postgresql:// connection string`,
    );

export const serverEnvSchema = z.object({
  /**
   * Runtime connection: Supabase TRANSACTION pooler, port 6543.
   * Correct for serverless, and why src/db/client.ts sets prepare: false.
   * Local + preview point at the STAGING project. Production is set only in
   * Vercel's environment settings.
   */
  DATABASE_URL: postgresUrl("DATABASE_URL"),

  /**
   * Migration connection: Supabase SESSION pooler, port 5432.
   * DDL through the transaction pooler is unreliable, and Supabase's direct
   * host (db.<ref>.supabase.co) is IPv6-only, which many networks cannot
   * reach. Session pooler is the one that works for both.
   * Optional: falls back to DATABASE_URL, which is right for a plain Postgres
   * container in CI where the distinction does not exist.
   */
  MIGRATION_DATABASE_URL: postgresUrl("MIGRATION_DATABASE_URL").optional(),

  /**
   * Master key for sealed integration credentials (AES-256-GCM), 32 bytes as
   * base64. Optional so builds and test runs don't require it; connecting an
   * integration without it fails with a clear error instead. Generate with
   * `openssl rand -base64 32`. Rotating it re-seals every stored credential —
   * that tooling lands with the first sync job.
   */
  CREDENTIALS_KEY: z.string().min(1).optional(),

  /**
   * Bearer secret for the scheduled sync endpoints (/api/sync/*). Optional —
   * without it, only a signed-in allowlisted user can trigger a sync.
   */
  SYNC_SECRET: z.string().min(1).optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/** Throws a readable, aggregated error listing every invalid key at once. */
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
