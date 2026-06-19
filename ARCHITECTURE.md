# Architecture

## Tech stack

- **Next.js 16.2.6** App Router
- **React 19.2.4**
- **Supabase SSR** (`@supabase/ssr ^0.10.3`, `@supabase/supabase-js ^2.105.4`) — auth + database
- **Tailwind 4**
- **Vitest 4** — unit and integration tests

## Multi-tenant structure

Barn slug is the org boundary. All barn-scoped routes live under `/barn/[slug]`. Every domain table carries `barn_id` as a FK to `barns(id)`. Composite FK constraints (`barn_id, id`) on junction tables (`lesson_horses`, `lesson_riders`) enforce cross-barn integrity at the DB level — a horse or rider must belong to the same barn as the lesson.

## Role system

Three roles: `manager`, `trainer`, `rider`.

### Permissions matrix

| Table | manager | trainer | rider |
|---|---|---|---|
| barns | SELECT | SELECT | SELECT |
| barn_memberships | SELECT own + barn; INSERT/UPDATE/DELETE own; UPDATE approve pending in barn; UPDATE `can_instruct` for barn members; DELETE any in barn | SELECT/INSERT/UPDATE/DELETE own | SELECT/INSERT/UPDATE/DELETE own |
| horses | SELECT, INSERT, UPDATE, DELETE | SELECT | SELECT |
| riders | SELECT, INSERT | SELECT | SELECT |
| lessons | SELECT, INSERT, UPDATE, DELETE | SELECT, INSERT, UPDATE own (any column; instructor_id locked by RLS) | SELECT, INSERT |
| lesson_horses | SELECT, INSERT, UPDATE, DELETE | SELECT, INSERT | SELECT, INSERT |
| lesson_riders | SELECT, INSERT, UPDATE, DELETE | SELECT, INSERT | SELECT, INSERT |
| lesson_tiers | SELECT, INSERT, UPDATE, DELETE (barn-scoped) | SELECT (barn-scoped) | — |
| profiles | SELECT own + barn members; ALL own | SELECT/ALL own | SELECT/ALL own |

## DB schema

All tables are in the `public` schema with RLS enabled.

| Table | Key columns | Notes |
|---|---|---|
| `roles` | `name TEXT PK CHECK IN ('manager','trainer','rider')` | Lookup table |
| `barns` | `id UUID PK`, `name TEXT NOT NULL`, `slug TEXT UNIQUE NOT NULL`, `created_at TIMESTAMPTZ` | |
| `barn_memberships` | `id UUID PK`, `user_id UUID NOT NULL→auth.users`, `barn_id UUID NOT NULL→barns`, `role TEXT→roles`, `status TEXT CHECK('active','pending') DEFAULT 'pending'`, `can_instruct BOOLEAN NOT NULL DEFAULT false`, `created_at TIMESTAMPTZ`; `UNIQUE(user_id, barn_id)` | Trigger `on_auth_user_created` matches on `profiles.email`, sets `profiles.user_id`, and creates an active membership from `profiles.barn_id + profiles.role` on first sign-in; `can_instruct` is set to `true` automatically for trainers |
| `horses` | `id UUID PK`, `barn_id UUID NOT NULL→barns`, `name TEXT NOT NULL`, `created_at/updated_at TIMESTAMPTZ`; `UNIQUE(barn_id, id)` | |
| `riders` | `id UUID PK`, `barn_id UUID NOT NULL→barns`, `name TEXT NOT NULL`, `user_id UUID→auth.users`, `created_at/updated_at TIMESTAMPTZ`; `UNIQUE(barn_id, id)`; unique index `(barn_id, user_id) WHERE user_id IS NOT NULL` | |
| `lessons` | `id UUID PK`, `barn_id UUID NOT NULL→barns`, `instructor_id UUID→auth.users`, `fee NUMERIC`, `lesson_at TIMESTAMPTZ NOT NULL`, `submitted_at TIMESTAMPTZ`, `lesson_type lesson_type NOT NULL DEFAULT 'normal'`, `jumping BOOLEAN NOT NULL DEFAULT false`, `payment_type payment_type_enum`, `tier_name TEXT NOT NULL DEFAULT 'Custom'`; `UNIQUE(barn_id, id)` | `lesson_type` enum: `'normal'` or `'group'`; `payment_type` enum: `'venmo'`,`'zelle'`,`'cash'`,`'check'`,`'freshbooks'`; NULL = unpaid |
| `lesson_tiers` | `id UUID PK`, `barn_id UUID NOT NULL→barns`, `name TEXT NOT NULL`, `price NUMERIC(10,2)`, `is_default BOOLEAN NOT NULL DEFAULT false`, `is_active BOOLEAN NOT NULL DEFAULT true`, `created_at TIMESTAMPTZ`; `UNIQUE(barn_id, id)` | Barn-scoped fee tiers; `is_default` marks the tier pre-selected on new lessons; `is_active=false` soft-deletes a tier |
| `lesson_horses` | `id UUID PK`, `barn_id UUID NOT NULL→barns`, `lesson_id UUID NOT NULL`, `horse_id UUID NOT NULL`, `exertion_level SMALLINT DEFAULT 3 CHECK(1–5)`; `UNIQUE(lesson_id, horse_id)`; `FK(barn_id, lesson_id)→lessons`; `FK(barn_id, horse_id)→horses` | Trigger `lesson_horses_participant_count_check` enforces per-type counts (deferred) |
| `lesson_riders` | `id UUID PK`, `barn_id UUID NOT NULL→barns`, `lesson_id UUID NOT NULL`, `rider_id UUID NOT NULL`; `UNIQUE(lesson_id, rider_id)`; `FK(barn_id, lesson_id)→lessons`; `FK(barn_id, rider_id)→riders` | `UNIQUE(lesson_id)` dropped; trigger `lesson_riders_participant_count_check` enforces normal=1 rider+1 horse, group=≥2 riders (deferred) |
| `profiles` | `id UUID PK`, `user_id UUID UNIQUE→auth.users` (nullable — null until first sign-in), `email TEXT UNIQUE NOT NULL`, `barn_id UUID→barns` (nullable), `role TEXT→roles` (nullable), `first_name TEXT NOT NULL`, `last_name TEXT NOT NULL`, `created_at TIMESTAMPTZ` | User-level (not barn-scoped). Pre-auth rows (user_id=null, barn_id+role set) are inserted by `seedManagerProfile` before OAuth sign-in; the trigger fills in user_id on first sign-in. Regular users have barn_id=null and role=null. |

## RLS conventions

`auth_is_barn_manager(p_barn_id uuid)` is a `SECURITY DEFINER` SQL function that bypasses RLS when checking manager status. This breaks the infinite recursion that occurs when a `barn_memberships` policy queries `barn_memberships`. Any policy that must check whether the calling user is a manager uses this helper.

RLS policies always go in a **separate migration file** from schema changes.

`service_role` has `GRANT ALL ON ALL TABLES IN SCHEMA public` plus a default-privileges rule so future tables are covered automatically. Supabase normally applies this at project creation; it was made explicit in migration `20260614000000_service_role_grants.sql`.

## Routes

Protected barn routes (dashboard, lessons, horses, riders, finances, approvals) live in a `(protected)` route group under `src/app/barn/[slug]/(protected)/`. The group layout (`layout.tsx`) centralises auth: absent or pending membership redirects to `/barn/[slug]/login`. Public routes (login, pending, register) stay outside the group and are unaffected.

The `(protected)` layout renders a persistent role-aware nav bar above `{children}` on every barn page. The barn name is rendered as a home link (visually distinct, `font-semibold`) before the section links:
- manager: {Barn Name} (home), Lessons, Horses, Riders, Finances, Manage Barn — 5 section links
- trainer: {Barn Name} (home), Lessons, Horses, Riders — 3 section links
- rider: {Barn Name} (home), Lessons, Horses — 2 section links

"Horses" → `/barn/[slug]/horses` (all roles)
"Manage Barn" → `/barn/[slug]/settings` (manager only; Approvals accessible directly at `/barn/[slug]/approvals` but not in nav — see #256)

| Route | Roles | Notes |
|---|---|---|
| `/` | All | Unauthenticated users are redirected to `/login`; authenticated users are redirected server-side using barn membership logic: single active → `/barn/[slug]`, multiple active → `/barns`, pending-only single → `/barn/[slug]/pending`, pending-only multiple → `/barns`, no memberships → `/login?no_barns=true` |
| `/barns` | Authenticated users | Barn selector: one card per membership; active shows role + link to `/barn/[slug]`; pending shows badge + link to `/barn/[slug]/pending`; no memberships redirects to `/login?no_barns=true` |
| `/barn/[slug]` | All active members | Manager sees upcoming-lessons preview (next 7 days); nav links rendered by layout |
| `/barn/[slug]/lessons` | All active members | Lessons split at 7-day cutoff: recent shown immediately, older behind `OlderLessonsToggle`; manager can delete |
| `/barn/[slug]/lessons/new` | manager, trainer | |
| `/barn/[slug]/lessons/[id]` | All active members | Edit link visible to managers |
| `/barn/[slug]/lessons/[id]/edit` | manager | Pre-filled edit form; group→normal downgrade shows warning and requires manager to select one rider/horse to keep; updates are atomic via `update_lesson_with_participants` RPC |
| `/barn/[slug]/horses` | All active members | Per-horse exertion summary over the last 7 days; columns (Horse, Total Exertion, # Jumping, Lessons) are clickable headers that sort client-side; active header shows ↑/↓; default sort: Total Exertion descending; manager sees Add Horse form at top and inline rename + Save per row |
| `/barn/[slug]/riders` | manager, trainer | Inline name editing via `updateRiderAction` |
| `/barn/[slug]/finances` | manager | **Outstanding** section (all-time past unpaid lessons with non-zero fee — inline payment-type dropdown via `OutstandingTable` Client Component) appears above the month selector and is hidden entirely when there are no outstanding lessons. Below it: `←`/`→` month navigation; `?month=YYYY-MM` selects month (defaults to current, clamped to barn creation date); **Collected income** (`payment_type IS NOT NULL`), **Pending income** (future unpaid lessons with fee); fee-tier breakdown, income by horse, income by rider |
| `/barn/[slug]/approvals` | manager | Approving a `rider`-role membership auto-creates a `riders` row (duplicate suppressed) |
| `/barn/[slug]/settings` | manager | Tier CRUD: list all tiers (active + inactive), add tier, edit name/price, set default, deactivate (blocked if default) |
| `/login` | All | Sign-in page; displays Supabase connection status dot (green = `NEXT_PUBLIC_SUPABASE_URL` set, yellow = not set); shows no-barn guidance when `?no_barns=true` and user is authenticated |
| `/barn/[slug]/register` | unauthenticated | Membership sign-up flow |

## Data access layer

`src/lib/db/` — one file per domain. Never query Supabase directly from components or actions; always go through these modules.

| File | Domain |
|---|---|
| `barns.ts` | Barn lookups |
| `barn-memberships.ts` | Membership reads and writes; cross-barn user lookup (`getBarnMembershipsForUser`) |
| `horses.ts` | Horse registry; per-horse exertion summary (`getHorseExertionSummary`) |
| `riders.ts` | Rider registry; name updates (`updateRider`) |
| `lessons.ts` | Lesson CRUD: `createLesson`, `getLessonsByBarn`, `getLessonById`, `deleteLesson`, `updateLesson`, `getUpcomingLessons` |
| `lesson-participants.ts` | Participant management: `createLessonWithParticipants`, `updateLessonWithParticipants`, `addHorseToLesson`, `addRiderToLesson` |
| `lesson-finances.ts` | Financial reporting: `getFinancialSummary` (returns `collectedIncome`, `pendingIncome`, `breakdown` grouped by `tier_name` with `{ tierName, price, lessonCount, subtotal }[]`); `getOutstandingLessons` (returns `OutstandingLesson[]` with past unpaid lessons, fee ≠ 0); `getHorseIncomeSummary` (collected-only); `getRiderIncomeSummary` (collected-only); `getTrainerIncomeSummary` (collected lessons grouped by instructor with full name from profiles) |
| `lesson-tiers.ts` | Tier CRUD: `getTiersByBarn`, `createTier`, `updateTier`, `deactivateTier`, `setDefaultTier`, `getAllTiersByBarn` (incl. inactive), `getTierById` |
| `profiles.ts` | User profiles; `upsertProfile` (called at registration); `seedManagerProfile` (inserts pre-auth row before first OAuth sign-in) |
| `types.ts` | Shared TypeScript types |

## Server actions pattern

No API routes. All mutations go through Next.js Server Actions.

- **Global actions:** `src/app/actions/` — auth (`auth.ts`), lesson submission and payment-type update (`lessons.ts`)
- **Feature-scoped actions:** co-located `actions.ts` files inside route directories (`barn/[slug]/approvals/`, `barn/[slug]/horses/`, `barn/[slug]/register/`, `barn/[slug]/riders/`)

## Supabase RPC

`create_lesson_with_participants(p_barn_id, p_instructor_id, p_lesson_at, p_fee, p_horse_ids[], p_exertion_levels[], p_rider_ids[], p_lesson_type, p_jumping, p_tier_name)` — atomically inserts a lesson, its horse assignments (`lesson_horses`), and one or more riders (`lesson_riders`) in one transaction. Validates participant counts inline: normal lessons require exactly 1 horse and exactly 1 rider; group lessons require ≥ 2 riders. `p_jumping` defaults to `false`; `p_tier_name` defaults to `'Custom'`. Used by lesson submission to avoid partial writes.

`set_default_tier(p_tier_id, p_barn_id)` — atomically clears `is_default` on all barn tiers then sets `is_default=true` on the target tier in one transaction. Used by `setDefaultTier` in `lesson-tiers.ts`.

`update_lesson_with_participants(p_lesson_id, p_barn_id, p_lesson_at, p_instructor_id, p_fee, p_lesson_type, p_jumping, p_payment_type, p_tier_name, p_horse_ids[], p_exertion_levels[], p_rider_ids[])` — atomically updates the `lessons` row and replaces `lesson_horses` + `lesson_riders` (delete then insert) in one transaction. The deferred `enforce_lesson_participant_counts` trigger sees the final state at commit. Used by the lesson edit page.

`set_can_instruct(p_membership_id uuid, p_barn_id uuid, p_value boolean)` — sets `can_instruct` on a single `barn_memberships` row. `SECURITY DEFINER`; verifies the caller is a manager of `p_barn_id` then updates only the `can_instruct` column. `EXECUTE` revoked from `PUBLIC` and granted to `authenticated`.

`teardown_dev_barn_lessons(p_barn_id uuid)` — dev-only helper that deletes all `lesson_riders`, `lesson_horses`, and `lessons` rows for a barn in a single transaction, so the deferred participant-count triggers see the lesson rows gone at commit and skip enforcement. `SECURITY DEFINER`; `EXECUTE` revoked from `PUBLIC` and granted to `service_role` only. Called exclusively by `scripts/reset-db.ts`.

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
