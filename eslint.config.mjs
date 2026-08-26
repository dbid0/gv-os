import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated artifacts, not source.
    "coverage/**",
    "drizzle/**",
    // Standalone Node runtime for the cloud notetaker (runs in a GitHub
    // Action, not the Next bundle) — its own deps, CommonJS, not app-linted.
    "notetaker/**",
  ]),
]);

export default eslintConfig;
