# Pre-Release Test Checklist

Manual smoke test of all barn workflows against the dev environment. Run the phases **in order** — later phases depend on data created in earlier ones. Every UI route in `ARCHITECTURE.md` is covered at least once (see [Route coverage](#route-coverage) at the bottom).

Paths below are relative — prepend your app origin (local `npm run dev` or Vercel preview URL).

> **Convention:** each checkbox verifies one independent assertion, so a partial failure can be marked cleanly. Split any checkbox that bundles multiple clauses — with one exception:
>
> - **Setup/data-creation steps** that assert nothing are fine to leave bundled with the assertion they set up for.

> **Automation tags:** each checkbox in an audited section carries exactly one of —
>
> - `(e2e: <test name>)` — covered by that Playwright test in `e2e/`; run via `scripts/run-checklist-suite.sh`
> - `(e2e-candidate)` — automatable, spec not written yet
> - `(manual)` — not automatable; always hand-verified
>
> Sections with no tags on their checkboxes have not been audited yet.

## Prerequisites

- [ ] `.env.local` at repo root with `DEV_EMAIL`, `DEV_NAME` (must be "First Last" — a single word breaks the name prompt in Phase 1), `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (optionally `DEV_BARN` — `seed-account.sh` in Phase 1 defaults it to `dev-barn`; `change-user.sh` in Phases 5–7 takes the barn slug as a required argument, e.g. `bash scripts/change-user.sh dev-barn`)
- [ ] App running (dev server or Vercel preview) and reachable in a browser
- [ ] Email provider enabled in the Supabase dashboard (required by the e2e auth logins `reset-db.sh` creates in Phase 1, which `seed-test-barn.sh` in Phase 7 then verifies exist)

## Phase 1 — Setup

- [ ] Visit `/login` — a **Terms of Service** link is present
- [ ] Clicking the link opens `/terms`
- [ ] The `/terms` page renders the drafted terms content
- [ ] Visit `/login` — a **Privacy Policy** link is present
- [ ] Clicking the link opens `/privacy`
- [ ] The `/privacy` page renders the drafted privacy policy content
- [ ] In a fresh/incognito browser (no existing session), visit `/demo` — a spinner and "Explore Stable State" heading render, then you land in a new `/barn/demo-.../` barn as its manager (requires `DEMO_USER_EMAIL`/`DEMO_USER_PASSWORD` in `.env.local`, from `scripts/setup-demo-user.sh` — `/demo` 404s if unset)
- [ ] Visiting `/demo` again in the same browser resumes the same demo barn (same URL) instead of creating a new one
- [ ] With `DEMO_USER_EMAIL` set but `DEMO_USER_PASSWORD` unset, visit `/demo` — you land on `/login` with a "demo is unavailable" message instead of a blank redirect
- [ ] `curl -X POST /api/cron/reset-demo` with a missing or wrong `Authorization` header — response is `401`
- [ ] With `CRON_SECRET` set in `.env.local` and a demo barn from the step above manually backdated (`update barns set created_at = now() - interval '7 hours' where slug = '...'`), `curl -X POST /api/cron/reset-demo -H "Authorization: Bearer <CRON_SECRET>"` — response is `{"reaped":1}` (or more)
- [ ] After that curl, the reaped barn no longer resolves at its old `/barn/demo-.../` URL
- [ ] On the demo barn's dashboard, an amber banner reads "This is a demo barn. Data resets at approximately [time]."
- [ ] In the nav, the demo barn's name renders as "{name} (DEMO)" in amber
- [ ] The user menu does not show a **Profile** link while signed in as the demo user
- [ ] Visiting `/profile` directly while signed in as the demo user redirects to `/`
- [ ] Reset and reseed the dev database:

  ```bash
  bash scripts/reset-db.sh
  ```

  This chains `seed-account.sh`, which prompts for **First name**, **Last name**, and **Barn slug** — each pre-filled from `.env.local` (`DEV_NAME`, `DEV_BARN`), so press **Enter** through all three to accept the defaults.
- [ ] The script prints `Invite path: /barn/dev-barn/register?token=<uuid>` — open that path on your app origin (no existing session, so it redirects to `/barn/dev-barn/login?token=<uuid>`)
- [ ] The `/barn/dev-barn/login` page shows the **"Keep me logged in"** checkbox (checked by default) — sign in with the **`DEV_EMAIL`** Google account
- [ ] You are redirected to `/profile/complete` (fresh claimed stub has no contact info)
- [ ] Fill in phone, emergency contact name, and emergency contact phone → Save → you land in the app as manager of Dev Barn
- [ ] Shrink the browser below 768px wide — the nav bar's section links disappear and a ☰ button appears
- [ ] Tapping ☰ opens a left drawer listing the same links
- [ ] The drawer closes on link tap
- [ ] The drawer closes on backdrop tap
- [ ] The drawer closes on Escape
- [ ] The bell icon sits to the left of the avatar at this width (reversed from desktop's avatar-then-bell order)
- [ ] **Lessons** is bolded/highlighted in the desktop nav bar while on `/barn/dev-barn/lessons` or a nested page like `/barn/dev-barn/lessons/[id]`
- [ ] **Lessons** is bolded/highlighted in the drawer under the same conditions
- [ ] Other links stay unhighlighted
- [ ] Temporarily `throw new Error('smoke test')` at the top of any page or Server Action, load it, then revert — confirm the global error boundary (`src/app/error.tsx`) renders "Something went wrong" with a working **Try again** button instead of a raw stack trace

**Seeded baseline after reset** (expect this data alongside anything you create below): trainers Alex, Blake, Casey; riders Dana, Emery, Finley; second manager Morgan Manager; horses Apple, Butter, Clover; horse Willow (retired/inactive with 3 past lessons + 1 upcoming — will not appear in the horse picker or the Horses page's Available/Unavailable sections, only visible to managers under Inactive); tiers Normal Tier ($100, default) and Premium Tier ($150); ~38 lessons spread over the past 3 months (some paid, one group per five, some jumping, 5 upcoming).

## Phase 2 — Manager seeding

Lesson tiers (`/barn/dev-barn/settings` → Add Tier → `/barn/dev-barn/settings/tiers/new`):

- [ ] Create tier **Beginner** — $60, default exertion level 2, jumping off
- [ ] Create tier **Advanced** — $120, default jumping on
- [ ] Create tier **Group Special** — $90, no defaults
- [ ] All three appear in the Lesson Tiers list on the settings page
- [ ] Try saving a tier with a blank price — rejected with "Price is required"
- [ ] Try saving a tier with a $0 price — accepted
- [ ] Try saving a tier with a blank or whitespace-only name — rejected with "Name is required" (same for editing an existing tier)
- [ ] Try saving a tier with both name and price blank — rejected with both errors shown together ("Name is required, Price is required")

Horses (`/barn/dev-barn/horses`, inline Add Horse form in the page header):

- [ ] Create horses **Daisy**, **Eclipse**, and **Flint**
- [ ] Open Daisy's detail page → set status pill to **Unavailable**, enter reason "Thrown shoe" → Save
- [ ] Horses page now shows Daisy under **Unavailable** with the reason visible
- [ ] On Eclipse's detail page, in the **Access** section, select rider Dana and tap **Grant Access** → Dana appears in the grants list with an **Owner** column showing **Set as Owner**
- [ ] Tap **Set as Owner** on Dana's row → the button changes to **Owner**
- [ ] (#1069) Dana's row now shows **Documents: Write** without touching the dropdown directly (auto-elevated on becoming owner)
- [ ] (#1069) Dana's row now shows lesson access **Can View** without tapping the toggle directly (auto-elevated on becoming owner)
- [ ] Refresh the page → an "Owner: Dana Rider" line appears above the photo, linking to Dana's member detail page
- [ ] Refresh the page → Dana's row in the Access table still shows **Owner**, not **Set as Owner**
- [ ] Grant access to rider Emery → Emery appears in the grants list with Documents set to **None** and lesson access **Cannot View**
- [ ] Change Emery's **Documents** dropdown to **Read** → refresh the page → the selection persists
- [ ] Tap Emery's **Cannot View** button → it flips to **Can View** and persists after refresh
- [ ] Tap **Owner** on Dana's row (the current owner) → it flips back to **Set as Owner**
- [ ] Refresh the page → the "Owner:" line above the photo is gone
- [ ] Tap **Set as Owner** on Dana's row again, then tap **Revoke** on Dana's row (confirm the browser prompt) → Dana no longer appears in the grants list
- [ ] Refresh the page → the "Owner:" line above the photo is still gone (revoking the owner cleared ownership)
- [ ] Tap **Revoke** on Emery's row (confirm the browser prompt) → Emery no longer appears in the grants list and is selectable again in the add-member dropdown

Agreements (`/barn/dev-barn/agreements?kind=lease` and `?kind=board`):

- [ ] **Leases** in the nav opens the lease-kind list, stays highlighted, and the URL shows `?kind=lease`; **Add Lease** → the nav still shows **Leases** highlighted (not Boarding) on the `/agreements/new` form → select rider Dana, horse Apple, fee $150, cadence Monthly, start date today → Save
- [ ] **Boarding** in the nav opens the board-kind list, stays highlighted, and the URL shows `?kind=board`; **Add Boarding** → select rider Emery, horse Butter — fee is pre-filled from the barn's default board fee → Save
- [ ] Both agreements appear as full-card links in their respective kind-scoped lists, each showing rider, horse, fee, and **Active** status — no separate View/Edit buttons on the card, the whole card is the link
- [ ] On the monthly lease's detail page, leave a past month's charge unpaid (Payment Type blank) → back on the Leases list, that agreement's card shows an amber **Unpaid** pill next to its status; mark the charge paid → refresh the list → the pill disappears
- [ ] Add a one-time lease (rider Dana, horse Apple, cadence One time) → its card shows **Complete** instead of Active, both in the Leases list and on its detail page
- [ ] Click the monthly lease's card → detail page shows rider, horse, fee, cadence, and status, plus a charges table with the first auto-generated charge; nav still shows **Leases** highlighted (not Boarding) on the detail page; **Edit** button top-right → nav still shows **Leases** highlighted on the edit page too; rider, horse, start date, and cadence are read-only; change the fee → Save → new fee reflected in the list
- [ ] On the lease detail page's charge row, select a **Payment Type** → page refreshes, the selection persists, and a brief "✓ Saved" confirmation appears next to the dropdown; edit the **Fee** field and blur → new amount persists after refresh and the same confirmation appears next to the field
- [ ] Click the boarding agreement's card → detail page shows nav still highlighting **Boarding** (not Leases); **End Agreement** (confirm the browser prompt) → it now shows **Ended** in the Boarding list
- [ ] On a rider's member detail page with an active boarding agreement, click the **Boarding: $X/month** link → lands on the agreement detail page with **Boarding** still highlighted in the nav

Managed rider stubs (`/barn/dev-barn/members`, inline Add Rider form in the Riders section):

> The UI creates managed **rider** and **trainer** stubs (#564 added the Add Trainer form); **manager** stubs are not creatable — other managers appear only once they join. The steps below use rider stubs; Phase 5's trainer checks still use the seeded trainers via `change-user.sh` rather than a freshly created stub.

- [ ] Create managed riders **Gale Test**, **Harper Test**, and **Indigo Test** — each row is a normal card link to its member detail page, alongside an inline amber **Unlinked** badge next to the name (no Copy Invite/Revoke buttons on this list)
- [ ] Open Gale Test's member detail page as manager — a **Manage Member** section appears right after the name with an amber notice and **Copy Invite**/**Revoke** buttons
- [ ] While Gale Test is still unclaimed, upload a document on their detail page — confirms manager can upload/delete documents for a managed/unclaimed rider
- [ ] Click **Copy Invite** on Gale Test's detail page → button briefly reads **Copied!** → the copied URL matches `/barn/dev-barn/register?token=<uuid>` (a well-formed UUID token)

> Actually claiming that invite — and the pre-claim-document-readability regression check that goes with it — needs a genuinely different person, which no local or preview setup produces. It's verified against prod in [`POST_RELEASE_TEST_CHECKLIST.md`](POST_RELEASE_TEST_CHECKLIST.md) instead.

- [ ] On Harper Test's detail page, click **Revoke** → click **Copy Invite** again → the copied URL contains a **different** token than before
- [ ] On Indigo Test's detail page, click **Revoke** then immediately click **Copy Invite** (as fast as possible, before the button re-enables) — Copy Invite is disabled/unclickable until the new token has loaded, so it never copies the just-revoked stale token (#939 regression check)

## Phase 3 — Manager lesson entry

All via `/barn/dev-barn/lessons/new`. Times entered here should display later in 12-hour AM/PM format. `reset-db.ts` seeds ~43 varied lessons across past/current/future dates, tiers, jumping, and exertion — only create the purpose-built lessons below; verify everything else against seeded data (including the seeded Custom-tier lesson).

- [ ] Create a **past lesson** (dated ~5 weeks ago, previous calendar month): Beginner tier, trainer Alex, horse Apple, rider Dana
- [ ] Try saving a lesson with a blank fee (Custom tier, no tier selected) — rejected with "fee is required"; in edit mode, blank fee is rejected too
- [ ] Select a named tier (e.g. Beginner) — fee field stays visible and editable, pre-filled with the tier's price; change the fee and save — lesson saves with the edited fee and keeps the tier's name (not "Custom")
- [ ] Create a **current-month paid lesson** (dated a few days ago, before today): Beginner tier, trainer Alex, horse Clover, rider Dana — after saving, mark it **paid**
- [ ] While creating it, pick a date and check Apple, Butter, and Clover in turn — each shows an exhaustion bar (no bars before a date is picked); adjust a checked horse's exertion level and watch its ghost segment move live, unchecked horses stay solid; change the date and confirm bars refresh
- [ ] Open this lesson's edit page afterward and confirm Clover's bar still renders (excluding the lesson itself from its own window)
- [ ] Create a **group lesson** (dated a few days ago): Group Special tier, trainer Blake, horse Butter, riders Dana + Emery — horse picker legend reads "Horses (select at least one)" (a Normal lesson reads plain "Horse", already exercised above)
- [ ] On any lesson form, set the fee to `0` — Payment Type field disappears; raise it back above `0` — field reappears
- [ ] Daisy (Unavailable) appears **disabled** in the horse picker
- [ ] Check one horse and confirm it jumps to the top of the list ahead of unchecked available horses (ordered least-to-most worked), Daisy sorted last; set the date/hour to the past — no bars render; set it back — bars reappear
- [ ] Check **Recurring (weekly)** — Date field label changes to "Starting Date" (reverts when unchecked); checkbox sits directly above the date field
- [ ] Create a **recurring lesson** (dated 7 days out): check **Recurring (weekly)**, Beginner tier, trainer Alex, horse Apple, rider Dana — saves; the checkbox doesn't appear when editing
- [ ] The recurring lesson shows a **Recurring** badge on the Lessons list row and its detail page
- [ ] Open its edit page — "part of a recurring series" indicator + **Stop Recurring Lessons** button appear; confirm, click Stop — both disappear on reload, the lesson itself keeps its Recurring badge
- [ ] Open Willow's seeded upcoming lesson's edit page — Willow (inactive) still appears checked, sorted first, still shows its bar; uncheck it — moves to the bottom (grouped with Unavailable), bar disappears

*(Dropped the manual "create a Custom-tier lesson" step from the original goals — that's now covered by #950's seed addition instead.)*

## Phase 4 — Manager verification

- [ ] (e2e: lesson_creation_stores_correct_utc_lesson_at_for_known_local_wall_clock) Compare a lesson's stored `lesson_at` in the DB (Supabase Studio or `supabase db` query) against the wall-clock time you entered when creating it in Phase 3 — confirms UTC storage round-trips correctly for your local timezone, not just that the created time displays back the same way it was entered
- [ ] (e2e-candidate) On the Lessons list, a lesson's displayed time matches the wall-clock time you entered (not shifted by your UTC offset) — if your system/browser clock is set to a non-UTC timezone, this also proves the display isn't silently forcing UTC
- [ ] (e2e-candidate) On that lesson's detail page, its displayed time matches the same wall-clock time

Dashboard (`/barn/dev-barn`):

- [ ] (e2e-candidate) Dashboard shows a single-day calendar (one date's entries, not a week or a flat list)
- [ ] (e2e: dashboard_today_indicator_visible_on_current_day) The calendar defaults to today, with today's date in the heading
- [ ] (e2e-candidate) Prev/Next links appear alongside the calendar heading
- [ ] (e2e-candidate) Today's seeded lessons appear on the calendar
- [ ] (e2e-candidate) A planned expense scheduled for today (future date+time, no amount yet) appears on the same calendar alongside those lessons
- [ ] (e2e-candidate) Clicking Next twice navigates to the day the seeded Riverside Vet Clinic expense (2 days out) is scheduled for
- [ ] (e2e: dashboard_expense_interleaved_with_lesson_by_time_on_shared_day) That expense appears on that day interleaved by time with the day's lessons, not grouped into a separate expenses block
- [ ] (e2e-candidate) A "Today" link appears while viewing a day other than today
- [ ] (e2e-candidate) That "Today" link returns to today's calendar when clicked
- [ ] (e2e-candidate) No "Today" link appears while already viewing today
- [ ] (e2e: dashboard_date_only_planned_expense_not_shown) A date-only planned expense (no time set) does **not** appear on the calendar for its date
- [ ] (e2e: dashboard_expense_card_shows_scheduled_time) An expense entry on the calendar shows its scheduled date/time
- [ ] (e2e: dashboard_expense_card_shows_recipient) That expense entry shows its recipient
- [ ] (e2e: dashboard_expense_card_shows_type) That expense entry shows its expense type
- [ ] (e2e: dashboard_expense_card_shows_horse) A horse-specific expense entry shows its horse(s)
- [ ] (e2e-candidate) An **Entire Barn** expense entry shows "Entire Barn" in place of horse names
- [ ] (e2e-candidate) Tapping an expense entry opens that expense's detail page
- [ ] (e2e: dashboard_reminders_header_visible_for_manager) A "Reminders" section header appears above the document-reminders/unpaid-income cards
- [ ] (e2e: dashboard_reminders_header_hidden_for_rider_with_no_reminders) That header is hidden entirely when none of those cards have anything to show
- [ ] (e2e-candidate) No document-reminder cards appear under Reminders when no documents are past their reminder date
- [ ] (e2e: dashboard_document_reminder_card_shown_after_setting_reminder_date) After setting a past reminder date on a document (see Horses/Members below), a single-line "{owner} — {record type} — {date}" card appears under Reminders
- [ ] (e2e-candidate) That card appears directly under Reminders with no separate "Document Reminders" heading above it
- [ ] (e2e-candidate) That card links to the horse's or member's detail page
- [ ] (e2e: dashboard_unpaid_lesson_reminder_links_to_outstanding) With unpaid lessons in the barn, an "N unpaid lessons" card appears under Reminders linking to `/barn/dev-barn/finances/outstanding`
- [ ] (e2e: dashboard_unpaid_lease_reminder_links_to_outstanding) With unpaid lease/boarding charges in the barn, an "N unpaid leases/boarding" card appears under Reminders linking to the same page
- [ ] (e2e-candidate) Each of those two cards is hidden individually when its own count is zero, without hiding the other
- [ ] (e2e-candidate) (#1016) A "Day"/"Week" pill switcher appears above the calendar
- [ ] (e2e-candidate) (#1016) The Day view is active by default
- [ ] (e2e-candidate) (#1070) Tapping "Week" switches to the calendar-aligned Sunday–Saturday week containing the currently viewed date, not a rolling 7-day window
- [ ] (e2e-candidate) (#1016) In Week view, each of the 7 days shows its own date heading
- [ ] (e2e-candidate) (#1016) In Week view, each day section lists that day's own lessons/expenses/events
- [ ] (e2e-candidate) (#1016) In Week view, a day with nothing scheduled shows "Nothing scheduled for this day."
- [ ] (e2e-candidate) (#1016) A week with nothing scheduled on any of its 7 days shows a single "You're all clear" empty state instead of 7 empty lines
- [ ] (e2e-candidate) (#1016) In Week view, Prev/Next move the visible range by 7 days at a time
- [ ] (e2e-candidate) (#1016) In Week view, a "Today" link appears when today's date isn't inside the visible week
- [ ] (e2e-candidate) (#1016) In Week view, no "Today" link appears when today's date is already inside the visible week
- [ ] (e2e-candidate) (#1070) In Week view, today's day section (when visible) shows a distinct background tint/border in light mode
- [ ] (e2e-candidate) (#1070) In Week view, today's day section (when visible) shows a distinct background tint/border in dark mode
- [ ] (e2e-candidate) (#1070) Switching from Week to Day view lands on today if today is inside the currently-viewed week
- [ ] (e2e-candidate) (#1070) Switching from Week to Day view lands on the week's Sunday if today is not inside the currently-viewed week
- [ ] (e2e-candidate) (#1016) Switching to Week view as a trainer shows only lessons you instruct across all 7 days, matching Day view's role-scoping
- [ ] (e2e-candidate) (#1016) Switching to Week view as a rider shows only your enrolled lessons

Lessons (`/barn/dev-barn/lessons`):

- [ ] (e2e-candidate) Recent lessons (last 7 days) are shown immediately on page load
- [ ] (e2e-candidate) Older lessons are not shown on page load
- [ ] (e2e-candidate) Tapping the older-lessons toggle reveals them
- [ ] (e2e-candidate) Each lesson renders as a full-width card of uniform height with its siblings
- [ ] (e2e-candidate) The whole card is tappable and opens that lesson's detail page
- [ ] (e2e-candidate) No **Cancel** button appears on any lesson in the list
- [ ] (e2e-candidate) Filter pills show exactly `My Lessons | All | By Instructor | By Rider | By Horse | By Tier`
- [ ] (e2e-candidate) At ~390px width those pills wrap onto multiple lines instead of requiring horizontal scroll
- [ ] (e2e-candidate) **All** is the active pill on page load
- [ ] (e2e-candidate) Picking **My Lessons** filters to only lessons you instruct
- [ ] (e2e-candidate) Picking **All** shows every barn lesson regardless of instructor
- [ ] (e2e-candidate) Picking **By Instructor → Alex** shows only Alex's lessons
- [ ] (e2e-candidate) Picking **By Instructor → Alex** carries the URL `?filter=trainer&id=<uuid>`
- [ ] (e2e-candidate) **By Rider → Dana** filters correctly
- [ ] (e2e-candidate) **By Horse → Apple** filters correctly
- [ ] (e2e-candidate) **By Tier → Custom** (or another tier name found among the barn's lessons) filters correctly
- [ ] (e2e-candidate) Picking **By Tier → Custom** carries the URL `?filter=tier&id=<tier name>`
- [ ] (e2e-candidate) Times display in 12-hour AM/PM format everywhere (no military time)
- [ ] (e2e-candidate) Willow's upcoming lesson shows a **Needs Attention** badge on the Lessons list (Willow is seeded inactive)
- [ ] (e2e-candidate) That same lesson shows the badge on the Dashboard's Day view (navigate to the lesson's date if it isn't today)
- [ ] (e2e-candidate) The badge does not appear on Willow's past lessons
- [ ] (e2e-candidate) The badge does not appear on a cancelled lesson
- [ ] (e2e-candidate) Willow's flagged lesson's detail page shows a **Needs Attention** banner at the top reading "Willow is inactive"
- [ ] (e2e-candidate) The same banner appears on that lesson's edit page
- [ ] (e2e-candidate) The banner does not block editing or saving that lesson
- [ ] (e2e-candidate) On Willow's flagged lesson's edit page, without changing any field, clicking a nav link (or hitting browser back) raises a confirm dialog warning about the unresolved horse issue
- [ ] (e2e-candidate) That dialog defaults to **Stay**
- [ ] (e2e-candidate) Swap Willow out for an active horse and save, then reopen the edit page — navigating away no longer prompts
- [ ] (e2e-candidate) On a lesson's detail page (`/barn/dev-barn/lessons/[id]`), horse notes render read-only
- [ ] (e2e-candidate) On that same page, rider notes render read-only
- [ ] (e2e-candidate) On that same page, the Edit link is visible
- [ ] (e2e-candidate) On a lesson with no notes recorded at all, every note label (Horse Notes, Rider Notes, Private, Your Notes, Cancellation Notes) is hidden entirely rather than showing an empty label or a "—" placeholder
- [ ] Edit a lesson (`/barn/dev-barn/lessons/[id]/edit`) — change the fee, enter horse notes and rider notes, and save
- [ ] (e2e-candidate) The fee change appears on the detail page
- [ ] (e2e-candidate) The horse notes from that same save appear on the detail page
- [ ] (e2e-candidate) The rider notes from that same save appear on the detail page
- [ ] (e2e-candidate) Edit the group lesson created in Phase 3 → switch type to normal → a downgrade warning asks you to pick one rider/horse to keep (cancel without saving)
- [ ] (e2e-candidate) Delete one seeded lesson — it disappears from the list
- [ ] (e2e-candidate) A lesson's detail page header shows a single **Cancel** button next to **Edit**/**Delete**
- [ ] (e2e-candidate) That **Cancel** button is shown to the manager even on a lesson another trainer instructs
- [ ] (e2e-candidate) Clicking **Cancel** on a **normal** lesson opens a confirmation page with a **Cancelled by Rider** / **Cancelled by Instructor** toggle
- [ ] (e2e-candidate) That toggle defaults to **Cancelled by Instructor** on a lesson you instruct
- [ ] (e2e-candidate) That toggle defaults to **Cancelled by Rider** on a lesson you don't instruct
- [ ] (e2e-candidate) Confirming **Cancelled by Rider** on a **normal** lesson >24h out leaves its fee unaffected
- [ ] (e2e-candidate) Confirming **Cancelled by Rider** on a **normal** lesson booked <24h away zeroes its fee
- [ ] (e2e-candidate) A lesson cancelled that way shows a **Cancelled** badge
- [ ] (e2e-candidate) The notes you entered on the confirmation page appear under **Cancellation Notes**
- [ ] (e2e-candidate) Confirming **Cancelled by Instructor** on a lesson >24h out zeroes its fee
- [ ] (e2e-candidate) Confirming **Cancelled by Instructor** on a lesson booked <24h away zeroes its fee too
- [ ] (e2e-candidate) On a **normal** lesson booked <24h away, select **Cancelled by Rider** → an amber "The rider will be due a late cancellation fee." label appears
- [ ] (e2e-candidate) On that same lesson, switch to **Cancelled by Instructor** → the label disappears
- [ ] (e2e-candidate) On a **normal** lesson booked >24h out, select **Cancelled by Rider** → the label does not appear
- [ ] (e2e-candidate) Clicking **Cancel** on a **group** lesson shows the same **Cancelled by Rider** / **Cancelled by Instructor** toggle
- [ ] (e2e-candidate) Choosing **Cancelled by Instructor** there shows the count of enrolled riders who'll be affected
- [ ] (e2e-candidate) It also lists those riders by name
- [ ] (e2e-candidate) Confirming cancels the whole lesson, every enrolled rider included
- [ ] (e2e-candidate) That whole-lesson cancellation waives the fee
- [ ] (e2e-candidate) On that same group lesson's Cancel page, choosing **Cancelled by Rider** reveals a rider picker listing the still-active enrolled riders
- [ ] (e2e-candidate) Select one and confirm → only that rider's row shows a **Cancelled** badge
- [ ] (e2e-candidate) The rest of the lesson and its other riders are unaffected
- [ ] (e2e-candidate) The standard 24-hour fee policy applies to that rider
- [ ] (e2e-candidate) On a **group** lesson booked <24h away, select **Cancelled by Rider** → an amber "Warning: No late cancellation fees are currently leveraged for group lessons." label appears
- [ ] (e2e-candidate) On that same lesson, switch to **Cancelled by Instructor** → the label disappears
- [ ] (e2e-candidate) On a **group** lesson booked >24h out, select **Cancelled by Rider** → the label does not appear
- [ ] (e2e-candidate) Cancel a **normal** lesson (there's only one rider) → the lesson shows a **Cancelled** badge on the Lessons list
- [ ] (e2e-candidate) That same lesson shows the **Cancelled** badge on its detail page
- [ ] (e2e-candidate) (#1015) That same cancelled lesson no longer appears on the Dashboard's Day view for its date, even navigating directly to that day
- [ ] (e2e-candidate) On a **group** lesson, cancel riders one at a time via the picker → the lesson does *not* show a **Cancelled** badge while any rider is still active
- [ ] (e2e-candidate) Once the final rider is cancelled, the lesson shows a **Cancelled** badge on the Lessons list
- [ ] (e2e-candidate) That fully-cancelled group lesson shows the **Cancelled** badge on its detail page too
- [ ] (e2e-candidate) As manager, open **Edit Lesson** on an already-cancelled lesson → the Notes section shows a **Cancellation Notes** textarea
- [ ] (e2e-candidate) As the instructing trainer, open **Edit Lesson** on an already-cancelled lesson you instruct → the same **Cancellation Notes** textarea appears
- [ ] (e2e-candidate) That textarea does *not* appear when editing a non-cancelled lesson
- [ ] (e2e-candidate) As manager, edit that textarea and Save → the detail page shows the updated text read-only under **Cancellation Notes**
- [ ] (e2e-candidate) As the instructing trainer, open a cancelled lesson that already has cancellation notes recorded → the same read-only **Cancellation Notes** row renders
- [ ] (e2e-candidate) As a rider enrolled in a cancelled lesson that already has cancellation notes recorded → the same read-only **Cancellation Notes** row renders
- [ ] (e2e-candidate) Clear the field and Save again → the **Cancellation Notes** row disappears entirely from the detail page
- [ ] (e2e-candidate) As manager, open an **unpaid** lesson's detail page, click **Delete** and confirm the browser prompt → the lesson disappears from the Lessons list
- [ ] (e2e-candidate) That deleted lesson also disappears from Finances
- [ ] (e2e-candidate) It leaves no **Cancelled** badge behind (it's gone, not cancelled)
- [ ] (e2e-candidate) No notification is sent to the instructor or riders for that delete
- [ ] (e2e-candidate) **Delete** is reachable the same way on an already-cancelled lesson
- [ ] (e2e-candidate) As trainer, no **Delete** button is shown on any lesson
- [ ] (e2e-candidate) On a **paid** (or $0-fee) lesson's detail page, **Delete** lands on `/barn/dev-barn/lessons/[id]/delete` rather than raising a browser prompt
- [ ] (e2e-candidate) That page shows the amount already collected for the lesson
- [ ] (e2e-candidate) Its "also delete the collected record" checkbox is unchecked by default
- [ ] (e2e-candidate) Confirm without checking it → the lesson is gone from the Lessons list
- [ ] (e2e-candidate) Its income still shows up in Finances for that month
- [ ] (e2e-candidate) Repeat on another paid lesson, this time checking the box → that lesson's income is also gone from Finances

Expenses (`/barn/dev-barn/expenses`):

- [ ] (e2e-candidate) Nav shows **Expenses** between Lessons and Horses
- [ ] (e2e-candidate) A seeded expense renders as a full-card link showing its date/time
- [ ] (e2e-candidate) That card shows its recipient
- [ ] (e2e-candidate) That card shows its expense type
- [ ] (e2e-candidate) That card shows its horse(s), or "Entire Barn"
- [ ] (e2e-candidate) That card shows its amount
- [ ] (e2e-candidate) The list is split into a recent and an older group
- [ ] (e2e-candidate) The older group is revealed by the **Show older expenses** toggle
- [ ] (e2e-candidate) At least one future-dated planned expense with no amount appears in the list
- [ ] (e2e-candidate) Tapping anywhere on an expense card opens its edit page
- [ ] (e2e-candidate) There is no separate row-level Delete link on the list
- [ ] (e2e-candidate) On `/barn/dev-barn/expenses/new`, enter a recipient seen before (e.g. "Dr. Hoof Farrier") and tab out — Expense Type auto-fills
- [ ] (e2e-candidate) That auto-filled Expense Type field flashes to draw attention to itself
- [ ] (e2e-candidate) Leaving the amount blank saves a planned expense
- [ ] (e2e-candidate) Re-opening that planned expense's form later lets you fill the amount in and save
- [ ] (e2e-candidate) Checking **Entire Barn** on the new-expense form disables the horse checkboxes
- [ ] (e2e-candidate) Saving that expense shows "Entire Barn" on its card instead of specific horses
- [ ] (e2e-candidate) On the new-expense form, setting the date to yesterday hides the Time field
- [ ] (e2e-candidate) Changing it back to today or a future date brings the Time field back
- [ ] (e2e-candidate) Editing a seeded expense (`/barn/dev-barn/expenses/[id]`) opens the form pre-filled with its stored values
- [ ] (e2e-candidate) That form opens with the correct Entire Barn / specific-horse checkbox state
- [ ] (e2e-candidate) Change the recipient and save → the card shows the new recipient
- [ ] (e2e-candidate) Change the amount and save → the card shows the new amount
- [ ] (e2e-candidate) On the new-expense form, set a **Payment Type**, save → it persists on reload
- [ ] (e2e-candidate) On the edit-expense form, set a **Payment Type**, save → it persists on reload
- [ ] (e2e-candidate) From the edit page, **Delete** on a seeded expense with **no amount set** opens a confirmation page headed "Confirm Delete"
- [ ] (e2e-candidate) That confirmation page carries no checkbox
- [ ] (e2e-candidate) Confirming it removes the expense from the list
- [ ] (e2e-candidate) Deleting a seeded expense **with an amount** shows an "Also delete the collected record from Finances" checkbox on the confirmation page
- [ ] (e2e-candidate) That checkbox is unchecked by default
- [ ] (e2e-candidate) Confirm that delete without checking the box — the expense is gone from the list
- [ ] (e2e-candidate) Its record still shows up in Finances for that month
- [ ] (e2e-candidate) Delete another seeded expense with an amount, this time checking the box — its record is also gone from Finances

Horses (`/barn/dev-barn/horses` and `/barn/dev-barn/horses/[id]`):

- [ ] (e2e-candidate) The Available section is sorted by total exertion (±3 days) ascending
- [ ] (e2e-candidate) Apple/Butter/Clover each show an exhaustion bar
- [ ] (e2e-candidate) Those bars land in different color bands from one another
- [ ] (e2e-candidate) Tapping a bar expands the ±3-day lesson breakdown
- [ ] (e2e-candidate) Tapping the bar again dismisses the breakdown
- [ ] (e2e-candidate) Tapping elsewhere dismisses the breakdown
- [ ] (e2e-candidate) Tapping the bar does not navigate to the horse detail page
- [ ] (e2e-candidate) Clover's detail page (no photo seeded) shows a placeholder icon
- [ ] (e2e-candidate) It also shows a **Set Photo** button
- [ ] (e2e-candidate) Tapping **Set Photo** navigates to the same upload screen used for horse documents
- [ ] (e2e-candidate) On that screen Document Type is locked to "Photo" with no dropdown
- [ ] (e2e-candidate) That screen has no Notes field
- [ ] (e2e-candidate) That screen has no Expiration reminder date field
- [ ] (e2e-candidate) Tap **Choose File** and select a non-square JPG or PNG → the upload starts immediately, with no separate Upload button to click
- [ ] (e2e-candidate) You land back on the horse detail page with the photo displayed
- [ ] (e2e-candidate) That photo is scaled to a fixed height with its aspect ratio preserved, not cropped to a square
- [ ] (e2e-candidate) With a photo set, tap **Replace Photo** and choose a different image → the upload starts immediately
- [ ] (e2e-candidate) The new photo displays
- [ ] (e2e-candidate) Reload the page after replacing a photo → the old photo is gone (confirms it wasn't just a stale client-side preview)
- [ ] (e2e-candidate) With a photo set, tap **Remove** → the placeholder icon returns
- [ ] (e2e-candidate) The **Set Photo** button returns with it
- [ ] (e2e-candidate) On the photo upload screen, attempt to select a PDF → rejected with an inline error, not a crash
- [ ] (e2e-candidate) As manager, set a photo on Apple (never assigned an owning member anywhere in this checklist, so the owner-lock can't apply) → succeeds
- [ ] (e2e-candidate) Replace Apple's photo again as manager → still succeeds (manager-set photos never lock out other managers)
- [ ] (e2e-candidate) On Apple's detail page, the manager form and Exhaustion Thresholds share a single **Save** button
- [ ] (e2e-candidate) Rename Apple, uncheck "Use barn defaults", set Moderate/High and Save → the name updates
- [ ] (e2e-candidate) The thresholds update from that same Save
- [ ] (e2e-candidate) A brief "✓ Saved" confirmation appears next to the Save button
- [ ] (e2e-candidate) Both values persist on reload
- [ ] (e2e-candidate) The "Use barn defaults" toggle is still unchecked on reload
- [ ] (e2e-candidate) The manager form's name field is labeled **Barn Name**
- [ ] (e2e-candidate) Fill in **Registered Name** (e.g. "Four-Leaf Clover") → Save → it persists on reload
- [ ] (e2e-candidate) Apple's card on the Horses list now shows "Apple (Four-Leaf Clover)"
- [ ] (e2e-candidate) As a trainer, a horse seeded with a registered name shows a **Registered Name** row below Status on its detail page
- [ ] (e2e-candidate) As a rider, that same horse shows the **Registered Name** row below Status
- [ ] (e2e-candidate) (#1000) As manager, make yourself the owning member of Clover (Access section) → a **My Horses** section appears at the top of the Horses list
- [ ] (e2e-candidate) (#1000) Clover appears under **My Horses**
- [ ] (e2e-candidate) (#1000) Clover shows a green **Active** badge there
- [ ] (e2e-candidate) (#1000) Clover no longer appears under Available
- [ ] (e2e-candidate) Clear **Registered Name** back to blank and Save → the card's parenthetical is gone on reload
- [ ] (e2e-candidate) As a trainer, a horse seeded with no registered name shows no **Registered Name** row on its detail page
- [ ] (e2e-candidate) As a rider, that same horse shows no **Registered Name** row
- [ ] (e2e-candidate) Re-check "Use barn defaults" and Save → thresholds revert to barn defaults (`5`/`11`) on reload — **known limitation, accepted as-is**: the Moderate/High inputs don't visually refresh until reload
- [ ] (e2e-candidate) With "Use barn defaults" unchecked, try Moderate ≥ High → rejected with a field error
- [ ] (e2e-candidate) No "✓ Saved" confirmation appears for that rejected save
- [ ] (e2e-candidate) The horse's name and status are unchanged by it
- [ ] (e2e-candidate) The thresholds are unchanged by it
- [ ] (e2e-candidate) Fill in **Feed Notes** → Save → it persists on reload
- [ ] (e2e-candidate) Fill in **Medication Notes** → Save → it persists on reload
- [ ] (e2e-candidate) Clear **Feed Notes** back to blank and Save → the field is empty on reload (confirms `NULL` clears it, not just an empty-string no-op)
- [ ] (e2e-candidate) Documents section: tap **Add Document**, upload a PDF → redirects back to this horse's page
- [ ] (e2e-candidate) That document is listed in the horse's Documents section
- [ ] (e2e-candidate) Open the document via its link (signed URL)
- [ ] (e2e-candidate) Delete it → row disappears
- [ ] (e2e-candidate) On the Add Document page, attempt to upload a document over 4.5MB — rejected with an inline error, not a crash
- [ ] (e2e-candidate) On the Add Document page, the Upload button disables while the upload is pending
- [ ] (e2e-candidate) An indeterminate progress bar shows while the upload is pending
- [ ] (e2e-candidate) Upload another document with an **Expiration reminder date** set → the date persists in the Reminder Date column
- [ ] (e2e-candidate) Edit that date inline (tap the field, change the date, tap away) → the new date saves
- [ ] (e2e-candidate) That inline edit saves without a page reload
- [ ] (e2e-candidate) Set that document's Reminder Date to a past date → a **Reminder Due** badge appears next to the date
- [ ] (e2e-candidate) A card for it shows up under the Dashboard's Reminders section
- [ ] (e2e-candidate) That card links back to this horse

Members (`/barn/dev-barn/members` and `/barn/dev-barn/members/[membership_id]`):

- [ ] (e2e-candidate) A "You" card renders at the top of the Members list
- [ ] (e2e-candidate) A **Managers** section renders, listing Morgan
- [ ] (e2e-candidate) Your own entry is excluded from that Managers section
- [ ] (e2e-candidate) A **Trainers** section renders
- [ ] (e2e-candidate) A **Riders** section renders
- [ ] (e2e-candidate) A trainer's member detail page shows a Phone row under **Contact Info**
- [ ] (e2e-candidate) It shows an Emergency Contact Name row
- [ ] (e2e-candidate) It shows an Emergency Contact Phone row
- [ ] (e2e-candidate) Any of those three left blank renders as "—"
- [ ] (e2e-candidate) Managed/unclaimed rider Harper Test's member detail page renders their name even though the account has no linked `user_id`
- [ ] (e2e-candidate) That page renders **Contact Info** too
- [ ] (e2e-candidate) Its Documents section renders normally, not blocked
- [ ] (e2e-candidate) That Documents section has an **Add Document** button
- [ ] (e2e-candidate) On Harper Test's member detail page, **Contact Info** is an editable form (manager viewing an unclaimed/managed member)
- [ ] (e2e-candidate) Set Phone, Emergency Contact Name and Emergency Contact Phone there and tap **Save** → the values persist on reload
- [ ] (e2e-candidate) On Harper Test's member detail page, tap **Set Photo** and choose a JPG or PNG → the upload starts immediately
- [ ] (e2e-candidate) You land back on the member page
- [ ] (e2e-candidate) The photo displays there
- [ ] (e2e-candidate) With Harper Test's photo set, tap **Replace Photo** and choose a different image → the new photo displays
- [ ] (e2e-candidate) With Harper Test's photo set, tap **Remove** → the placeholder returns
- [ ] (e2e-candidate) The **Set Photo** button returns with it
- [ ] (e2e-candidate) A claimed trainer's member detail page shows no **Set Photo**/**Replace Photo**/**Remove** control (manager can't edit a claimed member's photo)
- [ ] (e2e-candidate) On your own manager member detail page, tap **Set Photo** and upload one → the photo displays
- [ ] (e2e-candidate) That photo persists on reload
- [ ] (e2e-candidate) Tap **Add Document** on Harper Test's page and upload a document → redirects back to the member page
- [ ] (e2e-candidate) The document is listed there
- [ ] (e2e-candidate) Its signed-URL link opens the document
- [ ] (e2e-candidate) Delete it → row disappears
- [ ] (e2e-candidate) A trainer's member detail page has an **Add Document** button
- [ ] (e2e-candidate) That button links to the shared `/barn/dev-barn/documents/new?entity=trainer&id=<id>` page
- [ ] (e2e-candidate) Rider Gale Test's member detail page has an **Add Document** button
- [ ] (e2e-candidate) That button links to `/barn/dev-barn/documents/new?entity=rider&id=<id>`
- [ ] (e2e-candidate) As manager, rider Emery's member detail page shows an **Active Agreements** header
- [ ] (e2e-candidate) It shows a card for her seeded lease agreement
- [ ] (e2e-candidate) It shows a card for her seeded boarding agreement
- [ ] (e2e-candidate) Each of those cards names its kind (lease or boarding)
- [ ] (e2e-candidate) Each names its horse
- [ ] (e2e-candidate) Each shows its fee
- [ ] (e2e-candidate) Each links to its agreement detail page
- [ ] (e2e-candidate) A rider with no active agreements shows **No active agreements** instead
- [ ] (e2e-candidate) That empty state carries no add-boarding link
- [ ] (e2e-candidate) A managed (unclaimed) rider's detail page shows the same **Active Agreements** section
- [ ] (e2e-candidate) A trainer's member detail page shows an **Instructor Access** section reading **Revoke Instructor Access** (trainers default to `can_instruct=true`)
- [ ] (e2e-candidate) Tapping it raises a browser confirm prompt naming the trainer
- [ ] (e2e-candidate) That prompt warns they'll no longer be assignable to future lessons
- [ ] (e2e-candidate) **Cancel** it → access is unchanged
- [ ] (e2e-candidate) Tap **Revoke Instructor Access** again and confirm → the button now reads **Grant Instructor Access**
- [ ] (e2e-candidate) That trainer no longer appears in the instructor select on the new-lesson form
- [ ] (e2e-candidate) Tapping **Grant Instructor Access** raises no confirm prompt
- [ ] (e2e-candidate) The trainer reappears in the instructor select afterwards
- [ ] (e2e-candidate) Your own manager member detail page shows an **Instructor Access** section reading **Grant Instructor Access**
- [ ] (e2e-candidate) Tapping it raises no confirm prompt
- [ ] (e2e-candidate) You then appear in the instructor select on the new-lesson form
- [ ] (e2e-candidate) Tapping **Revoke Instructor Access** to undo does raise a confirm prompt
- [ ] (e2e-candidate) Rider Gale Test's member detail page shows no **Instructor Access** section
- [ ] (e2e-candidate) Indigo Test's member detail page shows a **Remove** button top-right of the header, next to the member's name
- [ ] (e2e-candidate) Tap it and confirm the browser prompt → you're redirected to the Members list
- [ ] (e2e-candidate) Indigo Test no longer appears on that list
- [ ] (e2e-candidate) Your own manager member detail page shows no **Remove** button
- [ ] (e2e-candidate) Second manager Morgan Manager's member detail page shows no **Remove** button either (managers can't remove other managers)

Finances (`/barn/dev-barn/finances`):

- [ ] (manual) The Finances page as a whole — Outstanding sections, tab pills, and every tab's table/footer — looks clean and visually consistent (spacing, alignment, typography) with the rest of the app
- [ ] (e2e: outstanding_income_lists_past_unpaid_lesson) **Outstanding Income** section (renamed from "Outstanding") lists past unpaid lessons
- [ ] (e2e: outstanding_income_row_leaves_list_once_payment_type_set) Set a payment type on one **Outstanding Income** row via the inline dropdown → it leaves the list
- [ ] (e2e: outstanding_income_lesson_date_renders_in_viewer_timezone) A lesson row's date in **Outstanding Income** matches the wall-clock time you entered for that lesson, not shifted by your UTC offset
- [ ] (e2e: by_horse_drilldown_lesson_date_renders_in_viewer_timezone) That same lesson's date in the **By Horse** drill-down matches the wall-clock time you entered, not shifted by your UTC offset
- [ ] (e2e: by_rider_drilldown_lesson_date_renders_in_viewer_timezone) That same lesson's date in the **By Rider** drill-down matches the wall-clock time you entered, not shifted by your UTC offset
- [ ] (e2e: by_instructor_drilldown_lesson_date_renders_in_viewer_timezone) That same lesson's date in the **By Instructor** drill-down matches the wall-clock time you entered, not shifted by your UTC offset
- [ ] (e2e: outstanding_income_lease_charge_date_renders_as_plain_calendar_date) A lease/boarding charge row's date, in contrast, is unaffected by timezone (it's a plain calendar date, not a time-of-day instant)
- [ ] (e2e: late_cancelled_unpaid_lesson_raises_an_outstanding_cancellation_fee) Late-cancel an **unpaid** normal lesson (**Cancelled by Rider**, within 24 hours of `lesson_at`) → a **Cancellation Fee** row for it appears in **Outstanding Income** with a **Type** of "Cancellation Fee"
- [ ] (e2e: late_cancelled_paid_lesson_raises_no_cancellation_fee) The same late cancellation on a lesson that was **already marked paid** raises **no** Cancellation Fee row — the rider has already paid for that lesson and must not be billed twice
- [ ] (e2e: cancellation_fee_leaves_the_list_once_payment_type_set) Mark that cancellation fee paid via the inline dropdown → it leaves the list
- [ ] (e2e: outstanding_expenses_total_sums_only_entries_with_a_known_amount) The **Outstanding Expenses** section (renamed from "Needs an amount", below Outstanding Income) shows a bold total above the list, summing only the expenses in it that have a known amount
- [ ] (e2e: outstanding_expenses_lists_past_due_planned_expense_as_one_line) **Outstanding Expenses** lists the seeded past-due planned expense as a single line (date — recipient — expense type)
- [ ] (e2e: past_due_planned_expense_absent_from_outstanding_income_table) That past-due planned expense does **not** appear inside the Outstanding Income table itself
- [ ] (e2e: outstanding_expenses_info_icon_explains_why_an_entry_is_listed) Tap the ⓘ info icon on **Outstanding Expenses** → shows explanatory text that an entry is listed for a missing amount, a missing payment type, or both
- [ ] (e2e: past_due_expense_line_links_to_its_edit_page) Tap the past-due expense's line in **Outstanding Expenses** → lands on its edit page
- [ ] (e2e: past_due_expense_still_outstanding_after_amount_entered_without_payment_type) Enter an amount on it (leave Payment Type unset) and save → back on Finances, it still appears under **Outstanding Expenses**
- [ ] (e2e: past_due_expense_amount_now_counts_toward_the_outstanding_expenses_total) That same expense now contributes its amount to the **Outstanding Expenses** bold total instead of $0
- [ ] (e2e: past_due_expense_amount_added_to_every_tab_expenses_total) That same expense contributes its amount to every tab's footer Total for Expenses that month
- [ ] (e2e: past_due_expense_amount_added_to_its_horses_expenses_column) That same expense also contributes to the By Horse tab's own Expenses column for its horse
- [ ] (e2e: past_due_expense_leaves_outstanding_expenses_once_payment_type_set) Now set a Payment Type on that same expense and save → it disappears from **Outstanding Expenses** entirely
- [ ] (e2e: outstanding_page_lists_every_type_of_outstanding_item) "View all outstanding" → `/barn/dev-barn/finances/outstanding` lists all barn outstanding lessons, leases/boarding charges, and cancellation fees
- [ ] (e2e: outstanding_page_lesson_and_cancellation_fee_rows_link_to_their_lesson) On that page, each lesson/cancellation-fee row links to its lesson
- [ ] (e2e: outstanding_page_omits_outstanding_expenses) Outstanding expenses do **not** appear on that page (no Outstanding Expenses equivalent there)
- [ ] (e2e: month_navigation_arrows_update_the_month_query_param) Month navigation `←`/`→` works and updates `?month=YYYY-MM`
- [ ] (e2e: previous_month_reflects_its_own_seeded_lesson) Navigate to the previous month → the previous month's seeded lesson is reflected
- [ ] (e2e: pending_income_line_appears_once_below_the_outstanding_sections) Below the Outstanding sections, only a single **Pending income** line appears for the current month
- [ ] (e2e: pending_income_line_has_no_month_year_suffix) That **Pending income** line carries no month/year suffix (the month picker above already shows it)
- [ ] (e2e: no_gross_expenses_net_summary_boxes_remain_on_the_page) No Gross Income / Total Expenses / Net Income summary boxes appear above the Pending income line (#971 removed them, since their numbers didn't reconcile with any one breakdown table below)
- [ ] (e2e: every_tab_shows_the_same_gross_expenses_net_columns) Every tab shows uniform **Gross | Expenses | Net** columns (`—` for a column a tab has no concept of)
- [ ] (e2e: every_tab_footer_lists_the_reconciliation_rows_in_order) Every tab ends in a footer with **Subtotal / Unattributed / Outside this view / Total** rows, in that order
- [ ] (e2e: by_horse_is_the_default_tab_on_page_load) **By Horse** is the default tab on page load (no `?tab=` needed)
- [ ] (e2e: by_horse_tab_shows_horse_gross_expenses_net_columns) **By Horse** tab shows **Horse | Gross | Expenses | Net** columns
- [ ] (e2e: by_horse_horse_name_is_underlined_without_hovering) By Horse's horse name is an underlined link (not just underlined on hover)
- [ ] (e2e: by_horse_expenses_column_grows_by_the_new_expense_amount) Add an expense for a horse with a lesson this month → its Expenses column updates
- [ ] (e2e: by_horse_net_column_shrinks_by_the_new_expense_amount) That same horse's Net column updates too
- [ ] (e2e: by_horse_shows_a_dash_for_a_horse_with_no_expenses) A horse with `$0` expenses shows **—** (not `$0.00` or blank)
- [ ] (e2e: by_horse_lists_a_horse_with_expenses_and_no_lessons_at_zero_gross) A horse with expenses but no lessons this month still appears in the list, with `$0.00` Gross
- [ ] (e2e: by_horse_net_is_negative_for_a_horse_with_expenses_and_no_lessons) That same horse's Net is negative
- [ ] (e2e: horse_drilldown_combines_lessons_charges_and_expenses_in_one_table) Click a horse → drill-down `/barn/dev-barn/finances/horses/[id]` shows one combined table of lessons, leases/boarding charges, and expenses
- [ ] (e2e: horse_drilldown_rows_are_ordered_by_date_ascending) The horse drill-down's combined table is ordered by date ascending
- [ ] (e2e: horse_drilldown_table_has_a_type_column) The horse drill-down's combined table has a **Type** column
- [ ] (e2e: horse_drilldown_expense_amount_renders_in_parentheses) The horse drill-down's expense **Amount** renders in parentheses (e.g. `($25.00)`)
- [ ] (e2e: horse_drilldown_expense_split_renders_in_parentheses) The horse drill-down's expense **Split** renders in parentheses too
- [ ] (e2e: horse_drilldown_net_is_the_by_horse_net_less_the_horses_share_of_its_lessons_instructor_cuts) The horse drill-down's bottom **Net** figure equals this horse's Net on the By Horse tab **minus this horse's share of the instructor cut on each of its lessons that month** — a lesson's cut is split across its horses exactly as its fee is, so on a two-horse lesson the gap is half that lesson's cut, not all of it. The two figures are deliberately not the same number: #971 made the By Horse/By Rider summary figures pre-cut gross (`splitsGrossFee`), but left the drill-down's per-lesson rows net of each lesson's own snapshotted cut
- [ ] (e2e: horse_drilldown_link_preserves_the_month_param) The horse drill-down preserves the month param
- [ ] (e2e: by_horse_rows_load_sorted_by_horse_name_ascending) On page load, By Horse rows are sorted by **Horse** name ascending (A→Z)
- [ ] (e2e: by_horse_horse_header_shows_an_ascending_indicator_on_load) On page load, a ▲ appears next to By Horse's **Horse** header
- [ ] (e2e: by_horse_gross_header_tap_sorts_rows_by_gross_ascending) Tap the **Gross** header on By Horse → rows re-sort by that column ascending
- [ ] (e2e: by_horse_gross_header_tap_moves_the_ascending_indicator_to_gross) After tapping **Gross**, a ▲ appears on the Gross header (and disappears from Horse)
- [ ] (e2e: by_horse_gross_header_tap_does_not_change_the_url) Tapping a sort header does not change the URL (no `?sort=` param, no page reload)
- [ ] (e2e: by_horse_second_gross_header_tap_reverses_the_order) Tap the **Gross** header again → order reverses
- [ ] (e2e: by_horse_second_gross_header_tap_flips_the_indicator_to_descending) After that second tap, the indicator flips to ▼
- [ ] (e2e: gross_header_info_icon_reveals_its_explanation) Tap the ⓘ next to a **Gross**/**Expenses**/**Net** header on any tab → shows explanatory text
- [ ] (e2e: gross_header_info_icon_tap_does_not_trigger_a_sort) Tapping that ⓘ does **not** trigger a sort (the icon sits beside, not inside, the sort button)
- [ ] (e2e: by_tier_tab_lists_every_barn_tier) **By Tier** tab (no longer default, still reachable via the pill) lists your new tiers and seeded tiers
- [ ] (e2e: by_tier_column_order_is_tier_gross_expenses_net) By Tier's column order is **Tier | Gross | Expenses | Net** — no Price column, no Lessons count column
- [ ] (e2e: by_tier_expenses_column_sums_the_tiers_snapshotted_cuts) By Tier's Expenses column (renamed from "Instructor Cut") sums that tier's lessons' own snapshotted cuts
- [ ] (e2e: by_tier_expenses_column_shows_a_dash_when_snapshotted_cuts_total_zero) By Tier's Expenses column shows `—` for a tier whose snapshotted cuts total zero
- [ ] (e2e: by_tier_row_gross_equals_net_plus_expenses) For a tier's row, Gross equals Net plus Expenses
- [ ] (e2e: tier_with_no_paid_lessons_still_appears_with_zero_gross_and_net) A tier with no paid lessons this month still appears (alongside at least one tier that did collect something), with `$0.00` Gross/Net (not omitted from the list)
- [ ] (e2e: by_tier_expenses_column_mixes_old_and_new_instructor_cut_rates) Edit a tier's instructor cut, book a new lesson under it, and confirm the tier's Expenses column reflects a mix of the old and new per-lesson rates rather than the new rate × total count
- [ ] (e2e: by_tier_shows_empty_state_in_a_month_with_no_collected_income) **By Tier empty-state check** (#971): navigate to a month where **no** tier collected any lesson income and no lease/boarding charge was collected either → **By Tier** shows its `EmptyState` instead of a table full of `$0.00` rows (the #771 per-active-tier backfill alone must not keep the table visible)
- [ ] (e2e: by_tier_shows_its_table_in_a_charge_only_month) **By Tier charge-only check**: navigate to a month with **no** lesson income but **one** collected lease/boarding charge → **By Tier** shows its table, not `EmptyState`
- [ ] (e2e: charge_only_month_gross_appears_in_the_outside_this_view_footer_row) In that charge-only month, the charge amount is reflected in By Tier's footer **Outside this view** row for Gross
- [ ] (e2e: by_tier_rows_load_sorted_by_tier_name_ascending) On page load, By Tier rows are sorted by **Tier** name ascending
- [ ] (e2e: by_tier_tier_header_carries_the_ascending_indicator_on_load) On page load, a ▲ appears next to By Tier's **Tier** header
- [ ] (e2e: tapping_the_net_header_sorts_by_net_ascending) Tap the **Net** header on By Tier → rows re-sort by that column ascending
- [ ] (e2e: tapping_the_net_header_moves_the_ascending_indicator_to_net) After tapping **Net** on By Tier, a ▲ appears on the Net header (and disappears from Tier)
- [ ] (e2e: tapping_the_net_header_twice_reverses_the_order) Tap the **Net** header on By Tier again → order reverses
- [ ] (e2e: tapping_the_net_header_twice_flips_the_indicator_to_descending) After that second tap on By Tier, the indicator flips to ▼
- [ ] (e2e: by_rider_tab_shows_rider_gross_expenses_net_columns) **By Rider** tab shows **Rider | Gross | Expenses | Net** columns
- [ ] (e2e: by_rider_expenses_column_is_always_a_dash) By Rider's Expenses column is always `—` (no rider-level expense concept)
- [ ] (e2e: by_rider_expenses_header_is_not_sortable) By Rider's Expenses header isn't clickable/sortable
- [ ] (e2e: by_rider_net_column_equals_gross_in_every_row) By Rider's Net always equals Gross
- [ ] (e2e: by_rider_name_is_an_underlined_link_to_the_rider_drilldown) By Rider's rider name is an underlined link to drill-down `/barn/dev-barn/finances/riders/[id]`
- [ ] (e2e: rider_drilldown_combines_lessons_and_agreement_charges_in_one_table) The rider drill-down shows one combined table of lessons and leases/boarding charges, matching the By Horse drill-down's layout
- [ ] (e2e: rider_drilldown_rows_are_ordered_by_date_ascending) The rider drill-down's combined table is ordered by date ascending
- [ ] (e2e: rider_drilldown_table_has_a_type_column) The rider drill-down's combined table has a **Type** column
- [ ] (e2e: rider_drilldown_total_is_the_by_rider_gross_less_the_instructor_cut) The rider drill-down's bottom **Total** equals that rider's **Gross** on the By Rider tab less that rider's share of the instructor cut on their lessons this month (a lesson's cut is split across its riders, exactly as its fee is — so a solo lesson's whole cut, half of a two-rider lesson's) — the tab is pre-cut since #971, the drill-down is net-of-cut
- [ ] (e2e: rider_drilldown_preserves_the_month_param) The rider drill-down preserves the month param
- [ ] (e2e: by_rider_rows_load_sorted_by_rider_name_ascending) On page load, By Rider rows are sorted by **Rider** name ascending
- [ ] (e2e: by_rider_rider_header_shows_an_ascending_indicator_on_load) On page load, a ▲ appears next to By Rider's **Rider** header
- [ ] (e2e: by_rider_gross_header_tap_re_sorts_rows_ascending) Tap the **Gross** header on By Rider → rows re-sort ascending
- [ ] (e2e: by_rider_net_header_tap_produces_the_same_order_as_gross) Tap the **Net** header on By Rider instead → identical resulting order to sorting by Gross (both share a sort key, since the two columns are always equal for this tab)
- [ ] (e2e: by_instructor_tab_shows_trainer_gross_expenses_net_columns) **By Instructor** tab shows **Trainer | Gross | Expenses | Net** columns
- [ ] (e2e: by_instructor_gross_is_the_trainers_pre_cut_lesson_fees) By Instructor's Gross is the trainer's pre-cut lesson fees
- [ ] (e2e: by_instructor_expenses_column_is_the_deducted_instructor_cut) By Instructor's Expenses column (renamed from "Instructor Cut") is the deducted amount
- [ ] (e2e: by_instructor_expenses_column_renders_the_cut_in_parentheses) That deducted amount renders in parentheses, e.g. `($25.00)`, not with a leading minus sign
- [ ] (e2e: by_instructor_net_is_gross_minus_the_instructor_cut) By Instructor's Net is the take-home figure
- [ ] (e2e: by_instructor_trainer_name_is_an_underlined_link) By Instructor's trainer name is an underlined link (not just underlined on hover)
- [ ] (e2e: by_instructor_trainer_name_links_to_the_trainer_drilldown) By Instructor's trainer name links to drill-down `/barn/dev-barn/finances/trainers/[id]`
- [ ] (e2e: trainer_drilldown_table_lists_only_that_trainers_paid_lessons) The trainer drill-down shows one table of that trainer's paid lessons
- [ ] (e2e: trainer_drilldown_date_cell_links_to_its_lesson) The trainer drill-down's date column links to the lesson
- [ ] (e2e: trainer_drilldown_type_column_is_always_lesson) The trainer drill-down's **Type** column is always "Lesson"
- [ ] (e2e: trainer_drilldown_amount_is_net_of_the_instructor_cut) The trainer drill-down's fee is net of the instructor cut
- [ ] (e2e: trainer_drilldown_total_matches_the_by_instructor_net_figure) The trainer drill-down's bottom **Total** matches the By Instructor summary's Net figure
- [ ] (e2e: trainer_drilldown_preserves_the_month_param) The trainer drill-down preserves the month param
- [ ] (e2e: by_instructor_rows_load_sorted_by_trainer_name_ascending) On page load, By Instructor rows are sorted by **Trainer** name ascending
- [ ] (e2e: by_instructor_trainer_header_carries_the_ascending_indicator_on_load) On page load, a ▲ appears next to By Instructor's **Trainer** header
- [ ] (e2e: tapping_net_header_re_sorts_by_net_ascending) Tap the **Net** header on By Instructor → rows re-sort by that column ascending
- [ ] (e2e: tapping_net_header_moves_the_ascending_indicator_to_net) After tapping **Net** on By Instructor, a ▲ appears on the Net header (and disappears from Trainer)
- [ ] (e2e: tapping_net_header_twice_reverses_the_row_order) Tap the **Net** header on By Instructor again → order reverses
- [ ] (e2e: tapping_net_header_twice_flips_the_indicator_to_descending) After that second tap on By Instructor, the indicator flips to ▼
- [ ] (e2e-candidate) Mark a $0 (comped) lesson paid → its net contribution is negative (cut with no fee to offset it)
- [ ] (e2e-candidate) That comped lesson's negative net renders in parentheses, e.g. `($25.00)`, not with a leading minus sign
- [ ] (e2e-candidate) That comped lesson is still included in every tab's Gross/Net totals (not dropped or clamped to zero)
- [ ] (e2e-candidate) Mark the lease's first charge as paid (`/barn/dev-barn/agreements/[id]` → set Payment Type) → back on Finances, **By Tier**'s footer **Outside this view** row for Gross increases by the charge amount (a charge has no tier)
- [ ] (e2e-candidate) Same charge: **By Instructor**'s footer **Outside this view** row for Gross also increases by the charge amount (a charge has no instructor)
- [ ] (e2e-candidate) Same charge: **By Horse** (Apple)'s Gross total includes the full charge amount directly (a charge is horse-tied)
- [ ] (e2e-candidate) Drilling into Apple's row shows the charge as a row in the combined table with a working link back to the agreement
- [ ] (e2e-candidate) Same charge: **By Rider** (Dana)'s Gross total includes the full charge amount directly (a charge is rider-tied)
- [ ] (e2e-candidate) On that trainer's member detail page, tap **Remove** and confirm the browser prompt after they've instructed a paid lesson → you're redirected to the Members list
- [ ] (e2e-candidate) The removed trainer no longer appears on the Members list
- [ ] (e2e-candidate) Back on Finances, that lesson's fee is still counted, now folded into **By Instructor**'s footer **Unattributed** row
- [ ] (e2e-candidate) By Instructor no longer shows a "No instructor" body row for that lesson
- [ ] (e2e-candidate) Tap the **Unattributed** row's ⓘ on By Instructor → the explanation covers a removed instructor
- [ ] (e2e-candidate) **By Paid To** tab shows **Recipient | Gross | Expenses | Net** columns
- [ ] (e2e-candidate) By Paid To's Gross and Net are always `—` (a recipient has no revenue concept)
- [ ] (e2e-candidate) By Paid To's Expenses column (renamed from "Expense Amount") is the recipient's total
- [ ] (e2e-candidate) By Paid To's recipient name is an underlined link (not just underlined on hover)
- [ ] (e2e-candidate) On page load, By Paid To rows are sorted by **Recipient** name ascending
- [ ] (e2e-candidate) On page load, a ▲ appears next to By Paid To's **Recipient** header
- [ ] (e2e-candidate) Tap the **Expenses** header on By Paid To → rows re-sort by that column ascending
- [ ] (e2e-candidate) After tapping **Expenses** on By Paid To, a ▲ appears on the Expenses header (and disappears from Recipient)
- [ ] (e2e-candidate) Tap the **Expenses** header on By Paid To again → order reverses
- [ ] (e2e-candidate) After that second tap on By Paid To, the indicator flips to ▼
- [ ] (e2e-candidate) Add a second expense for the same recipient this month → its **By Paid To** total updates to the combined amount
- [ ] (e2e-candidate) Click a recipient → drill-down `/barn/dev-barn/finances/expenses/[recipient]` lists that recipient's expenses for the month with Date, Type, Amount columns
- [ ] (e2e-candidate) The recipient drill-down's Date column links to the expense's edit page
- [ ] (e2e-candidate) The recipient drill-down's bottom **Total** matches the By Paid To summary
- [ ] (e2e-candidate) A recipient name containing `&` or spaces (e.g. seed a "Dr. Smith & Sons" expense) round-trips correctly through the drill-down link — no broken/garbled URL
- [ ] (e2e-candidate) **Reconciliation check** (#971): open all five tabs for the same month → each one's footer **Total** row shows the identical Gross figure
- [ ] (e2e-candidate) Reconciliation, same five tabs: each one's footer **Total** row shows the identical Expenses figure
- [ ] (e2e-candidate) Reconciliation, same five tabs: each one's footer **Total** row shows the identical Net figure
- [ ] (e2e-candidate) **Unattributed-expense check** (#971): delete a paid expense from `/barn/dev-barn/expenses/[id]/delete` **without** checking "Also delete the collected record from Finances" (its `transactions` row survives with no `horse_expenses` row behind it) → back on Finances, that amount appears under **Unattributed** in the By Horse footer instead of silently disappearing
- [ ] (e2e-candidate) That same amount appears under **Unattributed** in the By Paid To footer
- [ ] (e2e-candidate) Tap the ⓘ on **By Horse**'s **Unattributed** row → the explanation covers a paid lesson with no horse recorded, or an expense record whose original entry was deleted after being marked paid, and states that a barn-wide expense split across horses is never counted here (it appears in each horse's own row instead)
- [ ] (e2e-candidate) Tap the ⓘ on **By Paid To**'s **Unattributed** row → the explanation covers an expense record whose original entry was deleted after being marked paid

Manage Barn (`/barn/dev-barn/settings`):

- [ ] Sections render as collapsible accordions, collapsed by default; clicking a section's heading toggles it open/closed independently of the others; there is no "Active Members" section (member removal now lives on each member's own detail page — see Members phase above)
- [ ] **Default Instructor Cut** field shows the current value (default `25`)
- [ ] Change it and **Save** → value persists on reload; confirm the helper text says the change doesn't affect past lessons, not that it recalculates historical income
- [ ] Try `0` — allowed
- [ ] Try blank — rejected, field stays unchanged
- [ ] Edit a tier (`/barn/dev-barn/settings/tiers/[id]`): change its price → an amber warning appears noting past lessons are unaffected; revert to the original price → warning disappears → Save
- [ ] On that same tier edit page, change its **Instructor Cut** → the same style amber warning appears ("won't affect past lessons"); revert → warning disappears; **Add Tier** a new tier and confirm its Instructor Cut field pre-fills from the barn's Default Instructor Cut
- [ ] Set a different tier as **default** → new-lesson form pre-selects it
- [ ] **Deactivate** the Group Special tier → it no longer appears when creating a lesson; **reactivate** it
- [ ] Edit **Default Board Fee**, confirm the non-retroactive helper text is visible → Save → a pre-existing boarding agreement's fee is unchanged, but a newly created boarding agreement pre-fills the new fee
- [ ] **Horse Exhaustion Thresholds** fields show the current Moderate/High values (defaults `5`/`11`)
- [ ] Change both and **Save** → values persist on reload
- [ ] Try setting Moderate ≥ High → rejected with a field error and values unchanged
- [ ] **Schedule Buffer** field shows the current value (default `30`)
- [ ] Change it and **Save** → value persists on reload
- [ ] **Barn Timezone** select shows the current value (default Eastern); change it and Save → persists on reload; add a planned expense due a few minutes from now, wait for its due time to pass, then confirm it now surfaces under Finances' **Outstanding Expenses** section — proves the barn timezone setting, not just the display, actually drives the past-due check
- [ ] **Add Event** under Barn Events (`/barn/dev-barn/settings/events/new`): the three **Visible to** role checkboxes (Manager, Trainer, Rider) are all checked by default
- [ ] Create an event with a title, date/hour, and notes → it appears in the Barn Events list with the correct title, date, and "manager, trainer, rider" visible-to text
- [ ] **Edit** that event and uncheck the Rider checkbox → Save → reopening Edit shows Rider unchecked and Manager/Trainer still checked
- [ ] From the event's Edit page, tap **Delete** → confirm page shows the event's title → **Confirm Delete** → event no longer appears in the Barn Events list
- [ ] **Data Backup** section shows a **Download All Documents** button, enabled (documents were already uploaded earlier in this phase)
- [ ] Tap **Download All Documents** → a `.zip` downloads; open it and confirm it contains `horse/<name>/` and `member/<name>/` folders holding the documents uploaded earlier, each file named `<original>-<type>-<date>.<ext>`
- [ ] **Data Backup** section also shows a **Download Data** button, always enabled (no "nothing to export" state)
- [ ] Tap **Download Data** → an `.xlsx` downloads; open it and confirm it has 8 sheets (Horses, Lessons, Agreements, Agreement Charges, Horse Expenses, Members, Documents, All Transactions) and a horse/lesson/member created earlier in this phase appears by name (not a raw id) on the expected sheet

Notifications and profile:

- [ ] Notification bell shows an unread-count badge; opening it lists notifications with title/body/timestamp
- [ ] **Mark all read** clears the badge
- [ ] Avatar menu → **Profile** (`/profile?barn=dev-barn`): barn nav bar renders with the **full 9-link manager nav** (Lessons, Expenses, Horses, Leases, Boarding, Members, Finances, Manage Barn, Guide) — same set as the regular barn pages; edit phone → Save → redirected back to the barn
- [ ] Avatar menu → **User Guide** (`/barn/dev-barn/guide`) renders the manager guide
- [ ] Avatar menu → **About** (`/about`) renders the app overview
- [ ] The **Changelog** link on `/about` includes the current version and opens `/changelog`
- [ ] The **Terms of Service** link on `/about` opens `/terms`
- [ ] The **Privacy Policy** link on `/about` opens `/privacy`
- [ ] The **← Back** link on `/about`, `/changelog`, `/terms`, and `/privacy` returns to `/barns`

Mobile spot-check (resize the browser to ~390px wide, or use your browser's device toolbar):

- [ ] Nav bar and its dropdowns (avatar menu, notification bell) remain usable — reachable and dismissible by tap, with no reliance on hover
- [ ] Lessons and Horses lists stay readable without horizontal scrolling

Calendar feed (#1018):

- [ ] On `/profile?barn=dev-barn`, a **Calendar Feed** section appears; tap **Get my calendar link** — **Copy Link** and **Regenerate** appear
- [ ] Tap **Copy Link** — the copied URL contains `/calendar.ics?token=...`
- [ ] Open that URL directly (or `curl` it) — returns `Content-Type: text/calendar` and includes VEVENT entries for lessons across the whole barn (manager sees everything), not just your own
- [ ] Tap **Regenerate**, then **Copy Link** — the copied URL carries a different token than before
- [ ] Open the pre-regenerate URL — it now 404s

## Phase 5 — Trainer

Switch role (interactive):

```bash
bash scripts/change-user.sh dev-barn
```

> Pick **Alex** from the profile list — this list is scoped to Dev Barn's active members only, so no other barn's profiles appear.
>
> `change-user.sh` copies the selected user's role onto your `DEV_EMAIL` membership and reassigns their lessons to you — you stay logged in as yourself. Refresh the page after it runs.

- [ ] Nav shows only: barn name, Lessons, Horses, Members, Guide — **no Finances, no Manage Barn, no Leases, no Boarding, no Expenses**
- [ ] `/barn/dev-barn/expenses` is blocked — visiting it directly shows **404**, not a login redirect
- [ ] Lessons list defaults to **My Lessons** (only Alex's, now reassigned to you); switch to **All** to see every barn lesson including Blake's — filter pills show the same `My Lessons | All | By Instructor | By Rider | By Horse | By Tier` bar as the manager view
- [ ] Create 2 lessons via `/barn/dev-barn/lessons/new` — the instructor field is locked to you; pick a date and confirm the exhaustion bars render below each horse, same as the manager view
- [ ] Create one more lesson dated within 30 minutes of one of Blake's lessons (check Blake's lesson times via the **All** filter above) — submission succeeds with no error

> This notification's recipient (Blake) isn't the persona you're currently acting as, so it can't be observed by switching personas with `change-user.sh` — the swap reassigns `barn_memberships.user_id` away from whichever persona you leave, permanently disconnecting it from the id the notification was written against. Verify the row directly instead (Supabase Studio or a `supabase db` query). The live bell UI these rows feed is exercised on a genuinely different account, in both directions, in [`POST_RELEASE_TEST_CHECKLIST.md`](POST_RELEASE_TEST_CHECKLIST.md) — that supplements these row checks rather than replacing them.

- [ ] A `notifications` row exists for Blake's `user_id` with `type = 'instructor_lesson_nearby'` and `link = '/barn/dev-barn/lessons'`
- [ ] That row's `title` reads **"1 new lesson scheduled nearby"** (or an incremented count, e.g. "2 new lessons scheduled nearby", if a prior nearby lesson already landed this same row this pass)
- [ ] Edit one of your own lessons — the instructor field is **hidden entirely** (no label, no read-only text — just locked server-side)
- [ ] Open one of Blake's lessons from the Lessons list — no Edit link is shown, and navigating to its `/edit` URL directly does not let you save changes
- [ ] On one of your own lessons, click **Cancel** in the header and cancel a rider's spot (or the whole lesson) — works the same as manager; open Blake's lesson — no header **Cancel** button is shown
- [ ] The recurring lesson created in Phase 3 still shows its **Recurring** badge on the Lessons list row and detail page, now that it's reassigned to you
- [ ] Open the recurring lesson's edit page (now reassigned to you) — "This is part of a recurring series" indicator and **Stop Recurring Lessons** button appear at the top of the page, above the lesson form; stopping works the same as manager
- [ ] Horse detail page: documents are listed with working links, upload works (including setting a Reminder Date), but there is **no Actions column at all** (not just a hidden delete button), **no Exhaustion Thresholds section**, and the Reminder Date column is **read-only**
- [ ] Horse detail page shows the Feed Notes/Medication Notes entered as manager, read-only (no textareas, no Save button); clear one as manager and confirm its row disappears here on reload instead of showing blank
- [ ] (#1006) As manager, grant this trainer a horse-privileges row on **Clover** (Access section) then make them Clover's owning member; reopen Clover as this trainer — **Feed Notes**/**Medication Notes** are now editable textareas with a **Save** button
- [ ] (#1006) Edit and save both Feed Notes and Medication Notes as this trainer, then reload — the new text persists
- [ ] (#1000) Back on the Horses list as this trainer, a **My Horses** section appears at the top showing **Clover** with a status badge, and Clover no longer appears under Available/Unavailable
- [ ] Butter's horse detail page (this trainer does **not** own her): her seeded photo displays, but there is **no Set Photo / Replace Photo / Remove control**
- [ ] (#1003) On **Clover**'s detail page (the horse this trainer now owns), a **Set Photo** or **Replace Photo** control **is** shown — owning a horse grants photo write even to a non-manager
- [ ] Members page shows all four sections (You/Managers/Trainers/Riders), same structure as the manager view — no Add Trainer/Add Rider forms; open your own member detail page and upload a document, optionally setting a Reminder Date; the Reminder Date column on your own documents is **read-only** (only a manager can edit it)
- [ ] In the Riders section, the managed/unclaimed rows (Gale/Harper Test, whichever are still unclaimed — Indigo Test was removed earlier in the Members phase) render as normal card links — name only, **no Unlinked badge** (the list never shows Copy Invite/Revoke controls for any role — those now live only on the detail page's manager-only Manage Member section, which a trainer viewing that page won't see either)
- [ ] Open Harper Test's member detail page as trainer — Contact Info is read-only (blank fields show "—"), with no Save button
- [ ] Open another trainer's or a manager's member detail page from the roster — page loads (no 404), shows their name and **Contact Info** section (#863 — a trainer can view any member's Contact Info), but **no Documents section**; open Blake's (a rider's) detail page — same: Contact Info shown, Documents hidden (#779 narrowed rider-document access to manager/self only)
- [ ] `/barn/dev-barn/finances` is blocked — shows **404**, not a login redirect; `/barn/dev-barn/finances/outstanding` works and shows **only your own** outstanding lessons, plus any uncollected cancellation fees for lessons you instruct
- [ ] (#1015) Dashboard's Day view, on a day with other instructors' lessons scheduled too, shows only the lessons you instruct — not the whole barn's schedule
- [ ] Dashboard: if any of your instructed lessons are unpaid, a "Reminders" section with an "N unpaid lessons" card appears, linking to `/barn/dev-barn/finances/outstanding` — this is your only nav path to that page (no Finances link in the nav)
- [ ] Avatar menu → **Profile** (`/profile?barn=dev-barn`): barn nav bar renders with the **full 4-link trainer nav** (Lessons, Horses, Members, Guide) — same set as the regular barn pages
- [ ] (#1018) On the same Profile page, get/open your Calendar Feed link — it includes only lessons where you're the instructor (your reassigned Alex lessons), not Blake's

## Phase 6 — Rider

Switch role (pick **Dana** from the same member list as Phase 5):

```bash
bash scripts/change-user.sh dev-barn
```

- [ ] Nav shows only: barn name, Lessons, Horses, Members, Guide — **no Leases, no Boarding, no Expenses**
- [ ] `/barn/dev-barn/expenses` is blocked — visiting it directly shows **404**, not a login redirect
- [ ] Horses page shows Available/Unavailable cards with name (and unavailability reason) only — **no exhaustion bar**, no Inactive section
- [ ] Tap an Available or Unavailable card → navigates to that horse's detail page (#1002 — cards became linkable so a rider can view the horse's photo)
- [ ] On Butter's detail page (Dana does **not** own her), her seeded photo displays, but there is **no Set Photo / Replace Photo / Remove control**
- [ ] (#1006) As manager, make Dana the owning member of **Clover** (Access section — Dana has no privileges row on Clover; this reassigns ownership away from the Phase 5 trainer, which nothing later re-checks); reopen Clover as Dana — **Feed Notes**/**Medication Notes** are editable textareas with a **Save** button
- [ ] (#1006) On **Butter**, whom Dana does *not* own, Feed Notes/Medication Notes remain read-only text
- [ ] (#1000) Back on the Horses list as Dana, a **My Horses** section appears at the top showing **Clover** with a status badge, and Clover no longer appears under Available/Unavailable
- [ ] (#1003) On **Clover**'s detail page, a **Set Photo** or **Replace Photo** control **is** shown — owning a horse grants photo write even to a rider; use it to set a photo as Dana
- [ ] (#1003) As manager, reopen **Clover** → **no Replace Photo / Remove control** (an owner-set photo locks managers out, the converse of the manager-set case in the manager phase)
- [ ] (#999) As manager, grant Dana `document_privileges='read'` on a horse via its Access section; reopen that horse as Dana — a **Documents** section now appears, with no **Add Document** button
- [ ] (#999) Change that same grant to `document_privileges='write'`; reopen the horse as Dana — the **Add Document** button now appears in the Documents section
- [ ] (#999) On a horse Dana has no document privilege on, no Documents section appears for her at all
- [ ] (#999) As manager, grant Dana `lesson_read_privileges=true` on a horse with at least one upcoming lesson; reopen that horse as Dana — an **Exhaustion** bar now appears
- [ ] (#999) Tap that Exhaustion bar — it expands to show the ±3-day breakdown
- [ ] (#999) Same horse — a collapsed **Upcoming Lessons** section appears at the bottom of the page, listing its scheduled lessons
- [ ] (#999) Tap a lesson in that Upcoming Lessons list that Dana is **not** enrolled in — the lesson detail page loads (no 404)
- [ ] (#999) On a horse Dana has no lesson-read privilege on, neither the Exhaustion bar nor the Upcoming Lessons section appears
- [ ] Dashboard's Day view shows only lessons Dana is enrolled in for the viewed day, and no expenses (manager-only) or events outside her role's `visible_to_roles`
- [ ] Lessons list shows only Dana's enrolled lessons, with filter pills `All | By Instructor | By Horse | By Tier` — no **My Lessons** or **By Rider** pill; Dana's own name does not appear on her own lesson cards
- [ ] Open an enrolled lesson's detail page — own rider notes visible read-only; **no private notes** shown
- [ ] Same lesson detail page — no exertion rating shown next to any horse name (still true for a horse Dana holds no lesson-read privilege on)
- [ ] (#999) On the lesson detail page reached via the privileged Upcoming Lessons tap above, Dana's privileged horse **does** show an exertion rating and its horse notes (if any)
- [ ] (#999) Same page — other riders' rider/private notes stay hidden from Dana
- [ ] Open an enrolled **group** lesson's detail page — every co-rider's real name is shown, not a blank or raw ID
- [ ] Copy a lesson ID Dana is **not** enrolled in, for a lesson with no horse she holds lesson-read privileges on, and visit `/barn/dev-barn/lessons/[id]` directly — page shows **404**, not the lesson details
- [ ] Cancel your own spot in an enrolled lesson via the **Cancel** button in the lesson detail page header (no Cancel button on the Lessons list or Dashboard) → your row shows a **Cancelled** badge on the list, Dashboard, and detail page; the rest of the lesson (and other riders in a group lesson) is unaffected; the instructor receives a "Lesson participation cancelled" notification
- [ ] `/barn/dev-barn/finances` is blocked — shows **404**, not a login redirect
- [ ] `/barn/dev-barn/finances/outstanding` shows only Dana's outstanding lessons, plus her own outstanding lease/boarding charges (if any are past due) and her own uncollected late-cancellation fees, with a Type column — no such column entries for other riders' agreements
- [ ] Dashboard: if Dana has unpaid lessons and/or unpaid leases/boarding, a "Reminders" section with "N unpaid lessons"/"N unpaid leases/boarding" cards appears, each linking to `/barn/dev-barn/finances/outstanding` — this is Dana's only nav path to that page (no Finances link in the nav)
- [ ] (#938) With an outstanding late-cancellation fee but zero unpaid lesson fees, the Dashboard's "N unpaid lessons" card still appears (its count includes the cancellation fee) instead of being hidden
- [ ] `/barn/dev-barn/members` shows all four sections (You/Managers/Trainers/Riders) — no Add Trainer/Add Rider forms, and no Unlinked badge on any managed/unclaimed row (rider never sees it, unlike a manager)
- [ ] Open your own member detail page's Documents section — shows the empty state ("No documents yet"), with **no Add Document button** (#864 — rider self-service is read-only)
- [ ] Open another member's detail page from the roster (a trainer, a manager) — page loads (no 404), shows their name and **Contact Info** section, but no Documents section
- [ ] Open Emery's member detail page (her photo is seeded) → photo displays, but no **Set Photo**/**Replace Photo**/**Remove** control is shown

> Self photo upload/replace/remove is **not** verified here as Dana — `change-user.sh` reassigns `barn_memberships.user_id` to your real login but leaves `profiles.user_id` untouched, so the storage RLS self-write check (keyed on `profiles.user_id`) fails for any impersonated persona regardless of role. Phase 2-4's own-photo check exercises this code path for real on **your own** profile (no impersonation) — the only locally-linked one, and there's no role branch in the path. The version where the self-writer is *someone other than you* needs a real second account and is verified against prod in [`POST_RELEASE_TEST_CHECKLIST.md`](POST_RELEASE_TEST_CHECKLIST.md) — don't re-add a self-photo check to an impersonated phase.
- [ ] Switch to Emery (`change-user.sh dev-barn` → Emery) and open her own member detail page — the same Active Agreements cards from Phase 4 render as plain non-clickable cards (no hover state, no navigation on tap) — not links to the manager-only agreement detail page; switch back to Dana afterward
- [ ] Avatar menu → **Profile** (`/profile?barn=dev-barn`): barn nav bar renders with the **full 4-link rider nav** (Lessons, Horses, Members, Guide) — same set as the regular barn pages
- [ ] (#1018) On the same Profile page, get/open your Calendar Feed link — it includes only lessons Dana is enrolled in, not other riders' lessons

## Phase 7 — Multi-barn

- [ ] Create a second barn — completes successfully:

  ```bash
  bash scripts/seed-test-barn.sh test-barn-checklist
  ```

> **Caution:** `reset-db.sh` (Phase 1) wipes **all** barns project-wide, not just Dev Barn. If you need to restart this checklist from the top after this point, re-running it will also delete `test-barn-checklist`.

- [ ] As `DEV_EMAIL`, open `/barn/test-barn-checklist/register` with no `?token=` → shows an "Invite invalid" message, not a self-registration form

`DEV_EMAIL` already has a claimed profile from Phase 1 (`#887` — before that fix, claiming a second-barn invite as an already-claimed user threw an unhandled unique-violation on `profiles.user_id`; the merge fix now re-points the invite's membership onto the existing profile instead):

- [ ] Run `bash scripts/seed-account.sh`, accepting the default first/last name, and enter `test-barn-checklist` as the barn slug — creates a fresh managed-manager stub invite in that barn and prints `Invite path: /barn/test-barn-checklist/register?token=<uuid>`
- [ ] Open that invite path as `DEV_EMAIL` (already signed in elsewhere in this browser) — shows a "Join test-barn-checklist" confirmation with an **Accept Invite** button, no Google sign-in button
- [ ] Click **Accept Invite** → claim succeeds and you land in **test-barn-checklist** as manager — no `?error=1` redirect
- [ ] From the nav bar, click into a nested route (e.g. **Lessons**) — no redirect to `/barn/test-barn-checklist/login` despite the valid session (`#1076` — `acceptInvite` previously never set the `barn_session_{slug}` cookie, so this bounced to login on the first non-dashboard route visited)
- [ ] Run `change-user.sh dev-barn` → pick your own name → restores your manager role in Dev Barn (undoing the Phase 5/6 role swaps)
- [ ] Back as `DEV_EMAIL`: the nav barn name now has a caret — the **BarnSwitcher** dropdown lists both barns, current one checkmarked; clicking the other navigates to its dashboard
- [ ] At a mobile viewport (~390px wide, or your browser's device toolbar), the BarnSwitcher caret is still tappable (≥44px target) and the dropdown behaves the same as desktop
- [ ] Visit `/barns` — one card per membership, both showing **Manager**, each linking to its barn
- [ ] Visit `/` — as a multi-barn member you are redirected to `/barns`
- [ ] Sign out, then visit `/login` — connection status dot is green and the "Keep me logged in" checkbox is present and checked

Cleanup (optional):

```bash
bash scripts/teardown-test-barn.sh test-barn-checklist
```

## Route coverage

| Route | Covered in |
|---|---|
| `/` | Phase 7 |
| `/login` | Phase 7 |
| `/terms` | Phase 1 |
| `/privacy` | Phase 1 |
| `/demo` | Phase 1 |
| `/barns` | Phase 7 |
| `/barn/[slug]` (dashboard) | Phases 4, 6 |
| `/barn/[slug]/login` | Phases 1, 2, 7 |
| `/barn/[slug]/register` | Phase 7 |
| `/barn/[slug]/lessons` | Phases 4, 5, 6 |
| `/barn/[slug]/lessons/new` | Phases 3, 5 |
| `/barn/[slug]/lessons/[id]` | Phases 4, 5, 6 |
| `/barn/[slug]/lessons/[id]/edit` | Phases 4, 5 |
| `/barn/[slug]/expenses` | Phases 4, 5, 6 |
| `/barn/[slug]/horses` | Phases 2, 4 |
| `/barn/[slug]/horses/[id]` | Phases 2, 4, 5 |
| `/barn/[slug]/agreements` | Phase 2 |
| `/barn/[slug]/agreements/new` | Phase 2 |
| `/barn/[slug]/agreements/[id]/edit` | Phase 2 |
| `/barn/[slug]/members` | Phases 2, 4, 5, 6 |
| `/barn/[slug]/members/[membership_id]` | Phases 4, 5 |
| `/barn/[slug]/finances` | Phases 4, 5, 6 |
| `/barn/[slug]/finances/outstanding` | Phases 4, 5, 6 |
| `/barn/[slug]/finances/horses/[id]` | Phase 4 |
| `/barn/[slug]/finances/riders/[id]` | Phase 4 |
| `/barn/[slug]/finances/trainers/[id]` | Phase 4 |
| `/barn/[slug]/finances/expenses/[recipient]` | Phase 4 |
| `/barn/[slug]/settings` | Phases 2, 4, 7 |
| `/barn/[slug]/settings/tiers/new` | Phase 2 |
| `/barn/[slug]/settings/tiers/[id]` | Phase 4 |
| `/barn/[slug]/settings/events/new` | Phase 4 |
| `/barn/[slug]/settings/events/[id]` | Phase 4 |
| `/barn/[slug]/settings/events/[id]/delete` | Phase 4 |
| `/barn/[slug]/guide` | Phase 4 |
| `/profile` | Phase 4 |
| `/profile/complete` | Phases 1, 2 |
