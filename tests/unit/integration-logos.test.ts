import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { PROVIDERS } from "@/lib/integrations/providers";
import { PROVIDERS_WITH_LOGOS, providerLogo } from "@/lib/integrations/logos";

const DIR = join(process.cwd(), "public", "brand", "integrations");

describe("integration brand marks", () => {
  it("has a file for every provider that claims one", () => {
    // Claiming a mark that is not on disk 404s on every render, and the
    // monogram fallback hides it by looking fine.
    const missing = PROVIDERS_WITH_LOGOS.filter(
      (v) => !existsSync(join(DIR, `${v}.svg`)),
    );
    expect(missing, `no SVG on disk for: ${missing.join(", ")}`).toEqual([]);
  });

  it("claims every file that is on disk", () => {
    // The other direction: a mark nobody asks for is dead weight in the bundle.
    const onDisk = readdirSync(DIR)
      .filter((f) => f.endsWith(".svg"))
      .map((f) => f.replace(/\.svg$/, ""));
    const unclaimed = onDisk.filter(
      (v) => !(PROVIDERS_WITH_LOGOS as readonly string[]).includes(v),
    );
    expect(unclaimed, `on disk but never used: ${unclaimed.join(", ")}`).toEqual([]);
  });

  it("only names providers the catalog actually has", () => {
    const known = new Set(PROVIDERS.map((p) => p.value));
    const strays = PROVIDERS_WITH_LOGOS.filter((v) => !known.has(v));
    expect(strays, `not in the provider catalog: ${strays.join(", ")}`).toEqual([]);
  });

  it("ships real SVGs, not error pages", () => {
    for (const v of PROVIDERS_WITH_LOGOS) {
      const svg = readFileSync(join(DIR, `${v}.svg`), "utf8");
      expect(svg.slice(0, 200), `${v} is not an SVG`).toContain("<svg");
      // Vendored in brand colour; a mark with no fill renders as a blank box.
      expect(svg, `${v} has no fill`).toMatch(/fill="#[0-9A-Fa-f]{3,8}"/);
    }
  });

  it("gives a path for a provider with a mark and null for one without", () => {
    expect(providerLogo("stripe")).toBe("/brand/integrations/stripe.svg");
    // Whop, Slack, Close, Commas, iClosed and the rest draw their monogram.
    expect(providerLogo("whop")).toBeNull();
    expect(providerLogo("nonsense")).toBeNull();
  });
});
