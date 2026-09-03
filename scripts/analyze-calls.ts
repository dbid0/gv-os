/**
 * THE CALL READ — powered by Claude Code, not an API key.
 *
 * GV OS is hosted; Claude Code runs on this machine. So the read is a LOCAL
 * WORKER rather than a request handler: it claims recordings whose analysis is
 * still pending, runs each transcript through `claude -p`, and writes the
 * result back. Same shape ODYSSEY uses — the desktop side does the thinking,
 * the app stores and displays it.
 *
 * The prompt and the parser are the TESTED PURE ONES from lib/calls/
 * call-analysis. This file only moves data and shells out, so there is exactly
 * one definition of what a call read asks for and what counts as an answer.
 *
 * It never stores a guess:
 *   • a reply that doesn't parse, or doesn't say what happened → `failed`
 *   • a transcript that isn't there → skipped
 *   • a transient CLI failure → retried, then left `pending` for the next run
 *
 *   DATABASE_URL=… npx tsx scripts/analyze-calls.ts [--limit 5] [--slug the-grid]
 *                                                   [--model opus] [--redo]
 */
import { spawn } from "node:child_process";
import { and, eq, isNotNull, sql as raw } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/db/schema";
import { callRecordings, clients } from "@/db/schema/app";
import {
  buildAnalysisPrompt,
  CALL_ANALYSIS_SYSTEM,
  parseCallAnalysis,
} from "@/lib/calls/call-analysis";

const args = process.argv.slice(2);
const flag = (name: string): string | null => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : (args[i + 1] ?? null);
};
const LIMIT = Number(flag("limit") ?? "100");
const SLUG = flag("slug");
const MODEL = flag("model") ?? "sonnet";
const REDO = args.includes("--redo");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

/** One read. Retried once: the CLI can drop a long response mid-stream. */
async function readCall(prompt: string): Promise<string | null> {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return await runClaude(prompt);
    } catch (e) {
      const why = e instanceof Error ? e.message : "failed";
      if (attempt === 2) {
        console.log(`      cli failed twice (${why})`);
        return null;
      }
      console.log(`      cli failed (${why}) — retrying`);
    }
  }
  return null;
}

function runClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "claude",
      ["-p", "--append-system-prompt", CALL_ANALYSIS_SYSTEM, "--model", MODEL],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    let out = "";
    let err = "";
    // A long call can take minutes; give it room but never hang the run.
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("timed out"));
    }, 600_000);

    child.stdout.on("data", (d) => (out += String(d)));
    child.stderr.on("data", (d) => (err += String(d)));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      // The CLI prints its own error into stdout on a dropped connection.
      if (code !== 0 || /^API Error/i.test(out.trim())) {
        reject(
          new Error(
            out.trim().slice(0, 80) || err.trim().slice(0, 80) || `exit ${code}`,
          ),
        );
        return;
      }
      resolve(out);
    });
    child.stdin.end(prompt);
  });
}

async function main() {
  const client = postgres(url!, { max: 4, prepare: false });
  const db = drizzle(client, { schema });

  const where = [isNotNull(callRecordings.transcript)];
  if (!REDO) where.push(eq(callRecordings.analysisStatus, "pending"));
  if (SLUG) {
    const [c] = await db
      .select({ id: clients.id })
      .from(clients)
      .where(eq(clients.slug, SLUG))
      .limit(1);
    if (!c) {
      console.error(`no client with slug ${SLUG}`);
      process.exit(1);
    }
    where.push(eq(callRecordings.clientId, c.id));
  }

  const pending = await db
    .select({
      id: callRecordings.id,
      title: callRecordings.title,
      transcript: callRecordings.transcript,
      participants: callRecordings.participants,
      clientId: callRecordings.clientId,
    })
    .from(callRecordings)
    .where(and(...where))
    .orderBy(raw`occurred_at desc nulls last`)
    .limit(LIMIT);

  console.log(
    `${pending.length} call${pending.length === 1 ? "" : "s"} to read (model: ${MODEL})\n`,
  );

  const offerNames = new Map<string, string>();
  for (const row of await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)) {
    offerNames.set(row.id, row.name);
  }

  let done = 0;
  let failed = 0;
  for (const [i, call] of pending.entries()) {
    const label = (call.title ?? call.id).slice(0, 54);
    process.stdout.write(`  [${i + 1}/${pending.length}] ${label} … `);
    if (!call.transcript) {
      console.log("no transcript, skipped");
      continue;
    }

    const prompt = buildAnalysisPrompt(call.transcript, {
      disposition: null,
      // Participants are [rep, lead email]; the lead is the prospect.
      customerName: call.participants?.[1] ?? null,
      offerName: call.clientId ? (offerNames.get(call.clientId) ?? null) : null,
    });

    const reply = await readCall(prompt);
    const analysis = reply ? parseCallAnalysis(reply) : null;

    if (!analysis) {
      // A reply that does not say what happened is worse than no read at all,
      // so it is recorded as failed rather than stored.
      await db
        .update(callRecordings)
        .set({ analysisStatus: "failed", analyzedAt: new Date() })
        .where(eq(callRecordings.id, call.id));
      failed += 1;
      console.log("no usable read → failed");
      continue;
    }

    await db
      .update(callRecordings)
      .set({
        analysisStatus: "done",
        analysisOutcome: analysis.outcome,
        analysis: analysis as unknown as Record<string, unknown>,
        analyzedAt: new Date(),
      })
      .where(eq(callRecordings.id, call.id));
    done += 1;
    console.log(`done — ${analysis.outcome.slice(0, 70)}…`);
  }

  console.log(`\n${done} read, ${failed} failed.`);
  await client.end();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("FAILED:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
