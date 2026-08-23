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
  `src/components/shell/home-headline.tsx`, `dashboard-cards.tsx`, the Sales
  section (`src/app/(app)/sales/*`, `src/components/sales/*`), sidebar/topbar,
  notifications. **Please don't touch these on main until merged.**
- **Quotas session** — building the Quotas feature (branch `feat/quotas`).

If you need something in the other session's area, drop a note here.
