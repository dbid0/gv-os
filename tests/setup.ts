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
