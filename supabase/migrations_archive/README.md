# Migration archive

These 93 files (`20260516000000`–`20260629004605`) are the pre-#657 migration
history — everything through v2.0.2 (release-2 + patches). They are kept for
history, not applied by the Supabase CLI (only `supabase/migrations/` is).

Their net effect is captured by the 3-file baseline in `supabase/migrations/`:
`20260629004610_baseline_schema.sql`, `..._baseline_functions.sql`,
`..._baseline_rls.sql`. Equivalence was verified by replaying this archive
and the baseline separately on throwaway local Postgres databases and
diffing the resulting schemas with `migra` until empty (public schema
objects, `storage.objects` policies, and the `storage.buckets` seed row all
matched).

After this baseline merges, `scripts/repair-migration-history.sh` must be
run against prod to mark these 93 versions "reverted" and the 3 baseline
versions "applied" in prod's migration-tracking table, so the CLI doesn't
try to re-run history that's already live. The shared dev DB is reconciled
separately, by wholesale schema replacement (see #659,
`scripts/replace-all-migrations.sh`).
