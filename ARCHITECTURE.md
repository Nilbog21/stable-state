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
| lessons | SELECT, INSERT, UPDATE, DELETE | SELECT, INSERT, UPDATE own (any column; instructor_id locked by RLS) | SELECT, INSERT |
| lesson_horses | SELECT, INSERT, UPDATE, DELETE | SELECT, INSERT, UPDATE, DELETE own | SELECT, INSERT |
| lesson_riders | SELECT, INSERT, UPDATE, DELETE | SELECT, INSERT, UPDATE, DELETE own | SELECT, INSERT |
| lesson_tiers | SELECT, INSERT, UPDATE, DELETE (barn-scoped) | SELECT (barn-scoped) | — |
| profiles | SELECT own + barn members; UPDATE own + any barn member (contact fields only); INSERT own | SELECT own + barn members | SELECT own + barn members; INSERT/UPDATE own |
| notifications | SELECT/UPDATE own; INSERT any authenticated | SELECT/UPDATE own; INSERT any authenticated | SELECT/UPDATE own; INSERT any authenticated |
| horse_documents | SELECT, INSERT, UPDATE, DELETE | SELECT, INSERT (barn-scoped) | — |
| trainer_documents | SELECT, INSERT, UPDATE, DELETE | SELECT, INSERT, DELETE own rows only | — |
| rider_documents | SELECT, INSERT, UPDATE, DELETE | SELECT (barn-scoped) | SELECT, INSERT, DELETE own rows only |

## DB schema

All tables are in the `public` schema with RLS enabled.

| Table | Key columns | Notes |
|---|---|---|
| `roles` | `name TEXT PK CHECK IN ('manager','trainer','rider')` | Lookup table |
| `barns` | `id UUID PK`, `name TEXT NOT NULL`, `slug TEXT UNIQUE NOT NULL`, `created_at TIMESTAMPTZ` | |
| `seeded_accounts` | `id UUID PK`, `email TEXT UNIQUE NOT NULL`, `first_name TEXT NOT NULL`, `last_name TEXT NOT NULL`, `barn_id UUID NOT NULL→barns`, `role TEXT NOT NULL→roles`, `created_at TIMESTAMPTZ NOT NULL DEFAULT now()` | Staging table for manager accounts seeded before first OAuth sign-in. A row is inserted by `createSeededAccount` (via `seed-account.ts`) and deleted by `activateSeededAccount` in the auth callback on first sign-in. RLS: service_role INSERT (bypasses RLS by default); authenticated users SELECT own row and DELETE own row (`email = auth.email()`). |
| `barn_memberships` | `id UUID PK`, `user_id UUID NOT NULL→auth.users`, `barn_id UUID NOT NULL→barns`, `role TEXT→roles`, `status TEXT CHECK('active','pending') DEFAULT 'pending'`, `can_instruct BOOLEAN NOT NULL DEFAULT false`, `created_at TIMESTAMPTZ`; `UNIQUE(user_id, barn_id)`; `UNIQUE(barn_id, id)` | `can_instruct` is set to `true` for trainer role on activation. The composite `UNIQUE(barn_id, id)` is used as the FK target from `lesson_riders(barn_id, rider_id)`. |
| `horses` | `id UUID PK`, `barn_id UUID NOT NULL→barns`, `name TEXT NOT NULL`, `is_active BOOLEAN NOT NULL DEFAULT true`, `is_available BOOLEAN NOT NULL DEFAULT true`, `unavailability_reason TEXT`, `created_at/updated_at TIMESTAMPTZ`; `UNIQUE(barn_id, id)` | `is_active=false` soft-deletes a horse; `is_available=false` temporarily marks a horse out of rotation — still returned by `getHorsesByBarn`, shown as disabled in lesson forms; management queries filter to `is_active=true`; lesson history resolves horse names regardless |

| `lessons` | `id UUID PK`, `barn_id UUID NOT NULL→barns`, `instructor_id UUID→auth.users`, `fee NUMERIC`, `lesson_at TIMESTAMPTZ NOT NULL`, `submitted_at TIMESTAMPTZ`, `lesson_type lesson_type NOT NULL DEFAULT 'normal'`, `jumping BOOLEAN NOT NULL DEFAULT false`, `payment_type payment_type_enum`, `tier_name TEXT NOT NULL DEFAULT 'Custom'`; `UNIQUE(barn_id, id)` | `lesson_type` enum: `'normal'` or `'group'`; `payment_type` enum: `'venmo'`,`'zelle'`,`'cash'`,`'check'`,`'freshbooks'`; NULL = unpaid |
| `lesson_tiers` | `id UUID PK`, `barn_id UUID NOT NULL→barns`, `name TEXT NOT NULL`, `price NUMERIC(10,2)`, `is_default BOOLEAN NOT NULL DEFAULT false`, `is_active BOOLEAN NOT NULL DEFAULT true`, `default_exertion_level SMALLINT CHECK(1–5)` (nullable), `default_jumping BOOLEAN` (nullable), `created_at TIMESTAMPTZ`; `UNIQUE(barn_id, id)` | Barn-scoped fee tiers; `is_default` marks the tier pre-selected on new lessons; `is_active=false` soft-deletes a tier; `default_exertion_level`/`default_jumping` are optional defaults for the lesson form (NULL = no default) |
| `lesson_horses` | `id UUID PK`, `barn_id UUID NOT NULL→barns`, `lesson_id UUID NOT NULL`, `horse_id UUID NOT NULL`, `exertion_level SMALLINT DEFAULT 3 CHECK(1–5)`, `horse_notes TEXT`; `UNIQUE(lesson_id, horse_id)`; `FK(barn_id, lesson_id)→lessons`; `FK(barn_id, horse_id)→horses` | Trigger `lesson_horses_participant_count_check` enforces per-type counts (deferred) |
| `lesson_riders` | `id UUID PK`, `barn_id UUID NOT NULL→barns`, `lesson_id UUID NOT NULL`, `rider_id UUID NOT NULL`, `rider_notes TEXT`, `private_notes TEXT`; `UNIQUE(lesson_id, rider_id)`; `FK(barn_id, lesson_id)→lessons`; `FK(barn_id, rider_id)→barn_memberships(barn_id, id)` | `UNIQUE(lesson_id)` dropped; trigger `lesson_riders_participant_count_check` enforces normal=1 rider+1 horse, group=≥2 riders (deferred); `private_notes` visible to trainer/manager only (DAL-layer column projection) |
| `profiles` | `id UUID PK`, `user_id UUID UNIQUE→auth.users` (nullable — null until first sign-in), `email TEXT UNIQUE NOT NULL`, `first_name TEXT NOT NULL`, `last_name TEXT NOT NULL`, `phone TEXT` (nullable), `emergency_contact_name TEXT` (nullable), `emergency_contact_phone TEXT` (nullable), `created_at TIMESTAMPTZ` | User-level (not barn-scoped). Created by `upsertProfile` on first sign-in or registration. |
| `notifications` | `id UUID PK`, `user_id UUID NOT NULL→auth.users`, `barn_id UUID NOT NULL→barns`, `type TEXT NOT NULL`, `title TEXT NOT NULL`, `body TEXT`, `link TEXT`, `read_at TIMESTAMPTZ`, `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`; `UNIQUE(user_id, barn_id, type)` | In-app alert system. Types for release-2: `outstanding_payment`, `pending_approval`, `lesson_cancelled`, `incomplete_profile`, `member_incomplete_profile`. Upsert on `(user_id, barn_id, type)` prevents duplicates and resets `read_at = NULL` on conflict. |
| `horse_documents` | `id UUID PK`, `barn_id UUID NOT NULL→barns`, `horse_id UUID NOT NULL`, `record_type horse_document_type NOT NULL`, `storage_path TEXT NOT NULL`, `file_name TEXT NOT NULL`, `file_size INTEGER NOT NULL`, `notes TEXT`, `created_at/updated_at TIMESTAMPTZ`; `UNIQUE(barn_id, id)`; `FK(barn_id, horse_id)→horses` | Enum `horse_document_type`: `insurance_binder`, `coggins`, `shot_record`, `contract`, `other`. No unique constraint on `(horse_id, record_type)` — multiple records per type allowed. Storage objects at `{barn_id}/horses/{horse_id}/{filename}` in the `documents` bucket. |
| `trainer_documents` | `id UUID PK`, `barn_id UUID NOT NULL→barns`, `trainer_id UUID NOT NULL→auth.users`, `record_type trainer_document_type NOT NULL`, `storage_path TEXT NOT NULL`, `file_name TEXT NOT NULL`, `file_size INTEGER NOT NULL`, `notes TEXT`, `created_at/updated_at TIMESTAMPTZ`; `UNIQUE(barn_id, id)` | Enum `trainer_document_type`: `instructor_contract`, `other`. Storage objects at `{barn_id}/trainers/{trainer_user_id}/{filename}` in the `documents` bucket. |
| `rider_documents` | `id UUID PK`, `barn_id UUID NOT NULL→barns`, `rider_id UUID NOT NULL→auth.users`, `record_type rider_document_type NOT NULL`, `storage_path TEXT NOT NULL`, `file_name TEXT NOT NULL`, `file_size INTEGER NOT NULL`, `notes TEXT`, `created_at/updated_at TIMESTAMPTZ`; `UNIQUE(barn_id, id)` | Enum `rider_document_type`: `liability_waiver`, `lease_agreement`, `boarding_contract`, `other`. Storage objects at `{barn_id}/riders/{rider_user_id}/{filename}` in the `documents` bucket. |

## RLS conventions

`auth_is_barn_manager(p_barn_id uuid)` is a `SECURITY DEFINER` SQL function that bypasses RLS when checking manager status. This breaks the infinite recursion that occurs when a `barn_memberships` policy queries `barn_memberships`. Any policy that must check whether the calling user is a manager uses this helper.

`auth_get_profile_immutable_fields(p_id uuid)` is a `SECURITY DEFINER` SQL function that returns a single `profiles` row's non-editable fields (`user_id`, `email`, `first_name`, `last_name`, `created_at`). Used by the `profiles_manager_update` WITH CHECK to verify that a manager update does not change any immutable column. The SECURITY DEFINER is required because a plain `SELECT FROM profiles` inside a `profiles` WITH CHECK clause causes infinite recursion; this function bypasses RLS when fetching the pre-update row, breaking the cycle.

RLS policies always go in a **separate migration file** from schema changes.

`service_role` has `GRANT ALL ON ALL TABLES IN SCHEMA public` plus a default-privileges rule so future tables are covered automatically. Supabase normally applies this at project creation; it was made explicit in migration `20260614000000_service_role_grants.sql`.

## Routes

Protected barn routes (dashboard, lessons, horses, riders, finances, settings) live in a `(protected)` route group under `src/app/barn/[slug]/(protected)/`. The group layout (`layout.tsx`) centralises auth: absent or pending membership redirects to `/barn/[slug]/login`. Public routes (login, pending, register) stay outside the group and are unaffected.

The `(protected)` layout renders a persistent role-aware nav bar above `{children}` on every barn page. The barn name is rendered via a `BarnSwitcher` Client Component (`font-semibold`). For single-barn members it renders as a plain `BlockingLink` home link. For multi-barn members it renders the barn name link plus a caret button (≥ 44 px tap target) that opens a dropdown listing all active barn memberships; the current barn is marked with a checkmark, others link to their `/barn/[slug]` dashboards; the dropdown dismisses on outside click/touch or on any link click. The barn name element appears before the section links:
- manager: {Barn Name} (home), Lessons, Horses, Members, Finances, Manage Barn, Guide — 6 section links
- trainer: {Barn Name} (home), Lessons, Horses, Members, Guide — 4 section links
- rider: {Barn Name} (home), Lessons, Horses, Guide — 3 section links

A `UserMenu` Client Component and a `NotificationBell` Client Component sit on the right side of the nav bar (avatar then bell, both in a flex container). `UserMenu` shows the user's initials (first letter of `first_name` + first letter of `last_name` from `profiles`; falls back to first character of email, then `?`). Clicking it opens a dropdown with: full name + email (non-clickable header), a "Profile" link to `/profile?barn=<slug>`, a "Switch Barn" link to `/barns` (only when the user has >1 active barn membership), a "User Guide" link to `/barn/[slug]/guide`, and a Sign Out button. The dropdown closes on outside click or touch. `NotificationBell` shows a bell icon with an unread-count badge (hidden when zero); clicking opens a dropdown listing recent notifications (title, body, timestamp) with links via the `link` field and a "Mark all read" button that calls `markAllNotificationsReadAction` and refreshes. Notification data is fetched server-side in the layout via `getNotifications`; interactivity is client-side.

"Horses" → `/barn/[slug]/horses` (all roles)
"Manage Barn" → `/barn/[slug]/settings` (manager only)

| Route | Roles | Notes |
|---|---|---|
| `/` | All | Unauthenticated users are redirected to `/login`; authenticated users are redirected server-side using barn membership logic: single active → `/barn/[slug]`, multiple active → `/barns`, pending-only single → `/barn/[slug]/pending`, pending-only multiple → `/barns`, no memberships → `/login?no_barns=true` |
| `/barns` | Authenticated users | Barn selector: one card per membership; active shows role + link to `/barn/[slug]`; pending shows badge + link to `/barn/[slug]/pending`; no memberships redirects to `/login?no_barns=true` |
| `/barn/[slug]` | All active members | All roles see upcoming-lessons preview (next 7 days; manager/trainer filtered by `instructor_id`, rider by enrollment); manager also sees pending-requests badge (links to `/settings`; hidden when zero); nav links rendered by layout |
| `/barn/[slug]/lessons` | All active members | Lessons split at 7-day cutoff: recent shown immediately, older behind `OlderLessonsToggle`; manager can delete; role-aware filter bar above the list — trainer sees a horizontally scrollable pill row (`All \| [Rider A] \| ...`) to filter by rider; manager sees a two-level pill row (`All \| By Trainer \| By Rider` then a second row of specific people); rider sees no filter controls; active filter persists in URL params (`?filter=trainer\|rider&id=<uuid>`) |
| `/barn/[slug]/lessons/new` | manager, trainer | |
| `/barn/[slug]/lessons/[id]` | All active members | Edit link visible to managers and trainers; trainer/manager see and can inline-edit `horse_notes` per horse and `rider_notes`+`private_notes` (visually distinguished) per rider via server actions; rider sees own `rider_notes` read-only |
| `/barn/[slug]/lessons/[id]/edit` | manager, trainer | Pre-filled edit form; instructor field read-only for trainers (DB enforces via RLS); group→normal downgrade shows warning and requires manager to select one rider/horse to keep; updates are atomic via `update_lesson_with_participants` RPC; only managers can add new horses or riders inline |
| `/barn/[slug]/horses` | All active members | Three categorized sections: **Available** (`is_active=true`, `is_available=true`) sorted by total exertion ascending — card shows name, exertion, lesson count, jumping count (7d); **Unavailable** (`is_active=true`, `is_available=false`) — card shows name and unavailability reason; **Inactive** (`is_active=false`) — manager only, card shows name; empty sections hidden; manager sees inline Add Horse form (name input + button) in the page header; all cards are full-card links to `/barn/[slug]/horses/[id]`; trainer and rider see Available and Unavailable only |
| `/barn/[slug]/horses/[id]` | All active members | Horse detail page; shows horse name and current availability status; manager sees `HorseManagerForm` — a unified form with name input, three-state pill status control (Active / Unavailable / Inactive), conditional reason textarea (shown only when Unavailable is selected), and a single Save that updates name, `is_active`, `is_available`, and `unavailability_reason` in one call via `updateHorseDetails`; trainer/rider see reason as read-only text when horse is unavailable; manager and trainer see a Documents section listing all uploaded files by `record_type` with signed-URL links; manager can upload and delete documents, trainer can upload only; rider sees no documents section |
| `/barn/[slug]/members` | All active members | Members roster; "You" card (links to detail page) shown for all roles; manager sees Managers (own entry excluded) + Trainers + Riders sections; trainer sees Riders section only; rider sees "You" card only; data fetched via `barn_memberships` join `profiles`; nav link visible to manager and trainer only |
| `/barn/[slug]/members/[membership_id]` | All active members | Member detail page; shows documents for the target member and an upload form when the caller can manage docs; manager target: uses `trainer_documents` stored at `{barn_id}/managers/{user_id}/` (same document types as trainer); trainer target: `trainer_documents` at `trainers/`; rider target: `rider_documents` at `riders/`; manager can upload/delete any member's docs (including other managers' and own); trainer manages own docs, views rider docs read-only; rider manages own docs only; trainer viewing another trainer gets `notFound()`; rider viewing anyone else gets `notFound()`; if target has no linked account, shows "No account linked" message; accepted file types: PDF, JPG, PNG, DOCX (max 5 MB); documents open via signed URL (300 s TTL) |
| `/barn/[slug]/riders` | All (redirect) | Redirects to `/barn/[slug]/members` |
| `/barn/[slug]/finances` | manager | **Outstanding** section (all-time past unpaid lessons with non-zero fee — inline payment-type dropdown via `OutstandingTable` Client Component, plus a "View all outstanding" link to `/barn/[slug]/finances/outstanding`) appears above the month selector and is hidden entirely when there are no outstanding lessons. Below it: `←`/`→` month navigation; `?month=YYYY-MM` selects month (defaults to current, clamped to barn creation date); **Collected income** (`payment_type IS NOT NULL`), **Pending income** (future unpaid lessons with fee); pill-style tab switcher (`?tab=tier\|horse\|rider\|trainer`, defaults to `tier`) with four views: **By Tier** (tier name, price or `—` for Custom, lesson count, subtotal), **By Horse** (horse name, collected income), **By Rider** (rider name, collected income), **By Trainer** (trainer full name, collected income) |
| `/barn/[slug]/finances/outstanding` | All active members | Read-only list of outstanding lessons for the calling user's role; manager sees all barn outstanding, trainer sees own (instructor_id filter), rider sees enrolled lessons; each row links to the lesson detail page |
| `/barn/[slug]/finances/horses/[id]` | manager | Per-horse income drill-down for a given month (`?month=YYYY-MM`, defaults to current); lists each paid lesson the horse participated in with full fee, horse count, and split amount; page total matches the "By Horse" summary on the finances page; linked from the By Horse tab with month param preserved |
| `/barn/[slug]/finances/riders/[id]` | manager | Per-rider income drill-down for a given month (`?month=YYYY-MM`, defaults to current); lists each paid lesson the rider participated in with full fee, rider count, and split amount; page total matches the "By Rider" summary on the finances page; linked from the By Rider tab with month param preserved |
| `/barn/[slug]/settings` | manager | **Manage Barn** page: Invite Link, Pending Requests (approve/reject), Active Members (remove), Lesson Tiers list with Edit links and Add Tier link |
| `/barn/[slug]/settings/tiers/new` | manager | New Tier page; shared `TierForm` component; on save redirects to settings |
| `/barn/[slug]/settings/tiers/[id]` | manager | Edit Tier page; shared `TierForm` component; Activate/Deactivate, Set Default, and Save actions all redirect to settings |
| `/barn/[slug]/guide` | All active members | Role-specific user guide rendered from `USER_GUIDE_{ROLE}.md` at repo root using `react-markdown` with Tailwind `prose` styling |
| `/profile` | Authenticated | Edit form for first name, last name, phone, emergency contact name, emergency contact phone; name changes prompt user to notify their barn manager; linked from avatar dropdown. Accepts optional `?barn=<slug>` — when present and the user has an active membership in that barn, the full barn nav bar is rendered instead of the back-button fallback; post-save redirect also returns to `/barn/<slug>` rather than the default membership-based redirect |
| `/profile/complete` | Authenticated | Same form with "Complete your profile" heading; post-login destination when any contact field (phone, emergency_contact_name, emergency_contact_phone) is null; redirects to `/` after save |
| `/login` | All | Sign-in page; displays Supabase connection status dot (green = `NEXT_PUBLIC_SUPABASE_URL` set, yellow = not set); shows no-barn guidance when `?no_barns=true` and user is authenticated |
| `/barn/[slug]/register` | unauthenticated | Membership sign-up flow |

## Data access layer

`src/lib/db/` — one file per domain. Never query Supabase directly from components or actions; always go through these modules.

| File | Domain |
|---|---|
| `auth.ts` | Auth session; `getAuthenticatedUser()` — wraps `supabase.auth.getUser()`, returns `User \| null` |
| `barns.ts` | Barn lookups |
| `barn-memberships.ts` | Membership reads and writes; cross-barn user lookup (`getBarnMembershipsForUser`); `getUserMembership(userId, barnId)` — single-membership lookup for a user in a specific barn, returns `null` if not found; `getActiveMembersWithProfiles(barnId, role)` — returns active members of a given role with names joined from `profiles`; `resolveMemberNames(membershipIds, barnId, client?)` — resolves a list of membership IDs to a `Map<membershipId, "First Last">` via two-query join to `profiles`, scoped to `barnId`, falling back to the raw membership ID when profile is missing |
| `horses.ts` | Horse registry; per-horse exertion summary (`getHorseExertionSummary`); `getHorsesByBarn` filters to active only; `getHorseById(horseId, barnId)` — single horse lookup, returns `null` if not found; `updateHorseDetails(horseId, barnId, updates)` — single-call update for `name?`, `is_active`, `is_available`, `unavailability_reason` (used by manager save form); `setHorseActive`, `setHorseAvailability` — individual field setters (still exported; used internally); `resolveHorseNames(horseIds, barnId, client?)` — resolves a list of horse IDs to a `Map<horseId, name>` scoped to `barnId`; callers fall back to raw horse ID when ID is absent from the map |
| `lessons.ts` | Lesson CRUD: `createLesson`, `getLessonsByBarn(barnId, userId, role)` — manager: all barn lessons; trainer: lessons where `instructor_id = userId`; rider: lessons via `lesson_riders` enrollment (resolved through `barn_memberships`); returns `LessonWithDetails[]` (includes `horse_names`, `rider_names`, `rider_ids` — parallel arrays built together so indexes always correspond); `getLessonById(lessonId, barnId, role, userId?)` — `role` is required (no default); rider role omits `private_notes` from the select; `deleteLesson`, `updateLesson`, `getUpcomingLessons(barnId, from, to, userId, role)` — manager/trainer: filters by `instructor_id`; rider: resolves via `barn_memberships → lesson_riders → lessons` |
| `lesson-participants.ts` | Participant management: `createLessonWithParticipants`, `updateLessonWithParticipants`, `addHorseToLesson`, `addRiderToLesson`, `updateLessonRiderNotes`, `updateLessonHorseNotes`; `getRiderEnrolledLessonIds(barnId, userId)` — resolves active rider membership then returns enrolled lesson IDs |
| `lesson-finances.ts` | Financial reporting: `getFinancialSummary` (returns `collectedIncome`, `pendingIncome`, `breakdown` grouped by `tier_name` with `{ tierName, price, lessonCount, subtotal }[]`); `getOutstandingLessons(barnId, userId?, role?)` (returns `OutstandingLesson[]` with past unpaid lessons, fee ≠ 0; role-filtered: manager=all barn, trainer=own lessons by `instructor_id`, rider=enrolled lessons via `lesson_riders`); `getHorseIncomeSummary` (collected-only); `getRiderIncomeSummary` (collected-only); `getTrainerIncomeSummary` (collected lessons grouped by instructor with full name from profiles); `getHorseIncomeDetail(barnId, horseId, startDate, endDate)` (per-horse drill-down: returns `{ horseName, rows: HorseIncomeDetailRow[], total }` where each row has `{ lessonId, lessonAt, fee, horseCount, splitAmount }`); `getRiderIncomeDetail(barnId, riderId, startDate, endDate)` (per-rider drill-down: returns `{ riderName, rows: RiderIncomeDetailRow[], total }` where each row has `{ lessonId, lessonAt, fee, riderCount, splitAmount }`) |
| `lesson-tiers.ts` | Tier CRUD: `getTiersByBarn`, `createTier` (accepts optional `defaultExertionLevel`/`defaultJumping`), `updateTier` (accepts optional `default_exertion_level`/`default_jumping` in updates), `deactivateTier`, `reactivateTier`, `setDefaultTier`, `getAllTiersByBarn` (incl. inactive), `getTierById` |
| `seeded-accounts.ts` | Pre-auth manager staging: `createSeededAccount(email, firstName, lastName, barnId, role, client?)` — upserts a `seeded_accounts` row (called by `seed-account.ts`); `activateSeededAccount(userId, email, client?)` — looks up by email, creates profile + active membership, deletes the row (called by auth callback on first sign-in; no-op if row not found) |
| `profiles.ts` | User profiles; `upsertProfile` (called at registration and by `activateSeededAccount`); `getProfileByUserId` (single-user lookup by auth user ID); `getProfilesByUserIds(userIds)` — bulk lookup by auth user ID array, returns empty array when list is empty; `updateProfile` (updates all five editable fields: first_name, last_name, phone, emergency_contact_name, emergency_contact_phone); `updateContactInfo` (updates phone/emergency contact fields; RLS enforces own-row for users, any barn member for managers) |
| `notifications.ts` | Notification CRUD: `createNotification` (upserts on `user_id,barn_id,type`; resets `read_at` on conflict); `deleteNotificationByType(userId, barnId, type)` (deletes a notification by user+barn+type; no-op if not found); `markNotificationRead` (sets `read_at = now()` by id); `markAllNotificationsRead` (sets `read_at = now()` for all unread for a user in a barn); `getNotifications(userId, barnId, limit=20)` (recent notifications ordered by `created_at DESC`) |
| `document-storage.ts` | Shared Supabase Storage helpers: `uploadFile(storagePath, file, contentType)`, `removeFile(storagePath)`, `getSignedUrl(storagePath)` (300 s TTL), `validateFile(file)` (throws on invalid type/extension/size; returns lowercased extension on success); exports `ALLOWED_MIME_TYPES`, `ALLOWED_EXTENSIONS`, `MAX_FILE_SIZE` |
| `horse-documents.ts` | Horse document CRUD: `getHorseDocuments(horseId, barnId)`, `createHorseDocument(...)`, `deleteHorseDocument(id, horseId, barnId)` |
| `trainer-documents.ts` | Trainer document CRUD: `getTrainerDocuments(trainerId, barnId)`, `createTrainerDocument(...)`, `deleteTrainerDocument(id, barnId)` |
| `rider-documents.ts` | Rider document CRUD: `getRiderDocuments(riderId, barnId)`, `createRiderDocument(...)`, `deleteRiderDocument(id, barnId)` |
| `types.ts` | Shared TypeScript types |

## Server actions pattern

No API routes. All mutations go through Next.js Server Actions.

- **Global actions:** `src/app/actions/` — auth (`auth.ts`), lesson submission and payment-type update (`lessons.ts`), notification create and mark-read (`notifications.ts`)
- **Feature-scoped actions:** co-located `actions.ts` files inside route directories (`profile/`, `barn/[slug]/horses/`, `barn/[slug]/horses/[id]/`, `barn/[slug]/register/`, `barn/[slug]/riders/`, `barn/[slug]/settings/`, `barn/[slug]/(protected)/approvals/`, `barn/[slug]/(protected)/members/[membership_id]/`)

## Auth guard

`src/lib/auth/guard.ts` exports `requireMembership(barnSlug: string, allowedRoles: Role[]): Promise<{ user, barn, membership }>`. All server actions that enforce role-based access call this function. It redirects to `/barn/[slug]/login` on any auth or role failure, eliminating the 6-line auth block that was previously duplicated across every action. `register/actions.ts` does not use it — its guard is a different pattern (membership existence check, not role authorization).

## Supabase RPC

`create_lesson_with_participants(p_barn_id, p_instructor_id, p_lesson_at, p_fee, p_horse_ids[], p_exertion_levels[], p_rider_ids[], p_lesson_type, p_jumping, p_tier_name, p_payment_type)` — atomically inserts a lesson, its horse assignments (`lesson_horses`), and one or more riders (`lesson_riders`) in one transaction. Validates participant counts inline: normal lessons require exactly 1 horse and exactly 1 rider; group lessons require ≥ 2 riders. `p_jumping` defaults to `false`; `p_tier_name` defaults to `'Custom'`; `p_payment_type` defaults to `NULL`. Used by lesson submission to avoid partial writes.

`set_default_tier(p_tier_id, p_barn_id)` — atomically clears `is_default` on all barn tiers then sets `is_default=true` on the target tier in one transaction. Used by `setDefaultTier` in `lesson-tiers.ts`.

`update_lesson_with_participants(p_lesson_id, p_barn_id, p_lesson_at, p_instructor_id, p_fee, p_lesson_type, p_jumping, p_payment_type, p_tier_name, p_horse_ids[], p_exertion_levels[], p_rider_ids[])` — atomically updates the `lessons` row and replaces `lesson_horses` + `lesson_riders` (delete then insert) in one transaction. The deferred `enforce_lesson_participant_counts` trigger sees the final state at commit. Used by the lesson edit page.

`set_can_instruct(p_membership_id uuid, p_barn_id uuid, p_value boolean)` — sets `can_instruct` on a single `barn_memberships` row. `SECURITY DEFINER`; verifies the caller is a manager of `p_barn_id` then updates only the `can_instruct` column. `EXECUTE` revoked from `PUBLIC` and granted to `authenticated`.

`teardown_dev_barn_lessons(p_barn_id uuid)` — dev-only helper that deletes all `lesson_riders`, `lesson_horses`, and `lessons` rows for a barn in a single transaction, so the deferred participant-count triggers see the lesson rows gone at commit and skip enforcement. `SECURITY DEFINER`; `EXECUTE` revoked from `PUBLIC` and granted to `service_role` only. Called by `teardownBarnData` in `scripts/script-utils.ts`.

`teardown_all_lesson_data()` — dev-only helper that deletes all `lesson_riders`, `lesson_horses`, and `lessons` rows across all barns in a single transaction, satisfying the deferred participant-count triggers at commit. `SECURITY DEFINER`; `EXECUTE` revoked from `PUBLIC` and granted to `service_role` only. Called by `teardownAllData` in `scripts/script-utils.ts`.

`get_horse_exertion_summary(p_barn_id uuid, p_since timestamptz)` — returns one row per horse in the barn with `is_available` and aggregated `lesson_count`, `total_exertion`, and `jumping_count` for lessons on or after `p_since`. Uses a subquery JOIN + GROUP BY so horses with zero in-window lessons appear with zero counts. `SECURITY INVOKER`; `EXECUTE` granted to `authenticated`. Used by `getHorseExertionSummary` in `horses.ts`.

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
