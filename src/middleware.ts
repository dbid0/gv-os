import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { isAllowed } from "@/lib/auth/allowlist";

/**
 * Session refresh and route protection, on every request.
 *
 * Two jobs:
 *
 * 1. Refresh the Supabase session. Server Components cannot write cookies, so
 *    without this the session would silently expire mid-use.
 * 2. Gate the app. Anything outside the public paths requires a signed-in user
 *    whose address is on the allowlist.
 *
 * The allowlist is checked HERE as well as at the callback, deliberately. If a
 * session ever exists for an address that should not have one — removed from
 * the list, or issued before the list tightened — it is signed out on its very
 * next request rather than lingering until it expires.
 */

const PUBLIC_PATHS = [
  "/login",
  "/auth/callback",
  "/auth/error",
  "/api/health",
  // Carry their own SYNC_SECRET bearer auth for scheduled jobs.
  "/api/sync/finance-sheet",
  "/api/sync/payments",
  "/api/sync/close",
  "/api/sync/kit",
  "/api/sync/all-pulls",
  "/api/sync/bookings",
  // Capability-URL token IS the auth; unknown tokens 404 in the route.
  "/api/webhooks/payments",
  "/api/webhooks/bookings",
  // Discord bot's task API — its own BOT_API_TOKEN bearer.
  "/api/bot/tasks",
];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

export async function middleware(request: NextRequest) {
  // Build phase: the app is internal and unpublished, so the whole thing is
  // open — no login wall. Set DISABLE_AUTH back to unset/false to restore the
  // gate before any real launch. This is the ONE switch; nothing else changes.
  if (process.env.DISABLE_AUTH === "true") {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser, not getSession: this revalidates against Supabase rather than
  // trusting a cookie that could have been tampered with.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // A signed-in user has no reason to sit on the login page.
  if (user && isAllowed(user.email) && pathname === "/login") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (isPublic(pathname)) return response;

  if (!user) {
    const url = new URL("/login", request.url);
    // Remember where they were headed, so login returns them there.
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (!isAllowed(user.email)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(
      new URL("/auth/error?reason=not-allowed", request.url),
    );
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except Next internals and static files.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
