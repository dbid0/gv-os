// Environment first: src/env.ts parses at module load, so anything importing it
// needs valid values before the first import runs. Setup files execute ahead of
// test files, which makes this the right place. These mirror the placeholders
// CI uses for the build step.
process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://test.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "test-anon-key-not-a-real-credential";

import "@testing-library/jest-dom/vitest";

// Tests run as if the user asked for reduced motion. Two reasons: jsdom cannot
// complete an animation, so any assertion about a node disappearing would hang
// on an exit that never finishes; and a test should assert behaviour, never the
// state of a tween. Components must behave correctly with motion disabled, which
// is exactly what this checks on every run.
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

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Testing Library only auto-cleans when Vitest runs with `globals: true`. We do
// not, so unmount explicitly. Without this, renders accumulate across tests in a
// file and queries start finding duplicates from the previous test, which fails
// in a way that looks like a component bug.
afterEach(() => {
  cleanup();
});
