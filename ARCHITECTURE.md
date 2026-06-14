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
| barn_memberships | SELECT own + barn; INSERT/UPDATE/DELETE own; UPDATE approve pending in barn; DELETE any in barn | SELECT/INSERT/UPDATE/DELETE own | SELECT/INSERT/UPDATE/DELETE own |
| horses | SELECT, INSERT, UPDATE, DELETE | SELECT | SELECT |
| riders | SELECT, INSERT | SELECT | SELECT |
| lessons | SELECT, INSERT, DELETE | SELECT, INSERT | SELECT, INSERT |
| lesson_horses | SELECT, INSERT, DELETE | SELECT, INSERT | SELECT, INSERT |
| lesson_riders | SELECT, INSERT, DELETE | SELECT, INSERT | SELECT, INSERT |
| lesson_tiers | SELECT, INSERT, UPDATE, DELETE (barn-scoped) | SELECT (barn-scoped) | — |
| profiles | SELECT own + barn members; ALL own | SELECT/ALL own | SELECT/ALL own |

## DB schema

All tables are in the `public` schema with RLS enabled.

| Table | Key columns | Notes |
|---|---|---|
| `roles` | `name TEXT PK CHECK IN ('manager','trainer','rider')` | Lookup table |
| `barns` | `id UUID PK`, `name TEXT NOT NULL`, `slug TEXT UNIQUE NOT NULL`, `created_at TIMESTAMPTZ` | |
| `seeded_accounts` | `id UUID PK`, `email TEXT UNIQUE NOT NULL`, `role TEXT→roles`, `barn_id UUID NOT NULL→barns`, `created_at TIMESTAMPTZ` | Pre-reserves a role for a Google email before first OAuth sign-in |
| `barn_memberships` | `id UUID PK`, `user_id UUID NOT NULL→auth.users`, `barn_id UUID NOT NULL→barns`, `role TEXT→roles`, `status TEXT CHECK('active','pending') DEFAULT 'pending'`, `created_at TIMESTAMPTZ`; `UNIQUE(user_id, barn_id)` | Trigger `on_auth_user_created` auto-creates an active membership from `seeded_accounts` on first sign-in |
| `horses` | `id UUID PK`, `barn_id UUID NOT NULL→barns`, `name TEXT NOT NULL`, `created_at/updated_at TIMESTAMPTZ`; `UNIQUE(barn_id, id)` | |
| `riders` | `id UUID PK`, `barn_id UUID NOT NULL→barns`, `name TEXT NOT NULL`, `user_id UUID→auth.users`, `created_at/updated_at TIMESTAMPTZ`; `UNIQUE(barn_id, id)`; unique index `(barn_id, user_id) WHERE user_id IS NOT NULL` | |
| `lessons` | `id UUID PK`, `barn_id UUID NOT NULL→barns`, `instructor_id UUID→auth.users`, `fee NUMERIC`, `lesson_at TIMESTAMPTZ NOT NULL`, `submitted_at TIMESTAMPTZ`, `lesson_type lesson_type NOT NULL DEFAULT 'normal'`, `jumping BOOLEAN NOT NULL DEFAULT false`, `payment_type payment_type_enum`, `tier_name TEXT NOT NULL DEFAULT 'Custom'`; `UNIQUE(barn_id, id)` | `lesson_type` enum: `'normal'` or `'group'`; `payment_type` enum: `'venmo'`,`'zelle'`,`'cash'`,`'check'`,`'freshbooks'`; NULL = unpaid |
| `lesson_tiers` | `id UUID PK`, `barn_id UUID NOT NULL→barns`, `name TEXT NOT NULL`, `price NUMERIC(10,2)`, `is_default BOOLEAN NOT NULL DEFAULT false`, `is_active BOOLEAN NOT NULL DEFAULT true`, `created_at TIMESTAMPTZ`; `UNIQUE(barn_id, id)` | Barn-scoped fee tiers; `is_default` marks the tier pre-selected on new lessons; `is_active=false` soft-deletes a tier |
| `lesson_horses` | `id UUID PK`, `barn_id UUID NOT NULL→barns`, `lesson_id UUID NOT NULL`, `horse_id UUID NOT NULL`, `exertion_level SMALLINT DEFAULT 3 CHECK(1–5)`; `UNIQUE(lesson_id, horse_id)`; `FK(barn_id, lesson_id)→lessons`; `FK(barn_id, horse_id)→horses` | Trigger `lesson_horses_participant_count_check` enforces per-type counts (deferred) |
| `lesson_riders` | `id UUID PK`, `barn_id UUID NOT NULL→barns`, `lesson_id UUID NOT NULL`, `rider_id UUID NOT NULL`; `UNIQUE(lesson_id, rider_id)`; `FK(barn_id, lesson_id)→lessons`; `FK(barn_id, rider_id)→riders` | `UNIQUE(lesson_id)` dropped; trigger `lesson_riders_participant_count_check` enforces normal=1 rider+1 horse, group=≥2 riders (deferred) |
| `profiles` | `user_id UUID PK→auth.users`, `first_name TEXT NOT NULL`, `last_name TEXT NOT NULL`, `created_at TIMESTAMPTZ` | User-level (not barn-scoped) |

## RLS conventions

`auth_is_barn_manager(p_barn_id uuid)` is a `SECURITY DEFINER` SQL function that bypasses RLS when checking manager status. This breaks the infinite recursion that occurs when a `barn_memberships` policy queries `barn_memberships`. Any policy that must check whether the calling user is a manager uses this helper.

RLS policies always go in a **separate migration file** from schema changes.

## Routes

All barn-scoped routes enforce access in the route handler via `getEffectiveMembership`. An absent or pending membership redirects to `/barn/[slug]/login`.

| Route | Roles | Notes |
|---|---|---|
| `/` | All | Unauthenticated users see the public landing page; authenticated users are redirected server-side using barn membership logic: single active → `/barn/[slug]`, multiple active → `/barns`, pending-only single → `/barn/[slug]/pending`, pending-only multiple → `/barns`, no memberships → `/login?no_barns=true` |
| `/barn/[slug]` | All active members | Manager sees upcoming-lessons preview (next 7 days) and full nav; trainer and rider see a role-filtered nav |
| `/barn/[slug]/lessons` | All active members | Lessons split at 7-day cutoff: recent shown immediately, older behind `OlderLessonsToggle`; manager can delete |
| `/barn/[slug]/lessons/new` | manager, trainer | |
| `/barn/[slug]/lessons/[id]` | All active members | |
| `/barn/[slug]/horses` | manager | |
| `/barn/[slug]/horses/overview` | All active members | Per-horse exertion summary over the last 7 days, sortable asc/desc |
| `/barn/[slug]/riders` | manager, trainer | Inline name editing via `updateRiderAction` |
| `/barn/[slug]/finances` | manager | Current calendar month income summary: fee-tier breakdown, income by horse, income by rider |
| `/barn/[slug]/approvals` | manager | Approving a `rider`-role membership auto-creates a `riders` row (duplicate suppressed) |
| `/barn/[slug]/register` | unauthenticated | Membership sign-up flow |

## Data access layer

`src/lib/db/` — one file per domain. Never query Supabase directly from components or actions; always go through these modules.

| File | Domain |
|---|---|
| `barns.ts` | Barn lookups |
| `barn-memberships.ts` | Membership reads and writes; cross-barn user lookup (`getBarnMembershipsForUser`) |
| `horses.ts` | Horse registry; per-horse exertion summary (`getHorseExertionSummary`) |
| `riders.ts` | Rider registry; name updates (`updateRider`) |
| `lessons.ts` | Lesson + participant queries; financial summary (`getFinancialSummary`); per-horse income breakdown (`getHorseIncomeSummary`); per-rider income breakdown (`getRiderIncomeSummary`); upcoming lessons preview (`getUpcomingLessons`) |
| `lesson-tiers.ts` | Tier CRUD: `getTiersByBarn`, `createTier`, `updateTier`, `deactivateTier`, `setDefaultTier` |
| `profiles.ts` | User profiles |
| `effective-membership.ts` | Dev-only role override (see below) |
| `types.ts` | Shared TypeScript types |

## Server actions pattern

No API routes. All mutations go through Next.js Server Actions.

- **Global actions:** `src/app/actions/` — auth (`auth.ts`), dev role switching (`dev-role.ts`), lesson submission (`lessons.ts`)
- **Feature-scoped actions:** co-located `actions.ts` files inside route directories (`barn/[slug]/approvals/`, `barn/[slug]/horses/`, `barn/[slug]/register/`, `barn/[slug]/riders/`)

## Supabase RPC

`create_lesson_with_participants(p_barn_id, p_instructor_id, p_lesson_at, p_fee, p_horse_ids[], p_exertion_levels[], p_rider_ids[], p_lesson_type, p_jumping)` — atomically inserts a lesson, its horse assignments (`lesson_horses`), and one or more riders (`lesson_riders`) in one transaction. Validates participant counts inline: normal lessons require exactly 1 horse and exactly 1 rider; group lessons require ≥ 2 riders. `p_jumping` defaults to `false`. Used by lesson submission to avoid partial writes.

`set_default_tier(p_tier_id, p_barn_id)` — atomically clears `is_default` on all barn tiers then sets `is_default=true` on the target tier in one transaction. Used by `setDefaultTier` in `lesson-tiers.ts`.

## effective-membership.ts

`src/lib/db/effective-membership.ts` — dev-only role impersonation.

- Only active when `NODE_ENV === 'development'` and the authenticated user is a manager
- Reads a `dev_role_override` cookie; overridable to `trainer` or `rider`
- Returns the overridden membership in place of the real one so the caller sees trainer/rider permissions without a separate test account
- `src/app/barn/[slug]/DevRoleSwitcher.tsx` renders a floating toolbar in `BarnLayout` (dev mode only, manager only) to set/clear the cookie

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
