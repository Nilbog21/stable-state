# Tier & barn-setting RPCs

`set_default_tier(p_tier_id, p_barn_id)` — atomically clears `is_default` on all barn tiers then sets `is_default=true` on the target tier in one transaction.
`SECURITY INVOKER`; `EXECUTE` revoked from `PUBLIC` (#1535) and granted to `authenticated`.
Used by `setDefaultTier` in `lesson-tiers.ts`.

`set_instructor_cut(p_barn_id uuid, p_value numeric)` — sets `default_instructor_cut` on a single `barns` row (RPC name and TS wrapper `setInstructorCut` left as-is post-#776 — internal-only identifiers, not user-facing).
`SECURITY DEFINER`, mirroring `set_can_instruct` — though the original migration's "no broad `UPDATE` RLS policy on `barns`" rationale does not hold: `manager_update_barns` (`FOR UPDATE TO authenticated USING`/`WITH CHECK auth_is_barn_manager(id)`, carried by `20260716005944_release3_rls.sql`) is exactly such a policy and is what authorizes `barns.ts`'s direct per-setting writes, so the DEFINER mode here is redundant-but-harmless rather than load-bearing; verifies the caller is a manager of `p_barn_id` (`auth_is_barn_manager`) then updates only the `default_instructor_cut` column.
`EXECUTE` revoked from `PUBLIC` and granted to `authenticated`.
That pair was originally carried by the migration archived at `supabase/migrations_archive/20260706005857_rpc_set_instructor_cut.sql` and neither statement survived the #972 squash, leaving `20260716005943_release3_functions.sql`'s `CREATE OR REPLACE` as the only live statement touching the function — which preserved the existing ACL on the already-migrated dev/prod databases but, on a from-scratch replay (e.g. the Verify Migrations CI gate), created it with `PUBLIC` keeping `EXECUTE`.
Behaviorally harmless throughout, since the in-body manager check rejects every non-manager caller; #1158 restored the pair (`20260729185422_lock_security_definer_execute_grants.sql`), so replay and dev/prod now agree.
Used by `setInstructorCut` in `barns.ts`, called from the Manage Barn settings page.
