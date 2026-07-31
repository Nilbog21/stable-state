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

Their net effect was originally captured by a 4-file set:
`20260716005941_release3_schema.sql`, `..._release3_backfills.sql`,
`..._release3_functions.sql`, `..._release3_rls.sql`. Unlike the first squash
(a from-scratch baseline with no prior data), this one is a delta on top of the
existing baseline — four one-time backfills that migrate real pre-existing rows
(kept in `..._release3_backfills.sql`) could not be flattened into fresh `CREATE
TABLE` shapes and are preserved as literal ALTER+backfill DML. Equivalence was
verified the same way as the first squash: replaying the 90 archived files (on
top of the untouched baseline) and the 4 consolidated files separately on
throwaway local Postgres databases, then diffing with `migra --with-privileges`
until empty (public schema, storage schema, and privileges/grants all matched).

## Third squash (#972): round 2, folding in 6 post-#658 fix migrations

The 6 files listed just below this section
(`20260716011738`-`20260716044953`) landed on `release/release-3` on top of
the #658 squash while resolving test failures found during manual QA: #941
(new `delete_expense_with_transactions` RPC), #935 (`create_expense_with_horses`/
`update_expense_with_horses` gain a `p_occurred_at` param), #936
(`get_horse_exertion_summary`'s window realigned to ±3 days), #955 (new
`barns.timezone` column), #937 (`lesson_horses`' `exertion_level` column
narrowed off the table-wide grant + new `get_lesson_horse_exertion_levels`
RPC), #969 (`barn_memberships_manager_delete` narrowed to exclude manager-role
rows). #972 folded all 6 into the #658 4-file set, superseding it outright —
the #658 files (`20260715075708-711_release3_*.sql`) were **deleted**, not
archived, since they only lived one day. The current, final release-3 4-file
set lives in `supabase/migrations/`: `20260716005941_release3_schema.sql`,
`..._release3_backfills.sql`, `..._release3_functions.sql`, `..._release3_rls.sql`.

Equivalence was verified the same way as the first two squashes: replaying
the prior full history (baseline + the #658 4 files + these 6 fix
migrations) and the new 4 consolidated files separately on throwaway local
Postgres databases (Supabase's `auth`/`storage` schemas stubbed minimally,
since only their referenced shape — `auth.users`, `auth.uid()`,
`storage.objects`, `storage.foldername()` — matters for this diff), then
diffing with `migra --with-privileges` until empty. No prod migration-tracking
reconciliation was needed — release-3 still hadn't shipped to prod at this point.
