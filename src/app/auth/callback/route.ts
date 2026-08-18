import { NextResponse, type NextRequest } from "next/server";

import { isAllowed } from "@/lib/auth/allowlist";
import { createClient } from "@/lib/auth/server";

/**
 * Where the magic link lands.
 *
 * This is the security boundary that actually matters. The login form's
 * allowlist check is a courtesy so a wrong address fails fast; this one is the
 * gate. Anyone can request a link for any address, so the check has to happen
 * where the session is created, not where it is requested.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/error?reason=no-code`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/auth/error?reason=exchange-failed`);
  }

  if (!isAllowed(data.user.email)) {
    // A valid link for an address that is not permitted. Destroy the session
    // immediately rather than leaving it to the middleware to catch later.
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/auth/error?reason=not-allowed`);
  }

  // Only ever redirect to a path on this origin. An open redirect here would
  // let a crafted link bounce a freshly authenticated user somewhere hostile.
  const target = next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  return NextResponse.redirect(`${origin}${target}`);
}
