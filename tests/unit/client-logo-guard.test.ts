import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A guard, not a unit test.
 *
 * `ClientLogo` points at `/api/clients/[slug]/logo` and falls back to the
 * client's initial when that 404s. The fallback looks right, so a call site
 * that forgets `hasLogo` LOOKS fine while firing a 404 (and a console error)
 * for every logoless client on every page that draws one.
 *
 * That is exactly why it kept coming back: #4 fixed the avatars, #7b found the
 * Sales team cards, and 9c found the workspace teamspace icons, the clients
 * health rows and the profile cards. Three fixes, three surfaces missed,
 * because nothing failed when a new call site was added.
 *
 * So: every `<ClientLogo` in the tree must say something about `hasLogo`. A
 * surface that genuinely cannot know passes `hasLogo={undefined}` on purpose —
 * explicit ignorance is fine, silent omission is what ships the 404s.
 */

const SRC = join(process.cwd(), "src");

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return tsxFiles(path);
    return path.endsWith(".tsx") ? [path] : [];
  });
}

/** The props text of each `<ClientLogo …>` element in a file. */
function clientLogoElements(source: string): string[] {
  const out: string[] = [];
  const tag = "<ClientLogo";
  let from = 0;
  for (;;) {
    const start = source.indexOf(tag, from);
    if (start === -1) return out;
    // The element ends at the first ">" that closes the opening tag. Props here
    // only ever hold braces and strings, never a nested ">" outside them.
    let depth = 0;
    let i = start + tag.length;
    for (; i < source.length; i++) {
      const ch = source[i];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      else if (ch === ">" && depth === 0) break;
    }
    out.push(source.slice(start, i));
    from = i;
  }
}

describe("every ClientLogo says whether a logo exists", () => {
  const files = tsxFiles(SRC).filter((f) => !f.endsWith("client-logo.tsx"));

  it("finds the call sites at all (the guard itself still works)", () => {
    const withLogo = files.filter((f) =>
      readFileSync(f, "utf8").includes("<ClientLogo"),
    );
    // If this ever drops to 0 the scan has broken, not the app.
    expect(withLogo.length).toBeGreaterThan(3);
  });

  it("passes hasLogo at every call site", () => {
    const missing: string[] = [];
    for (const file of files) {
      for (const el of clientLogoElements(readFileSync(file, "utf8"))) {
        if (!el.includes("hasLogo")) {
          missing.push(file.slice(file.indexOf("src")));
        }
      }
    }
    expect(
      missing,
      `These <ClientLogo> call sites omit hasLogo, so they will request ` +
        `/api/clients/<slug>/logo for clients with no logo and 404: ` +
        `${missing.join(", ")}. Thread hasLogo from the roster, or pass ` +
        `hasLogo={undefined} deliberately if the surface cannot know.`,
    ).toEqual([]);
  });
});
