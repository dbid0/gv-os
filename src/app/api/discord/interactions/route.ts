import { createPublicKey, verify } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Discord slash-command endpoint for the notetaker.
 *
 * Discord POSTs here when someone runs `/record`. We verify its ed25519
 * signature (the signature IS the auth — this route is public), then fire a
 * GitHub `repository_dispatch` that starts the notetaker Action for an ad-hoc
 * call. The scheduled 9:00 call needs none of this; it runs on cron.
 *
 * No external crypto dep: Node verifies ed25519 natively once the raw 32-byte
 * public key is wrapped in its SPKI DER header.
 *
 * Env: DISCORD_PUBLIC_KEY (Discord app's public key), GH_DISPATCH_TOKEN (a
 * fine-grained PAT with Actions: read/write on the repo), GH_DISPATCH_REPO
 * ("owner/repo", default dbid0/gv-os).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ED25519_SPKI_PREFIX = "302a300506032b6570032100";

// Discord interaction + response types we use.
const PING = 1;
const APPLICATION_COMMAND = 2;
const PONG = 1;
const CHANNEL_MESSAGE = 4;
const EPHEMERAL = 64;

function verifySignature(raw: string, sig: string, ts: string): boolean {
  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  if (!publicKey || !sig || !ts) return false;
  try {
    const key = createPublicKey({
      key: Buffer.from(ED25519_SPKI_PREFIX + publicKey, "hex"),
      format: "der",
      type: "spki",
    });
    return verify(null, Buffer.from(ts + raw), key, Buffer.from(sig, "hex"));
  } catch {
    return false;
  }
}

interface CommandOption {
  name: string;
  value?: string;
}

function optionValue(options: CommandOption[] | undefined, name: string): string {
  return options?.find((o) => o.name === name)?.value?.toString() ?? "";
}

async function dispatchRecord(payload: Record<string, string>): Promise<boolean> {
  const token = process.env.GH_DISPATCH_TOKEN;
  const repo = process.env.GH_DISPATCH_REPO || "dbid0/gv-os";
  if (!token) return false;
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "gv-os-notetaker",
      },
      body: JSON.stringify({
        event_type: "notetaker-record",
        client_payload: payload,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function reply(content: string) {
  return NextResponse.json({
    type: CHANNEL_MESSAGE,
    data: { content, flags: EPHEMERAL },
  });
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const sig = req.headers.get("x-signature-ed25519") ?? "";
  const ts = req.headers.get("x-signature-timestamp") ?? "";

  if (!verifySignature(raw, sig, ts)) {
    return new NextResponse("invalid request signature", { status: 401 });
  }

  let body: {
    type: number;
    data?: { name?: string; options?: CommandOption[] };
    channel_id?: string;
  };
  try {
    body = JSON.parse(raw);
  } catch {
    return new NextResponse("bad request", { status: 400 });
  }

  // Discord's endpoint health check.
  if (body.type === PING) return NextResponse.json({ type: PONG });

  if (body.type === APPLICATION_COMMAND && body.data?.name === "record") {
    const title = optionValue(body.data.options, "title") || "Client call";
    const clientSlug = optionValue(body.data.options, "client");
    const started = await dispatchRecord({
      title,
      source: "client_call",
      client_slug: clientSlug,
      // Record the channel the command was run from unless one was named.
      voice_channel_id: optionValue(body.data.options, "channel"),
      channel_id: body.channel_id ?? "",
    });
    return reply(
      started
        ? "🎙️ Notetaker starting — I'll join the call, record it, and drop the notes + tasks into GV OS when it wraps."
        : "⚠️ Couldn't start the notetaker (dispatch token not set). Ping Daniel.",
    );
  }

  // Unknown command — acknowledge so Discord doesn't show an error.
  return reply("Unrecognized command.");
}
