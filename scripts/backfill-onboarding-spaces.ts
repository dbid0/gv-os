/**
 * Give every active client the onboarding section they should already have.
 *
 * The seeder used to skip any client that had ANY page, so the two clients
 * whose real Notion was imported first (The Grid, The Vault) never received
 * one — their teamspace opens straight onto sales SOPs with no onboarding, and
 * the ones that were seeded got a page literally titled "Client Template".
 *
 * This runs the REAL copy (`copyTemplateIntoClient`) rather than
 * reimplementing it in SQL, so there is one definition of what the section
 * contains. Idempotent: a client that already has it is skipped, and existing
 * pages are never modified — the section is only ever ADDED alongside them.
 *
 *   DATABASE_URL=... npx tsx scripts/backfill-onboarding-spaces.ts [--dry]
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";

import * as schema from "@/db/schema";
import { clients, workspacePages } from "@/db/schema/app";
import { copyTemplateIntoClient } from "@/lib/workspace/copy-template";
import {
  CLIENT_TEMPLATE_TITLE,
  hasOnboardingSpace,
  onboardingRootIcon,
  onboardingSpaceTitle,
} from "@/lib/workspace/template";

const dry = process.argv.includes("--dry");
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

async function main() {
  const client = postgres(url!, { max: 4, prepare: false });
  const db = drizzle(client, { schema });

  // The agency Client Template's own icon — what a seeded section wears.
  const [template] = await db
    .select({ icon: workspacePages.icon })
    .from(workspacePages)
    .where(eq(workspacePages.title, CLIENT_TEMPLATE_TITLE))
    .limit(1);
  const templateIcon = template?.icon ?? null;

  const roster = await db
    .select({ id: clients.id, slug: clients.slug, name: clients.name })
    .from(clients)
    .where(eq(clients.status, "active"));

  for (const c of roster.sort((a, b) => a.name.localeCompare(b.name))) {
    const [clientRow] = await db
      .select({ logo: clients.logo })
      .from(clients)
      .where(eq(clients.id, c.id))
      .limit(1);
    const roots = (
      await db
        .select({
          id: workspacePages.id,
          title: workspacePages.title,
          icon: workspacePages.icon,
          parentId: workspacePages.parentId,
        })
        .from(workspacePages)
        .where(eq(workspacePages.clientId, c.id))
    ).filter((r) => r.parentId === null);
    const titles = roots.map((r) => r.title);

    // A section seeded before the rename is still titled "Client Template" —
    // the factory label on the client's own workspace. Rename it in place
    // rather than adding a second copy beside it.
    const stale = roots.find(
      (r) =>
        r.title.trim() === CLIENT_TEMPLATE_TITLE &&
        r.title !== onboardingSpaceTitle(c.name),
    );
    if (stale) {
      const nextTitle = onboardingSpaceTitle(c.name);
      const nextIcon = onboardingRootIcon(clientRow?.logo ?? null, stale.icon);
      if (dry) {
        console.log(
          `  [dry] ${c.slug} — would rename "${stale.title}" -> "${nextTitle}"`,
        );
      } else {
        await db
          .update(workspacePages)
          .set({ title: nextTitle, icon: nextIcon })
          .where(eq(workspacePages.id, stale.id));
        console.log(`  RENAMED ${c.slug} — "${stale.title}" -> "${nextTitle}"`);
      }
      continue;
    }

    if (hasOnboardingSpace(titles, c.name)) {
      // It exists — but the two clients whose sections were renamed in place,
      // or pulled from their own Notion, never picked up an icon, while the
      // two seeded from the template did. Four client workspaces, two of them
      // wearing a mark and two blank, is exactly the kind of inconsistency
      // that makes a product look unfinished.
      const existing = roots.find((r) => hasOnboardingSpace([r.title], c.name));
      if (existing && !existing.icon) {
        const icon = onboardingRootIcon(clientRow?.logo ?? null, templateIcon);
        if (icon) {
          if (dry) {
            console.log(
              `  [dry] ${c.slug} — would give "${existing.title}" the template icon`,
            );
          } else {
            await db
              .update(workspacePages)
              .set({ icon })
              .where(eq(workspacePages.id, existing.id));
            console.log(
              `  ICON  ${c.slug} — "${existing.title}" now carries the template icon`,
            );
          }
          continue;
        }
      }
      console.log(`  skip  ${c.slug} — already has its onboarding section`);
      continue;
    }
    if (dry) {
      console.log(
        `  [dry] ${c.slug} — would add "${onboardingSpaceTitle(c.name)}" (has ${titles.length} top-level pages now)`,
      );
      continue;
    }
    const { copied } = await copyTemplateIntoClient(db, c.id);
    console.log(
      copied > 0
        ? `  ADDED ${c.slug} — "${onboardingSpaceTitle(c.name)}" (${copied} pages)`
        : `  none  ${c.slug} — nothing copied (no agency Client Template?)`,
    );
  }
  await client.end();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("FAILED:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
