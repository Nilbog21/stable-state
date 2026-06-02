Check Supabase migration status and push any pending local migrations to the linked remote project.

## Steps

1. Run `npx supabase migration list` and capture the output.

2. Parse the output to identify:
   - Migrations that exist **remotely but not locally** (remote-only)
   - Migrations that exist **locally but not remotely** (pending)

3. If there are any **remote-only** migrations (exist in the remote DB but have no corresponding local file), display them clearly as an error and **stop immediately**. Do not push anything. Tell the user they need to reconcile the remote-only migrations before proceeding.

4. If there are **no pending** local migrations, report that the remote is already up to date and exit.

5. If there are **pending** migrations, display them clearly — show the migration timestamp and name for each one.

6. Ask the user explicitly: "Push these migrations to the remote? [y/N]"

7. If the user answers `y` or `yes`, run `npx supabase db push`.
   If the user answers anything else, abort and do nothing.
