# Migration archive

> **Equivalence is now a script, not a procedure.** Each section below records a
> `migra` run someone performed by hand; #1542 replaced that with
> `bash scripts/verify-migration-equivalence.sh`, which replays both sets and diffs
> `pg_dump --schema-only` including every ACL. Use it for the next squash rather than
> reconstructing the prose — `RELEASE_CEREMONY.md`'s Wrapup 4 criteria own the exact
> invocation, including which ref to pass, so it is stated once. Its
> `--self-check` re-derives the first section's verdict below — and, run against
> #657's squash *as first pushed*, independently finds the 11 missing GRANTs that
> review caught in `bf620567`. The hand-run recorded here did not.
>
> **Read every "verified until empty" below as the hand-run's verdict, not as
> fact.** Two of the three are known wrong: #657's above, and #972's, which
> missed `set_instructor_cut`'s dropped REVOKE — #1158 restored it and #1535
> built a CI gate for it. That is the whole argument for the script.

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

That empty diff was wrong. This squash's `CREATE OR REPLACE` of
`set_instructor_cut` dropped its `REVOKE ... FROM PUBLIC`, leaving PUBLIC
EXECUTE on a `SECURITY DEFINER` function; #1158 restored it and #1535 added
`check-function-grants.sh` to catch the class in CI. The `--with-privileges`
flag was passed and the drop still went unrecorded, which is why
`verify-migration-equivalence.sh` diffs rendered schema text including ACLs
rather than trusting a flag someone has to remember.

## Fourth squash (#1629): release-4's own migrations

A further 62 files (`20260722201810`–`20260818012511`) are `release/release-4`'s own migration
history, added since it branched off `main`. Like #658's set and unlike #657's, they had never
been applied to prod — they reach it for the first time when release-4 ships — so no prod
migration-tracking reconciliation was needed. Their net effect is captured by the 4-file set in
`supabase/migrations/`: `20260818001709_release4_schema.sql`, `..._release4_backfills.sql`,
`..._release4_functions.sql`, `..._release4_rls.sql` — a delta on top of the untouched baseline
and release-3 sets, not a from-scratch snapshot.

Three of the 62 carry top-level row-migrating DML, preserved verbatim in
`..._release4_backfills.sql` alongside the ALTER each one guards: the `DELETE` of leftover
`pending` memberships before `barn_memberships_status_check` narrows to `'active'` (#1037); the
`INSERT … SELECT` that carries `amount`/`payment_type` onto `appointment_costs` before
`appointments` drops them (#1148); and the `UPDATE` that gives every ownerless horse an owner,
with its `DO $$` guard, before `owning_member_id` goes `NOT NULL` (#1549). Every other DML hit
across the 62 sits inside a `CREATE FUNCTION` body and flattened normally.

**Equivalence was proven by `bash scripts/verify-migration-equivalence.sh`, not by a hand-run
`migra`** — the first squash to use the tool the header above points at. `--self-check` passed
both polarities immediately beforehand, then the run against `origin/release/release-4`'s tip
reported the two sets identical across 5189 lines of `pg_dump --schema-only` output including
every ACL.

That is not a formality: the first draft of this squash **dropped a grant**, and the script
caught it. `get_calendar_feed`'s `REVOKE … FROM PUBLIC` / `GRANT … TO anon, authenticated` pair
lived in `20260723185601_calendar_feed_rpc.sql`, the migration that first defined the function.
A later `CREATE OR REPLACE` (`20260805022307`) superseded that body, so flattening to the final
definition dropped the file — and its grants with it, leaving the app's one anon-reachable
function (`/calendar.ics`, authorized by feed token alone) unreachable by `anon`. This is the
same failure mode as #657's 11 missing GRANTs and #972's dropped `set_instructor_cut` REVOKE,
which are the two entries above that a hand-run `migra` recorded as clean.
