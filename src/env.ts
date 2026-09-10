/**
 * Client-safe environment contract — deliberately dependency-free.
 *
 * This module is imported by client components, so everything here ships in
 * the browser bundle. It used to lean on zod for validation, which dragged
 * the entire library into the shared client chunk to check five strings. The
 * checks below are hand-rolled: same failures, same aggregated messages, zero
 * bytes of dependency.
 *
 * Every variable the browser is allowed to see is declared here and parsed
 * once, at module load. A missing or malformed variable fails the BUILD, not
 * a request at 2am. Server-only secrets live in env.server.ts, which is
 * guarded by `server-only` so it cannot be imported into a client bundle; the
 * zod schema for those lives in env.schema.ts, because standalone scripts
 * need it too — and stays server-side.
 */

const NODE_ENVS = ["development", "test", "production"] as const;
const APP_ENVS = ["local", "preview", "production"] as const;

export type Env = {
  NODE_ENV: (typeof NODE_ENVS)[number];
  /** Which deployment this is. Drives banners, log tagging, and safety checks. */
  NEXT_PUBLIC_APP_ENV: (typeof APP_ENVS)[number];
  /** Public origin of this deployment, used for auth redirects and absolute URLs. */
  NEXT_PUBLIC_APP_URL: string;
  /**
   * Supabase project, for auth. The anon key is PUBLIC by design: it carries
   * no privileges of its own and every request is still checked against
   * row-level security and the user's own session. The service-role key is a
   * different thing entirely and must never appear in this file.
   */
  NEXT_PUBLIC_SUPABASE_URL: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
};

function isUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Pure parser, exported so tests can exercise it without touching process.env.
 * Throws a readable, aggregated error listing every invalid key at once.
 */
export function parseEnv(raw: NodeJS.ProcessEnv | Record<string, unknown>): Env {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Invalid environment variables:\n  (root): expected an object");
  }
  const r = raw as Record<string, unknown>;
  const issues: string[] = [];
  const str = (v: unknown) => (typeof v === "string" && v !== "" ? v : undefined);

  const oneOf = <T extends readonly string[]>(
    key: string,
    allowed: T,
    fallback: T[number],
  ): T[number] => {
    const v = str(r[key]);
    if (v === undefined) return fallback;
    if ((allowed as readonly string[]).includes(v)) return v as T[number];
    issues.push(`  ${key}: must be one of ${allowed.join(" | ")}`);
    return fallback;
  };

  const url = (key: string, fallback?: string): string => {
    const v = str(r[key]) ?? fallback;
    if (v === undefined) {
      issues.push(`  ${key}: required`);
      return "";
    }
    if (!isUrl(v)) {
      issues.push(`  ${key}: must be a valid URL`);
      return "";
    }
    return v;
  };

  const NODE_ENV = oneOf("NODE_ENV", NODE_ENVS, "development");
  const NEXT_PUBLIC_APP_ENV = oneOf("NEXT_PUBLIC_APP_ENV", APP_ENVS, "local");
  const NEXT_PUBLIC_APP_URL = url("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
  const NEXT_PUBLIC_SUPABASE_URL = url("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = str(r.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (!anonKey || anonKey.length < 20) {
    issues.push("  NEXT_PUBLIC_SUPABASE_ANON_KEY: anon key looks truncated");
  }

  if (issues.length > 0) {
    throw new Error(`Invalid environment variables:\n${issues.join("\n")}`);
  }
  return {
    NODE_ENV,
    NEXT_PUBLIC_APP_ENV,
    NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey as string,
  };
}

// NEXT_PUBLIC_* variables are inlined by the bundler ONLY when read as static
// `process.env.NAME` member accesses. Passing `process.env` as an object leaves
// them undefined in the browser (there is no real process.env there), which
// crashes the client at load. Each key is therefore named explicitly.
export const env = parseEnv({
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});

/** Alias used by the auth clients, to read as "the public half" at the call site. */
export const publicEnv = env;
