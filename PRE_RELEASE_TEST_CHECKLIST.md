# Pre-Release Test Checklist

Manual smoke test of all barn workflows against the dev environment. Run the phases **in order** — later phases depend on data created in earlier ones. Every UI route in `ARCHITECTURE.md` is covered at least once (see [Route coverage](#route-coverage) at the bottom).

Paths below are relative — prepend your app origin (local `npm run dev` or Vercel preview URL).

> **Convention:** each checkbox verifies one independent assertion, so a partial failure can be marked cleanly. Split any checkbox that bundles multiple clauses — with one exception:
>
> - **Setup/data-creation steps** that assert nothing are fine to leave bundled with the assertion they set up for.

> **Phases are partitioned by the role doing the *asserting*, not the role the data is about.** A manager reading a page *about* riders is a Phase 4 line; a rider reading their own page is a Phase 6 line. That distinction is load-bearing — read it the other way and all 141 Finances lines look like Phase 6 material.
>
> - A precondition may be planted by any role, including a mid-phase `change-user.sh` detour to a manager. Only the eye doing the looking has to match the phase.
> - When such a line is later automated, the manager-side precondition becomes a **fixture/seed call in the asserting role's own barn**, so one test is always one role — a Playwright project binds one `storageState`.
> - A misplaced line is not merely untidy: it can never be tagged honestly. A Phase 4 line asserting trainer-visible UI can only ever be covered by a `@trainer` test, so its `(e2e: …)` tag would be a lie.
> - If a check ever genuinely needs two live roles acting in sequence and cannot be reduced to seed-then-assert, give it its own phase and tag it `(manual)`. No such check exists today.

> **Automation tags:** in an audited section, every checkbox carries exactly one of — including a standalone setup step, which a spec automates alongside the assertions it sets up
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

Every step below that uploads a file names one from `scripts/data/` (#1135 — a tracked directory, nothing to place by hand). The images are deliberately non-square and bracketed by `|------- word -------|` edge markers, so a square-crop regression visibly eats the bars instead of needing a proportion judgment, and the word tells you at a glance which file is displayed. See `scripts/CLAUDE.md`'s Test assets section for the full manifest.

## Phase 1 — Setup

<!-- Asserting role: role-agnostic setup — an unauthenticated visitor, then the shared demo user, then the developer's own account pre-membership and as its manager. -->

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

<!-- Asserting role: manager only. Data other phases depend on is created here. -->

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
- [ ] While Gale Test is still unclaimed, upload `scripts/data/test_1_kb.pdf` on their detail page — confirms manager can upload/delete documents for a managed/unclaimed rider
- [ ] Click **Copy Invite** on Gale Test's detail page → button briefly reads **Copied!** → the copied URL matches `/barn/dev-barn/register?token=<uuid>` (a well-formed UUID token)

> Actually claiming that invite — and the pre-claim-document-readability regression check that goes with it — needs a genuinely different person, which no local or preview setup produces. It's verified against prod in [`POST_RELEASE_TEST_CHECKLIST.md`](POST_RELEASE_TEST_CHECKLIST.md) instead.

- [ ] On Harper Test's detail page, click **Revoke** → click **Copy Invite** again → the copied URL contains a **different** token than before
- [ ] On Indigo Test's detail page, click **Revoke** then immediately click **Copy Invite** (as fast as possible, before the button re-enables) — Copy Invite is disabled/unclickable until the new token has loaded, so it never copies the just-revoked stale token (#939 regression check)

## Phase 3 — Manager lesson entry

<!-- Asserting role: manager only. -->

All via `/barn/dev-barn/lessons/new`. Times entered here should display later in 12-hour AM/PM format. `reset-db.ts` seeds ~43 varied lessons across past/current/future dates, tiers, jumping, and exertion — only create the purpose-built lessons below; verify everything else against seeded data (including the seeded Custom-tier lesson).

- [ ] Create a **past lesson** (dated ~5 weeks ago, previous calendar month): Beginner tier, trainer Alex, horse Apple, rider Dana
- [ ] Try saving a lesson with a blank fee (Custom tier, no tier selected) — rejected with "fee is required"; in edit mode, blank fee is rejected too
- [ ] Select a named tier (e.g. Beginner) — fee field stays visible and editable, pre-filled with the tier's price; change the fee and save — lesson saves with the edited fee and keeps the tier's name (not "Custom")
- [ ] Create a **current-month paid lesson** (dated a few days ago, before today): Beginner tier, trainer Alex, horse Clover, rider Dana — after saving, mark it **paid**
- [ ] While creating it, pick a date and check Apple, Butter, and Clover in turn — each shows an exhaustion bar (no bars before a date is picked); adjust a checked horse's exertion level and watch its ghost segment move live, unchecked horses stay solid; change the date and confirm bars refresh
- [ ] Open this lesson's edit page afterward and confirm Clover's bar still renders (excluding the lesson itself from its own window)

**#1019 — month conflict calendar on the Date field.** All on `/barn/dev-barn/lessons/new` unless stated.

- [ ] (#1019) The Date field renders as a month calendar grid, not a native date box
- [ ] (#1019) Days before today are greyed out, making today the first fully-coloured day on the grid
- [ ] (#1019) With neither a horse nor a rider selected, no day is tinted
- [ ] (#1019) With neither a horse nor a rider selected, no day shows a dot
- [ ] (#1019) Select rider Dana and no horse — days where Dana already has a lesson are tinted
- [ ] (#1019) Still rider-only, no day shows a dot
- [ ] (#1019) Now also check horse Apple — the flat rider tint is replaced by exertion shading
- [ ] (#1019) A day where Apple already has a lesson shows a small red dot below the date number
- [ ] (#1019) A day shaded amber/red only by neighbouring days' lessons shows no dot
- [ ] (#1019) Check a second horse alongside Apple — a day loaded for either horse takes the heavier of the two shadings
- [ ] (#1019) Change the Hour dropdown from an early hour to a late one — at least one day's shading shifts
- [ ] (#1019) Schedule a vet/farrier expense for Apple on a future day — **set a time and an amount on it** (#1148's Phase 5 checks below need both) — then reopen this form with Apple selected — that day shows a dot
- [ ] (#1147) Schedule a farrier expense on another future day with **Applies to all horses** checked, then reopen this form with Apple selected — that day shows a dot even though the expense names no horse
- [ ] (#1147) That barn-wide day's exertion shading is unchanged from before the expense was booked (an appointment is not a workload)
- [ ] (#1019) With Apple selected, a greyed-out past day shows no shading
- [ ] (#1019) With Apple selected, a greyed-out past day shows no dot
- [ ] (#1019) Tap a day that has a lesson on it — a popup lists that day's items
- [ ] (#1019) That popup shows each item's time in 12-hour AM/PM format
- [ ] (#1019) That popup shows each item's horse and rider names
- [ ] (#1019) Tap a day with nothing on it — the popup reads "Nothing scheduled for this day."
- [ ] (#1019) Tapping a day also selects it as the lesson's date (the tapped day gains a selection ring)
- [ ] (#1019) Tap **&gt;** — the grid advances one month
- [ ] (#1019) The **&lt;** / **&gt;** month arrows are the same size as the ones on the Finances page
- [ ] (#1019) After advancing a month, the new grid's shading reflects that month's lessons
- [ ] (#1019) A day carried in from the neighbouring month renders dimmed
- [ ] (#1019) That dimmed neighbouring-month day is still selectable
- [ ] (#1019) In **dark mode**, an amber day and a red day are clearly different colours from each other
- [ ] (#1019) In **dark mode**, the date number on a tinted neighbouring-month day is still readable
- [ ] (#1019) The popup opened by tapping a day in the calendar's first row does not cover that day
- [ ] (#1019) The exhaustion bar under a horse's checkbox uses the same amber/red as that horse's calendar shading
- [ ] (#1019) Check **Recurring (weekly)** — the calendar's field label changes to "Starting Date"
- [ ] (#1019) Manage Barn → Events → Add Event still uses a plain native date box, not the month calendar
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

<!-- Asserting role: manager, or role-agnostic. A line whose asserting eye is a trainer or rider belongs in Phase 5 or 6 — see the phase-partitioning Convention at the top. -->

- [ ] (e2e: lesson_creation_stores_correct_utc_lesson_at_for_known_local_wall_clock) Compare a lesson's stored `lesson_at` in the DB (Supabase Studio or `supabase db` query) against the wall-clock time you entered when creating it in Phase 3 — it must be that time in the **barn's** timezone converted to UTC, regardless of your own machine's zone (#1222)
- [ ] (e2e: lesson_list_shows_the_barn_local_wall_clock_time_entered_on_the_form) On the Lessons list, a lesson's displayed time matches the wall-clock time you entered — with your machine's clock set to a zone that is neither UTC nor the barn's, this proves the display follows the barn (#1222) rather than your device or the server host
- [ ] (e2e: lesson_detail_shows_the_same_barn_local_wall_clock_time) On that lesson's detail page, its displayed time matches the same wall-clock time

Dashboard (`/barn/dev-barn`):

- [ ] (e2e: dashboard_day_view_shows_only_the_selected_days_entries) Dashboard shows a single-day calendar (one date's entries, not a week or a flat list)
- [ ] (e2e: dashboard_today_indicator_visible_on_current_day) The calendar defaults to today, with today's date in the heading
- [ ] (e2e: dashboard_day_heading_has_previous_and_next_day_links) Prev/Next links appear alongside the calendar heading
- [ ] (e2e: dashboard_todays_lessons_appear_on_the_calendar) Today's seeded lessons appear on the calendar
- [ ] (e2e: dashboard_todays_planned_expense_appears_alongside_todays_lessons) A planned expense scheduled for today (future date+time, no amount yet) appears on the same calendar alongside those lessons
- [ ] (e2e: dashboard_todays_lessons_and_expense_are_ordered_by_time_not_grouped_by_type) Today's lessons and that expense are ordered by time together, not grouped into separate blocks by type
- [ ] (e2e: dashboard_clicking_next_twice_reaches_the_day_of_the_two_day_out_expense) Clicking Next twice navigates to the day the seeded Riverside Vet Clinic expense (2 days out) is scheduled for
- [ ] (e2e: dashboard_expense_interleaved_with_lesson_by_time_on_shared_day) That expense appears on that day interleaved by time with the day's lessons, not grouped into a separate expenses block
- [ ] (e2e: dashboard_today_link_appears_when_viewing_another_day) A "Today" link appears while viewing a day other than today
- [ ] (e2e: dashboard_today_link_returns_to_todays_calendar) That "Today" link returns to today's calendar when clicked
- [ ] (e2e: dashboard_no_today_link_while_viewing_today) No "Today" link appears while already viewing today
- [ ] (e2e: dashboard_date_only_planned_expense_not_shown) A date-only planned expense (no time set) does **not** appear on the calendar for its date
- [ ] (e2e: dashboard_expense_card_shows_scheduled_time) An expense entry on the calendar shows its scheduled time (no per-entry date — the day heading already carries it)
- [ ] (e2e: dashboard_expense_card_shows_recipient) That expense entry shows its recipient
- [ ] (e2e: dashboard_expense_card_shows_type) That expense entry shows its expense type
- [ ] (e2e: dashboard_expense_card_shows_horse) A horse-specific expense entry shows its horse(s)
- [ ] (e2e: dashboard_entire_barn_expense_card_shows_entire_barn_instead_of_horses) An **Entire Barn** expense entry shows "Entire Barn" in place of horse names
- [ ] (e2e: dashboard_tapping_an_expense_card_opens_its_detail_page) Tapping an expense entry opens that expense's detail page
- [ ] (e2e: dashboard_reminders_header_visible_for_manager) A "Reminders" section header appears above the document-reminders/unpaid-income cards
- [ ] (e2e: dashboard_no_document_reminder_cards_when_no_document_is_past_its_reminder_date) No document-reminder cards appear under Reminders when no documents are past their reminder date
- [ ] (e2e: dashboard_document_reminder_card_shown_after_setting_reminder_date) After setting a past reminder date on a document (see Horses/Members below), a single-line "{owner} — {record type} — {date}" card appears under Reminders
- [ ] (e2e: dashboard_document_reminder_card_sits_directly_under_reminders_without_its_own_heading) That card appears directly under Reminders with no separate "Document Reminders" heading above it
- [ ] (e2e: dashboard_document_reminder_card_links_to_the_horses_detail_page) That card links to the horse's or member's detail page
- [ ] (e2e: dashboard_unpaid_lesson_reminder_links_to_outstanding) With unpaid lessons in the barn, an "N unpaid lessons" card appears under Reminders linking to `/barn/dev-barn/finances/outstanding`
- [ ] (e2e: dashboard_unpaid_lease_reminder_links_to_outstanding) With unpaid lease/boarding charges in the barn, an "N unpaid leases/boarding" card appears under Reminders linking to the same page
- [ ] (e2e: dashboard_unpaid_reminder_cards_hide_independently_of_each_other) Each of those two cards is hidden individually when its own count is zero, without hiding the other
- [ ] (e2e: dashboard_day_and_week_pill_switcher_appears_above_the_calendar) (#1016) A "Day"/"Week" pill switcher appears above the calendar
- [ ] (e2e: dashboard_day_pill_is_the_active_view_on_load) (#1016) The Day view is active by default
- [ ] (e2e: dashboard_week_pill_shows_the_calendar_aligned_sunday_to_saturday_week_of_the_viewed_date) (#1070) Tapping "Week" switches to the calendar-aligned Sunday–Saturday week containing the currently viewed date, not a rolling 7-day window
- [ ] (e2e: dashboard_week_view_shows_a_date_heading_for_each_of_the_seven_days) (#1016) In Week view, each of the 7 days shows its own date heading
- [ ] (e2e: dashboard_week_view_lists_each_days_own_items_under_that_day) (#1016) In Week view, each day section lists that day's own lessons/expenses/events
- [ ] (e2e: dashboard_week_view_shows_nothing_scheduled_on_a_day_with_no_items) (#1016) In Week view, a day with nothing scheduled shows "Nothing scheduled for this day."
- [ ] (e2e: dashboard_week_view_shows_one_all_clear_empty_state_for_a_week_with_nothing_on_it) (#1016) A week with nothing scheduled on any of its 7 days shows a single "You're all clear" empty state instead of 7 empty lines
- [ ] (e2e: dashboard_week_view_prev_and_next_move_the_visible_range_by_seven_days) (#1016) In Week view, Prev/Next move the visible range by 7 days at a time
- [ ] (e2e: dashboard_week_view_shows_the_this_week_link_when_today_is_outside_the_visible_week) (#1016) In Week view, a "This Week" link appears when today's date isn't inside the visible week
- [ ] (e2e: dashboard_week_view_hides_the_this_week_link_when_today_is_inside_the_visible_week) (#1016) In Week view, no "This Week" link appears when today's date is already inside the visible week
- [ ] (e2e: dashboard_week_view_tints_todays_day_section_in_light_mode) (#1070) In Week view, today's day section (when visible) shows a distinct background tint/border in light mode
- [ ] (e2e: dashboard_week_view_tints_todays_day_section_in_dark_mode) (#1070) In Week view, today's day section (when visible) shows a distinct background tint/border in dark mode
- [ ] (e2e: dashboard_week_to_day_view_lands_on_today_when_today_is_inside_the_week) (#1070) Switching from Week to Day view lands on today if today is inside the currently-viewed week
- [ ] (e2e: dashboard_week_to_day_view_lands_on_the_weeks_sunday_when_today_is_outside_the_week) (#1070) Switching from Week to Day view lands on the week's Sunday if today is not inside the currently-viewed week

Lessons (`/barn/dev-barn/lessons`):

- [ ] (e2e: recent_lessons_are_shown_on_page_load) Recent lessons (last 7 days) are shown immediately on page load
- [ ] (e2e: older_lessons_are_not_shown_on_page_load) Older lessons are not shown on page load
- [ ] (e2e: older_lessons_toggle_reveals_them) Tapping the older-lessons toggle reveals them
- [ ] (e2e: lesson_cards_are_full_width_and_uniform_height) Each lesson renders as a full-width card of uniform height with its siblings
- [ ] (e2e: whole_lesson_card_opens_its_detail_page) The whole card is tappable and opens that lesson's detail page
- [ ] (e2e: no_cancel_button_appears_on_any_lesson_in_the_list) No **Cancel** button appears on any lesson in the list
- [ ] (e2e: filter_pills_show_the_six_expected_filters) Filter pills show exactly `My Lessons | All | By Instructor | By Rider | By Horse | By Tier`
- [ ] (e2e: filter_pills_wrap_at_narrow_width_without_horizontal_scroll) At ~390px width those pills wrap onto multiple lines instead of requiring horizontal scroll
- [ ] (e2e: all_is_the_active_pill_on_page_load) **All** is the active pill on page load
- [ ] (e2e: my_lessons_filter_shows_only_lessons_you_instruct) Picking **My Lessons** filters to only lessons you instruct
- [ ] (e2e: all_filter_shows_every_barn_lesson) Picking **All** shows every barn lesson regardless of instructor
- [ ] (e2e: by_instructor_filter_shows_only_that_instructors_lessons) Picking **By Instructor → Alex** shows only Alex's lessons
- [ ] (e2e: by_instructor_filter_url_carries_the_instructor_membership_id) Picking **By Instructor → Alex** carries the URL `?filter=trainer&id=<uuid>`
- [ ] (e2e: by_rider_filter_shows_only_that_riders_lessons) **By Rider → Dana** filters correctly
- [ ] (e2e: by_horse_filter_shows_only_that_horses_lessons) **By Horse → Apple** filters correctly
- [ ] (e2e: by_tier_filter_shows_only_that_tiers_lessons) **By Tier → Custom** (or another tier name found among the barn's lessons) filters correctly
- [ ] (e2e: by_tier_filter_url_carries_the_tier_name) Picking **By Tier → Custom** carries the URL `?filter=tier&id=<tier name>`
- [ ] (e2e: lesson_list_times_display_in_twelve_hour_format) Times display in 12-hour AM/PM format on the Lessons list (no military time — the seeded 14:00 barn-local lesson must read "2:00 PM")
- [ ] (e2e: willow_upcoming_lesson_shows_needs_attention_badge_on_lessons_list) Willow's upcoming lesson shows a **Needs Attention** badge on the Lessons list (Willow is seeded inactive)
- [ ] (e2e: willow_upcoming_lesson_shows_needs_attention_badge_on_dashboard_day_view) That same lesson shows the badge on the Dashboard's Day view (navigate to the lesson's date if it isn't today)
- [ ] (e2e: needs_attention_badge_does_not_appear_on_willows_past_lesson) The badge does not appear on Willow's past lessons
- [ ] (e2e: needs_attention_badge_does_not_appear_on_a_cancelled_lesson) The badge does not appear on a cancelled lesson
- [ ] (e2e: willows_flagged_lesson_detail_page_shows_the_inactive_horse_attention_banner) Willow's flagged lesson's detail page shows a **Needs Attention** banner at the top reading "Willow is inactive"
- [ ] (e2e: willows_flagged_lesson_edit_page_shows_the_same_attention_banner) The same banner appears on that lesson's edit page
- [ ] (manual) The banner does not block editing or saving that lesson
- [ ] (e2e: clicking_a_nav_link_on_the_flagged_edit_page_raises_the_unresolved_horse_dialog) On Willow's flagged lesson's edit page, without changing any field, clicking a nav link (or hitting browser back) raises a confirm dialog warning about the unresolved horse issue
- [ ] (e2e: choosing_stay_dismisses_the_dialog_and_keeps_you_on_the_edit_page) Choosing **Stay** in that dialog dismisses it without navigating away
- [ ] (e2e: swapping_the_inactive_horse_for_an_active_one_stops_the_navigation_prompt) Swap Willow out for an active horse and save, then reopen the edit page — navigating away no longer prompts
- [ ] (e2e: horse_notes_render_read_only_on_the_lesson_detail_page) On a lesson's detail page (`/barn/dev-barn/lessons/[id]`), horse notes render read-only
- [ ] (e2e: rider_notes_render_read_only_on_the_lesson_detail_page) On that same page, rider notes render read-only
- [ ] (e2e: the_edit_link_is_visible_on_the_lesson_detail_page) On that same page, the Edit link is visible
- [ ] (e2e: every_note_label_is_hidden_on_a_lesson_with_no_notes) On a lesson with no notes recorded at all, every note label (Horse Notes, Rider Notes, Private, Your Notes, Cancellation Notes) is hidden entirely rather than showing an empty label or a "—" placeholder
- [ ] (e2e: editing_a_lessons_fee_and_notes_persists_them_to_the_detail_page) Edit a lesson (`/barn/dev-barn/lessons/[id]/edit`) — change the fee, enter horse notes and rider notes, and save
- [ ] (e2e: editing_a_lessons_fee_and_notes_persists_them_to_the_detail_page) The fee change appears on the detail page
- [ ] (e2e: editing_a_lessons_fee_and_notes_persists_them_to_the_detail_page) The horse notes from that same save appear on the detail page
- [ ] (e2e: editing_a_lessons_fee_and_notes_persists_them_to_the_detail_page) The rider notes from that same save appear on the detail page
- [ ] (e2e: switching_a_group_lesson_to_normal_warns_before_dropping_extra_riders_and_horses) Edit the group lesson created in Phase 3 → switch type to normal → a downgrade warning asks you to pick one rider/horse to keep (cancel without saving)
- [ ] (e2e: deleting_a_lesson_removes_it_from_the_lessons_list) Delete one seeded lesson — it disappears from the list
- [ ] (e2e: lesson_detail_header_shows_a_single_cancel_button_beside_edit_and_delete) A lesson's detail page header shows a single **Cancel** button next to **Edit**/**Delete**
- [ ] (e2e: the_manager_sees_the_cancel_button_on_a_lesson_another_trainer_instructs) That **Cancel** button is shown to the manager even on a lesson another trainer instructs
- [ ] (e2e: clicking_cancel_on_a_normal_lesson_opens_the_cancel_type_confirmation_page) Clicking **Cancel** on a **normal** lesson opens a confirmation page with a **Cancelled by Rider** / **Cancelled by Instructor** toggle
- [ ] (e2e: the_cancel_type_toggle_defaults_to_instructor_on_a_lesson_you_instruct) That toggle defaults to **Cancelled by Instructor** on a lesson you instruct
- [ ] (e2e: the_cancel_type_toggle_defaults_to_rider_on_a_lesson_you_do_not_instruct) That toggle defaults to **Cancelled by Rider** on a lesson you don't instruct
- [ ] (e2e: confirming_cancelled_by_rider_more_than_24h_out_zeroes_the_fee) Confirming **Cancelled by Rider** on a **normal** lesson >24h out zeroes its fee
- [ ] (e2e: confirming_cancelled_by_rider_within_24h_leaves_the_fee_unaffected) Confirming **Cancelled by Rider** on a **normal** lesson booked <24h away leaves its fee unaffected
- [ ] (e2e: a_rider_cancellation_shows_the_cancelled_badge_on_the_lesson_detail_page) A lesson cancelled that way shows a **Cancelled** badge
- [ ] (e2e: cancellation_notes_entered_on_the_confirmation_page_appear_on_the_detail_page) The notes you entered on the confirmation page appear under **Cancellation Notes**
- [ ] (e2e: confirming_cancelled_by_instructor_more_than_24h_out_zeroes_the_fee) Confirming **Cancelled by Instructor** on a lesson >24h out zeroes its fee
- [ ] (e2e: confirming_cancelled_by_instructor_within_24h_zeroes_the_fee_too) Confirming **Cancelled by Instructor** on a lesson booked <24h away zeroes its fee too
- [ ] (e2e: selecting_cancelled_by_rider_within_24h_shows_the_late_fee_warning) On a **normal** lesson booked <24h away, select **Cancelled by Rider** → an amber "The rider will be due a late cancellation fee." label appears
- [ ] (e2e: switching_to_cancelled_by_instructor_hides_the_late_fee_warning) On that same lesson, switch to **Cancelled by Instructor** → the label disappears
- [ ] (e2e: selecting_cancelled_by_rider_more_than_24h_out_shows_no_late_fee_warning) On a **normal** lesson booked >24h out, select **Cancelled by Rider** → the label does not appear
- [ ] (e2e: clicking_cancel_on_a_group_lesson_opens_the_same_cancel_type_toggle) Clicking **Cancel** on a **group** lesson shows the same **Cancelled by Rider** / **Cancelled by Instructor** toggle
- [ ] (e2e: choosing_cancelled_by_instructor_on_a_group_lesson_shows_the_affected_rider_count) Choosing **Cancelled by Instructor** there shows the count of enrolled riders who'll be affected
- [ ] (e2e: the_cancelled_by_instructor_description_lists_the_affected_riders_by_name) It also lists those riders by name
- [ ] (e2e: confirming_cancelled_by_instructor_on_a_group_lesson_cancels_every_enrolled_rider) Confirming cancels the whole lesson, every enrolled rider included
- [ ] (e2e: whole_lesson_cancellation_of_a_group_lesson_waives_the_fee) That whole-lesson cancellation waives the fee
- [ ] (e2e: choosing_cancelled_by_rider_on_a_group_lesson_reveals_a_picker_of_still_active_riders) On that same group lesson's Cancel page, choosing **Cancelled by Rider** reveals a rider picker listing the still-active enrolled riders
- [ ] (e2e: cancelling_one_group_rider_shows_a_cancelled_badge_on_only_that_riders_row) Select one and confirm → only that rider's row shows a **Cancelled** badge
- [ ] (e2e: the_rest_of_a_group_lesson_is_unaffected_when_one_of_its_riders_cancels) The rest of the lesson and its other riders are unaffected (on a lesson booked <24h away — a rider cancelling >24h out zeroes the whole lesson's fee)
- [ ] (e2e: the_24_hour_fee_policy_applies_to_a_group_rider_who_cancels) The standard 24-hour fee policy applies to that rider
- [ ] (e2e: selecting_cancelled_by_rider_on_a_group_lesson_within_24h_shows_the_group_fee_warning) On a **group** lesson booked <24h away, select **Cancelled by Rider** → an amber "Warning: No late cancellation fees are currently leveraged for group lessons." label appears
- [ ] (e2e: switching_a_group_lesson_to_cancelled_by_instructor_hides_the_group_fee_warning) On that same lesson, switch to **Cancelled by Instructor** → the label disappears
- [ ] (e2e: selecting_cancelled_by_rider_on_a_group_lesson_more_than_24h_out_shows_no_group_fee_warning) On a **group** lesson booked >24h out, select **Cancelled by Rider** → the label does not appear
- [ ] (e2e: cancelling_a_normal_lesson_shows_a_cancelled_badge_on_the_lessons_list) Cancel a **normal** lesson (there's only one rider) → the lesson shows a **Cancelled** badge on the Lessons list
- [ ] (e2e: a_cancelled_normal_lesson_shows_the_cancelled_badge_on_its_detail_page) That same lesson shows the **Cancelled** badge on its detail page
- [ ] (e2e: a_cancelled_lesson_is_absent_from_the_dashboard_day_view_for_its_date) (#1015) That same cancelled lesson no longer appears on the Dashboard's Day view for its date, even navigating directly to that day
- [ ] (e2e: a_group_lesson_shows_no_cancelled_badge_while_any_rider_is_still_active) On a **group** lesson, cancel riders one at a time via the picker → the lesson does *not* show a **Cancelled** badge while any rider is still active
- [ ] (e2e: a_group_lesson_shows_a_cancelled_badge_on_the_lessons_list_once_its_final_rider_is_cancelled) Once the final rider is cancelled, the lesson shows a **Cancelled** badge on the Lessons list
- [ ] (e2e: a_fully_cancelled_group_lesson_shows_the_cancelled_badge_on_its_detail_page) That fully-cancelled group lesson shows the **Cancelled** badge on its detail page too
- [ ] (e2e: edit_lesson_on_a_cancelled_lesson_shows_a_cancellation_notes_textarea) Open **Edit Lesson** on an already-cancelled lesson → the Notes section shows a **Cancellation Notes** textarea
- [ ] (e2e: edit_lesson_on_a_non_cancelled_lesson_shows_no_cancellation_notes_textarea) That textarea does *not* appear when editing a non-cancelled lesson
- [ ] (e2e: saving_edited_cancellation_notes_shows_them_read_only_on_the_detail_page) Edit that textarea and Save → the detail page shows the updated text read-only under **Cancellation Notes**
- [ ] (e2e: clearing_cancellation_notes_and_saving_removes_the_row_from_the_detail_page) Clear the field and Save again → the **Cancellation Notes** row disappears entirely from the detail page
- [ ] (e2e: deleting_an_unpaid_lesson_via_the_browser_prompt_removes_it_from_the_lessons_list) Open an **unpaid** lesson's detail page, click **Delete** and confirm the browser prompt → the lesson disappears from the Lessons list
- [ ] (e2e: deleting_an_unpaid_lesson_removes_it_from_outstanding_income_in_finances) That deleted lesson also disappears from Finances
- [ ] (e2e: a_deleted_lesson_leaves_no_cancelled_badge_behind) It leaves no **Cancelled** badge behind (it's gone, not cancelled)
- [ ] (e2e: deleting_a_lesson_sends_no_notification_to_its_instructor_or_riders) No notification is sent to the instructor or riders for that delete
- [ ] (e2e: delete_raises_the_same_browser_prompt_on_an_already_cancelled_lesson) **Delete** is reachable the same way on an already-cancelled lesson whose fee survived — cancel one **late** (under 24h out) to get there, since a non-late cancellation zeroes the fee and lands on the `/delete` page below instead
- [ ] (e2e: delete_on_a_paid_lesson_opens_the_delete_page_instead_of_a_browser_prompt) On a **paid** (or $0-fee) lesson's detail page, **Delete** lands on `/barn/dev-barn/lessons/[id]/delete` rather than raising a browser prompt
- [ ] (e2e: the_lesson_delete_page_shows_the_amount_already_collected) That page shows the amount already collected for the lesson
- [ ] (e2e: the_lesson_delete_pages_collected_record_checkbox_is_unchecked_by_default) Its "also delete the collected record" checkbox is unchecked by default
- [ ] (e2e: confirming_the_lesson_delete_page_removes_the_lesson_from_the_lessons_list) Confirm without checking it → the lesson is gone from the Lessons list
- [ ] (e2e: deleting_a_paid_lesson_without_the_checkbox_keeps_its_income_in_finances) Its income still shows up in Finances for that month
- [ ] (e2e: deleting_a_paid_lesson_with_the_checkbox_removes_its_income_from_finances) Repeat on another paid lesson, this time checking the box → that lesson's income is also gone from Finances

Expenses (`/barn/dev-barn/expenses`):

- [ ] (e2e: nav_shows_expenses_between_lessons_and_horses) Nav shows **Expenses** between Lessons and Horses
- [ ] (e2e: an_expense_card_is_a_full_card_link_showing_its_date_and_time) A seeded expense renders as a full-card link showing its date/time
- [ ] (e2e: an_expense_card_shows_its_recipient) That card shows its recipient
- [ ] (e2e: an_expense_card_shows_its_expense_type) That card shows its expense type
- [ ] (e2e: an_expense_card_shows_its_horses_or_entire_barn) That card shows its horse(s), or "Entire Barn"
- [ ] (e2e: an_expense_card_shows_its_amount) That card shows its amount
- [ ] (e2e: the_list_splits_recent_expenses_from_older_ones) The list is split into a recent and an older group
- [ ] (e2e: show_older_expenses_toggle_reveals_the_older_group) The older group is revealed by the **Show older expenses** toggle
- [ ] (e2e: a_future_dated_planned_expense_with_no_amount_appears_in_the_list) At least one future-dated planned expense with no amount appears in the list
- [ ] (e2e: tapping_an_expense_card_away_from_its_text_opens_its_edit_page) Tapping anywhere on an expense card opens its edit page
- [ ] (e2e: the_expenses_list_has_no_row_level_delete_link) There is no separate row-level Delete link on the list
- [ ] (e2e: entering_a_recipient_seen_before_autofills_the_expense_type) On `/barn/dev-barn/expenses/new`, enter a recipient seen before (e.g. "Dr. Hoof Farrier") and tab out — Expense Type auto-fills
- [ ] (e2e: the_autofilled_expense_type_field_flashes) That auto-filled Expense Type field flashes to draw attention to itself
- [ ] (e2e: leaving_the_amount_blank_saves_a_planned_expense) Leaving the amount blank saves a planned expense
- [ ] (e2e: reopening_a_planned_expense_lets_its_amount_be_filled_in) Re-opening that planned expense's form later lets you fill the amount in and save
- [ ] (e2e: checking_all_disables_the_horse_checkboxes) Checking **All** on the new-expense form disables the horse checkboxes
- [ ] (e2e: saving_a_barn_wide_expense_shows_entire_barn_on_its_card) Saving that expense shows "Entire Barn" on its card instead of specific horses
- [ ] (e2e: setting_the_date_to_yesterday_hides_the_time_field) On the new-expense form, setting the date to yesterday hides the Time field
- [ ] (e2e: setting_the_date_back_to_today_brings_the_time_field_back) Changing it back to today or a future date brings the Time field back

**#1020 — month conflict calendar on the expense form's Date field.** All on `/barn/dev-barn/expenses/new` unless stated. Assumes the Phase 3 seeding above, which put lessons and a vet/farrier expense on known future days.

- [ ] (#1020) The Date field renders as a month calendar grid, not a native date box
- [ ] (#1020) Days before today are greyed out
- [ ] (#1020) With no horse checked and **All** unchecked, no day shows a dot
- [ ] (#1020) No day is exertion-shaded at any point on this form — an appointment carries no workload, so the grid stays untinted even on a horse's heaviest day
- [ ] (#1020) Check horse Apple — a day where Apple already has a lesson shows a small red dot
- [ ] (#1020) Still with Apple checked, the day holding Apple's seeded vet/farrier expense also shows a dot (the vet+farrier same-day case)
- [ ] (#1020) A day whose only booking belongs to a different horse shows no dot
- [ ] (#1020) Uncheck Apple and check **All** — every day holding any lesson or expense shows a dot
- [ ] (#1020) With **All** checked, a day holding only a barn event (Manage Barn → Events) shows no dot
- [ ] (#1020) Tap a dotted day — a popup lists that day's items
- [ ] (#1020) That popup names an expense by its recipient and type
- [ ] (#1020) That popup names a lesson by its horses
- [ ] (#1020) Tapping a day selects it as the expense's date (the tapped day gains a selection ring)
- [ ] (#1020) Save after picking a day that way — the expense stores the day you tapped
- [ ] (#1020) On a seeded expense's edit page (`/barn/dev-barn/expenses/[id]`), its own day shows no dot from itself
- [ ] (#1020) The **&lt;** / **&gt;** month arrows match the ones on the lesson form and Finances page
- [ ] (e2e: the_edit_form_opens_prefilled_with_the_expenses_stored_values) Editing a seeded expense (`/barn/dev-barn/expenses/[id]`) opens the form pre-filled with its stored values
- [ ] (e2e: the_edit_form_opens_with_the_stored_all_and_horse_checkbox_state) That form opens with the correct All / specific-horse checkbox state
- [ ] (e2e: changing_the_recipient_and_saving_updates_the_card) Change the recipient and save → the card shows the new recipient
- [ ] (e2e: changing_the_amount_and_saving_updates_the_card) Change the amount and save → the card shows the new amount
- [ ] (e2e: a_payment_type_set_on_the_new_expense_form_persists) On the new-expense form, set a **Payment Type**, save → it persists on reload
- [ ] (e2e: a_payment_type_set_on_the_edit_expense_form_persists) On the edit-expense form, set a **Payment Type**, save → it persists on reload
- [ ] (e2e: the_delete_confirmation_page_is_headed_delete_expense) From the edit page, **Delete** on a seeded expense with **no amount set** opens a confirmation page headed "Delete Expense"
- [ ] (e2e: the_unamounted_delete_confirmation_carries_no_checkbox) That confirmation page carries no checkbox
- [ ] (e2e: confirming_an_unamounted_delete_removes_it_from_the_list) Confirming it removes the expense from the list
- [ ] (e2e: deleting_an_amounted_expense_offers_the_finances_checkbox) Deleting a seeded expense **with an amount** shows an "Also delete the collected record from Finances" checkbox on the confirmation page
- [ ] (e2e: the_finances_delete_checkbox_is_unchecked_by_default) That checkbox is unchecked by default
- [ ] (e2e: confirming_without_the_checkbox_removes_the_expense_from_the_list) Confirm that delete without checking the box — the expense is gone from the list
- [ ] (e2e: the_deleted_expenses_record_still_counts_in_finances_for_that_month) Its record still shows up in Finances for that month
- [ ] (e2e: checking_the_box_also_removes_its_record_from_finances) Delete another seeded expense with an amount, this time checking the box — its record is also gone from Finances

Horses (`/barn/dev-barn/horses` and `/barn/dev-barn/horses/[id]`):

- [ ] (e2e: available_section_is_sorted_by_total_exertion_ascending) The Available section is sorted by total exertion (±3 days) ascending
- [ ] (e2e: each_available_horse_card_shows_an_exhaustion_bar) Apple/Butter/Clover each show an exhaustion bar
- [ ] (e2e: the_three_bars_land_in_three_different_color_bands) Those bars land in different color bands from one another
- [ ] (e2e: tapping_a_bar_expands_the_three_day_lesson_breakdown) Tapping a bar expands the ±3-day lesson breakdown
- [ ] (e2e: tapping_the_bar_again_dismisses_the_breakdown) Tapping the bar again dismisses the breakdown
- [ ] (e2e: tapping_elsewhere_dismisses_the_breakdown) Tapping elsewhere dismisses the breakdown
- [ ] (e2e: tapping_the_bar_does_not_navigate_to_the_horse_detail_page) Tapping the bar does not navigate to the horse detail page
- [ ] (e2e: clovers_photo_section_shows_a_placeholder_icon_when_no_photo_is_set) Clover's detail page (no photo seeded) shows a placeholder icon
- [ ] (e2e: clovers_photo_section_shows_a_set_photo_button_when_no_photo_is_set) It also shows a **Set Photo** button
- [ ] (e2e: tapping_set_photo_opens_the_horse_document_upload_screen) Tapping **Set Photo** navigates to the same upload screen used for horse documents
- [ ] (e2e: the_photo_upload_screen_locks_document_type_to_photo_with_no_dropdown) On that screen Document Type is locked to "Photo" with no dropdown
- [ ] (e2e: the_photo_upload_screen_has_no_notes_field) That screen has no Notes field
- [ ] (e2e: the_photo_upload_screen_has_no_expiration_reminder_date_field) That screen has no Expiration reminder date field
- [ ] (e2e: choosing_a_photo_file_uploads_it_immediately_with_no_upload_click) Tap **Choose File** and select `scripts/data/clover-photo.png` (non-square) → the upload starts immediately, with no separate Upload button to click
- [ ] (e2e: the_uploaded_horse_photo_displays_on_the_horse_detail_page) You land back on the horse detail page with the photo displayed
- [ ] (e2e: the_horse_photo_is_scaled_to_a_fixed_height_with_its_aspect_ratio_preserved) That photo is scaled to a fixed height with its aspect ratio preserved — both `|` edge bars still visible, not cropped off to make a square
- [ ] (e2e: replacing_the_horse_photo_uploads_the_new_file_immediately) With a photo set, tap **Replace Photo** and choose `scripts/data/butter-photo.jpg` (a different file *and* a different format) → the upload starts immediately
- [ ] (e2e: the_replaced_horse_photo_displays_the_new_image) The displayed word changes from `clover` to `butter`
- [ ] (e2e: the_replaced_horse_photo_survives_a_reload_and_the_old_one_is_gone) Reload the page after replacing a photo → the old photo is gone (confirms it wasn't just a stale client-side preview)
- [ ] (e2e: removing_the_horse_photo_restores_the_placeholder_icon) With a photo set, tap **Remove** → the placeholder icon returns
- [ ] (e2e: removing_the_horse_photo_restores_the_set_photo_button) The **Set Photo** button returns with it
- [ ] (e2e: selecting_a_pdf_on_the_photo_upload_screen_is_rejected_inline) On the photo upload screen, attempt to select `scripts/data/test_1_kb.pdf` → rejected with an inline error, not a crash
- [ ] (e2e: a_manager_can_set_a_photo_on_an_owned_horse_whose_owner_never_set_one) As manager, set `scripts/data/harper-photo.png` on Apple (the seed gives Apple an owning rider, but no owner has ever set her photo — the lock needs both, so it can't apply yet) → succeeds
- [ ] (e2e: a_manager_can_replace_a_manager_set_photo_on_an_owned_horse) Replace Apple's photo with `scripts/data/emery-photo.jpg` as manager → still succeeds (manager-set photos never lock out other managers)
- [ ] (e2e: an_owner_set_photo_hides_the_replace_and_remove_controls_from_a_manager) (#1003) On a horse whose photo was set by its **owning member** rather than by a manager, no **Replace Photo**/**Remove** control is shown to you — the converse of the case above. No seed plants this today, so plant it by hand: `bash scripts/change-user.sh dev-barn` → pick Apple's owning rider, set Apple's photo as them, switch back to yourself, reopen Apple. (An e2e run stamps `photo_uploaded_by` in the fixture instead, needing no detour.)
- [ ] (e2e: manager_form_and_exhaustion_thresholds_share_one_save_button) On Apple's detail page, the manager form and Exhaustion Thresholds share a single **Save** button
- [ ] (e2e: renaming_apple_with_threshold_overrides_updates_the_heading) Rename Apple, uncheck "Use barn defaults", set Moderate/High and Save → the name updates
- [ ] (e2e: threshold_overrides_update_from_the_same_save) The thresholds update from that same Save
- [ ] (e2e: saved_confirmation_appears_next_to_the_save_button) A brief "✓ Saved" confirmation appears next to the Save button
- [ ] (e2e: renamed_name_and_thresholds_persist_on_reload) Both values persist on reload
- [ ] (e2e: use_barn_defaults_toggle_is_still_unchecked_on_reload) The "Use barn defaults" toggle is still unchecked on reload
- [ ] (e2e: manager_form_name_field_is_labeled_barn_name) The manager form's name field is labeled **Barn Name**
- [ ] (e2e: registered_name_persists_on_reload) Fill in **Registered Name** (e.g. "Four-Leaf Clover") → Save → it persists on reload
- [ ] (e2e: horses_list_card_shows_registered_name_in_parentheses) Apple's card on the Horses list now shows "Apple (Four-Leaf Clover)"
- [ ] (e2e: setting_yourself_as_owner_puts_my_horses_at_the_top_of_the_horses_list) (#1000) Make yourself the owning member of Clover (Access section) → a **My Horses** section appears at the top of the Horses list
- [ ] (e2e: owned_horse_appears_under_my_horses) (#1000) Clover appears under **My Horses**
- [ ] (e2e: owned_horse_shows_a_green_active_badge_under_my_horses) (#1000) Clover shows a green **Active** badge there
- [ ] (e2e: owned_horse_no_longer_appears_under_available) (#1000) Clover no longer appears under Available
- [ ] (e2e: clearing_registered_name_removes_the_card_parenthetical) Clear **Registered Name** back to blank and Save → the card's parenthetical is gone on reload
- [ ] (e2e: re_checking_use_barn_defaults_reverts_thresholds_on_reload) Re-check "Use barn defaults" and Save → thresholds revert to barn defaults (`5`/`11`) on reload — **known limitation, accepted as-is**: the Moderate/High inputs don't visually refresh until reload
- [ ] (e2e: moderate_not_below_high_is_rejected_with_an_error) With "Use barn defaults" unchecked, try Moderate ≥ High → rejected with a field error
- [ ] (e2e: no_saved_confirmation_appears_for_a_rejected_save) No "✓ Saved" confirmation appears for that rejected save
- [ ] (e2e: a_rejected_save_leaves_the_name_and_status_unchanged) The horse's name and status are unchanged by it
- [ ] (e2e: a_rejected_save_leaves_the_thresholds_unchanged) The thresholds are unchanged by it
- [ ] (e2e: feed_notes_persist_on_reload) Fill in **Feed Notes** → Save → it persists on reload
- [ ] (e2e: medication_notes_persist_on_reload) Fill in **Medication Notes** → Save → it persists on reload
- [ ] (e2e: clearing_feed_notes_leaves_the_field_empty_on_reload) Clear **Feed Notes** back to blank and Save → the field is empty on reload (confirms `NULL` clears it, not just an empty-string no-op)
- [ ] (e2e: uploading_a_horse_document_redirects_back_to_the_horse_page) Documents section: tap **Add Document**, upload `scripts/data/test_1_kb.pdf` → redirects back to this horse's page
- [ ] (e2e: the_uploaded_horse_document_is_listed_in_the_documents_section) That document is listed in the horse's Documents section
- [ ] (e2e: the_horse_document_link_is_a_signed_url_for_its_stored_object) The document's link is a signed URL over that document's own stored object
- [ ] (e2e: the_horse_document_signed_url_serves_the_stored_pdf) That signed URL returns 200 with `application/pdf` and the uploaded file's bytes
- [ ] (e2e: deleting_a_horse_document_removes_its_row) Delete it → row disappears
- [ ] (e2e: an_over_limit_horse_document_is_rejected_inline) On the Add Document page, attempt to upload `scripts/data/test_4_6_mb.pdf` (4,600,000 bytes, over the 4.5MB limit) — rejected with an inline error, not a crash
- [ ] (e2e: the_upload_button_disables_while_a_horse_document_uploads) On the Add Document page, upload `scripts/data/test_4_4_mb.pdf` (4,400,000 bytes, the largest accepted size) — the Upload button disables while the upload is pending
- [ ] (e2e: an_indeterminate_progress_bar_shows_while_a_horse_document_uploads) An indeterminate progress bar shows while that upload is pending
- [ ] (e2e: an_uploaded_reminder_date_persists_in_the_reminder_date_column) Upload `scripts/data/test_1_kb.pdf` again with an **Expiration reminder date** set → the date persists in the Reminder Date column
- [ ] (e2e: editing_the_reminder_date_inline_saves_the_new_date) Edit that date inline (tap the field, change the date, tap away) → the new date saves
- [ ] (e2e: the_inline_reminder_date_edit_saves_without_a_page_reload) That inline edit saves without a page reload
- [ ] (e2e: a_past_reminder_date_shows_a_reminder_due_badge) Set that document's Reminder Date to a past date → a **Reminder Due** badge appears next to the date
- [ ] (e2e: a_due_horse_document_shows_a_card_in_the_dashboard_reminders_section) A card for it shows up under the Dashboard's Reminders section
- [ ] (e2e: the_dashboard_reminder_card_links_back_to_the_horse) That card links back to this horse

Members (`/barn/dev-barn/members` and `/barn/dev-barn/members/[membership_id]`):

- [ ] (e2e: members_list_you_card_links_to_your_own_membership) A "You" card renders at the top of the Members list
- [ ] (e2e: managers_section_lists_other_manager) A **Managers** section renders, listing Morgan
- [ ] (e2e: managers_section_excludes_your_own_entry) Your own entry is excluded from that Managers section
- [ ] (e2e: trainers_section_lists_trainer) A **Trainers** section renders
- [ ] (e2e: riders_section_lists_rider) A **Riders** section renders
- [ ] (e2e: trainer_detail_shows_phone_row) A trainer's member detail page shows a Phone row under **Contact Info**
- [ ] (e2e: trainer_detail_shows_emergency_contact_name_row) It shows an Emergency Contact Name row
- [ ] (e2e: trainer_detail_shows_emergency_contact_phone_row) It shows an Emergency Contact Phone row
- [ ] (e2e: blank_contact_fields_render_as_dash) Any of those three left blank renders as "—"
- [ ] (e2e: managed_rider_detail_renders_name_without_linked_user) Managed/unclaimed rider Harper Test's member detail page renders their name even though the account has no linked `user_id`
- [ ] (e2e: managed_rider_detail_renders_contact_info) That page renders **Contact Info** too
- [ ] (e2e: managed_rider_documents_section_renders) Its Documents section renders normally, not blocked
- [ ] (e2e: managed_rider_documents_section_has_add_document_button) That Documents section has an **Add Document** button
- [ ] (e2e: managed_rider_contact_info_is_editable_form) On Harper Test's member detail page, **Contact Info** is an editable form (manager viewing an unclaimed/managed member)
- [ ] (e2e: managed_rider_contact_info_values_persist_after_save_and_reload) Set Phone, Emergency Contact Name and Emergency Contact Phone there and tap **Save** → the values persist on reload
- [ ] (e2e: choosing_a_photo_file_uploads_it_immediately_and_returns_to_the_member_page) On Harper Test's member detail page, tap **Set Photo** and choose `scripts/data/harper-photo.png` → the upload starts immediately
- [ ] (e2e: choosing_a_photo_file_uploads_it_immediately_and_returns_to_the_member_page) You land back on the member page
- [ ] (e2e: the_uploaded_member_photo_displays_on_the_member_page) The photo displays there
- [ ] (e2e: replacing_the_member_photo_with_a_jpg_repoints_the_displayed_image) With Harper Test's photo set, tap **Replace Photo** and choose `scripts/data/emery-photo.jpg` (a different file *and* a different format) → the displayed photo's signed URL repoints to the newly uploaded `.jpg` object
- [ ] (e2e: removing_the_member_photo_restores_the_no_photo_placeholder) With Harper Test's photo set, tap **Remove** → the placeholder returns
- [ ] (e2e: removing_the_member_photo_restores_the_set_photo_button) The **Set Photo** button returns with it
- [ ] (e2e: claimed_member_photo_section_offers_no_edit_controls_to_a_manager) A claimed trainer's member detail page shows no **Set Photo**/**Replace Photo**/**Remove** control (manager can't edit a claimed member's photo)
- [ ] (e2e: uploading_your_own_photo_displays_it_on_your_member_page) On your own manager member detail page, tap **Set Photo** and upload `scripts/data/clover-photo.png` → the photo displays
- [ ] (e2e: your_own_member_photo_persists_across_a_reload) That photo persists on reload
- [ ] (e2e: uploading_a_member_document_redirects_back_to_the_member_page) Tap **Add Document** on Harper Test's page and upload `scripts/data/test_1_kb.pdf` → redirects back to the member page
- [ ] (e2e: the_uploaded_member_document_is_listed_on_the_member_page) The document is listed there
- [ ] (e2e: the_member_document_signed_url_serves_the_pdf) Its signed-URL link returns 200 with `application/pdf`
- [ ] (e2e: deleting_a_member_document_removes_its_row) Delete it → row disappears
- [ ] (e2e: trainer_detail_has_an_add_document_button) A trainer's member detail page has an **Add Document** button
- [ ] (e2e: trainer_add_document_button_links_to_the_trainer_upload_page) That button links to the shared `/barn/dev-barn/documents/new?entity=trainer&id=<id>` page
- [ ] (e2e: rider_detail_has_an_add_document_button) Rider Gale Test's member detail page has an **Add Document** button
- [ ] (e2e: rider_add_document_button_links_to_the_rider_upload_page) That button links to `/barn/dev-barn/documents/new?entity=rider&id=<id>`
- [ ] (e2e: rider_detail_shows_an_active_agreements_header) Rider Emery's member detail page shows an **Active Agreements** header
- [ ] (e2e: rider_detail_shows_a_card_for_the_lease_agreement) It shows a card for her seeded lease agreement
- [ ] (e2e: rider_detail_shows_a_card_for_the_boarding_agreement) It shows a card for her seeded boarding agreement
- [ ] (e2e: each_agreement_card_names_its_kind) Each of those cards names its kind (lease or boarding)
- [ ] (e2e: each_agreement_card_names_its_horse) Each names its horse
- [ ] (e2e: each_agreement_card_shows_its_fee) Each shows its fee
- [ ] (e2e: each_agreement_card_links_to_its_agreement_detail_page) Each links to its agreement detail page
- [ ] (e2e: a_rider_with_no_active_agreements_shows_the_empty_state) A rider with no active agreements shows **No active agreements** instead
- [ ] (e2e: the_empty_active_agreements_state_carries_no_add_boarding_link) That empty state carries no add-boarding link
- [ ] (e2e: a_managed_riders_detail_page_shows_the_active_agreements_section) A managed (unclaimed) rider's detail page shows the same **Active Agreements** section
- [ ] (e2e: trainer_detail_instructor_access_button_reads_revoke) A trainer's member detail page shows an **Instructor Access** section reading **Revoke Instructor Access** (trainers default to `can_instruct=true`)
- [ ] (e2e: revoking_instructor_access_prompts_with_the_trainers_name) Tapping it raises a browser confirm prompt naming the trainer
- [ ] (e2e: the_revoke_prompt_warns_the_trainer_becomes_unassignable_to_future_lessons) That prompt warns they'll no longer be assignable to future lessons
- [ ] (e2e: cancelling_the_revoke_prompt_leaves_instructor_access_unchanged) **Cancel** it → access is unchanged
- [ ] (e2e: confirming_the_revoke_prompt_flips_the_button_to_grant) Tap **Revoke Instructor Access** again and confirm → the button now reads **Grant Instructor Access**
- [ ] (e2e: a_revoked_trainer_is_absent_from_the_new_lesson_instructor_select) That trainer no longer appears in the instructor select on the new-lesson form
- [ ] (e2e: granting_instructor_access_raises_no_confirm_prompt) Tapping **Grant Instructor Access** raises no confirm prompt
- [ ] (e2e: a_regranted_trainer_returns_to_the_new_lesson_instructor_select) The trainer reappears in the instructor select afterwards
- [ ] (e2e: your_own_instructor_access_button_reads_grant) Your own manager member detail page shows an **Instructor Access** section reading **Grant Instructor Access**
- [ ] (e2e: granting_your_own_instructor_access_raises_no_confirm_prompt) Tapping it raises no confirm prompt
- [ ] (e2e: you_appear_in_the_new_lesson_instructor_select_after_granting) You then appear in the instructor select on the new-lesson form
- [ ] (e2e: revoking_your_own_instructor_access_raises_a_confirm_prompt) Tapping **Revoke Instructor Access** to undo does raise a confirm prompt
- [ ] (e2e: a_riders_detail_page_has_no_instructor_access_section) Rider Gale Test's member detail page shows no **Instructor Access** section
- [ ] (e2e: a_removable_members_header_carries_a_remove_button_beside_their_name) Indigo Test's member detail page shows a **Remove** button top-right of the header, next to the member's name
- [ ] (e2e: confirming_the_remove_prompt_redirects_to_the_members_list) Tap it and confirm the browser prompt → you're redirected to the Members list
- [ ] (e2e: a_removed_member_no_longer_appears_on_the_members_list) Indigo Test no longer appears on that list
- [ ] (e2e: your_own_member_detail_header_carries_no_remove_button) Your own manager member detail page shows no **Remove** button
- [ ] (e2e: a_second_managers_header_carries_no_remove_button) Second manager Morgan Manager's member detail page shows no **Remove** button either (managers can't remove other managers)

Finances (`/barn/dev-barn/finances`):

- [ ] (manual) The Finances page as a whole — Outstanding sections, tab pills, and every tab's table/footer — looks clean and visually consistent (spacing, alignment, typography) with the rest of the app
- [ ] (e2e: outstanding_income_lists_past_unpaid_lesson) **Outstanding Income** section (renamed from "Outstanding") lists past unpaid lessons
- [ ] (e2e: outstanding_income_row_leaves_list_once_payment_type_set) Set a payment type on one **Outstanding Income** row via the inline dropdown → it leaves the list
- [ ] (e2e: outstanding_income_lesson_date_renders_in_barn_timezone) A lesson row's date in **Outstanding Income** is the barn-local date of the time you entered for that lesson, not shifted by your own machine's UTC offset
- [ ] (e2e: by_horse_drilldown_lesson_date_renders_in_barn_timezone) That same lesson's date in the **By Horse** drill-down is the barn-local date, not shifted by your own machine's UTC offset
- [ ] (e2e: by_rider_drilldown_lesson_date_renders_in_barn_timezone) That same lesson's date in the **By Rider** drill-down is the barn-local date, not shifted by your own machine's UTC offset
- [ ] (e2e: by_instructor_drilldown_lesson_date_renders_in_barn_timezone) That same lesson's date in the **By Instructor** drill-down is the barn-local date, not shifted by your own machine's UTC offset
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
- [ ] (e2e: comped_lesson_tier_row_net_is_negative) Mark a $0 (comped) lesson paid → its net contribution is negative (cut with no fee to offset it)
- [ ] (e2e: comped_lesson_tier_row_net_renders_in_parentheses) That comped lesson's negative net renders in parentheses, e.g. `($25.00)`, not with a leading minus sign
- [ ] (e2e: comped_lesson_reduces_every_tabs_total_net_by_its_instructor_cut) That comped lesson's instructor cut still reaches the barn-wide Net total (not dropped or clamped to zero)
- [ ] (e2e: paid_lease_charge_raises_by_tier_outside_this_view_gross) Mark the lease's first charge as paid (`/barn/dev-barn/agreements/[id]` → set Payment Type) → back on Finances, **By Tier**'s footer **Outside this view** row for Gross increases by the charge amount (a charge has no tier)
- [ ] (e2e: paid_lease_charge_raises_by_instructor_outside_this_view_gross) Same charge: **By Instructor**'s footer **Outside this view** row for Gross also increases by the charge amount (a charge has no instructor)
- [ ] (e2e: paid_lease_charge_raises_the_leased_horses_by_horse_gross) Same charge: **By Horse** (Apple)'s Gross total includes the full charge amount directly (a charge is horse-tied)
- [ ] (e2e: horse_drilldown_shows_the_paid_charge_as_a_row) Drilling into Apple's row shows the charge as a row in the combined table
- [ ] (e2e: horse_drilldown_charge_row_links_back_to_its_agreement) That same charge row carries a working link back to the agreement
- [ ] (e2e: paid_lease_charge_raises_the_leasing_riders_by_rider_gross) Same charge: **By Rider** (Dana)'s Gross total includes the full charge amount directly (a charge is rider-tied)
- [ ] (e2e: removing_a_trainer_redirects_to_the_members_list) On that trainer's member detail page, tap **Remove** and confirm the browser prompt after they've instructed a paid lesson → you're redirected to the Members list
- [ ] (e2e: removed_trainer_no_longer_appears_on_the_members_list) The removed trainer no longer appears on the Members list
- [ ] (e2e: removed_instructors_lesson_fee_folds_into_by_instructor_unattributed) Back on Finances, that lesson's fee is still counted, now folded into **By Instructor**'s footer **Unattributed** row
- [ ] (e2e: by_instructor_has_no_no_instructor_body_row_after_the_removal) By Instructor no longer shows a "No instructor" body row for that lesson
- [ ] (e2e: by_instructor_unattributed_info_icon_explains_a_removed_instructor) Tap the **Unattributed** row's ⓘ on By Instructor → the explanation covers a removed instructor
- [ ] (e2e: by_paid_to_tab_shows_recipient_gross_expenses_net_columns) **By Paid To** tab shows **Recipient | Gross | Expenses | Net** columns
- [ ] (e2e: by_paid_to_gross_and_net_are_always_a_dash) By Paid To's Gross and Net are always `—` (a recipient has no revenue concept)
- [ ] (e2e: by_paid_to_expenses_column_is_the_recipients_combined_total) By Paid To's Expenses column (renamed from "Expense Amount") is the recipient's total
- [ ] (e2e: by_paid_to_recipient_name_is_an_underlined_link) By Paid To's recipient name is an underlined link (not just underlined on hover)
- [ ] (e2e: by_paid_to_rows_load_sorted_by_recipient_name_ascending) On page load, By Paid To rows are sorted by **Recipient** name ascending
- [ ] (e2e: by_paid_to_recipient_header_shows_an_ascending_indicator_on_load) On page load, a ▲ appears next to By Paid To's **Recipient** header
- [ ] (e2e: by_paid_to_expenses_header_tap_re_sorts_rows_ascending) Tap the **Expenses** header on By Paid To → rows re-sort by that column ascending
- [ ] (e2e: by_paid_to_expenses_header_tap_moves_the_ascending_indicator_off_recipient) After tapping **Expenses** on By Paid To, a ▲ appears on the Expenses header (and disappears from Recipient)
- [ ] (e2e: by_paid_to_second_expenses_header_tap_reverses_the_row_order) Tap the **Expenses** header on By Paid To again → order reverses
- [ ] (e2e: by_paid_to_second_expenses_header_tap_flips_the_indicator_to_descending) After that second tap on By Paid To, the indicator flips to ▼
- [ ] (e2e: by_paid_to_total_combines_a_second_expense_for_the_same_recipient) Add a second expense for the same recipient this month → its **By Paid To** total updates to the combined amount
- [ ] (e2e: recipient_drilldown_lists_only_that_recipients_expenses_for_the_month) Click a recipient → drill-down `/barn/dev-barn/finances/expenses/[recipient]` lists that recipient's expenses for the month
- [ ] (e2e: recipient_drilldown_shows_date_type_amount_columns) The recipient drill-down table shows **Date | Type | Amount** columns
- [ ] (e2e: recipient_drilldown_date_links_to_the_expense_edit_page) The recipient drill-down's Date column links to the expense's edit page
- [ ] (e2e: recipient_drilldown_total_matches_the_by_paid_to_expenses_cell) The recipient drill-down's bottom **Total** matches the By Paid To summary
- [ ] (e2e: recipient_name_with_ampersand_round_trips_through_the_drilldown_link) A recipient name containing `&` or spaces (e.g. seed a "Dr. Smith & Sons" expense) round-trips correctly through the drill-down link — no broken/garbled URL
- [ ] (e2e: every_tab_footer_total_shows_the_same_gross_figure) **Reconciliation check** (#971): open all five tabs for the same month → each of the four tabs that has a Gross column (every tab but **By Paid To**, whose Gross is `—` by design) shows the identical Gross figure in its footer **Total** row
- [ ] (e2e: every_tab_footer_total_shows_the_same_expenses_figure) Reconciliation, all five tabs: each one's footer **Total** row shows the identical Expenses figure
- [ ] (e2e: every_tab_footer_total_shows_the_same_net_figure) Reconciliation, the same four tabs as the Gross check: each one's footer **Total** row shows the identical Net figure
- [ ] (e2e: orphaned_expense_amount_appears_in_the_by_horse_unattributed_row) **Unattributed-expense check** (#971): delete a paid expense from `/barn/dev-barn/expenses/[id]/delete` **without** checking "Also delete the collected record from Finances" (its `transactions` row survives with no `horse_expenses` row behind it) → back on Finances, that amount appears under **Unattributed** in the By Horse footer instead of silently disappearing
- [ ] (e2e: orphaned_expense_amount_appears_in_the_by_paid_to_unattributed_row) That same amount appears under **Unattributed** in the By Paid To footer
- [ ] (e2e: by_horse_unattributed_info_icon_explains_where_the_amount_came_from) Tap the ⓘ on **By Horse**'s **Unattributed** row → the explanation covers a paid lesson with no horse recorded, or an expense record whose original entry was deleted after being marked paid, and states that a barn-wide expense split across horses is never counted here (it appears in each horse's own row instead)
- [ ] (e2e: by_paid_to_unattributed_info_icon_explains_where_the_amount_came_from) Tap the ⓘ on **By Paid To**'s **Unattributed** row → the explanation covers an expense record whose original entry was deleted after being marked paid

Manage Barn (`/barn/dev-barn/settings`):

- [ ] (e2e: settings_sections_all_render_collapsed_on_page_load) Sections render as collapsible accordions, all collapsed on page load
- [ ] (e2e: clicking_a_section_heading_opens_that_section) Clicking a section's heading opens that section
- [ ] (e2e: clicking_an_open_section_heading_closes_it) Clicking it again closes the section
- [ ] (e2e: opening_a_second_section_leaves_the_first_open) Opening one section leaves the other sections' open/closed state unchanged
- [ ] (e2e: settings_page_has_no_active_members_section) There is no "Active Members" section (member removal now lives on each member's own detail page — see Members phase above)
- [ ] (e2e: instructor_cut_field_shows_the_barns_current_value) **Default Instructor Cut** field shows the current value (default `25`)
- [ ] (e2e: saving_a_new_instructor_cut_persists_it_across_a_reload) Change it and **Save** → the value persists on reload
- [ ] (e2e: instructor_cut_helper_text_says_past_lessons_are_unaffected) Its helper text says the change doesn't affect past lessons, not that it recalculates historical income
- [ ] (e2e: instructor_cut_accepts_zero) Try `0` — allowed
- [ ] (e2e: blank_instructor_cut_is_rejected_by_the_field) Try blank — rejected
- [ ] (e2e: a_rejected_blank_instructor_cut_leaves_the_stored_value_unchanged) After that rejection the field's stored value is unchanged
- [ ] (e2e: changing_a_tier_price_warns_that_past_lessons_are_unaffected) Edit a tier (`/barn/dev-barn/settings/tiers/[id]`): change its price → an amber warning appears noting past lessons are unaffected
- [ ] (e2e: reverting_a_tier_price_removes_the_warning) Revert to the original price → that warning disappears
- [ ] (e2e: changing_a_tier_instructor_cut_warns_that_past_lessons_are_unaffected) On that same tier edit page, change its **Instructor Cut** → the same style amber warning appears ("won't affect past lessons")
- [ ] (e2e: reverting_a_tier_instructor_cut_removes_the_warning) Revert the Instructor Cut → that warning disappears
- [ ] (e2e: new_tier_form_prefills_instructor_cut_from_the_barn_default) **Add Tier** a new tier — its Instructor Cut field pre-fills from the barn's Default Instructor Cut
- [ ] (e2e: setting_a_tier_as_default_preselects_it_on_the_new_lesson_form) Set a different tier as **default** → the new-lesson form pre-selects it
- [ ] (e2e: deactivating_a_tier_removes_it_from_the_new_lesson_form) **Deactivate** the Group Special tier → it no longer appears when creating a lesson
- [ ] (e2e: reactivating_a_tier_restores_it_to_the_new_lesson_form) **Reactivate** it → it appears again when creating a lesson
- [ ] (e2e: board_fee_helper_text_says_existing_boarders_are_unchanged) The **Default Board Fee** field's non-retroactive helper text is visible
- [ ] (e2e: changing_the_default_board_fee_leaves_an_existing_boarding_agreement_unchanged) Edit **Default Board Fee** and Save → a pre-existing boarding agreement's fee is unchanged
- [ ] (e2e: a_new_boarding_agreement_prefills_the_changed_default_board_fee) A newly created boarding agreement pre-fills the new fee
- [ ] (e2e: exhaustion_threshold_fields_show_the_barns_current_values) **Horse Exhaustion Thresholds** fields show the current Moderate/High values (defaults `5`/`11`)
- [ ] (e2e: saving_new_exhaustion_thresholds_persists_them_across_a_reload) Change both and **Save** → values persist on reload
- [ ] (e2e: a_moderate_threshold_at_or_above_high_is_rejected_with_a_field_error) Try setting Moderate ≥ High → rejected with a field error
- [ ] (e2e: a_rejected_threshold_save_leaves_the_stored_values_unchanged) After that rejection the stored threshold values are unchanged
- [ ] (e2e: schedule_buffer_field_shows_the_barns_current_value) **Schedule Buffer** field shows the current value (default `30`)
- [ ] (e2e: saving_a_new_schedule_buffer_persists_it_across_a_reload) Change it and **Save** → value persists on reload
- [ ] (e2e: barn_timezone_select_shows_the_barns_current_zone) **Barn Timezone** select shows the current value (default Eastern)
- [ ] (e2e: saving_a_new_barn_timezone_persists_it_across_a_reload) Change it and Save → it persists on reload
- [ ] (e2e: changing_the_barn_timezone_moves_a_newly_past_due_expense_into_outstanding_expenses) With the timezone changed above, add a planned expense due a few minutes from now, wait for its due time to pass *in the barn's configured timezone* → it now surfaces under Finances' **Outstanding Expenses** section — proves the barn timezone setting, not just the display, actually drives the past-due check
- [ ] (e2e: dashboard_heading_names_the_barns_day_not_the_devices) #1149 setup — set **Barn Timezone** to Eastern, set your *machine's* timezone to Hawaii, and do the next two checks after 8pm Hawaii time (by then the barn's own date is already tomorrow): the dashboard heading names the barn's date, one day ahead of your device's
- [ ] (e2e: new_lesson_calendar_greys_out_the_devices_day_as_past) Under that setup, **New Lesson**'s month calendar greys out your machine's own current date as past — the cutoff follows the barn's day, which has already moved past it, not your device's
- [ ] (e2e: a_document_due_on_the_barns_day_shows_the_reminder_due_badge) Under that setup, a horse document whose Reminder Date is *tomorrow* by your machine's clock (i.e. the barn's current date) shows the amber **Reminder Due** badge on the horse detail page
- [ ] (e2e: add_expense_hides_the_time_field_for_the_devices_already_past_day) Under that setup, **Add Expense** with the Date set to your machine's own current date — already yesterday in barn time — hides the optional **Time** field, since the barn considers that date past
- [ ] (e2e: add_expense_date_prefills_the_barns_day) Under that setup, **Add Expense**'s Date field pre-fills with the *barn's* date, one day ahead of your device's
- [ ] (e2e: add_lease_and_add_boarding_start_dates_prefill_the_barns_day) Under that setup, **Add Lease** / **Add Boarding**'s Start Date pre-fills with the barn's date, one day ahead of your device's
- [ ] (e2e-candidate) Under that setup, a lesson you created for 4:00 PM still reads 4:00 PM on the Lessons list — not 10:00 AM Hawaii (#1222)
- [ ] (e2e-candidate) Under that setup, that same lesson still reads 4:00 PM on the lesson detail page (#1222)
- [ ] (e2e-candidate) Under that setup, that same lesson still reads 4:00 PM on the dashboard calendar (#1222)
- [ ] (e2e-candidate) Under that setup, opening that lesson's **Edit** form shows 4:00 PM and the barn's date in the date/hour picker (#1222)
- [ ] (e2e-candidate) Under that setup, saving that **Edit** form without changing anything leaves the stored time untouched (#1222)
- [ ] (e2e-candidate) Under that setup, **New Lesson**'s date pre-fills with the barn's date, not your device's (#1222)
- [ ] (e2e-candidate) Under that setup, **New Lesson**'s hour select opens on the barn's current hour, not your device's (#1222)
- [ ] (e2e-candidate) Under that setup, creating a lesson at 4:00 PM stores 4:00 PM *barn-local* — check the DB value, or reopen the lesson and confirm it still says 4:00 PM (#1222 — entry is barn-anchored, not just display)
- [ ] (e2e-candidate) Under that setup, **Add Expense** with a Time of 11:30 PM stores that as 11:30 PM *barn-local* — check that expense's `transactions.occurred_at` in the DB, which must be the barn's 11:30 PM converted to UTC, not your device's (#1222 — a late-evening entry near a month boundary otherwise buckets into the wrong month in Finances)
- [ ] (e2e-candidate) Under that setup, a barn event's time on **Manage Barn** → Barn Events is the barn's, matching what the Add Event form was given (#1222)
- [ ] (e2e-candidate) Under that setup, that same barn event's time on the dashboard calendar is the barn's, matching what the Add Event form was given (#1222)
- [ ] (e2e: add_event_form_checks_all_three_visible_to_roles_by_default) **Add Event** under Barn Events (`/barn/dev-barn/settings/events/new`): the three **Visible to** role checkboxes (Manager, Trainer, Rider) are all checked by default
- [ ] (e2e: creating_a_barn_event_lists_it_under_its_title) Create an event with a title, date/hour, and notes → it appears in the Barn Events list under the correct title
- [ ] (e2e: barn_event_list_entry_shows_the_events_date_and_time) That list entry shows the correct date
- [ ] (e2e: barn_event_list_entry_shows_its_visible_to_roles) That list entry shows "manager, trainer, rider" visible-to text
- [ ] (e2e: unchecking_rider_on_an_event_persists_after_save) **Edit** that event and uncheck the Rider checkbox → Save → reopening Edit shows Rider unchecked
- [ ] (e2e: manager_and_trainer_stay_checked_after_unchecking_rider) Manager and Trainer are still checked there
- [ ] (e2e: event_delete_confirm_page_names_the_event) From the event's Edit page, tap **Delete** → the confirm page shows the event's title
- [ ] (e2e: confirming_delete_removes_the_event_from_the_barn_events_list) **Confirm Delete** → the event no longer appears in the Barn Events list
- [ ] (e2e: data_backup_section_shows_download_all_documents_button) **Data Backup** section shows a **Download All Documents** button
- [ ] (e2e: download_all_documents_button_is_enabled_when_the_barn_has_documents) That button is enabled (documents were already uploaded earlier in this phase)
- [ ] (e2e: download_all_documents_downloads_a_zip_file) Tap **Download All Documents** → a `.zip` downloads
- [ ] (e2e: documents_zip_groups_horse_documents_under_a_folder_named_for_the_horse) That zip contains a `horse/<name>/` folder holding the horse documents uploaded earlier
- [ ] (e2e: documents_zip_groups_member_documents_under_a_folder_named_for_the_member) It contains a `member/<name>/` folder holding the member documents uploaded earlier
- [ ] (e2e: documents_zip_names_each_file_original_type_and_date) Each file inside is named `<original>-<type>-<date>.<ext>`
- [ ] (e2e: data_backup_section_shows_download_data_button) **Data Backup** section also shows a **Download Data** button
- [ ] (e2e: download_data_button_is_enabled_with_no_nothing_to_export_state) That button is always enabled (no "nothing to export" state)
- [ ] (e2e: download_data_downloads_an_xlsx_file) Tap **Download Data** → an `.xlsx` downloads
- [ ] (e2e: data_workbook_has_exactly_the_eight_expected_sheets) It has exactly 8 sheets: Horses, Lessons, Agreements, Agreement Charges, Horse Expenses, Members, Documents, All Transactions
- [ ] (e2e: horses_sheet_lists_the_seeded_horse_by_name) A horse created earlier in this phase appears by name (not a raw id) on the Horses sheet
- [ ] (e2e: lessons_sheet_lists_the_seeded_lesson) A lesson created earlier in this phase appears on the Lessons sheet
- [ ] (e2e: lessons_sheet_row_names_its_horse_and_rider_not_ids) That lesson's row names its horse and rider (not raw ids)
- [ ] (e2e: members_sheet_lists_the_seeded_member_by_name) A member created earlier in this phase appears by name (not a raw id) on the Members sheet
- [ ] (e2e: horses_sheet_leads_with_the_date_time_added_column) **Date/Time Added** is the first column on the Horses sheet
- [ ] (e2e: lessons_sheet_leads_with_the_date_time_column) **Date/Time** is the first column on the Lessons sheet
- [ ] (e2e: horse_expenses_sheet_leads_with_the_date_time_column) It is also the first column on the Horse Expenses sheet
- [ ] (e2e: all_transactions_sheet_leads_with_the_date_time_column) It is also the first column on the All Transactions sheet
- [ ] (e2e: members_sheet_leads_with_the_date_time_added_column) **Date/Time Added** is the first column on the Members sheet
- [ ] (e2e: documents_sheet_leads_with_the_date_time_added_column) It is also the first column on the Documents sheet
- [ ] (e2e: agreements_sheet_leads_with_the_start_date_column) **Start Date** is the first column on the Agreements sheet
- [ ] (e2e: agreement_charges_sheet_leads_with_the_period_column) **Period** is the first column on the Agreement Charges sheet
- [ ] (e2e: horses_sheet_rows_run_newest_first) The Horses sheet's rows run newest-first by that first column
- [ ] (e2e: all_transactions_sheet_rows_run_newest_first) The All Transactions sheet's rows also run newest-first
- [ ] (e2e: agreements_sheet_rows_run_newest_first_by_start_date) The Agreements sheet's rows also run newest-first, by Start Date
- [ ] (e2e: header_row_is_bold_on_every_sheet) The header row is bold on every sheet
- [ ] (e2e: header_row_is_taller_than_a_data_row_and_vertically_centered) The header row is visibly taller than a data row, with its text vertically centered
- [ ] (e2e: expense_date_and_time_share_one_date_time_cell) An expense's date and time appear together in that one **Date/Time** cell, not in two columns
- [ ] (e2e: expense_without_a_time_renders_date_only) An expense entered without a time shows just its date there, with no `12:00 AM`
- [ ] (e2e: date_cells_are_real_excel_dates_not_text) A date cell is a real date to Excel, not text — the exported cell carries a date type rather than a string that looks like one
- [ ] (e2e: date_cells_render_zero_padded) Dates render zero-padded (`07/15/2026`, not `7/15/2026`) so they are all the same width
- [ ] (e2e: date_columns_are_left_justified) Date columns are left-justified, so a date-only row lines its date up with a date+time row's date
- [ ] (e2e: all_transactions_sheet_has_no_lesson_id_column) The All Transactions sheet has no `Lesson ID` column
- [ ] (e2e: all_transactions_sheet_has_no_lesson_rider_id_column) It has no `Lesson Rider ID` column
- [ ] (e2e: all_transactions_sheet_has_no_agreement_charge_id_column) It has no `Agreement Charge ID` column
- [ ] (e2e: all_transactions_sheet_has_no_expense_id_column) It has no `Expense ID` column
- [ ] (e2e: expense_transactions_show_a_negative_amount) An `expense` row on the All Transactions sheet shows a negative amount
- [ ] (e2e: instructor_payout_transactions_show_a_negative_amount) An `instructor_payout` row there also shows a negative amount
- [ ] (e2e: lesson_fee_transactions_show_a_positive_amount) A `lesson_fee` row there still shows a positive amount
- [ ] (e2e: transaction_amounts_render_as_currency) Amounts on that sheet render as currency (a `$`, two decimals), not as bare numbers
- [ ] (e2e: every_column_is_wide_enough_for_its_contents) Every column is wide enough to read its contents without manual resizing

Notifications and profile:

- [ ] (e2e: notification_bell_shows_an_unread_count_badge) Notification bell shows an unread-count badge
- [ ] (e2e: opening_the_bell_lists_the_notifications) Opening the bell lists the notifications
- [ ] (e2e: each_listed_notification_shows_its_title) Each listed notification shows its title
- [ ] (e2e: each_listed_notification_shows_its_body) Each shows its body
- [ ] (e2e: each_listed_notification_shows_its_timestamp) Each shows its timestamp
- [ ] (e2e: mark_all_read_clears_the_unread_badge) **Mark all read** clears the badge
- [ ] (e2e: avatar_menu_profile_opens_the_profile_page_with_the_barn_nav_bar) Avatar menu → **Profile** (`/profile?barn=dev-barn`) renders the barn nav bar
- [ ] (e2e: the_profile_nav_bar_carries_the_full_nine_link_manager_nav) That nav bar carries the **full 9-link manager nav** (Lessons, Expenses, Horses, Leases, Boarding, Members, Finances, Manage Barn, Guide) — same set as the regular barn pages
- [ ] (e2e: saving_an_edited_phone_redirects_back_to_the_barn) Edit phone on `/profile` → Save → you're redirected back to the barn
- [ ] (e2e: avatar_menu_user_guide_opens_the_manager_guide) Avatar menu → **User Guide** (`/barn/dev-barn/guide`) renders the manager guide
- [ ] (e2e: avatar_menu_about_opens_the_app_overview) Avatar menu → **About** (`/about`) renders the app overview
- [ ] (e2e: the_changelog_link_on_about_includes_the_current_version) The **Changelog** link on `/about` includes the current version
- [ ] (e2e: the_changelog_link_on_about_opens_the_changelog_page) That **Changelog** link opens `/changelog`
- [ ] (e2e: the_terms_of_service_link_on_about_opens_the_terms_page) The **Terms of Service** link on `/about` opens `/terms`
- [ ] (e2e: the_privacy_policy_link_on_about_opens_the_privacy_page) The **Privacy Policy** link on `/about` opens `/privacy`
- [ ] (e2e: the_back_link_on_about_returns_to_the_barn_list) The **← Back** link on `/about` returns to `/barns`
- [ ] (e2e: the_back_link_on_changelog_returns_to_the_barn_list) The **← Back** link on `/changelog` returns to `/barns`
- [ ] (e2e: the_back_link_on_terms_returns_to_the_barn_list) The **← Back** link on `/terms` returns to `/barns`
- [ ] (e2e: the_back_link_on_privacy_returns_to_the_barn_list) The **← Back** link on `/privacy` returns to `/barns`

Mobile spot-check (resize the browser to ~390px wide, or use your browser's device toolbar):

- [ ] (e2e: at_mobile_width_the_avatar_menu_opens_and_dismisses_by_tap) At this width the avatar menu opens and dismisses by tap
- [ ] (e2e: at_mobile_width_the_notification_bell_dropdown_opens_and_dismisses_by_tap) At this width the notification bell dropdown opens and dismisses by tap
- [ ] (manual) Nothing in the nav bar or its dropdowns relies on hover to be reachable or dismissible
- [ ] (e2e: the_lessons_list_has_no_horizontal_overflow_at_mobile_width) The Lessons list stays readable without horizontal scrolling
- [ ] (e2e: the_horses_list_has_no_horizontal_overflow_at_mobile_width) The Horses list stays readable without horizontal scrolling

Calendar feed (#1018):

- [ ] (e2e-candidate) On `/profile?barn=dev-barn`, a **Calendar Feed** section appears
- [ ] (e2e-candidate) Tap **Get my calendar link** → a **Copy Link** button appears
- [ ] (e2e-candidate) A **Regenerate** button appears alongside it
- [ ] (e2e-candidate) Tap **Copy Link** — the copied URL contains `/calendar.ics?token=...`
- [ ] (e2e-candidate) Open that URL directly (or `curl` it) — it returns `Content-Type: text/calendar`
- [ ] (e2e-candidate) Its body includes VEVENT entries for the barn's lessons
- [ ] (e2e-candidate) Those entries cover lessons across the whole barn (manager sees everything), not just your own
- [ ] (e2e-candidate) Tap **Regenerate**, then **Copy Link** — the copied URL carries a different token than before
- [ ] (e2e-candidate) Open the pre-regenerate URL — it now 404s

## Phase 5 — Trainer

<!-- Asserting role: trainer only. A manager may plant a precondition mid-phase; the eye doing the looking must be the trainer's. Not audited for automation yet — the few tagged lines here were relocated from Phase 4 by #1136. -->

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
- [ ] (#1019) The trainer's New Lesson form shows the same month conflict calendar on the Date field as the manager view
- [ ] (#1019) With a horse selected there, the exertion shading reflects the whole barn's lessons for that horse — not just the ones you instruct
- [ ] (#1019) With Apple selected there, the day carrying Apple's vet/farrier appointment (scheduled back in Phase 3) shows a dot — the conflict dot fires on appointments for a trainer, not just lessons
- [ ] (#1019) The Dashboard calendar shows that same vet/farrier appointment alongside your own lessons
- [ ] (#1148) That appointment's card on the Dashboard is a tappable link, not plain text
- [ ] (#1148) Tapping it opens a page headed **Appointment**
- [ ] (#1148) That page shows the appointment's recipient
- [ ] (#1148) That page shows the appointment's horse
- [ ] (#1148) That page shows no amount anywhere — the figure entered on it in Phase 3 appears nowhere on the page
- [ ] (#1148) That page shows no **Save Changes** button — it is read-only, not the manager's edit form
- [ ] (#1148) That page shows no **Delete** button
- [ ] (#1148) The Dashboard's empty-state subtext on a day with nothing on it reads "No lessons, appointments, or events scheduled for this day." — "appointments", not "expenses"
- [ ] (#1148) Switch to the **Week** view — its empty-state subtext likewise says "appointments", not "expenses"
- [ ] Create one more lesson dated within 30 minutes of one of Blake's lessons (check Blake's lesson times via the **All** filter above) — submission succeeds with no error

> This notification's recipient (Blake) isn't the persona you're currently acting as, so it can't be observed by switching personas with `change-user.sh` — the swap reassigns `barn_memberships.user_id` away from whichever persona you leave, permanently disconnecting it from the id the notification was written against. Verify the row directly instead (Supabase Studio or a `supabase db` query). The live bell UI these rows feed is exercised on a genuinely different account, in both directions, in [`POST_RELEASE_TEST_CHECKLIST.md`](POST_RELEASE_TEST_CHECKLIST.md) — that supplements these row checks rather than replacing them.

- [ ] A `notifications` row exists for Blake's `user_id` with `type = 'instructor_lesson_nearby'` and `link = '/barn/dev-barn/lessons'`
- [ ] That row's `title` reads **"1 new lesson scheduled nearby"** (or an incremented count, e.g. "2 new lessons scheduled nearby", if a prior nearby lesson already landed this same row this pass)
- [ ] Edit one of your own lessons — the instructor field is **hidden entirely** (no label, no read-only text — just locked server-side)
- [ ] Open one of Blake's lessons from the Lessons list — no Edit link is shown, and navigating to its `/edit` URL directly does not let you save changes
- [ ] (e2e-candidate) No **Delete** button is shown on any lesson, your own included
- [ ] On one of your own lessons, click **Cancel** in the header and cancel a rider's spot (or the whole lesson) — works the same as manager; open Blake's lesson — no header **Cancel** button is shown
- [ ] (e2e-candidate) Open **Edit Lesson** on an already-cancelled lesson you instruct — the Notes section shows the same **Cancellation Notes** textarea the manager gets
- [ ] (e2e-candidate) On that same lesson, enter cancellation notes in that textarea and Save — its detail page renders the same read-only **Cancellation Notes** row the manager gets
- [ ] The recurring lesson created in Phase 3 still shows its **Recurring** badge on the Lessons list row and detail page, now that it's reassigned to you
- [ ] Open the recurring lesson's edit page (now reassigned to you) — "This is part of a recurring series" indicator and **Stop Recurring Lessons** button appear at the top of the page, above the lesson form; stopping works the same as manager
- [ ] Horse detail page: documents are listed with working links, uploading `scripts/data/test_1_kb.pdf` works (including setting a Reminder Date), but there is **no Actions column at all** (not just a hidden delete button), **no Exhaustion Thresholds section**, and the Reminder Date column is **read-only**
- [ ] Horse detail page shows the Feed Notes/Medication Notes entered as manager, read-only (no textareas, no Save button); clear one as manager and confirm its row disappears here on reload instead of showing blank
- [ ] (#1006) As manager, grant this trainer a horse-privileges row on **Clover** (Access section) then make them Clover's owning member; reopen Clover as this trainer — **Feed Notes**/**Medication Notes** are now editable textareas with a **Save** button
- [ ] (#1006) Edit and save both Feed Notes and Medication Notes as this trainer, then reload — the new text persists
- [ ] (#1000) Back on the Horses list as this trainer, a **My Horses** section appears at the top showing **Clover** with a status badge, and Clover no longer appears under Available/Unavailable
- [ ] Butter's horse detail page (this trainer does **not** own her): her seeded photo displays, but there is **no Set Photo / Replace Photo / Remove control**
- [ ] (#1003) On **Clover**'s detail page (the horse this trainer now owns), a **Set Photo** or **Replace Photo** control **is** shown — owning a horse grants photo write even to a non-manager
- [ ] (e2e-candidate) As manager, set Apple's **Registered Name** (e.g. "Four-Leaf Clover"); reopen Apple as this trainer — a **Registered Name** row appears below Status (an e2e run seeds the registered name in the trainer's own barn instead)
- [ ] (e2e-candidate) As manager, clear Apple's **Registered Name** again; reopen Apple as this trainer — no **Registered Name** row is shown
- [ ] Members page shows all four sections (You/Managers/Trainers/Riders), same structure as the manager view — no Add Trainer/Add Rider forms; open your own member detail page and upload `scripts/data/test_1_kb.pdf`, optionally setting a Reminder Date; the Reminder Date column on your own documents is **read-only** (only a manager can edit it)
- [ ] In the Riders section, the managed/unclaimed rows (Gale/Harper Test, whichever are still unclaimed — Indigo Test was removed earlier in the Members phase) render as normal card links — name only, **no Unlinked badge** (the list never shows Copy Invite/Revoke controls for any role — those now live only on the detail page's manager-only Manage Member section, which a trainer viewing that page won't see either)
- [ ] Open Harper Test's member detail page as trainer — Contact Info is read-only (blank fields show "—"), with no Save button
- [ ] Open another trainer's or a manager's member detail page from the roster — page loads (no 404), shows their name and **Contact Info** section (#863 — a trainer can view any member's Contact Info), but **no Documents section**; open Blake's (a rider's) detail page — same: Contact Info shown, Documents hidden (#779 narrowed rider-document access to manager/self only)
- [ ] `/barn/dev-barn/finances` is blocked — shows **404**, not a login redirect; `/barn/dev-barn/finances/outstanding` works and shows **only your own** outstanding lessons, plus any uncollected cancellation fees for lessons you instruct
- [ ] (#1015) Dashboard's Day view, on a day with other instructors' lessons scheduled too, shows only the lessons you instruct — not the whole barn's schedule
- [ ] (e2e-candidate) (#1016) Switching to Week view shows only lessons you instruct across all 7 days, matching Day view's role-scoping
- [ ] Dashboard: if any of your instructed lessons are unpaid, a "Reminders" section with an "N unpaid lessons" card appears, linking to `/barn/dev-barn/finances/outstanding` — this is your only nav path to that page (no Finances link in the nav)
- [ ] Avatar menu → **Profile** (`/profile?barn=dev-barn`): barn nav bar renders with the **full 4-link trainer nav** (Lessons, Horses, Members, Guide) — same set as the regular barn pages
- [ ] (#1018) On the same Profile page, get/open your Calendar Feed link — it includes only lessons where you're the instructor (your reassigned Alex lessons), not Blake's

## Phase 6 — Rider

<!-- Asserting role: rider only. A manager may plant a precondition mid-phase; the eye doing the looking must be the rider's. Not audited for automation yet — the few tagged lines here were relocated from Phase 4 by #1136. -->

Switch role (pick **Dana** from the same member list as Phase 5):

```bash
bash scripts/change-user.sh dev-barn
```

- [ ] Nav shows only: barn name, Lessons, Horses, Members, Guide — **no Leases, no Boarding, no Expenses**
- [ ] `/barn/dev-barn/expenses` is blocked — visiting it directly shows **404**, not a login redirect
- [ ] Horses page shows Available/Unavailable cards with name (and unavailability reason) only — **no exhaustion bar**, no Inactive section
- [ ] Tap an Available or Unavailable card → navigates to that horse's detail page (#1002 — cards became linkable so a rider can view the horse's photo)
- [ ] On Butter's detail page (Dana does **not** own her), her seeded photo displays, but there is **no Set Photo / Replace Photo / Remove control**
- [ ] (e2e-candidate) As manager, set Apple's **Registered Name** (e.g. "Four-Leaf Clover"); reopen Apple as Dana — a **Registered Name** row appears below Status (an e2e run seeds the registered name in the rider's own barn instead)
- [ ] (e2e-candidate) As manager, clear Apple's **Registered Name** again; reopen Apple as Dana — no **Registered Name** row is shown
- [ ] (#1006) As manager, make Dana the owning member of **Clover** (Access section — Dana has no privileges row on Clover; this reassigns ownership away from the Phase 5 trainer, which nothing later re-checks); reopen Clover as Dana — **Feed Notes**/**Medication Notes** are editable textareas with a **Save** button
- [ ] (#1006) On **Butter**, whom Dana does *not* own, Feed Notes/Medication Notes remain read-only text
- [ ] (#1000) Back on the Horses list as Dana, a **My Horses** section appears at the top showing **Clover** with a status badge, and Clover no longer appears under Available/Unavailable
- [ ] (#1003) On **Clover**'s detail page, a **Set Photo** or **Replace Photo** control **is** shown — owning a horse grants photo write even to a rider; use it to set `scripts/data/clover-photo.png` as Dana
- [ ] (#999) As manager, grant Dana `document_privileges='read'` on a horse via its Access section; reopen that horse as Dana — a **Documents** section now appears, with no **Add Document** button
- [ ] (#999) Change that same grant to `document_privileges='write'`; reopen the horse as Dana — the **Add Document** button now appears in the Documents section
- [ ] (#999) On a horse Dana has no document privilege on, no Documents section appears for her at all
- [ ] (#999) As manager, grant Dana `lesson_read_privileges=true` on a horse with at least one upcoming lesson; reopen that horse as Dana — an **Exhaustion** bar now appears
- [ ] (#999) Tap that Exhaustion bar — it expands to show the ±3-day breakdown
- [ ] (#999) Same horse — a collapsed **Upcoming Lessons** section appears at the bottom of the page, listing its scheduled lessons
- [ ] (#999) Tap a lesson in that Upcoming Lessons list that Dana is **not** enrolled in — the lesson detail page loads (no 404)
- [ ] (#999) On a horse Dana has no lesson-read privilege on, neither the Exhaustion bar nor the Upcoming Lessons section appears
- [ ] Dashboard's Day view shows only lessons Dana is enrolled in for the viewed day, and no appointments (#1148 — manager and trainer only; riders gained no appointment visibility) or events outside her role's `visible_to_roles`
- [ ] (e2e-candidate) (#1016) Switching to Week view shows only Dana's enrolled lessons across all 7 days
- [ ] Lessons list shows only Dana's enrolled lessons, with filter pills `All | By Instructor | By Horse | By Tier` — no **My Lessons** or **By Rider** pill; Dana's own name does not appear on her own lesson cards
- [ ] Open an enrolled lesson's detail page — own rider notes visible read-only; **no private notes** shown
- [ ] Same lesson detail page — no exertion rating shown next to any horse name (still true for a horse Dana holds no lesson-read privilege on)
- [ ] (#999) On the lesson detail page reached via the privileged Upcoming Lessons tap above, Dana's privileged horse **does** show an exertion rating and its horse notes (if any)
- [ ] (#999) Same page — other riders' rider/private notes stay hidden from Dana
- [ ] (e2e-candidate) As manager, cancel a lesson Dana is enrolled in and record cancellation notes on it; reopen that lesson as Dana — its detail page renders the same read-only **Cancellation Notes** row (an e2e run seeds the cancelled lesson and its notes in the rider's own barn instead)
- [ ] Open an enrolled **group** lesson's detail page — every co-rider's real name is shown, not a blank or raw ID
- [ ] Copy a lesson ID Dana is **not** enrolled in, for a lesson with no horse she holds lesson-read privileges on, and visit `/barn/dev-barn/lessons/[id]` directly — page shows **404**, not the lesson details
- [ ] Cancel your own spot in an enrolled lesson via the **Cancel** button in the lesson detail page header (no Cancel button on the Lessons list or Dashboard) → your row shows a **Cancelled** badge on the list, Dashboard, and detail page; the rest of the lesson (and other riders in a group lesson) is unaffected; the instructor receives a "Lesson participation cancelled" notification
- [ ] `/barn/dev-barn/finances` is blocked — shows **404**, not a login redirect
- [ ] `/barn/dev-barn/finances/outstanding` shows only Dana's outstanding lessons, plus her own outstanding lease/boarding charges (if any are past due) and her own uncollected late-cancellation fees, with a Type column — no such column entries for other riders' agreements
- [ ] Dashboard: if Dana has unpaid lessons and/or unpaid leases/boarding, a "Reminders" section with "N unpaid lessons"/"N unpaid leases/boarding" cards appears, each linking to `/barn/dev-barn/finances/outstanding` — this is Dana's only nav path to that page (no Finances link in the nav)
- [ ] (#938) With an outstanding late-cancellation fee but zero unpaid lesson fees, the Dashboard's "N unpaid lessons" card still appears (its count includes the cancellation fee) instead of being hidden
- [ ] (e2e: dashboard_reminders_header_hidden_for_rider_with_no_reminders) For a rider with nothing outstanding of their own, the Dashboard shows no **Reminders** header at all — even while the barn holds unpaid items belonging to *another* rider, which proves the reminders query is rider-scoped rather than merely empty (Dana has her own unpaid items by this point, so verify as a rider who does not — the e2e run seeds exactly that pair)
- [ ] `/barn/dev-barn/members` shows all four sections (You/Managers/Trainers/Riders) — no Add Trainer/Add Rider forms, and no Unlinked badge on any managed/unclaimed row (rider never sees it, unlike a manager)
- [ ] Open your own member detail page's Documents section — shows the empty state ("No documents yet"), with **no Add Document button** (#864 — rider self-service is read-only)
- [ ] Open another member's detail page from the roster (a trainer, a manager) — page loads (no 404), shows their name and **Contact Info** section, but no Documents section
- [ ] Open Emery's member detail page (her photo is seeded) → photo displays, but no **Set Photo**/**Replace Photo**/**Remove** control is shown

> Self photo upload/replace/remove is **not** verified here as Dana — `change-user.sh` reassigns `barn_memberships.user_id` to your real login but leaves `profiles.user_id` untouched, so the storage RLS self-write check (keyed on `profiles.user_id`) fails for any impersonated persona regardless of role. Phase 2-4's own-photo check exercises this code path for real on **your own** profile (no impersonation) — the only locally-linked one, and there's no role branch in the path. The version where the self-writer is *someone other than you* needs a real second account and is verified against prod in [`POST_RELEASE_TEST_CHECKLIST.md`](POST_RELEASE_TEST_CHECKLIST.md) — don't re-add a self-photo check to an impersonated phase.
- [ ] Switch to Emery (`change-user.sh dev-barn` → Emery) and open her own member detail page — the same Active Agreements cards from Phase 4 render as plain non-clickable cards (no hover state, no navigation on tap) — not links to the manager-only agreement detail page; switch back to Dana afterward
- [ ] Avatar menu → **Profile** (`/profile?barn=dev-barn`): barn nav bar renders with the **full 4-link rider nav** (Lessons, Horses, Members, Guide) — same set as the regular barn pages
- [ ] (#1018) On the same Profile page, get/open your Calendar Feed link — it includes only lessons Dana is enrolled in, not other riders' lessons

## Phase 7 — Multi-barn

<!-- Asserting role: manager, across two barns. Cross-barn isolation, not cross-role. -->

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
