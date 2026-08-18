"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/auth/server";

/**
 * Sign out.
 *
 * A Server Action rather than a client-side call, so the session cookie is
 * cleared server-side and the redirect happens in the same round trip. A
 * client-only signOut can leave a stale cookie if the redirect races it.
 */
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
