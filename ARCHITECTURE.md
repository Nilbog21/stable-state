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
| riders | SELECT, INSERT, UPDATE | SELECT | SELECT |
| lessons | SELECT, INSERT, UPDATE, DELETE | SELECT, INSERT, UPDATE own (any column; instructor_id locked by RLS) | SELECT, INSERT |
| lesson_horses | SELECT, INSERT, UPDATE, DELETE | SELECT, INSERT | SELECT, INSERT |
| lesson_riders | SELECT, INSERT, UPDATE, DELETE | SELECT, INSERT | SELECT, INSERT |
| lesson_tiers | SELECT, INSERT, UPDATE, DELETE (barn-scoped) | SELECT (barn-scoped) | — |
| profiles | SELECT own + barn members; UPDATE own + any barn member (contact fields only); INSERT own | SELECT own + barn members | SELECT own + barn members; INSERT/UPDATE own |
| notifications | SELECT/UPDATE own; INSERT any authenticated | SELECT/UPDATE own; INSERT any authenticated | SELECT/UPDATE own; INSERT any authenticated |

## DB schema

All tables are in the `public` schema with RLS enabled.

| Table | Key columns | Notes |
|---|---|---|
| `roles` | `name TEXT PK CHECK IN ('manager','trainer','rider')` | Lookup table |
| `barns` | `id UUID PK`, `name TEXT NOT NULL`, `slug TEXT UNIQUE NOT NULL`, `created_at TIMESTAMPTZ` | |
| `barn_memberships` | `id UUID PK`, `user_id UUID NOT NULL→auth.users`, `barn_id UUID NOT NULL→barns`, `role TEXT→roles`, `status TEXT CHECK('active','pending') DEFAULT 'pending'`, `can_instruct BOOLEAN NOT NULL DEFAULT false`, `created_at TIMESTAMPTZ`; `UNIQUE(user_id, barn_id)` | Trigger `on_auth_user_created` matches on `profiles.email`, sets `profiles.user_id`, and creates an active membership from `profiles.barn_id + profiles.role` on first sign-in; `can_instruct` is set to `true` automatically for trainers |
| `horses` | `id UUID PK`, `barn_id UUID NOT NULL→barns`, `name TEXT NOT NULL`, `created_at/updated_at TIMESTAMPTZ`; `UNIQUE(barn_id, id)` | |
| `riders` | `id UUID PK`, `barn_id UUID NOT NULL→barns`, `name TEXT NOT NULL`, `user_id UUID→auth.users`, `is_active BOOLEAN NOT NULL DEFAULT true`, `created_at/updated_at TIMESTAMPTZ`; `UNIQUE(barn_id, id)`; unique index `(barn_id, user_id) WHERE user_id IS NOT NULL` | `is_active=false` soft-deletes a rider; management queries filter to active only; lesson history queries do not filter |
| `lessons` | `id UUID PK`, `barn_id UUID NOT NULL→barns`, `instructor_id UUID→auth.users`, `fee NUMERIC`, `lesson_at TIMESTAMPTZ NOT NULL`, `submitted_at TIMESTAMPTZ`, `lesson_type lesson_type NOT NULL DEFAULT 'normal'`, `jumping BOOLEAN NOT NULL DEFAULT false`, `payment_type payment_type_enum`, `tier_name TEXT NOT NULL DEFAULT 'Custom'`; `UNIQUE(barn_id, id)` | `lesson_type` enum: `'normal'` or `'group'`; `payment_type` enum: `'venmo'`,`'zelle'`,`'cash'`,`'check'`,`'freshbooks'`; NULL = unpaid |
| `lesson_tiers` | `id UUID PK`, `barn_id UUID NOT NULL→barns`, `name TEXT NOT NULL`, `price NUMERIC(10,2)`, `is_default BOOLEAN NOT NULL DEFAULT false`, `is_active BOOLEAN NOT NULL DEFAULT true`, `created_at TIMESTAMPTZ`; `UNIQUE(barn_id, id)` | Barn-scoped fee tiers; `is_default` marks the tier pre-selected on new lessons; `is_active=false` soft-deletes a tier |
| `lesson_horses` | `id UUID PK`, `barn_id UUID NOT NULL→barns`, `lesson_id UUID NOT NULL`, `horse_id UUID NOT NULL`, `exertion_level SMALLINT DEFAULT 3 CHECK(1–5)`; `UNIQUE(lesson_id, horse_id)`; `FK(barn_id, lesson_id)→lessons`; `FK(barn_id, horse_id)→horses` | Trigger `lesson_horses_participant_count_check` enforces per-type counts (deferred) |
| `lesson_riders` | `id UUID PK`, `barn_id UUID NOT NULL→barns`, `lesson_id UUID NOT NULL`, `rider_id UUID NOT NULL`; `UNIQUE(lesson_id, rider_id)`; `FK(barn_id, lesson_id)→lessons`; `FK(barn_id, rider_id)→riders` | `UNIQUE(lesson_id)` dropped; trigger `lesson_riders_participant_count_check` enforces normal=1 rider+1 horse, group=≥2 riders (deferred) |
| `profiles` | `id UUID PK`, `user_id UUID UNIQUE→auth.users` (nullable — null until first sign-in), `email TEXT UNIQUE NOT NULL`, `barn_id UUID→barns` (nullable), `role TEXT→roles` (nullable), `first_name TEXT NOT NULL`, `last_name TEXT NOT NULL`, `phone TEXT` (nullable), `emergency_contact_name TEXT` (nullable), `emergency_contact_phone TEXT` (nullable), `created_at TIMESTAMPTZ` | User-level (not barn-scoped). Pre-auth rows (user_id=null, barn_id+role set) are inserted by `seedManagerProfile` before OAuth sign-in; the trigger fills in user_id on first sign-in. Regular users have barn_id=null and role=null. |
| `notifications` | `id UUID PK`, `user_id UUID NOT NULL→auth.users`, `barn_id UUID NOT NULL→barns`, `type TEXT NOT NULL`, `title TEXT NOT NULL`, `body TEXT`, `link TEXT`, `read_at TIMESTAMPTZ`, `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`; `UNIQUE(user_id, barn_id, type)` | In-app alert system. Types for release-2: `outstanding_payment`, `pending_approval`, `lesson_cancelled`, `incomplete_profile`, `member_incomplete_profile`. Upsert on `(user_id, barn_id, type)` prevents duplicates and resets `read_at = NULL` on conflict. |

## RLS conventions

`auth_is_barn_manager(p_barn_id uuid)` is a `SECURITY DEFINER` SQL function that bypasses RLS when checking manager status. This breaks the infinite recursion that occurs when a `barn_memberships` policy queries `barn_memberships`. Any policy that must check whether the calling user is a manager uses this helper.

`auth_get_profile_immutable_fields(p_id uuid)` is a `SECURITY DEFINER` SQL function that returns a single `profiles` row's non-editable fields (`user_id`, `email`, `barn_id`, `role`, `first_name`, `last_name`, `created_at`). Used by the `profiles_manager_update` WITH CHECK to verify that a manager update does not change any immutable column. The SECURITY DEFINER is required because a plain `SELECT FROM profiles` inside a `profiles` WITH CHECK clause causes infinite recursion; this function bypasses RLS when fetching the pre-update row, breaking the cycle.

RLS policies always go in a **separate migration file** from schema changes.

`service_role` has `GRANT ALL ON ALL TABLES IN SCHEMA public` plus a default-privileges rule so future tables are covered automatically. Supabase normally applies this at project creation; it was made explicit in migration `20260614000000_service_role_grants.sql`.

## Routes

Protected barn routes (dashboard, lessons, horses, riders, finances, settings) live in a `(protected)` route group under `src/app/barn/[slug]/(protected)/`. The group layout (`layout.tsx`) centralises auth: absent or pending membership redirects to `/barn/[slug]/login`. Public routes (login, pending, register) stay outside the group and are unaffected.

The `(protected)` layout renders a persistent role-aware nav bar above `{children}` on every barn page. The barn name is rendered as a home link (visually distinct, `font-semibold`) before the section links:
- manager: {Barn Name} (home), Lessons, Horses, Riders, Finances, Manage Barn — 5 section links
- trainer: {Barn Name} (home), Lessons, Horses, Riders — 3 section links
- rider: {Barn Name} (home), Lessons, Horses — 2 section links

A `UserMenu` Client Component sits on the right side of the nav bar. It shows the user's initials (first letter of `first_name` + first letter of `last_name` from `profiles`; falls back to first character of email, then `?`). Clicking it opens a dropdown with: full name + email (non-clickable header), a "Profile" link to `/profile`, a "Switch Barn" link to `/barns` (only when the user has >1 active barn membership), and a Sign Out button. The dropdown closes on outside click or touch.

"Horses" → `/barn/[slug]/horses` (all roles)
"Manage Barn" → `/barn/[slug]/settings` (manager only)

| Route | Roles | Notes |
|---|---|---|
| `/` | All | Unauthenticated users are redirected to `/login`; authenticated users are redirected server-side using barn membership logic: single active → `/barn/[slug]`, multiple active → `/barns`, pending-only single → `/barn/[slug]/pending`, pending-only multiple → `/barns`, no memberships → `/login?no_barns=true` |
| `/barns` | Authenticated users | Barn selector: one card per membership; active shows role + link to `/barn/[slug]`; pending shows badge + link to `/barn/[slug]/pending`; no memberships redirects to `/login?no_barns=true` |
| `/barn/[slug]` | All active members | All roles see upcoming-lessons preview (next 7 days; manager/trainer filtered by `instructor_id`, rider by enrollment); manager also sees pending-requests badge (links to `/settings`; hidden when zero); nav links rendered by layout |
| `/barn/[slug]/lessons` | All active members | Lessons split at 7-day cutoff: recent shown immediately, older behind `OlderLessonsToggle`; manager can delete |
| `/barn/[slug]/lessons/new` | manager, trainer | |
| `/barn/[slug]/lessons/[id]` | All active members | Edit link visible to managers |
| `/barn/[slug]/lessons/[id]/edit` | manager | Pre-filled edit form; group→normal downgrade shows warning and requires manager to select one rider/horse to keep; updates are atomic via `update_lesson_with_participants` RPC |
| `/barn/[slug]/horses` | All active members | Per-horse exertion summary over the last 7 days; columns (Horse, Total Exertion, # Jumping, Lessons) are clickable headers that sort client-side; active header shows ↑/↓; default sort: Total Exertion descending; manager sees Add Horse form at top and inline rename + Save per row |
| `/barn/[slug]/riders` | manager, trainer | Inline name editing via `updateRiderAction` |
| `/barn/[slug]/finances` | manager | **Outstanding** section (all-time past unpaid lessons with non-zero fee — inline payment-type dropdown via `OutstandingTable` Client Component) appears above the month selector and is hidden entirely when there are no outstanding lessons. Below it: `←`/`→` month navigation; `?month=YYYY-MM` selects month (defaults to current, clamped to barn creation date); **Collected income** (`payment_type IS NOT NULL`), **Pending income** (future unpaid lessons with fee); pill-style tab switcher (`?tab=tier\|horse\|rider\|trainer`, defaults to `tier`) with four views: **By Tier** (tier name, price or `—` for Custom, lesson count, subtotal), **By Horse** (horse name, collected income), **By Rider** (rider name, collected income), **By Trainer** (trainer full name, collected income) |
| `/barn/[slug]/settings` | manager | **Manage Barn** page: Invite Link, Pending Requests (approve/reject; approving `rider` auto-creates a `riders` row, duplicate suppressed), Active Members (remove), Tier CRUD |
| `/profile` | Authenticated | Edit form for first name, last name, phone, emergency contact name, emergency contact phone; name changes prompt user to notify their barn manager; linked from avatar dropdown |
| `/profile/complete` | Authenticated | Same form with "Complete your profile" heading; post-login destination when any contact field (phone, emergency_contact_name, emergency_contact_phone) is null; redirects to `/` after save |
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
| `lessons.ts` | Lesson CRUD: `createLesson`, `getLessonsByBarn`, `getLessonById`, `deleteLesson`, `updateLesson`, `getUpcomingLessons(barnId, from, to, userId, role)` — manager/trainer: filters by `instructor_id`; rider: resolves via `riders → lesson_riders → lessons` |
| `lesson-participants.ts` | Participant management: `createLessonWithParticipants`, `updateLessonWithParticipants`, `addHorseToLesson`, `addRiderToLesson` |
| `lesson-finances.ts` | Financial reporting: `getFinancialSummary` (returns `collectedIncome`, `pendingIncome`, `breakdown` grouped by `tier_name` with `{ tierName, price, lessonCount, subtotal }[]`); `getOutstandingLessons` (returns `OutstandingLesson[]` with past unpaid lessons, fee ≠ 0); `getHorseIncomeSummary` (collected-only); `getRiderIncomeSummary` (collected-only); `getTrainerIncomeSummary` (collected lessons grouped by instructor with full name from profiles) |
| `lesson-tiers.ts` | Tier CRUD: `getTiersByBarn`, `createTier`, `updateTier`, `deactivateTier`, `setDefaultTier`, `getAllTiersByBarn` (incl. inactive), `getTierById` |
| `profiles.ts` | User profiles; `upsertProfile` (called at registration); `seedManagerProfile` (inserts pre-auth row before first OAuth sign-in); `getProfileByUserId` (single-user lookup by auth user ID); `updateProfile` (updates all five editable fields: first_name, last_name, phone, emergency_contact_name, emergency_contact_phone); `updateContactInfo` (updates phone/emergency contact fields; RLS enforces own-row for users, any barn member for managers) |
| `notifications.ts` | Notification CRUD: `createNotification` (upserts on `user_id,barn_id,type`; resets `read_at` on conflict); `markNotificationRead` (sets `read_at = now()` by id); `markAllNotificationsRead` (sets `read_at = now()` for all unread for a user in a barn) |
| `types.ts` | Shared TypeScript types |

## Server actions pattern

No API routes. All mutations go through Next.js Server Actions.

- **Global actions:** `src/app/actions/` — auth (`auth.ts`), lesson submission and payment-type update (`lessons.ts`), notification create and mark-read (`notifications.ts`)
- **Feature-scoped actions:** co-located `actions.ts` files inside route directories (`profile/`, `barn/[slug]/horses/`, `barn/[slug]/register/`, `barn/[slug]/riders/`, `barn/[slug]/settings/`, `barn/[slug]/(protected)/approvals/`)

## Auth guard

`src/lib/auth/guard.ts` exports `requireMembership(barnSlug: string, allowedRoles: Role[]): Promise<{ user, barn, membership }>`. All server actions that enforce role-based access call this function. It redirects to `/barn/[slug]/login` on any auth or role failure, eliminating the 6-line auth block that was previously duplicated across every action. `register/actions.ts` does not use it — its guard is a different pattern (membership existence check, not role authorization).

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
