Check Supabase migration status, rename pending migrations to the current timestamp, and push them to the linked remote project.

## Steps

1. Run `npx supabase migration list` and capture the output.

2. Parse the output to identify:
   - Migrations that exist **remotely but not locally** (remote-only)
   - Migrations that exist **locally but not remotely** (pending)

3. If there are any **remote-only** migrations (exist in the remote DB but have no corresponding local file), check the base branch before reporting anything — all worktrees share one dev DB, so the usual cause is that this branch is simply behind its base, not genuine drift.

   Get the base branch:
   ```
   git fetch origin && gh pr view --json baseRefName --jq .baseRefName
   ```
   If that fails with `no pull requests found for branch ...` (no PR open for this branch yet), ask the user: **"No PR found for this branch — what's the base branch?"** and use their answer. Do not fall back to a guess.

   Then list the base branch's migration files:
   ```
   git ls-tree --name-only origin/{base} supabase/migrations/
   ```
   `migration list`'s remote-only entries are bare version timestamps (`20260725005002`); `ls-tree` returns full paths (`supabase/migrations/20260725005002_add_thing.sql`). Match on the timestamp prefix.

   - **If every remote-only version is present there:** say so, then ask: **"Type 'merge' to merge `origin/{base}` into this branch, or anything else to abort:"**. On anything other than `merge`, stop. On `merge`:
     1. `git merge origin/{base}` (a merge, not a rebase, so no force-push is needed).
     2. Resolve conflicts. Expect them wherever both branches touched the same file — typically `ARCHITECTURE.md`, `docs/architecture/*.md`, and any shared DAL module plus its test; parallel issues usually *add* sibling functions/table rows rather than editing the same one, so resolve by keeping both sides' additions.
     3. Commit the merge (`git commit --no-edit`, or `git commit` with the resolved conflicts staged). Don't gate the commit on local `npx vitest run` / `bash scripts/check-coverage.sh` / `npm run lint` runs — CI runs all three on the next push, and for a conflict resolution that wait is cheaper than re-running the suite locally.
     4. Re-run step 1 from the top — the pending migrations will now sort *before* the remote tip, so they still need step 5's rename.
   - **If any remote-only version is absent from the base branch:** **stop immediately** and report the two sets separately, so the user can see how much of it a merge would have handled:
     ```
     Covered by merging origin/{base}:
       20260725005002_add_thing.sql
     Not on {base}:
       20260725005099_unknown.sql
     ```
     Don't call the second set drift outright — the shared dev DB means it has two very different causes, and only the user can say which:
     - **A sibling worktree's branch that hasn't merged to `{base}` yet.** Benign and common; nothing to repair. `git log --all --oneline -- supabase/migrations/{version}_*.sql` (after a `git fetch origin`) finds the branch that owns it. The fix is to wait for that branch to merge, then re-run this skill.
     - **Genuine drift** — no branch anywhere owns the file. This is the case `scripts/repair-migration-history.sh` addresses; note it's a runbook hardcoded to one past incident's versions, so it needs editing for the versions at hand rather than running as-is.

4. If there are **no pending** local migrations, report that the remote is already up to date and exit.

5. Rename every pending migration to a fresh timestamp, preserving relative order:
   - Get the current epoch seconds: `date +%s`
   - Sort the pending migrations by their current filename (ascending)
   - For the first migration, use epoch seconds as-is; for each subsequent one, add 1 second
   - Format each timestamp in UTC (existing migration filenames are UTC-based): `date -u -d @{epoch} +%Y%m%d%H%M%S`
   - Rename: `mv supabase/migrations/{old} supabase/migrations/{new_timestamp}_{rest_of_name}`

6. Display the planned renames clearly:
   ```
   Renaming migrations:
     20260623003217_add_function.sql → 20260625002301_add_function.sql
     20260623004100_add_index.sql    → 20260625002302_add_index.sql
   ```

7. Ask: **"Type 'sync' to push these migrations to remote, or anything else to abort:"**

8. If the user types `sync`, run `npx supabase db push`.
   Otherwise abort — do not undo the renames (the user should commit or revert manually).

**Note:** This skill does not commit the renamed files. The git commit is made by `/reviewIssue` after sync completes, so it carries the correct `[#N]` prefix. The one exception is step 3's merge commit — a merge can't be left uncommitted for `/reviewIssue` to pick up later, so this skill commits it itself.
