# Architecture

## Tech stack

- **Next.js 16.2.6** App Router
- **React 19.2.4**
- **Supabase SSR** (`@supabase/ssr ^0.10.3`, `@supabase/supabase-js ^2.105.4`) — auth + database
- **Tailwind 4**
- **Vitest 4** — unit and integration tests
- `src/proxy.ts` is the active Next.js 16 middleware entry point — `middleware.ts` is deprecated in this version

## Multi-tenant structure

Barn slug is the org boundary. All barn-scoped routes live under `/barn/[slug]`. Every domain table carries `barn_id` as a FK to `barns(id)`. Composite FK constraints (`barn_id, id`) on junction tables (`lesson_horses`, `lesson_riders`) enforce cross-barn integrity at the DB level — a horse or rider must belong to the same barn as the lesson.

## Role system

Three roles: `manager`, `trainer`, `rider`.

**Glossary:** a **boarder** is a rider who boards their horse at the stable.

### Permissions matrix

| Table | manager | trainer | rider |
|---|---|---|---|
| barns | SELECT, UPDATE (own barn) | SELECT | SELECT |
| barn_memberships | SELECT own + barn; INSERT/UPDATE/DELETE own; UPDATE `can_instruct` for barn members; DELETE any non-manager in barn (#969 — a manager can no longer delete another manager's row, or their own, even via a direct call; manager removal requires direct DB access) | SELECT/INSERT/UPDATE/DELETE own | SELECT/INSERT/UPDATE/DELETE own — plus (#779) any active barn member can read barn-wide member summaries (`id`/`user_id`/`profile_id`/`role`/`can_instruct`/`created_at`, never `invite_token`) via the `get_active_barn_member_summaries` RPC |
| horses | SELECT, INSERT, UPDATE, DELETE | SELECT | SELECT |
| lessons | SELECT, INSERT, UPDATE, DELETE | SELECT, INSERT, UPDATE own (any column; instructor_id locked by RLS) | SELECT (enrolled only), INSERT |
| lesson_horses | SELECT, INSERT, UPDATE, DELETE | SELECT, INSERT, UPDATE, DELETE own | SELECT (enrolled only), INSERT |
| lesson_riders | SELECT, INSERT, UPDATE, DELETE | SELECT, INSERT, UPDATE, DELETE own | SELECT (enrolled only), INSERT |
| lesson_tiers | SELECT, INSERT, UPDATE, DELETE (barn-scoped) | SELECT (barn-scoped) | — |
| lesson_series | SELECT, INSERT, UPDATE, DELETE (barn-scoped) | SELECT, INSERT, UPDATE own (`instructor_id` locked to caller's own membership) | — |
| profiles | SELECT own + barn members; UPDATE own + any barn member's managed/stub profile only (contact fields and photo only); INSERT own | SELECT own + barn members | SELECT own + barn members; INSERT/UPDATE own |
| notifications | SELECT/UPDATE/DELETE own; INSERT any authenticated (cross-user UPDATE/INSERT also reachable via `create_or_update_notification` RPC, gated on active membership in the target barn; cross-user SELECT of the `instructor_lesson_nearby` title only, also gated on active barn membership, via `get_unread_notification_title`, #1017) | SELECT/UPDATE/DELETE own; INSERT any authenticated (see manager column) | SELECT/UPDATE/DELETE own; INSERT any authenticated (see manager column) |
| horse_documents | SELECT, INSERT, UPDATE, DELETE | SELECT, INSERT (barn-scoped) | — |
| staff_documents | SELECT, INSERT, UPDATE, DELETE | SELECT, INSERT, DELETE own rows only | — |
| rider_documents | SELECT, INSERT, UPDATE, DELETE | — | SELECT own rows only |
| agreements | SELECT, INSERT, UPDATE, DELETE (barn-scoped, both kinds) | — | SELECT own rows only (both kinds) |
| agreement_charges | SELECT, INSERT, UPDATE, DELETE (barn-scoped, both kinds) | — | SELECT own rows only (via parent agreement, both kinds) |
| horse_expenses | SELECT, INSERT, UPDATE, DELETE (barn-scoped) | — | — |
| expense_horses | SELECT, INSERT, UPDATE, DELETE (barn-scoped) | — | — |
| transactions | SELECT (barn-scoped); no INSERT/UPDATE/DELETE grant to `authenticated` — writes only via `SECURITY DEFINER` RPCs (`sync_lesson_transactions`/`collect_lesson_payment`/`delete_lesson_with_transactions`, #827) | — | — |
| member_horse_privileges | SELECT, INSERT, UPDATE, DELETE (barn-scoped) | — | — (no direct read/write grant — a privileged rider's access is exercised only through the `auth_get_horse_document_privilege`/`auth_has_horse_lesson_read_privilege` helper functions and the policies they back on `horse_documents`/`lessons`/`lesson_horses`/`lesson_riders`, #997) |
| barn_events | SELECT, INSERT, UPDATE, DELETE (barn-scoped) | SELECT (role-filtered via `visible_to_roles`) | SELECT (role-filtered via `visible_to_roles`) |

## DB schema

All tables are in the `public` schema with RLS enabled. Full column definitions, constraints, and per-table notes: [`docs/architecture/schema.md`](docs/architecture/schema.md).

Tables: `roles`, `barns`, `barn_memberships`, `horses`, `lessons`, `lesson_tiers`, `lesson_series`, `lesson_horses`, `lesson_riders`, `profiles`, `notifications`, `horse_documents`, `staff_documents`, `rider_documents`, `agreements`, `agreement_charges`, `horse_expenses`, `expense_horses`, `transactions`, `member_horse_privileges`, `barn_events`

## RLS conventions

`auth_is_barn_manager(p_barn_id uuid)` is a `SECURITY DEFINER` SQL function that bypasses RLS when checking manager status. This breaks the infinite recursion that occurs when a `barn_memberships` policy queries `barn_memberships`. Any policy that must check whether the calling user is a manager uses this helper.

`auth_is_any_barn_manager()` is a `SECURITY DEFINER` SQL function that returns `true` if the calling user is an active manager of any barn. Used by the `profiles_manager_insert_managed` and `barn_memberships_manager_insert_managed` policies to allow managers to create managed-member stubs without service-role access.

`auth_get_profile_immutable_fields(p_id uuid)` is a `SECURITY DEFINER` SQL function that returns a single `profiles` row's non-editable fields (`user_id`, `email`, `first_name`, `last_name`, `created_at`). Used by the `profiles_manager_update` WITH CHECK to verify that a manager update does not change any immutable column. The SECURITY DEFINER is required because a plain `SELECT FROM profiles` inside a `profiles` WITH CHECK clause causes infinite recursion; this function bypasses RLS when fetching the pre-update row, breaking the cycle.

`auth_is_enrolled_rider(p_lesson_id uuid, p_barn_id uuid)` is a `SECURITY DEFINER` SQL function that returns `true` if the calling user has an active `barn_memberships` row enrolled (via `lesson_riders`) in the given lesson. Used by `lessons_select_rider`, `lesson_horses_select_rider`, and `lesson_riders_select_rider` to scope rider SELECT to enrolled lessons only. The SECURITY DEFINER is required because `lesson_riders_select_rider` needs to check `lesson_riders` from a policy defined on `lesson_riders` itself; a plain subquery there causes the same infinite-recursion class of bug as `auth_is_barn_manager`.

`auth_can_read_instructor_membership(p_membership_id uuid, p_barn_id uuid)` is a `SECURITY DEFINER` SQL function that returns `true` if the calling user can already see (per `lessons` SELECT policies) a lesson whose `instructor_id` is `p_membership_id`. Used as the authorization check inside `get_instructor_membership_names` (see [`docs/architecture/rpc.md`](docs/architecture/rpc.md)) — SECURITY DEFINER avoids the same barn_memberships↔lessons recursion class a plain subquery would hit. Originally backed a same-named row-level RLS policy on `barn_memberships`, but that policy granted the full row (including `invite_token`, a live `claim_managed_member` bearer credential, since `barn_memberships` has no column-level GRANT restriction for `authenticated`) and was replaced by `get_instructor_membership_names` for that reason (#739 follow-up).

`auth_is_active_barn_member(p_barn_id uuid)` is a `SECURITY DEFINER` SQL function that returns `true` if the calling user has any active `barn_memberships` row in the given barn, regardless of role. Used inside `get_active_barn_member_summaries` (see [`docs/architecture/rpc.md`](docs/architecture/rpc.md)) rather than a new row-level SELECT policy on `barn_memberships` — a broad policy would satisfy #779's "any active member can browse the roster" requirement but would also expose `invite_token` on every row it authorizes, since `barn_memberships` has no column-level GRANT restriction for `authenticated` (same bug class the `auth_can_read_instructor_membership`/`get_instructor_membership_names` pair above already fixed once).

`auth_can_read_barn_member_profile(p_profile_id uuid)` is a `SECURITY DEFINER` SQL function backing the `profiles_barn_members_read` policy, returning `true` if the calling user shares an active barn membership with the barn membership row(s) owning `p_profile_id`. Replaces that policy's original inline `barn_memberships` subquery (#779 follow-up), which was itself subject to `barn_memberships`' own narrow RLS (own-row/manager-full-barn/trainer-reads-riders) — so a trainer viewing a manager's profile, or a rider viewing a trainer's or manager's profile (both newly reachable via #779's broadened roster), silently got zero rows back and the name fell back to "Unknown Member". Same recursion class as `auth_is_barn_manager`.

`auth_get_horse_document_privilege(p_horse_id uuid, p_barn_id uuid)` is a `SECURITY DEFINER` SQL function that returns the calling user's `member_horse_privileges.document_privileges` value (`'none'`/`'read'`/`'write'`) for the given horse — `'none'` if the caller has no active membership in the barn or no privileges row for that horse. Backs `horse_documents_select_privilege` (`IN ('read','write')`) and `horse_documents_insert_privilege` (`= 'write'`), letting a manager-granted rider read or upload documents for a specific horse without a broader `horse_documents` grant. Same recursion-safe rationale as `auth_is_enrolled_rider` — checks the caller's own row via a `SECURITY DEFINER` join rather than a plain subquery.

`auth_has_horse_lesson_read_privilege(p_horse_id uuid, p_barn_id uuid)` is a `SECURITY DEFINER` SQL function that returns `true` if the calling user has an active `member_horse_privileges` row for the given horse with `lesson_read_privileges = true`. Backs `lesson_horses_select_horse_privilege` directly, and indirectly backs `lessons_select_horse_privilege`/`lesson_riders_select_horse_privilege` via `auth_lesson_has_privileged_horse` below (a privileged rider sees any lesson that includes their privileged horse, not just lessons they're enrolled in) — also checked inside `get_horse_projected_exhaustion` (see [`docs/architecture/rpc.md`](docs/architecture/rpc.md)) so that same rider can see their horse's projected exhaustion. One flag drives both concerns (schedule visibility and exhaustion visibility) rather than two separate columns/functions.

`auth_lesson_has_privileged_horse(p_lesson_id uuid, p_barn_id uuid)` is a `SECURITY DEFINER` SQL function that returns `true` if any of a lesson's `lesson_horses` rows is a horse the caller has `lesson_read_privileges` for (via `auth_has_horse_lesson_read_privilege`). Backs `lessons_select_horse_privilege` and `lesson_riders_select_horse_privilege`, fully encapsulating the `lessons`/`lesson_riders` → `lesson_horses` join inside one function rather than leaving an inline cross-table subquery in either policy — same recursion-safety rationale as `auth_is_enrolled_rider`, so a future `lesson_horses` policy that references `lessons`/`lesson_riders` can't reintroduce that recursion class through this path.

RLS policies always go in a **separate migration file** from schema changes.

`service_role` has `GRANT ALL ON ALL TABLES IN SCHEMA public` plus a default-privileges rule so future tables are covered automatically. Supabase normally applies this at project creation; it was made explicit in migration `20260614000000_service_role_grants.sql`, whose content now lives in the #657 squash baseline (`20260629004612_baseline_rls.sql` — the per-table `GRANT ALL ... TO service_role` statements plus its `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO service_role` rule); the original file is kept for reference at `supabase/migrations_archive/20260614000000_service_role_grants.sql`.

## Routes

Full per-route role gating and behavior notes, including the persistent nav bar: [`docs/architecture/routes.md`](docs/architecture/routes.md).

Routes: `/`, `/barns`, `/barn/[slug]`, `/barn/[slug]/lessons`, `/barn/[slug]/lessons/new`, `/barn/[slug]/lessons/[id]`, `/barn/[slug]/lessons/[id]/delete`, `/barn/[slug]/lessons/[id]/edit`, `/barn/[slug]/lessons/[id]/cancel`, `/barn/[slug]/lessons/[id]/cancel-rider/[riderId]`, `/barn/[slug]/expenses`, `/barn/[slug]/expenses/new`, `/barn/[slug]/expenses/[id]`, `/barn/[slug]/expenses/[id]/delete`, `/barn/[slug]/horses`, `/barn/[slug]/horses/[id]`, `/barn/[slug]/agreements`, `/barn/[slug]/agreements/new`, `/barn/[slug]/agreements/[id]`, `/barn/[slug]/agreements/[id]/edit`, `/barn/[slug]/members`, `/barn/[slug]/members/[membership_id]`, `/barn/[slug]/documents/new`, `/barn/[slug]/finances`, `/barn/[slug]/finances/outstanding`, `/barn/[slug]/finances/horses/[id]`, `/barn/[slug]/finances/riders/[id]`, `/barn/[slug]/finances/trainers/[id]`, `/barn/[slug]/finances/expenses/[recipient]`, `/barn/[slug]/settings`, `/barn/[slug]/settings/tiers/new`, `/barn/[slug]/settings/tiers/[id]`, `/barn/[slug]/settings/events/new`, `/barn/[slug]/settings/events/[id]`, `/barn/[slug]/settings/events/[id]/delete`, `/barn/[slug]/guide`, `/profile`, `/profile/complete`, `/login`, `/terms`, `/barn/[slug]/register`, `/privacy`, `/about`, `/changelog`, `/calendar.ics`, `/demo`, `/api/cron/reset-demo`

## Data access layer

`src/lib/db/` — one file per domain. Never query Supabase directly from components or actions; always go through these modules. Full per-module function descriptions: [`docs/architecture/dal.md`](docs/architecture/dal.md).

Modules: `auth.ts`, `transactions.ts`, `agreements.ts`, `agreement-finances.ts`, `expenses.ts`, `expense-finances.ts`, `barns.ts`, `barn-memberships.ts`, `member-names.ts`, `member-invites.ts`, `horses.ts`, `member-horse-privileges.ts`, `lessons.ts`, `lesson-participants.ts`, `lesson-series.ts`, `lesson-finance-queries.ts`, `lesson-finances.ts`, `outstanding.ts`, `schedule.ts`, `lesson-tiers.ts`, `barn-events.ts`, `calendar-feed.ts`, `profiles.ts`, `notifications.ts`, `document-storage.ts`, `documents.ts`, `document-backup.ts`, `backup.ts`, `types.ts`, `service-role.ts`

## Server actions pattern

No API routes. All mutations go through Next.js Server Actions.

- **Global actions:** `src/app/actions/` — auth (`auth.ts`), lesson submission, payment-type update, stopping a recurring series, and projected-exhaustion lookup (`lessons.ts`), whole-lesson and per-rider cancellation (`lesson-cancellation.ts`), notification mark-all-read (`notifications.ts`), expense create, delete, recipient-type lookup, and past-due-expense resolution (`expenses.ts`); `lesson-form-parsing.ts` — deliberately has no `'use server'` directive, so `parseLessonFormData` (shared parse/validate step for `submitLesson` and `updateLessonAction`, mirroring `parseExpenseFormData`) is never independently reachable as a Server Action and can't skip the `requireMembership` check its callers perform
- **Feature-scoped actions:** co-located `actions.ts` files inside route directories (`profile/`, `barn/[slug]/horses/`, `barn/[slug]/horses/[id]/`, `barn/[slug]/register/`, `barn/[slug]/settings/`, `barn/[slug]/(protected)/members/[membership_id]/`, `barn/[slug]/(protected)/agreements/`, `demo/`)

`demo/actions.ts`'s `createOrResumeDemoBarn` (#505) is app runtime's first use of a service-role client (`src/lib/db/service-role.ts`'s `createServiceClient`, previously scripts-only) rather than the usual request-scoped `createClient()` — barn creation and the fixture-identity `auth.admin.createUser` calls `seedBarn()` makes have no RLS path for a regular authenticated user, and `/demo` is reachable by unauthenticated visitors. The request-scoped client is still used for the one thing that must observe/mutate the visitor's own browser session: checking for an existing login and, if absent, `signInWithPassword` as the shared demo user.

Every `/demo` visitor authenticates as the same shared `DEMO_USER_EMAIL` account, which accumulates a manager `barn_memberships` row per live demo barn. Isolation between concurrent demo visitors is by slug secrecy (an unguessable `demo-{8 hex chars}` slug), not DB-level per-visitor scoping — a deliberate tradeoff accepted because demo barns hold only synthetic seed data, never real user data.

## Auth guard

`src/lib/auth/guard.ts` exports `requireMembership(barnSlug: string, allowedRoles: Role[]): Promise<{ user, barn, membership }>`. All server actions that enforce role-based access call this function. It redirects to `/barn/[slug]/login` only when there is no authenticated user at all; an authenticated user hitting a nonexistent barn, lacking an active membership, or holding the wrong role gets `notFound()` instead (#737 — an already-logged-in user shouldn't be bounced to a login page), eliminating the 6-line auth block that was previously duplicated across every action. A handful of actions legitimately don't fit this pattern and use a manual `getAuthenticatedUser()` check instead, documented inline with a comment at each site: `auth.ts` (sign-in/sign-out — no membership exists yet or matters), `register/actions.ts`'s `acceptInvite` (pre-membership existence check — the caller has no barn membership yet, claiming one is the whole point of the action; redirects to login-with-token rather than returning `{ error }`, since there's no form state to render an error into), `profile/actions.ts` (not barn-scoped — every user edits only their own profile), `notifications.ts`'s `markAllNotificationsReadAction` (invoked from `NotificationBell`'s dropdown while the user stays on the current page — it must fail gracefully rather than throw a hard 404/redirect at the caller mid-interaction), and `demo/actions.ts`'s `createOrResumeDemoBarn` (#505 — an unauthenticated visitor has no barn/membership yet; establishing one is the action's whole job).

## Supabase RPC

Full per-function signatures, `SECURITY DEFINER`/`INVOKER` mode, and grants: [`docs/architecture/rpc.md`](docs/architecture/rpc.md).

Functions: `assert_lesson_participant_counts`, `create_lesson_with_participants`, `create_lesson_series_with_participants`, `set_default_tier`, `update_horse_details`, `update_horse_photo`, `update_lesson_with_participants`, `create_managed_member`, `claim_managed_member`, `set_can_instruct`, `set_instructor_cut`, `cancel_rider_participation`, `teardown_dev_barn_lessons`, `teardown_all_lesson_data`, `get_horse_exertion_summary`, `get_horse_projected_exhaustion`, `get_lesson_horse_exertion_levels`, `get_instructor_membership_names`, `get_lesson_payment_info`, `get_active_barn_member_summaries`, `create_agreement_with_first_charge`, `generate_agreement_charge`, `mark_agreement_charge_paid`, `update_agreement_charge_fee`, `generate_lesson_for_series`, `sync_lesson_transactions`, `collect_lesson_payment`, `delete_lesson_with_transactions`, `delete_expense_with_transactions`, `sync_rider_cancellation_fee`, `cancel_lesson_with_transactions`, `get_outstanding_transactions`, `collect_rider_cancellation_fee`, `sync_expense_transaction`, `create_expense_with_horses`, `update_expense_with_horses`, `create_or_update_notification`, `revoke_horse_privilege`, `get_calendar_feed`, `get_unread_notification_title`

## Feature anatomy

Canonical file-touch sequence for any new feature:

1. Schema migration (`supabase/migrations/`)
2. RLS migration (separate file in `supabase/migrations/`)
3. `src/lib/db/<domain>.ts` — data access function(s)
4. Action (`src/app/actions/` or co-located `actions.ts`)
5. Component / page
6. Tests (written first — TDD)

## Coverage + null safety

CI enforces 100% branch coverage via `scripts/check-coverage.sh`. Handle all branches during implementation; do not leave gaps for the coverage script to catch. Null-check at all runtime boundaries (user input, Supabase responses, external API results).
