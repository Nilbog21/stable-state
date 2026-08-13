# Supabase

Rules that fire when you touch anything under `supabase/`. Moved verbatim out of the root
`CLAUDE.md` by #1468 — a nested `CLAUDE.md` loads from where you are editing, and both of these
trigger on a migration. Lives here rather than in `supabase/migrations/` because
`verify-migrations.yml` triggers on the unfiltered glob `paths: ['supabase/migrations/**']`, so a
markdown file there would fire a full Supabase start + `db reset` + replay on every edit to it;
nested loading walks *up*, so a new migration picks this up either way.

## Schema/RLS/RPC verification
- Migrations have no DAL-layer TDD tests of their own — they're verified by the `Verify Migrations` CI workflow (`.github/workflows/verify-migrations.yml`), which replays every migration from scratch against an ephemeral local Supabase/Postgres instance on any PR touching `supabase/migrations/**`
- Never edit an applied migration's SQL — every database change gets a new migration file. **Header comments are the sole exception:** they're inert, `Verify Migrations` replays the file identically, and the Supabase CLI tracks migrations by version rather than content hash. This is what lets `/sync-migrations` step 5 rewrite stale filename references after a rename
- Don't install Docker locally or push to `stable-state-dev` just to check a migration applies cleanly (syntax, ordering, FK/RLS/RPC errors) — let the CI gate catch that. It replays from a clean instance, so it can't catch drift between a migration's assumptions and `stable-state-dev`/prod's actual accumulated schema state (e.g. a renamed constraint) — that class of bug still needs manual dev-DB verification or a repair script (see `scripts/repair-migration-history.sh`)

## Barn Data Backup

`src/lib/db/backup.ts` (the "Download Data" spreadsheet export in Manage Barn → Data Backup) hand-maps a fixed set of tables into its own sheets — it does not introspect the schema, so a schema change to any of these tables can silently drop a new column/table from the export instead of erroring. Whenever a migration changes one of the following, also update `backup.ts`'s corresponding sheet: `horses`; `lessons`/`lesson_horses`/`lesson_riders`/`lesson_tiers`/`lesson_series`; `agreements`/`agreement_charges`; `appointments`/`appointment_horses`/`appointment_costs`; `transactions`; `barn_memberships`/`profiles`; `horse_documents`/`staff_documents`/`rider_documents`.
