import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { publicEnv } from "@/env";

/**
 * Supabase client for Server Components, Server Actions, and route handlers.
 *
 * Uses the ANON key with the user's own session cookie, never the service-role
 * key. Every query therefore runs as the signed-in person and row-level
 * security still applies. A service-role client bypasses RLS entirely, so it
 * only ever belongs in a deliberate, isolated admin path.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // The middleware refreshes the session, so this is safe to ignore.
          }
        },
      },
    },
  );
}

/** The signed-in user, or null. Never throws. */
export async function currentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
