// Environment first: src/env.ts parses at module load, so anything importing it
// needs valid values before the first import runs. Setup files execute ahead of
// test files, which makes this the right place. These mirror the placeholders
// CI uses for the build step.
process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://test.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "test-anon-key-not-a-real-credential";

import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Testing Library only auto-cleans when Vitest runs with `globals: true`. We do
// not, so unmount explicitly. Without this, renders accumulate across tests in a
// file and queries start finding duplicates from the previous test, which fails
// in a way that looks like a component bug.
afterEach(() => {
  cleanup();
});
