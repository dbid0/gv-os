# GV OS

The Global Ventures agency OS. Sales, accounting, and ops for Daniel and Gus in
one hosted app.

- **Plan:** `Operator/global-ventures/gv-os/BUILD-PLAN.md` (the full architecture
  and phase roadmap)
- **Rules:** [`docs/RELIABILITY.md`](docs/RELIABILITY.md) — read this before
  changing anything that touches money

## Stack

Next.js 16 (App Router) · TypeScript strict · Tailwind 4 · shadcn/ui · motion ·
Postgres on Supabase · Drizzle ORM · Supabase Auth · Vitest · Vercel

## Run it

Requires **Node 24** (see `.nvmrc`; Homebrew may put a newer Node first on your
`PATH`).

```bash
npm ci
cp .env.example .env.local   # fill in the values
npm run dev                  # http://localhost:3000
```

## Scripts

| Command                 | What it does                                     |
| ----------------------- | ------------------------------------------------ |
| `npm run dev`           | Dev server                                       |
| `npm run build`         | Production build                                 |
| `npm run typecheck`     | `tsc --noEmit`                                   |
| `npm run lint`          | ESLint                                           |
| `npm run test`          | Vitest, once                                     |
| `npm run test:watch`    | Vitest, watching                                 |
| `npm run test:coverage` | Coverage, with gates on money modules            |
| `npm run format`        | Prettier write                                   |
| `npm run verify`        | **Everything CI runs.** Do this before you push. |

## Environments

| Environment         | Database                 |
| ------------------- | ------------------------ |
| Local               | Supabase `gv-os-staging` |
| Preview (per PR)    | Supabase `gv-os-staging` |
| Production (`main`) | Supabase `gv-os-prod`    |

A preview deployment never touches production data. That separation is a
control, not a convention.

## Build order

1. **Foundation** — repo, CI, database, auth, app shell, live URL ← _here_
2. Sales module (VSL → application → setter → closer)
3. Accounting ledger (append-only, reconciled to the Master Finance Sheet)
4. Ops (tasks + EOD)
5. Ads
6. Migrate the GGV job boards in, retire Lovable
