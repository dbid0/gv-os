/**
 * Ask Claude Code what this client's unrecognised columns mean.
 *
 * The tracking parser ships with alias lists covering the sheets we have seen.
 * A new client names things their own way, and a header nobody anticipated is
 * kept but never read — the figure it holds silently does not count, which on
 * a dashboard is indistinguishable from a quiet week.
 *
 * This is the ONE job in the pipeline worth handing to a model, because the
 * question is about wording rather than data: "does the column headed X mean
 * what the parser calls `email`?" A person checks that in a second, and a
 * wrong answer changes nothing until they approve it.
 *
 * A proposal is written UNAPPROVED. Nothing a model suggested moves a number
 * on its own.
 *
 *   DATABASE_URL=… npx tsx scripts/propose-columns.ts [--slug the-grid] [--model opus]
 */
import { spawn } from "node:child_process";
import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/db/schema";
import {
  clientColumnMap,
  clients,
  clientTrackingRows,
  clientTrackingSyncs,
} from "@/db/schema/app";
import {
  buildColumnPrompt,
  COLUMN_PROPOSAL_SYSTEM,
  parseColumnProposals,
  type ColumnSample,
} from "@/lib/tracking/column-proposal";

const args = process.argv.slice(2);
const flag = (n: string) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 ? null : (args[i + 1] ?? null);
};
const SLUG = flag("slug");
const MODEL = flag("model") ?? "sonnet";
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

function ask(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "claude",
      ["-p", "--append-system-prompt", COLUMN_PROPOSAL_SYSTEM, "--model", MODEL],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    let out = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("timed out"));
    }, 300_000);
    child.stdout.on("data", (d) => (out += String(d)));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0 || /^API Error/i.test(out.trim())) {
        reject(new Error(out.trim().slice(0, 80) || `exit ${code}`));
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

  const roster = await db
    .select({ id: clients.id, slug: clients.slug, name: clients.name })
    .from(clients)
    .where(SLUG ? eq(clients.slug, SLUG) : eq(clients.status, "active"));

  for (const offer of roster) {
    const [snapshot] = await db
      .select({ id: clientTrackingSyncs.id, tabs: clientTrackingSyncs.tabs })
      .from(clientTrackingSyncs)
      .where(eq(clientTrackingSyncs.clientId, offer.id))
      .orderBy(desc(clientTrackingSyncs.createdAt))
      .limit(1);
    if (!snapshot) {
      console.log(`\n${offer.slug}: never synced, skipping`);
      continue;
    }
    console.log(`\n${offer.slug}`);

    const already = await db
      .select({ tab: clientColumnMap.tab, header: clientColumnMap.header })
      .from(clientColumnMap)
      .where(eq(clientColumnMap.clientId, offer.id));
    const seen = new Set(already.map((a) => `${a.tab}::${a.header.toLowerCase()}`));

    for (const scan of (snapshot.tabs ?? []) as {
      tab: string;
      unmappedColumns?: string[];
    }[]) {
      const headers = (scan.unmappedColumns ?? []).filter(
        (h) => !seen.has(`${scan.tab}::${h.toLowerCase()}`),
      );
      if (headers.length === 0) continue;

      // Real values give the model something to judge; a header alone is a guess.
      const rows = await db
        .select({ payload: clientTrackingRows.payload })
        .from(clientTrackingRows)
        .where(
          and(
            eq(clientTrackingRows.syncId, snapshot.id),
            eq(clientTrackingRows.tab, scan.tab),
          ),
        )
        .limit(60);
      const samples: ColumnSample[] = headers
        .map((header) => ({
          header,
          values: rows
            .map((r) => String(r.payload?.[header] ?? ""))
            .filter((v) => v.trim() !== ""),
        }))
        // A column that is empty on every row is not asked about at all.
        // There is nothing to map and nothing to gain, and asking invites the
        // model to reason from the HEADER alone — which is exactly what it did
        // on the first run: it proposed a date mapping for "Call Time", a
        // column with no values anywhere, purely because of the wording.
        .filter((s) => s.values.length > 0);

      if (samples.length === 0) {
        console.log(
          `  ${scan.tab.padEnd(15)} ${headers.length} unknown … all empty, not asking`,
        );
        continue;
      }

      process.stdout.write(`  ${scan.tab.padEnd(15)} ${samples.length} with data … `);
      let reply: string;
      try {
        reply = await ask(buildColumnPrompt(scan.tab, samples));
      } catch (e) {
        console.log(`failed (${e instanceof Error ? e.message : "error"})`);
        continue;
      }
      const proposals = parseColumnProposals(
        reply,
        samples.map((s) => s.header),
      );
      if (proposals.length === 0) {
        console.log("nothing maps (correct for most columns)");
        continue;
      }
      for (const p of proposals) {
        await db
          .insert(clientColumnMap)
          .values({
            clientId: offer.id,
            tab: scan.tab,
            header: p.header,
            field: p.field,
            source: "ai",
            reason: p.reason,
            // Deliberately NOT approved. A person confirms before it counts.
            approvedAt: null,
          })
          .onConflictDoNothing();
      }
      console.log(
        `proposed ${proposals.length}: ${proposals.map((p) => `${p.header} → ${p.field}`).join(", ")}`,
      );
    }
  }
  await client.end();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("FAILED:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
