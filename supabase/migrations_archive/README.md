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

## Second squash (#658): release-3's own migrations

A further 90 files (`20260702002709`–`20260715043458`) are `release/release-3`'s
own migration history, added since it branched off `main` post-#657. Unlike the
squash above, these apply to prod for the first time whenever release-3 ships
normally — no prod migration-tracking reconciliation was needed for this one.

Their net effect is captured by 4 files in `supabase/migrations/`:
`20260715075708_release3_schema.sql`, `..._release3_backfills.sql`,
`..._release3_functions.sql`, `..._release3_rls.sql`. Unlike the first squash
(a from-scratch baseline with no prior data), this one is a delta on top of the
existing baseline — four one-time backfills that migrate real pre-existing rows
(kept in `..._release3_backfills.sql`) could not be flattened into fresh `CREATE
TABLE` shapes and are preserved as literal ALTER+backfill DML. Equivalence was
verified the same way as the first squash: replaying the 90 archived files (on
top of the untouched baseline) and the 4 consolidated files separately on
throwaway local Postgres databases, then diffing with `migra --with-privileges`
until empty (public schema, storage schema, and privileges/grants all matched).
