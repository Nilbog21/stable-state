# Phase 3 — Manager lesson entry

<!-- Asserting role: manager -->

> Conventions, phase partitioning, automation tags, and route coverage: [`PRE_RELEASE_TEST_CHECKLIST.md`](../../PRE_RELEASE_TEST_CHECKLIST.md)

All via `/barn/dev-barn/lessons/new`. Times entered here should display later in 12-hour AM/PM format. `reset-db.ts` seeds ~43 varied lessons across past/current/future dates, tiers, jumping, and exertion — only create the purpose-built lessons below; verify everything else against seeded data (including the seeded Custom-tier lesson).

- [ ] (e2e: creating_a_past_lesson_stores_its_date_tier_instructor_horse_and_rider) Create a **past lesson** (dated in the previous calendar month): Beginner tier, trainer Alex, horse Apple, rider Dana
- [ ] (e2e: saving_a_new_lesson_with_a_blank_fee_is_rejected_by_the_fee_field) Try saving a lesson with a blank fee (Custom tier, no tier selected) — the Fee field itself rejects the save
- [ ] (e2e: editing_a_lesson_to_a_blank_fee_is_rejected_by_the_fee_field) In edit mode, a blank fee is rejected too
- [ ] (e2e: selecting_a_named_tier_leaves_the_fee_field_visible_and_editable) Select a named tier (e.g. Beginner) — the fee field stays visible and editable
- [ ] (e2e: selecting_a_named_tier_prefills_the_fee_with_that_tiers_price) That fee field is pre-filled with the tier's price
- [ ] (e2e: an_edited_fee_is_stored_on_the_created_lesson) Change the fee and save — the lesson saves with the edited fee
- [ ] (e2e: an_edited_fee_leaves_the_lesson_on_the_selected_tier) That lesson keeps the tier's name (not "Custom")
- [ ] (e2e-candidate) Create a **current-month paid lesson** (dated a few days ago, before today): Beginner tier, trainer Alex, horse Clover, rider Dana — after saving, mark it **paid**
- [ ] (e2e-candidate) While creating it, before a date is picked no exhaustion bars render
- [ ] (e2e-candidate) Pick a date and check Apple, Butter, and Clover in turn — each shows an exhaustion bar
- [ ] (e2e-candidate) Adjust a checked horse's exertion level — its ghost segment moves live
- [ ] (e2e-candidate) Unchecked horses' bars stay solid while that exertion level changes
- [ ] (e2e-candidate) Change the date — the bars refresh
- [ ] (e2e-candidate) Open this lesson's edit page afterward and confirm Clover's bar still renders (excluding the lesson itself from its own window)

**#1019 — month conflict calendar on the Date field.** All on `/barn/dev-barn/lessons/new` unless stated.

> The two `(manual)` lines in this block compare colours by eye, so the days they compare come from the seed rather than from the checkboxes above them (#1413): `reset-db.ts` gives **Juniper** low exhaustion thresholds and four lessons, which put an amber day, a red day and a tinted neighbouring-month day on its calendar from any date the checklist is walked on. Selecting Juniper is the setup for both.

- [ ] (e2e: manager_new_lesson_date_field_renders_a_month_grid_not_a_native_date_input) (#1019) The Date field renders as a month calendar grid, not a native date box
- [ ] (e2e: manager_calendar_greys_out_every_day_before_today) (#1019) Days before today are greyed out, making today the first fully-coloured day on the grid
- [ ] (e2e: manager_no_day_is_tinted_before_a_horse_or_rider_is_selected) (#1019) With neither a horse nor a rider selected, no day is tinted
- [ ] (e2e: manager_no_day_shows_a_conflict_dot_before_a_horse_or_rider_is_selected) (#1019) With neither a horse nor a rider selected, no day shows a dot
- [ ] (e2e: manager_rider_only_selection_tints_exactly_the_days_that_rider_already_rides) (#1019) Select rider Dana and no horse — days where Dana already has a lesson are tinted
- [ ] (e2e: manager_rider_only_selection_shows_no_conflict_dot) (#1019) Still rider-only, no day shows a dot
- [ ] (e2e: manager_checking_a_horse_replaces_the_flat_rider_tint_with_exertion_shading) (#1019) Now also check horse Apple — the flat rider tint is replaced by exertion shading
- [ ] (e2e: manager_a_day_the_selected_horse_already_works_shows_a_conflict_dot) (#1019) A day where Apple already has a lesson shows a small red dot below the date number
- [ ] (e2e: manager_a_day_shaded_only_by_a_neighbouring_days_lesson_shows_no_conflict_dot) (#1019) A day shaded amber/red only by neighbouring days' lessons shows no dot
- [ ] (e2e: manager_two_checked_horses_resolve_each_day_to_the_heavier_shading) (#1019) Check a second horse alongside Apple — a day loaded for either horse takes the heavier of the two shadings
- [ ] (e2e-candidate) (#1019, #1021) Change the **Start Time** field in the day panel from an early hour to a late one — at least one day's shading shifts
- [ ] (e2e-candidate) (#1019) Schedule a vet/farrier expense for Apple on a future day — **set a time and an amount on it** (#1148's Phase 5 checks in `phase-5-trainer.md` need both) — then reopen this form with Apple selected — that day shows a dot
- [ ] (e2e-candidate) (#1147) Schedule a farrier expense on another future day with **Applies to all horses** checked, then reopen this form with Apple selected — that day shows a dot even though the expense names no horse
- [ ] (e2e-candidate) (#1147) That barn-wide day's exertion shading is unchanged from before the expense was booked (an appointment is not a workload)
- [ ] (e2e-candidate) (#1019) With Apple selected, a greyed-out past day shows no shading
- [ ] (e2e-candidate) (#1019) With Apple selected, a greyed-out past day shows no dot
- [ ] (e2e-candidate) (#1019, #1021) Tap a day that has a lesson on it — the day panel below the grid lists that day's items
- [ ] (e2e-candidate) (#1019) That day panel shows each item's time in 12-hour AM/PM format
- [ ] (e2e-candidate) (#1019) That day panel shows each item's horse names
- [ ] (e2e-candidate) (#1019) That day panel shows each item's rider names
- [ ] (e2e-candidate) (#1019) Tap a day with nothing on it — the day panel reads "Nothing scheduled for this day."
- [ ] (e2e-candidate) (#1019) Tapping a day also selects it as the lesson's date (the tapped day gains a selection ring)
- [ ] (e2e-candidate) (#1019) Tap **&gt;** — the grid advances one month
- [ ] (e2e-candidate) (#1019) After advancing a month, the new grid's shading reflects that month's lessons
- [ ] (e2e-candidate) (#1019) A day carried in from the neighbouring month renders dimmed
- [ ] (e2e-candidate) (#1019) That dimmed neighbouring-month day is still selectable
- [ ] (manual) (#1019) In **dark mode**, with **Juniper** selected, its amber day and its red day are clearly different colours from each other — a colour-separation judgement by eye, which no assertion on a class name or a computed value can stand in for
- [ ] (manual) (#1019) In **dark mode**, with **Juniper** selected, the date number on its tinted neighbouring-month day (the 3rd of the next month, dimmed at the end of the grid) is still readable — a contrast judgement by eye, same reason
- [ ] (e2e-candidate) (#1019) The popup opened by tapping a day in the calendar's first row does not cover that day
- [ ] (e2e-candidate) (#1019) The exhaustion bar under a horse's checkbox uses the same amber/red as that horse's calendar shading
- [ ] (e2e-candidate) (#1019) Check **Recurring (weekly)** — the calendar's field label changes to "Starting Date"
- [ ] (e2e-candidate) (#1019) Manage Barn → Events → Add Event still uses a plain native date box, not the month calendar
- [ ] (e2e-candidate) Create a **group lesson** (dated a few days ago): Group Special tier, trainer Blake, horse Butter, riders Dana + Emery — horse picker legend reads "Horses (select at least one)" (a Normal lesson reads plain "Horse", already exercised above)
- [ ] (e2e-candidate) On any lesson form, set the fee to `0` — the Payment Type field disappears
- [ ] (e2e-candidate) Raise the fee back above `0` — the Payment Type field reappears
- [ ] (e2e-candidate) Daisy (Unavailable) appears **disabled** in the horse picker
- [ ] (e2e-candidate) Check one horse — it jumps to the top of the list ahead of unchecked available horses (ordered least-to-most worked)
- [ ] (e2e-candidate) Daisy is sorted last in that list
- [ ] (e2e-candidate) Set the date/start time to the past — no bars render
- [ ] (e2e-candidate) Set the date/start time back to the future — the bars reappear
- [ ] (e2e-candidate) Check **Recurring (weekly)** — the Date field label changes to "Starting Date"
- [ ] (e2e-candidate) Uncheck **Recurring (weekly)** — the Date field label reverts
- [ ] (e2e-candidate) The **Recurring (weekly)** checkbox sits directly above the date field
- [ ] (e2e-candidate) Create a **recurring lesson** (dated 7 days out): check **Recurring (weekly)**, Beginner tier, trainer Alex, horse Apple, rider Dana — it saves
- [ ] (e2e-candidate) The **Recurring (weekly)** checkbox doesn't appear when editing that lesson
- [ ] (e2e-candidate) The recurring lesson shows a **Recurring** badge on its Lessons list row
- [ ] (e2e-candidate) The recurring lesson shows a **Recurring** badge on its detail page
- [ ] (e2e-candidate) Open its edit page — a "part of a recurring series" indicator appears
- [ ] (e2e-candidate) That edit page also shows a **Stop Recurring Lessons** button
- [ ] (e2e-candidate) Confirm and click **Stop Recurring Lessons** — the "part of a recurring series" indicator is gone on reload
- [ ] (e2e-candidate) The **Stop Recurring Lessons** button is gone on that same reload
- [ ] (e2e-candidate) The lesson itself keeps its **Recurring** badge after stopping
- [ ] (e2e-candidate) Open Willow's seeded upcoming lesson's edit page — Willow (inactive) still appears checked
- [ ] (e2e-candidate) Willow is sorted first in that list
- [ ] (e2e-candidate) Willow still shows its exhaustion bar there
- [ ] (e2e-candidate) Uncheck Willow — it moves to the bottom of the list (grouped with Unavailable)
- [ ] (e2e-candidate) Willow's bar disappears once unchecked

*(Dropped the manual "create a Custom-tier lesson" step from the original goals — that's now covered by #950's seed addition instead.)*

Visual sweep — one pass per feature area, walked at the end of the phase (#1414):

This phase visits one route, so it gets one line. A one-line block shares its rubric with nothing, so it states its reason **on the line** rather than section-scoped — the carve-out in [`PRE_RELEASE_TEST_CHECKLIST.md`](../../PRE_RELEASE_TEST_CHECKLIST.md)'s Automation tags convention says so explicitly. The two `(manual)` colour lines above stay where they are, since each is a specific colour-separation judgement rather than this general one.

> The rubric that line is judged against — a suite run proves behaviour; it cannot prove the app reads well:
>
> - spacing, alignment and typography are consistent with the rest of the app
> - it is correct in **both light and dark mode**
> - it is readable at ~390px wide
> - nothing in it is reachable or dismissible only by hover
> - nothing non-interactive carries a hover state implying it is clickable

- [ ] (manual — a visual-judgement call against the rubric above; no click path asserts that a page reads cleanly) **New Lesson form** — the whole form, its month conflict calendar and day panel, and the exhaustion bars under the horse picker (`/barn/dev-barn/lessons/new`)
