# Reliability rules

These are not suggestions. They exist because if the accounting is wrong for a
month, Global Ventures loses real money.

> **A new feature must never break an existing one, and must never change a
> number that was already correct.**

## The three structural guarantees

1. **The ledger is append-only at the database level.** Money history cannot be
   edited, by anyone, including us. A Postgres trigger rejects `UPDATE` and
   `DELETE`, and the application role is not granted those privileges. Mistakes
   are corrected with a reversing row, never an edit. You cannot lose a month
   because you cannot edit a month.
2. **CI gates every commit.** Typecheck, lint, format, unit tests, and build all
   run on every push and pull request. Red never merges.
3. **Increments are small.** One vertical slice per PR, independently
   deployable and independently revertable. If a PR needs a paragraph to
   explain, it is two PRs.

## Money

- Money is **integer cents** (`bigint`), signed. Never a float. Never a JS
  `number` doing arithmetic on dollars.
- Splitting money uses the largest-remainder allocator. The invariant, asserted
  by a property test: **allocated parts always sum to exactly the input.**
- `src/lib/money.ts` and `src/lib/splits.ts` are held at **100% coverage**.
- Any change touching money starts with a failing test, then the fix.

## Database

- Schema changes are versioned SQL migration files in `drizzle/`, committed and
  reviewed. Never `drizzle-kit push` at production.
- Destructive changes use **expand/contract**: add the new column, backfill,
  ship code that reads it, wait a release, then drop the old one. A column is
  never renamed and dropped in the same deploy, because the rollback would lose
  data.
- Two separate Supabase projects: `gv-os-prod` and `gv-os-staging`. Preview
  deployments point at staging. **A preview may never touch production data.**

## Dependencies

**After any change to dependencies, run `npm run deps:relock` and commit the
lockfile.**

Incremental `npm install` on macOS re-resolves the tree and drops optional
packages that only apply to other platforms (the `@emnapi/*` packages that the
`@tailwindcss/oxide` wasm fallback needs on linux-x64). The lockfile then looks
fine locally and `npm ci` fails on the Linux CI runner. A clean regeneration
includes every platform. This has bitten us twice; it is a known trap, not a
mystery.

## Environments

- `src/env.ts` parses every environment variable through Zod at load. A missing
  or malformed variable fails the build, not a request at 2am.
- Production secrets exist only in Vercel's environment settings. Never in a
  file, never in the repo, never in chat.

## Before you merge

- [ ] `npm run verify` is green locally
- [ ] New behaviour has a test that fails without the change
- [ ] Migrations are additive, or expand/contract across two deploys
- [ ] No secret, key, or connection string is in the diff

## Confirm with Daniel before

- Spending money (plan upgrades, paid services, domains)
- The first public deploy of anything new
- Touching production data
- Adding a third-party dependency that holds money data
