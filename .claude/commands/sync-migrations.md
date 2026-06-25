Check Supabase migration status, rename pending migrations to the current timestamp, and push them to the linked remote project.

## Steps

1. Run `npx supabase migration list` and capture the output.

2. Parse the output to identify:
   - Migrations that exist **remotely but not locally** (remote-only)
   - Migrations that exist **locally but not remotely** (pending)

3. If there are any **remote-only** migrations (exist in the remote DB but have no corresponding local file), display them clearly as an error and **stop immediately**. Tell the user they need to reconcile the remote-only migrations before proceeding.

4. If there are **no pending** local migrations, report that the remote is already up to date and exit.

5. Rename every pending migration to a fresh timestamp, preserving relative order:
   - Get the current epoch seconds: `date +%s`
   - Sort the pending migrations by their current filename (ascending)
   - For the first migration, use epoch seconds as-is; for each subsequent one, add 1 second
   - Format each timestamp: `date -d @{epoch} +%Y%m%d00%M%S`
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
