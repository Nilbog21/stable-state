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
- [ ] (e2e: manager_shifting_the_start_time_from_an_early_hour_to_a_late_one_shifts_a_days_shading) (#1019, #1021) Change the **Start Time** field in the day panel from an early hour to a late one — at least one day's shading shifts
- [ ] (e2e: manager_a_future_day_with_the_selected_horses_own_appointment_shows_a_conflict_dot) (#1019) Schedule a vet/farrier expense for Apple on a future day — **set a time and an amount on it** (#1148's Phase 5 checks in `phase-5-trainer.md` need both) — then reopen this form with Apple selected — that day shows a dot
- [ ] (e2e: manager_a_barn_wide_appointment_dots_a_day_for_a_horse_it_never_names) (#1147) Schedule a farrier expense on another future day with **Applies to all horses** checked, then reopen this form with Apple selected — that day shows a dot even though the expense names no horse
- [ ] (e2e: manager_a_barn_wide_appointment_leaves_that_days_exertion_shading_unchanged) (#1147) That barn-wide day's exertion shading is unchanged from before the expense was booked (an appointment is not a workload)
- [ ] (e2e: manager_a_greyed_out_past_day_shows_no_exertion_shading) (#1019) With Apple selected, a greyed-out past day shows no shading
- [ ] (e2e: manager_a_greyed_out_past_day_shows_no_conflict_dot) (#1019) With Apple selected, a greyed-out past day shows no dot
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
- [ ] (e2e: group_lesson_horse_picker_legend_reads_select_at_least_one) Create a **group lesson** (dated a few days ago): Group Special tier, trainer Blake, horse Butter, riders Dana + Emery — horse picker legend reads "Horses (select at least one)" (a Normal lesson reads plain "Horse", already exercised above)
- [ ] (e2e: setting_the_fee_to_zero_removes_the_payment_type_field) On any lesson form, set the fee to `0` — the Payment Type field disappears
- [ ] (e2e: raising_the_fee_above_zero_restores_the_payment_type_field) Raise the fee back above `0` — the Payment Type field reappears
- [ ] (e2e: an_unavailable_horse_renders_disabled_in_the_horse_picker) Daisy (Unavailable) appears **disabled** in the horse picker
- [ ] (e2e: checking_a_horse_moves_it_above_the_unchecked_available_horses) Check one horse — it jumps to the top of the list ahead of unchecked available horses (ordered least-to-most worked)
- [ ] (e2e: an_unavailable_horse_sorts_below_every_available_horse) Daisy sorts below every available horse, in the unavailable group at the bottom (the seed's Hazel shares that group and both carry no lessons, so which of the two is literally last is a tie-break rather than a rule)
- [ ] (e2e: a_past_start_instant_renders_no_exhaustion_bars) Set the date/start time to the past — no bars render
- [ ] (e2e: returning_the_start_instant_to_the_future_restores_the_exhaustion_bars) Set the date/start time back to the future — the bars reappear
- [ ] (e2e: checking_recurring_relabels_the_date_field_to_starting_date) Check **Recurring (weekly)** — the Date field label changes to "Starting Date"
- [ ] (e2e: unchecking_recurring_reverts_the_date_field_label_to_date) Uncheck **Recurring (weekly)** — the Date field label reverts
- [ ] (e2e: the_recurring_checkbox_sits_directly_above_the_date_field) The **Recurring (weekly)** checkbox sits directly above the date field
- [ ] (e2e: creating_a_recurring_lesson_stores_its_day_tier_instructor_horse_and_rider) Create a **recurring lesson** (dated 7 days out): check **Recurring (weekly)**, Beginner tier, trainer Alex, horse Apple, rider Dana — it saves
- [ ] (e2e: the_recurring_checkbox_is_absent_when_editing_the_recurring_lesson) The **Recurring (weekly)** checkbox doesn't appear when editing that lesson
- [ ] (e2e: the_recurring_lesson_shows_a_recurring_badge_on_its_lessons_list_row) The recurring lesson shows a **Recurring** badge on its Lessons list row
- [ ] (e2e: the_recurring_lesson_shows_a_recurring_badge_on_its_detail_page) The recurring lesson shows a **Recurring** badge on its detail page
- [ ] (e2e: the_edit_page_shows_the_part_of_a_recurring_series_indicator) Open its edit page — a "part of a recurring series" indicator appears
- [ ] (e2e: the_edit_page_also_shows_the_stop_recurring_lessons_button) That edit page also shows a **Stop Recurring Lessons** button
- [ ] (e2e: stopping_the_series_removes_the_recurring_series_indicator_on_reload) Confirm and click **Stop Recurring Lessons** — the "part of a recurring series" indicator is gone on reload
- [ ] (e2e: the_stopped_series_edit_page_shows_no_stop_recurring_lessons_button) The **Stop Recurring Lessons** button is gone on that same reload
- [ ] (e2e: the_stopped_lesson_keeps_its_recurring_badge_on_its_detail_page) The lesson itself keeps its **Recurring** badge after stopping
- [ ] (e2e: an_inactive_horse_on_its_lessons_edit_page_is_still_checked) Open Willow's seeded upcoming lesson's edit page — Willow (inactive) still appears checked
- [ ] (e2e: the_checked_inactive_horse_sorts_first_in_the_edit_pages_picker) Willow is sorted first in that list
- [ ] (e2e: the_checked_inactive_horse_still_renders_its_exhaustion_bar) Willow still shows its exhaustion bar there
- [ ] (e2e: unchecking_the_inactive_horse_moves_it_to_the_bottom_of_the_picker) Uncheck Willow — it moves to the bottom of the list (grouped with Unavailable)
- [ ] (e2e: unchecking_the_inactive_horse_removes_its_exhaustion_bar) Willow's bar disappears once unchecked

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
