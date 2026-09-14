import { NextResponse, type NextRequest } from "next/server";

import { followShortLink } from "@/lib/marketing/utm-links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public short link: /l/<code> → 302 to the link's stored UTM-tagged URL, with
 * the click counted. Unknown codes are a plain 404. The target only ever comes
 * from the registry row, never from the request.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const target = await followShortLink(code).catch(() => null);
  if (!target) {
    return new NextResponse("This link doesn't exist.", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  return NextResponse.redirect(target, {
    status: 302,
    headers: { "cache-control": "no-store" },
  });
}
