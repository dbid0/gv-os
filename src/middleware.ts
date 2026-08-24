import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { devAuthBypass } from "@/lib/auth/dev-bypass";
import { isAllowed } from "@/lib/auth/allowlist";
import { effectiveRole, guardTarget, ROLES, type Role } from "@/lib/auth/roles";
import { resolveRealRole } from "@/lib/auth/resolve-role";

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
  "/api/sync/docs",
  "/api/sync/transactions-import",
  "/api/sync/notifications",
  "/api/sync/new-deals",
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

/**
 * The `gv-dev-role` cookie previews a NARROWER role (restrict-only — it can
 * only ever take access away, never grant it, and only for an admin: see
 * `effectiveRole`). It works even while the login wall is down, and is the
 * "View as" layer sitting ON TOP of a user's real role.
 */
function previewRole(request: NextRequest): Role | null {
  const v = request.cookies.get("gv-dev-role")?.value ?? "";
  return (ROLES as readonly string[]).includes(v) ? (v as Role) : null;
}

/**
 * Apply the route guard for a resolved role, or return null to let the request
 * through. Never guards a public path. The decision itself is the pure,
 * test-shared `guardTarget`; this only turns its answer into a redirect.
 */
function guard(request: NextRequest, realRole: Role): NextResponse | null {
  const { pathname } = request.nextUrl;
  if (isPublic(pathname)) return null;
  const role = effectiveRole(realRole, previewRole(request));
  const clientSlug = request.cookies.get("gv-dev-client")?.value ?? null;
  const target = guardTarget(role, pathname, clientSlug);
  if (target && target !== pathname) {
    return NextResponse.redirect(new URL(target, request.url));
  }
  return null;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Dev/preview only: devAuthBypass() is hard-fenced to never pass on the
  // production deployment (see src/lib/auth/dev-bypass.ts for the documented
  // verification path). In prod the login wall below always stands. With no
  // session to resolve, the real role is admin and only the preview cookie can
  // restrict what's shown — exactly the pre-login "View as" behavior.
  if (devAuthBypass()) {
    return guard(request, "admin") ?? NextResponse.next({ request });
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

  // Real per-user role enforcement. The user is signed in AND allowlisted; now
  // resolve their REAL role from the Team roster and 307 them off anything it
  // can't open. resolveRealRole fails open to admin and the whole block is
  // wrapped, so role logic can NEVER lock out a signed-in, allowlisted user —
  // least of all daniel@/gus@, who are unmapped and so always resolve to admin.
  try {
    const realRole = await resolveRealRole(user.email);
    const redirect = guard(request, realRole);
    if (redirect) return redirect;
  } catch {
    // Never let role resolution break access for an authenticated owner.
  }

  return response;
}

export const config = {
  // Node.js runtime: the guard resolves the real role from Postgres (getDb uses
  // the postgres-js driver, which needs Node sockets). Node middleware is stable
  // in Next 15.5+; the app already runs its data routes on "nodejs".
  runtime: "nodejs",
  matcher: [
    // Everything except Next internals and static files.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
