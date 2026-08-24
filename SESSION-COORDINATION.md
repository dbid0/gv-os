# ⚠️ Multiple Claude sessions in this repo — coordinate

Daniel runs more than one Claude Code session against this **same repo** at once
(e.g. a Sales/Dashboard session and a Quotas build session). Git has **one
working tree per clone**, so two agents editing + switching branches will
`git stash`/clobber each other's uncommitted work.

**To whoever is building here in parallel — hey! Let's make GV OS the best it can
be without stepping on each other:**

- **Use your own `git worktree`.** Don't share the main working tree. Example:
  `git worktree add -b feat/my-thing ~/dev/gv-os-<name> origin/main`
  then `ln -sfn ~/dev/gv-os/node_modules ~/dev/gv-os-<name>/node_modules` and
  copy `.env.local`. Work + commit + push + merge entirely from there.
- **Don't `git stash`/`git checkout` the other session's uncommitted changes.**
  If the tree isn't clean and it isn't yours, leave it — ping via this file.
- **Commit small and often.** Never leave edits uncommitted across long operations.

### Who's working on what (keep this current)

- **Sales / Dashboard session** — working in worktree `~/dev/gv-os-sales`
  (branch `feat/whop-dashboard` and successors). Owns: `src/app/(app)/dashboard/*`,
  `src/components/shell/*` (home-headline, dashboard-cards, recent-transactions,
  sidebar/topbar), the Sales section (`src/app/(app)/sales/*`,
  `src/components/sales/*`), the offer/client views (`src/app/w/[slug]/*`,
  `src/app/(app)/clients/*`), settings/profile shells, notifications.
  **Please don't touch these on main until merged.** NOT touching the Team
  section (`src/app/(app)/team/*`, `src/components/team/*`) — another session
  is building it (filters/roles).
- **Quotas session** — building the Quotas feature (branch `feat/quotas`).
- **Gamification session** — worktree `~/dev/gv-os-wt-gamify` (branch
  `feat/gamification`). Owns: `src/lib/gamification/*`,
  `src/components/gamification/*`, and the gamification additions to
  `src/app/(app)/home/member/*` and `src/app/(app)/profile/page.tsx`. All math
  is derived (no new tables); pure engine is 100% covered. Did NOT touch
  dashboard, sales, shell, or notifications.

- **Auth / roles session** — enforcing REAL per-user roles (branch
  `feat/per-user-roles`, worktree `~/dev/gv-os-wt-roles`). Owns:
  `src/middleware.ts`, `src/lib/auth/roles.ts`, `src/lib/auth/resolve-role.ts`
  (new), `src/lib/ai/context.ts`, and the role-computation block in
  `src/app/(app)/layout.tsx` (only the props fed to `<Sidebar/>` — does NOT edit
  `src/components/shell/sidebar.tsx`). Resolves each signed-in user's platform
  role from `team_members.role_key`; safe default = admin for owners
  (daniel@/gus@) and any unmapped allowlisted email. Does NOT change the
  allowlist. **Please don't touch these on main until merged.**

- **Role Home dashboards session** — worktree `~/dev/gv-os-wt-home` (branch
  `feat/role-home`). Owns: `src/app/(app)/home/manager/*`,
  `src/app/(app)/home/member/*`, `src/components/home/*`, and `src/lib/home/*`
  (new). Builds the two role home dashboards on top of #154's real roles:
  Coach (manager/admin, scoped to their offers) and Wingman (the signed-in
  rep). Both pages are VIEWER-AWARE — they resolve identity from the Team
  roster and render the right board for whoever the middleware delivers.
  REUSES read-only (never rewrites): `quota-queries`, `gamification/*`,
  `commission-rollup`, `call-queries`, sales `queries` (leaderboard/eod),
  `team.ts` roster reads. New pure model logic is 100% covered. Preserves the
  gamification momentum board for non-rep viewers on /home/member. Touches NO
  money/ledger/split/payout module (imports read fns only) and NO auth/routing.

If you need something in the other session's area, drop a note here.
