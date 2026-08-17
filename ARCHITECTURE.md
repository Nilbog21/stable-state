# Architecture

> Auto-loaded (via `CLAUDE.md`'s @-include) into every session — never `Read` this file explicitly; you already have it.

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
| barn_memberships | SELECT own + barn; INSERT/UPDATE/DELETE own; UPDATE `can_instruct` for barn members; DELETE any non-manager in barn (#969 — a manager can no longer delete another manager's row, or their own, even via a direct call; manager removal requires direct DB access) | SELECT own + the barn's active rider rows; INSERT/UPDATE/DELETE own | SELECT/INSERT/UPDATE/DELETE own — plus (#779) any active barn member can read barn-wide member summaries (`id`/`user_id`/`profile_id`/`role`/`can_instruct`/`created_at`, never `invite_token`) via the `get_active_barn_member_summaries` RPC |
| horses | SELECT, INSERT, UPDATE, DELETE — but `feed_notes`/`medication_notes` only through the `update_horse_notes` RPC since #1390, which admitted the manager alongside the owner when the fields moved out of `HorseManagerForm`; `update_horse_details` re-sends the stored values unchanged | SELECT | SELECT — plus (#1006) the horse's owning member (`owning_member_id`) can write just `feed_notes`/`medication_notes` for their own horse via the `update_horse_notes` RPC, same owner-write-RPC convention as `photo_path` below |
| lessons | SELECT, INSERT, UPDATE, DELETE | SELECT, INSERT, UPDATE own (any column; instructor_id locked by RLS) | SELECT (enrolled only), INSERT |
| lesson_horses | SELECT, INSERT, UPDATE, DELETE | SELECT, INSERT, UPDATE, DELETE own | SELECT (enrolled only), INSERT |
| lesson_riders | SELECT, INSERT, UPDATE, DELETE | SELECT, INSERT, UPDATE, DELETE own | SELECT (enrolled only), INSERT |
| lesson_tiers | SELECT, INSERT, UPDATE, DELETE (barn-scoped) | SELECT (barn-scoped) | — |
| lesson_series | SELECT, INSERT, UPDATE, DELETE (barn-scoped) | SELECT, INSERT, UPDATE own (`instructor_id` locked to caller's own membership) | — |
| profiles | SELECT own + barn members; UPDATE own + any barn member's managed/stub profile only (contact fields and photo only); INSERT own | SELECT own + barn members | SELECT own + barn members; INSERT/UPDATE own |
| notifications | SELECT/UPDATE/DELETE own; INSERT any authenticated (cross-user UPDATE/INSERT also reachable via `create_or_update_notification` RPC, gated on active membership in the target barn; cross-user SELECT of the `instructor_lesson_nearby` title only, also gated on active barn membership, via `get_unread_notification_title`, #1017) | SELECT/UPDATE/DELETE own; INSERT any authenticated (see manager column) | SELECT/UPDATE/DELETE own; INSERT any authenticated (see manager column) |
| horse_documents | SELECT, INSERT, UPDATE, DELETE | SELECT, INSERT (barn-scoped); plus the rider cell's owner branch, role-blind (#1547) | — except via `member_horse_privileges` (#997/#999): SELECT with a `'read'`/`'write'` grant, INSERT with `'write'`, enforced at both the table (`horse_documents_*_privilege` policies) and, since #1359, the storage layer (`rider_horse_documents_select`/`_insert` on `storage.objects`' `horses/` prefix — previously the missing storage half 500'd the horse page for exactly the riders the table grant admitted) — plus (#1547) the horse's owning member, who needs no grant at all: `auth_is_horse_owner` scores them `'write'` inside that helper, and `horse_documents_delete_ownership` (with its storage twin `rider_horse_documents_delete`) adds the DELETE a `'write'` grant alone never gets |
| staff_documents | SELECT, INSERT, UPDATE, DELETE | SELECT, INSERT, DELETE own rows only | — |
| rider_documents | SELECT, INSERT, UPDATE, DELETE | — | SELECT own rows only |
| agreements | SELECT, INSERT, UPDATE, DELETE (barn-scoped, both kinds) | — | SELECT own rows only (both kinds) |
| agreement_charges | SELECT, INSERT, UPDATE, DELETE (barn-scoped, both kinds) | — | SELECT own rows only (via parent agreement, both kinds) |
| appointments | SELECT, INSERT, UPDATE, DELETE (barn-scoped) | SELECT (barn-scoped, #1019 — so the New Lesson form's month conflict calendar can mark a horse's vet/farrier days for a trainer too, and so the dashboard's appointment card has a record to link to; #1148 renamed the table from `horse_expenses` and moved the `amount`/`payment_type` this grant used to expose off to `appointment_costs`, since RLS filters rows and not columns) | — |
| appointment_horses | SELECT, INSERT, UPDATE, DELETE (barn-scoped) | SELECT (barn-scoped, #1019 — see `appointments`) | — |
| appointment_costs | SELECT, INSERT, UPDATE, DELETE (barn-scoped) | — (#1148 — the money half of the appointment/cost split, manager-only like `transactions`; the `authenticated` table grant is intact, so a trainer's read returns zero rows rather than an error, which is what lets `expenses.ts`'s `attachCosts` stay role-blind) | — |
| transactions | SELECT (barn-scoped); no INSERT/UPDATE/DELETE grant to `authenticated` — writes only via `SECURITY DEFINER` RPCs (`sync_lesson_transactions`/`collect_lesson_payment`/`delete_lesson_with_transactions`, #827) | — | — |
| member_horse_privileges | SELECT, INSERT, UPDATE, DELETE (barn-scoped) | — | — (no direct read/write grant — a privileged rider's access is exercised only through the `auth_get_horse_document_privilege`/`auth_has_horse_lesson_read_privilege` helper functions and the policies they back on `horse_documents`/`lessons`/`lesson_horses`/`lesson_riders` (#997) and on `storage.objects`' `horses/` prefix (#1359)) |
| barn_events | SELECT, INSERT, UPDATE, DELETE (barn-scoped) | SELECT (role-filtered via `visible_to_roles`) | SELECT (role-filtered via `visible_to_roles`) |

## DB schema

All tables are in the `public` schema with RLS enabled. Full column definitions, constraints, and per-table notes: [`docs/architecture/schema.md`](docs/architecture/schema.md).

Tables: `roles`, `barns`, `barn_memberships`, `horses`, `lessons`, `lesson_tiers`, `lesson_series`, `lesson_horses`, `lesson_riders`, `profiles`, `notifications`, `horse_documents`, `staff_documents`, `rider_documents`, `agreements`, `agreement_charges`, `appointments`, `appointment_horses`, `appointment_costs`, `transactions`, `member_horse_privileges`, `barn_events`

## RLS conventions

Policy-helper functions — all `SECURITY DEFINER` SQL, each existing to break a would-be RLS recursion or to avoid over-granting through a row-level policy. Full per-helper rationale: [`docs/architecture/rls.md`](docs/architecture/rls.md).

- `auth_is_barn_manager(p_barn_id)` — manager check; required in `barn_memberships` policies, optional elsewhere
- `auth_is_barn_trainer(p_barn_id)` — trainer check; backs `barn_memberships_trainer_read_riders`
- `auth_is_any_barn_manager()` — manager of *any* barn; backs `profiles_manager_insert_managed`
- `auth_get_profile_immutable_fields(p_id)` — pre-update row for `profiles_manager_update`'s WITH CHECK; reach gated (#1158)
- `auth_is_enrolled_rider(p_lesson_id, p_barn_id)` — backs the rider SELECT policies on `lessons`/`lesson_horses`/`lesson_riders`
- `auth_can_read_instructor_membership(p_membership_id, p_barn_id)` — auth check inside `get_instructor_membership_names` (a row policy would expose `invite_token`)
- `auth_is_active_barn_member(p_barn_id)` — used inside `get_active_barn_member_summaries` (same `invite_token` reason)
- `auth_can_read_barn_member_profile(p_profile_id)` — backs `profiles_barn_members_read`
- `auth_is_horse_owner(p_horse_id, p_barn_id)` — the ownership branch inside both horse-privilege helpers below; also backs `horse_documents_delete_ownership` and `rider_horse_documents_delete` (#1547)
- `auth_get_horse_document_privilege(p_horse_id, p_barn_id)` — backs the two `horse_documents` privilege policies and their `storage.objects` counterparts (#1359)
- `auth_has_horse_lesson_read_privilege(p_horse_id, p_barn_id)` — backs `lesson_horses_select_horse_privilege` and `get_horse_projected_exhaustion`'s check
- `auth_lesson_has_privileged_horse(p_lesson_id, p_barn_id)` — backs `lessons_select_horse_privilege`/`lesson_riders_select_horse_privilege`

RLS policies always go in a **separate migration file** from schema changes. `service_role` has blanket grants on all tables and all functions, plus a default-privileges rule covering future ones of both kinds (#1546; detail in [`docs/architecture/rls.md`](docs/architecture/rls.md)).

## Routes

Full per-route role gating and behavior notes live in one file per route group under `docs/architecture/routes/`; the persistent nav bar and the group index: [`docs/architecture/routes.md`](docs/architecture/routes.md).

Routes: `/`, `/barns`, `/barn/[slug]`, `/barn/[slug]/lessons`, `/barn/[slug]/lessons/new`, `/barn/[slug]/lessons/[id]`, `/barn/[slug]/lessons/[id]/delete`, `/barn/[slug]/lessons/[id]/edit`, `/barn/[slug]/lessons/[id]/cancel`, `/barn/[slug]/lessons/[id]/cancel-rider/[riderId]`, `/barn/[slug]/expenses`, `/barn/[slug]/expenses/new`, `/barn/[slug]/expenses/[id]`, `/barn/[slug]/expenses/[id]/delete`, `/barn/[slug]/horses`, `/barn/[slug]/horses/[id]`, `/barn/[slug]/agreements`, `/barn/[slug]/agreements/new`, `/barn/[slug]/agreements/[id]`, `/barn/[slug]/agreements/[id]/edit`, `/barn/[slug]/members`, `/barn/[slug]/members/[membership_id]`, `/barn/[slug]/documents/new`, `/barn/[slug]/finances`, `/barn/[slug]/finances/outstanding`, `/barn/[slug]/finances/horses/[id]`, `/barn/[slug]/finances/riders/[id]`, `/barn/[slug]/finances/trainers/[id]`, `/barn/[slug]/finances/expenses/[recipient]`, `/barn/[slug]/settings`, `/barn/[slug]/settings/tiers/new`, `/barn/[slug]/settings/tiers/[id]`, `/barn/[slug]/settings/events/new`, `/barn/[slug]/settings/events/[id]`, `/barn/[slug]/settings/events/[id]/delete`, `/barn/[slug]/guide`, `/profile`, `/profile/complete`, `/login`, `/barn/[slug]/login`, `/terms`, `/barn/[slug]/register`, `/privacy`, `/about`, `/changelog`, `/calendar.ics`, `/auth/callback`, `/demo`, `/api/cron/reset-demo`

## Data access layer

`src/lib/db/` — one file per domain. Never query Supabase directly from components or actions; always go through these modules. Full function descriptions live in one file per module under `docs/architecture/dal/`; cross-cutting conventions and the module index: [`docs/architecture/dal.md`](docs/architecture/dal.md).

Modules: `auth.ts`, `transactions.ts`, `agreements.ts`, `agreement-finances.ts`, `expenses.ts`, `expense-finances.ts`, `barns.ts`, `barn-memberships.ts`, `member-names.ts`, `member-invites.ts`, `horses.ts`, `member-horse-privileges.ts`, `lessons.ts`, `lesson-participants.ts`, `lesson-series.ts`, `lesson-finance-queries.ts`, `lesson-finances.ts`, `outstanding.ts`, `schedule.ts`, `lesson-tiers.ts`, `barn-events.ts`, `calendar-feed.ts`, `profiles.ts`, `notifications.ts`, `document-storage.ts`, `documents.ts`, `document-backup.ts`, `backup.ts`, `types.ts`, `service-role.ts`

## Server actions pattern

No API routes. All mutations go through Next.js Server Actions.

- **Global actions:** `src/app/actions/` — auth (`auth.ts`); lesson submission, payment-type update, series stop, projected-exhaustion lookup, and the forms' month-range schedule read (`lessons.ts`, #1020); whole-lesson and per-rider cancellation (`lesson-cancellation.ts`); notification mark-all-read (`notifications.ts`); expense CRUD and recipient-type lookup (`expenses.ts`). `lesson-form-parsing.ts` deliberately has no `'use server'` directive, so the shared parse/validate step is never independently reachable as a Server Action and can't skip its callers' `requireMembership` check
- **Feature-scoped actions:** co-located `actions.ts` files inside route directories (`profile/`, `barn/[slug]/horses/`, `barn/[slug]/horses/[id]/`, `barn/[slug]/register/`, `barn/[slug]/settings/`, `barn/[slug]/(protected)/members/`, `barn/[slug]/(protected)/members/[membership_id]/`, `barn/[slug]/(protected)/agreements/`, `barn/[slug]/(protected)/documents/new/`, `demo/`)

`demo/actions.ts`'s `createOrResumeDemoBarn` (#505) is app runtime's one use of a service-role client (`src/lib/db/service-role.ts`'s `createServiceClient`) — barn creation and `seedBarn()`'s `auth.admin.createUser` calls have no RLS path for a regular user, and `/demo` is reachable unauthenticated; the request-scoped client still handles the one thing that must observe the visitor's own browser session (existing-login check, else `signInWithPassword` as the shared demo user). Every visitor authenticates as the same shared `DEMO_USER_EMAIL` account; isolation between concurrent demo visitors is by unguessable `demo-{8 hex chars}` slug secrecy, not DB-level scoping — a deliberate tradeoff, since demo barns hold only synthetic seed data.

## Auth guard

`src/lib/auth/guard.ts` exports `requireMembership(barnSlug: string, allowedRoles: Role[]): Promise<{ user, barn, membership }>`. All server actions that enforce role-based access call it. It redirects to `/barn/[slug]/login` only when there is no authenticated user at all; an authenticated user hitting a nonexistent barn, lacking an active membership, or holding the wrong role gets `notFound()` instead (#737). The handful of actions that legitimately don't fit (sign-in/out, `register/actions.ts`'s `acceptInvite`, `profile/actions.ts`, `notifications.ts`'s `markAllNotificationsReadAction`, `demo/actions.ts`'s `createOrResumeDemoBarn`) each use a manual `getAuthenticatedUser()` check instead, documented inline with a comment at each site.

## Supabase RPC

Full per-function signatures, `SECURITY DEFINER`/`INVOKER` mode, and grants live in one file per domain under `docs/architecture/rpc/`; the domain index: [`docs/architecture/rpc.md`](docs/architecture/rpc.md).

Functions: `assert_lesson_participant_counts`, `create_lesson_with_participants`, `create_lesson_series_with_participants`, `set_default_tier`, `update_horse_details`, `update_horse_photo`, `update_horse_notes`, `update_lesson_with_participants`, `update_lesson_rider_notes`, `create_managed_member`, `claim_managed_member`, `set_can_instruct`, `set_instructor_cut`, `cancel_rider_participation`, `teardown_dev_barn_lessons`, `teardown_all_lesson_data`, `get_horse_exertion_summary`, `get_horse_projected_exhaustion`, `get_lesson_horse_exertion_levels`, `get_lesson_horse_exertion_levels_batch`, `get_lesson_rider_notes`, `get_instructor_membership_names`, `get_lesson_payment_info`, `get_active_barn_member_summaries`, `create_agreement_with_first_charge`, `generate_agreement_charge`, `mark_agreement_charge_paid`, `update_agreement_charge_fee`, `generate_lesson_for_series`, `sync_lesson_transactions`, `collect_lesson_payment`, `delete_lesson_with_transactions`, `delete_expense_with_transactions`, `sync_rider_cancellation_fee`, `cancel_lesson_with_transactions`, `get_outstanding_transactions`, `collect_rider_cancellation_fee`, `sync_expense_transaction`, `create_expense_with_horses`, `update_expense_with_horses`, `create_or_update_notification`, `revoke_horse_privilege`, `set_horse_owner`, `get_calendar_feed`, `get_unread_notification_title`

## Feature anatomy

Canonical file-touch sequence for any new feature:

1. Schema migration (`supabase/migrations/`)
2. RLS migration (separate file in `supabase/migrations/`)
3. RPC migration, if the feature needs one (separate file again — no migration in this repo both creates a table and defines a function)
4. `src/lib/db/<domain>.ts` — data access function(s)
5. Action (`src/app/actions/` or co-located `actions.ts`)
6. Component / page
7. Tests (written first — TDD)

## Timezone convention

**Times are barn times.** A lesson at 4:00 PM is 4:00 PM *at the barn* — for everyone, on every device, in every direction (#1222). Two frames:

- **A real instant is barn-local.** A rendered or compared `TIMESTAMPTZ` travels as an `Instant` (`{ at, tz }`, `src/lib/db/types.ts`), minted only by the DAL, so `format-date.ts`'s `formatBarnDateTime`/`formatBarnDate`/`formatBarnTime` take no timezone argument and cannot be called wrong. Today comes from `barn-timezone.ts`'s `barnToday()` server-side, passed as a required prop; date/hour entry anchors through `wallClockToInstant()`.
- **A calendar date is zoneless.** `DATE` columns and the "YYYY-MM-DD" strings the calendar views do arithmetic on are branded `CalendarDate` (#1223); `local-day.ts` holds the arithmetic, `formatShortDate`/`formatShortDateOnly`/`formatChargePeriod` render UTC-forced, and an instant no longer typechecks into any of it.

**The host's zone is fenced off** by an `eslint.config.mjs` rule banning the host-zone date APIs outside the date modules; `scripts/ci.sh` runs it with `--max-warnings 0`, which is what proves the conversion stayed complete. `/calendar.ics` is the one deliberate exception (UTC output — the subscriber's calendar client converts).

Full detail — the fence's exact API list and carve-outs, every call site, why each stayed or moved — lives in the `barns.timezone` and `lessons.lesson_at` rows of [`docs/architecture/schema.md`](docs/architecture/schema.md); the mint rules are in [`docs/architecture/dal.md`](docs/architecture/dal.md).

## Coverage + null safety

CI enforces 100% branch coverage via `scripts/check-coverage.sh`. Handle all branches during implementation; do not leave gaps for the coverage script to catch. Null-check at all runtime boundaries (user input, Supabase responses, external API results).

## Workflow skills

`.claude/commands/*.md` — the Claude Code skills this project's development process runs on, each invoked as a slash command named after its filename. Tracked in-repo so a convention change and the skill text encoding it land in the same reviewed PR; editing rules in `.claude/commands/CLAUDE.md`, developer-setup assumptions (shell, `gh`, worktree layout, ports, `.env.local`) in `README.md`.

Main sequence, one issue from selection to merge (`/continueIssue {N}` routes an in-flight issue to the right next step):

1. `/issueBatch create|pick|prune|defer` — maintain `specs/batch_{release-label}.md` and pick next work; its `note:`/`## Insights` prose is the file's real payload, and every skill that writes the file preserves it
2. `/beginIssue {N}` — assign, branch, plan-mode design review, TDD implementation, draft PR
3. `/reviewIssue {N}` — automated code review; substantial findings return to `/beginIssue`'s revise mode
4. `/testIssue {N}` — sync migrations, run the app, walk the acceptance criteria, mark the PR ready
5. `/finishIssue {N}` — merge the PR, delete the branch, close the issue

Adjuncts: `/grillMe` (the only path from a finding to a filed issue), `/backlogReview`, `/estimateRelease`, `/sync-migrations`, `/runChecklist` (drive one `PRE_RELEASE_TEST_CHECKLIST.md` pass section by section — the `(e2e:)` lines from one suite run, the rest prompted one at a time, recorded in gitignored `specs/checklist-run-{date}.md`), `/fableFleet` (run the main sequence headlessly across `fable-N` worktrees; a plan naming anything the acceptance criteria didn't escalates, and a PR adding a `(manual)` checklist line parks for human verification — #1293/#1294), `/overnightRefactor` + `/overnightRefactorWrapup` (unattended nightly structure-only refactor loop — plan/implement/review in three fresh contexts, one commit per kept iteration, `e2e/**` iterations gated on `select-specs.sh`'s selection; the wrapup files one issue per commit and merges the night's single PR — #1511), `/releaseCeremony` (walk `RELEASE_CEREMONY.md` in order off its `(auto)`/`(prompt)`/`(manual)` tags, resuming from `specs/release-ceremony-{N}.md` — #1542).

Shared rule owners: `scripts/workflow-context.sh` (#1118 — worktree→port map, label→base-branch rule) and `scripts/select-specs.sh` (#1213 — which e2e specs a diff can break, via each spec's `// covers:` globs). Contracts for both: [`docs/scripts.md`](docs/scripts.md); `scripts/ci.sh` runs `select-specs.sh --lint`, which makes the declarations binding on fleet workers.

`specs/` is per-developer scratch, gitignored and never committed — `issue-{N}.md` work logs and the batch file carry state between skills within one developer's session chain; not shared state across developers.
