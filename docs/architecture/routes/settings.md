# Settings routes

## `/barn/[slug]/settings`

**Roles:** manager

**Manage Barn** page (#778 — restructured into collapsible accordion sections, each built on a native `<details>`/`<summary>` `AccordionSection` component rather than a client-side disclosure pattern, so the page stays a pure Server Component, all collapsed by default; a section's own header button, e.g. Lesson Tiers' Add Tier link, renders as a sibling positioned outside `<summary>` rather than nested inside it, avoiding the nested-interactive-element nesting `<details>`/`<summary>` don't tolerate well; the self-service join-request "Pending Requests" section — approve/reject for legacy pending rows — was removed in #1037, since #777 had already closed off the generic self-registration flow that created them, and the sibling "Active Members" section that used to live here was removed in #943 — member removal now lives on the Member Detail page header instead): **Default Instructor Cut** (#776, renamed from "Instructor Cut"; single number field + Save, with helper text noting it doesn't affect past lessons — only seeds new lesson tiers and Custom lessons booked afterward), **Horse Exhaustion Thresholds** (Moderate/High number fields pre-filled from the barn row, server-validated `moderate < high` with a field error otherwise), Lesson Tiers list with Edit links and Add Tier link, **Barn Events** list (#1014, title/date/visible-to roles, Edit links, Add Event link — see `barn_events` in [`schema.md`](../schema.md)), editable **Default Board Fee** (with non-retroactive helper text — only seeds new boarding agreements), editable **Barn Timezone** (#955 — a `<select>` restricted to `src/lib/barn-timezone.ts`'s short fixed list of common US IANA zones; since #1222 this is the *only* zone the app resolves a real instant in — every displayed time, every date the user enters, and every past/due/today comparison, see `barns.timezone` in [`schema.md`](../schema.md))

## `/barn/[slug]/settings/tiers/new`

**Roles:** manager

New Tier page; shared `TierForm` component, including an Instructor Cut field pre-filled from `barns.default_instructor_cut` (#776); on save redirects to settings

## `/barn/[slug]/settings/tiers/[id]`

**Roles:** manager

Edit Tier page; shared `TierForm` component; Instructor Cut field pre-filled from the tier's own rate, with the same amber "won't affect past lessons" warning on change as the price field (#776); Set Default and Save actions redirect to settings; Activate/Deactivate (#752) stay on this page — they `revalidatePath` both this page and settings instead of redirecting, so the manager sees the tier's new status in place; attempting to deactivate the barn's default tier no longer silently redirects — `deactivateTierAction` returns `{ error }` (via `useActionState`, same pattern as the Save form) and `TierForm` renders it inline next to the Deactivate button, telling the manager to set another tier as default first

## `/barn/[slug]/settings/events/new`

**Roles:** manager

New Event page (#1014); shared `EventForm` component — title, `DateHourPicker` (reused as-is from `lessons/DateHourPicker.tsx` via its `onChange` prop into a locally-named `event_at` hidden input), notes, and a three-checkbox `visible_to_roles` selector defaulting all-checked; on save redirects to settings

## `/barn/[slug]/settings/events/[id]`

**Roles:** manager

Edit Event page (#1014); shared `EventForm` component pre-filled from the event row, checkboxes pre-checked per `visible_to_roles`; a Delete link/button navigates to the delete-confirm page rather than deactivating in place (no soft-delete concept for events, unlike Lesson Tiers)

## `/barn/[slug]/settings/events/[id]/delete`

**Roles:** manager

Delete Event confirm page (#1014) — mirrors the Expenses delete-confirm pattern; hard-deletes the row, redirects to settings
