/**
 * No-op stand-in for the `server-only` package inside Vitest.
 *
 * The real package ships a browser build that throws on import, which is
 * exactly what we want in the app: it makes `next build` fail if a client
 * component ever imports a server module. Vitest resolves browser conditions
 * for jsdom tests, so it hits that throw too.
 *
 * Aliasing it here does NOT weaken the guarantee. The guarantee is enforced at
 * build time by Next, and `npm run build` runs in CI on every commit.
 */
export {};
