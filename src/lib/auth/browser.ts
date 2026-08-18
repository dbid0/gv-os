"use client";

import { createBrowserClient } from "@supabase/ssr";

import { publicEnv } from "@/env";

/** Supabase client for client components. Anon key only. */
export function createClient() {
  return createBrowserClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
