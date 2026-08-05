# Dev/teardown RPCs

`teardown_dev_barn_lessons(p_barn_id uuid)` — service-role-only helper (named for its original dev-reset caller — since #505 it also serves the prod demo-barn teardown path) that deletes all `lesson_riders`, `lesson_horses`, and `lessons` rows for a barn in a single transaction, so the deferred participant-count triggers see the lesson rows gone at commit and skip enforcement.
`SECURITY DEFINER`; `EXECUTE` revoked from `PUBLIC` and granted to `service_role` only.
Called by `teardownBarnData` in `src/lib/db/service-role.ts` (relocated there from `scripts/script-utils.ts` by #505, which left a re-export behind — see `service-role.ts` in [`dal.md`](../dal.md)); `teardownBarnData`'s own callers are `/demo`'s reap-oldest-on-cap step, `/api/cron/reset-demo`'s reap loop, and `e2e/support/fixtures.ts`.

`teardown_all_lesson_data()` — dev-only helper that deletes all `lesson_riders`, `lesson_horses`, and `lessons` rows across all barns in a single transaction, satisfying the deferred participant-count triggers at commit.
`SECURITY DEFINER`; `EXECUTE` revoked from `PUBLIC` and granted to `service_role` only.
Called by `teardownAllData` in `src/lib/db/service-role.ts` (relocated there from `scripts/script-utils.ts` by #505, which left a re-export behind); its sole caller, `scripts/reset-db.ts`, imports it through that re-export.
