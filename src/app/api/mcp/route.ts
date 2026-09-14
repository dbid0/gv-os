import { NextResponse, type NextRequest } from "next/server";

import { bearerKey } from "@/lib/mcp/keys";
import { authenticateMcpKey } from "@/lib/mcp/keys-store";
import { handleMessage, RPC } from "@/lib/mcp/protocol";
import { GV_OS_TOOLS } from "@/lib/mcp/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The GV OS MCP endpoint. Public to the session middleware on purpose: it
 * carries its own credential — an owner-created, read-only API key presented as
 * a Bearer token — and refuses everything without one. JSON-RPC over POST;
 * notifications get 202 with no body.
 */
export async function POST(req: NextRequest) {
  const key = bearerKey(req.headers.get("authorization"));
  const identity = key ? await authenticateMcpKey(key).catch(() => null) : null;
  if (!identity) {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: RPC.invalidRequest,
          message:
            'Missing or invalid GV OS API key. Create one under Settings → MCP and send it as "Authorization: Bearer <key>".',
        },
      },
      { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="gv-os"' } },
    );
  }

  let message: unknown;
  try {
    message = await req.json();
  } catch {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: RPC.parseError, message: "Body is not valid JSON." },
      },
      { status: 400 },
    );
  }

  const response = await handleMessage(message, GV_OS_TOOLS);
  if (response === null) return new NextResponse(null, { status: 202 });
  return NextResponse.json(response);
}

/** No server-initiated stream in v1 — the spec's answer is 405 on GET. */
export function GET() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}
