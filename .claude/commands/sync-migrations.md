Check Supabase migration status, rename pending migrations to the current timestamp, and push them to the linked remote project.

## Steps

1. Run `npx supabase migration list` and capture the output.

2. Parse the output to identify:
   - Migrations that exist **remotely but not locally** (remote-only)
   - Migrations that exist **locally but not remotely** (pending)

3. If there are any **remote-only** migrations (exist in the remote DB but have no corresponding local file), check the base branch before reporting anything — all worktrees share one dev DB, so the usual cause is that this branch is simply behind its base, not genuine drift:
   ```
   git ls-tree --name-only origin/{base} supabase/migrations/
   ```
   ({base} is the PR's base branch — `release/release-N` for a feature, `main` for a patch.)
   - **If every remote-only name is present there:** say so, and offer `git merge origin/{base}` as the fix (a merge, not a rebase, so no force-push is needed). Expect conflicts wherever both branches touched the same file — typically `ARCHITECTURE.md`, `docs/architecture/*.md`, and any shared DAL module plus its test; parallel issues usually *add* sibling functions/table rows rather than editing the same one, so resolve by keeping both sides' additions. Run the full `npx vitest run` and `npm run lint` before committing the merge, then re-run step 1 from the top — the pending migrations will now sort *before* the remote tip, so they still need step 5's rename.
   - **If any remote-only name is absent from the base branch:** that's real drift. Display them clearly as an error and **stop immediately**. Tell the user they need to reconcile before proceeding.

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

**Note:** This skill does not commit the renamed files. The git commit is made by `/reviewIssue` after sync completes, so it carries the correct `[#N]` prefix.
