/**
 * Which integrations ship a brand mark.
 *
 * The marks are vendored SVGs in `public/brand/integrations/<value>.svg`, so
 * they render offline, never call a third-party logo service at runtime, and
 * cannot leak which tools this agency uses to anyone outside it.
 *
 * Only providers listed here have a file. Everything else falls back to the
 * monogram, which is why this list exists at all: asking for a logo that is
 * not there 404s on every render, and the fallback looks correct while it
 * happens — exactly the bug that shipped three times on client logos. A test
 * keeps this list and the folder in step.
 *
 * Marks come from Simple Icons (CC0). The trademarks belong to their owners
 * and are used only to identify the tool being connected.
 */

export const PROVIDERS_WITH_LOGOS = [
  "calendly",
  "discord",
  "fathom",
  "google_drive",
  "google_sheets",
  "kit",
  "notion",
  "shopify",
  "stripe",
  "typeform",
  "wistia",
] as const;

const WITH_LOGOS = new Set<string>(PROVIDERS_WITH_LOGOS);

/** The mark's path, or null when this provider should draw its monogram. */
export function providerLogo(value: string): string | null {
  return WITH_LOGOS.has(value) ? `/brand/integrations/${value}.svg` : null;
}
