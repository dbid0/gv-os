import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Environment first: src/env.ts parses at module load, so anything importing it
// needs valid values before the first import runs. Setup files execute ahead of
// test files, which makes this the right place. These mirror the placeholders
// CI uses for the build step.
process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://test.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "test-anon-key-not-a-real-credential";

/** One key out of .env.local, or null. No new dependency, no side effects. */
function readEnvLocal(key: string): string | null {
  try {
    const text = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const raw of text.split("\n")) {
      // trim() also takes the trailing CR off a CRLF file.
      const line = raw.trim();
      if (line === "" || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1 || line.slice(0, eq).trim() !== key) continue;
      // Strip one layer of matching quotes, the way dotenv does.
      const value = line.slice(eq + 1).trim();
      const quoted = /^(['"])(.*)\1$/.exec(value);
      return quoted ? quoted[2] : value;
    }
  } catch {
    // No .env.local on this machine: integration tests skip, exactly as before.
  }
  return null;
}

/** True only for a database plainly on this machine. */
function isLocalhost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

// THE LOCAL INTEGRATION DATABASE.
//
// Every integration test is `describe.skipIf(!process.env.DATABASE_URL)`, and
// nothing set that variable on a developer machine — Vitest does not read
// .env.local the way `next dev` does. So `npm run test:integration` reported
// "20 skipped · 73 skipped" locally and read exactly like a pass. The first
// anyone learned that a store had broken was CI, on a push, after the work was
// already considered verified. Reading the file here makes the local gate real.
//
// LOCALHOST ONLY, deliberately. These tests write to and truncate the database
// they are handed. A remote URL in that file — a staging box, a Supabase
// branch, a pooler aimed at production — would be a catastrophe run by
// accident, so anything not plainly on this machine is refused, not used.
//
// An already-set DATABASE_URL always wins: CI provides its own service.
if (!process.env.DATABASE_URL) {
  const url = readEnvLocal("DATABASE_URL");
  if (url && isLocalhost(url)) process.env.DATABASE_URL = url;
}

import "@testing-library/jest-dom/vitest";

// Tests run as if the user asked for reduced motion. Two reasons: jsdom cannot
// complete an animation, so any assertion about a node disappearing would hang
// on an exit that never finishes; and a test should assert behaviour, never the
// state of a tween. Components must behave correctly with motion disabled, which
// is exactly what this checks on every run.
// Integration tests run in the node environment, where there is no window.
if (typeof window !== "undefined") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Testing Library only auto-cleans when Vitest runs with `globals: true`. We do
// not, so unmount explicitly. Without this, renders accumulate across tests in a
// file and queries start finding duplicates from the previous test, which fails
// in a way that looks like a component bug.
afterEach(() => {
  cleanup();
});
