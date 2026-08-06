# Phase 5 — Trainer

<!-- Asserting role: trainer — a manager may plant a precondition mid-phase, but never inside a checkbox — a manager mutation gets its own tagged `Setup —` checkbox above the assertions it serves, so every asserting checkbox here is a single trainer-eye assertion. -->

> Conventions, phase partitioning, automation tags, and route coverage: [`PRE_RELEASE_TEST_CHECKLIST.md`](../../PRE_RELEASE_TEST_CHECKLIST.md)

Switch role (interactive):

```bash
bash scripts/change-user.sh dev-barn
```

> Pick **Alex** from the profile list — this list is scoped to Dev Barn's active members only, so no other barn's profiles appear.
>
> `change-user.sh` copies the selected user's role onto your `DEV_EMAIL` membership and reassigns their lessons to you — you stay logged in as yourself. Refresh the page after it runs.

- [ ] (e2e: trainer_nav_shows_the_four_link_nav_beside_the_barn_name) Nav shows the **full 4-link trainer nav** (Lessons, Horses, Members, Guide) alongside the barn name
- [ ] (e2e: trainer_nav_hides_finances_manage_barn_leases_boarding_and_expenses) That nav shows **no Finances, no Manage Barn, no Leases, no Boarding, no Expenses**
- [ ] (e2e: trainer_expenses_route_404s_rather_than_redirecting_to_login) `/barn/dev-barn/expenses` is blocked — visiting it directly shows **404**, not a login redirect
- [ ] (e2e: trainer_lessons_list_defaults_to_my_lessons) Lessons list defaults to **My Lessons**, showing only the lessons you instruct (Alex's, now reassigned to you)
- [ ] (e2e: trainer_all_filter_shows_every_barn_lesson_including_another_instructors) Switching to **All** shows every barn lesson, including another instructor's (Blake's)
- [ ] (e2e: trainer_filter_pills_show_the_same_six_filters_as_the_manager_view) The filter pills show the same `My Lessons | All | By Instructor | By Rider | By Horse | By Tier` bar as the manager view
- [ ] (e2e: trainer_creating_two_lessons_files_both_under_the_trainer_as_instructor) Create 2 lessons via `/barn/dev-barn/lessons/new` — the instructor field is locked to you
- [ ] (e2e: trainer_picking_a_date_renders_an_exhaustion_bar_below_every_horse) With a date picked on that form, exhaustion bars render below each horse, same as the manager view
- [ ] (e2e: trainer_new_lesson_form_renders_the_month_calendar_as_its_date_field) (#1019) The trainer's New Lesson form shows the same month conflict calendar on the Date field as the manager view
- [ ] (e2e: trainer_exertion_shading_counts_another_instructors_lesson_for_the_selected_horse) (#1019) With a horse selected there, the exertion shading reflects the whole barn's lessons for that horse — not just the ones you instruct
- [ ] (e2e: trainer_conflict_dot_fires_on_the_selected_horses_appointment_day) (#1019) With Apple selected there, the day carrying Apple's vet/farrier appointment (scheduled back in Phase 3) shows a dot — the conflict dot fires on appointments for a trainer, not just lessons
- [ ] (e2e: trainer_dashboard_calendar_shows_the_appointment_alongside_their_own_lessons) (#1019) The Dashboard calendar shows that same vet/farrier appointment alongside your own lessons
- [ ] (e2e: trainer_dashboard_appointment_card_is_a_link_to_its_detail_page) (#1148) That appointment's card on the Dashboard is a tappable link, not plain text
- [ ] (e2e: trainer_can_open_the_appointment_detail_page) (#1148) Opening it reaches a page headed **Appointment**
- [ ] (e2e: trainer_appointment_page_shows_the_recipient) (#1148) That page shows the appointment's recipient
- [ ] (e2e: trainer_appointment_page_shows_the_assigned_horse) (#1148) That page shows the appointment's horse
- [ ] (e2e: trainer_appointment_page_shows_the_notes) (#1148) That page shows the appointment's notes
- [ ] (e2e: trainer_appointment_page_never_shows_the_amount) (#1148) That page shows no amount anywhere — the figure entered on it in Phase 3 appears nowhere on the page
- [ ] (e2e: trainer_appointment_page_shows_no_save_changes_button) (#1148) That page shows no **Save Changes** button — it is read-only, not the manager's edit form
- [ ] (e2e: trainer_appointment_page_shows_no_delete_button) (#1148) That page shows no **Delete** button
- [ ] (e2e: trainer_dashboard_day_view_empty_state_names_appointments_not_expenses) (#1148) The Dashboard's empty-state subtext on a day with nothing on it reads "No lessons, appointments, or events scheduled for this day." — "appointments", not "expenses"
- [ ] (e2e: trainer_dashboard_week_view_empty_state_names_appointments_not_expenses) (#1148) The **Week** view's empty-state subtext likewise says "appointments", not "expenses"
- [ ] (e2e: trainer_can_create_a_lesson_within_the_buffer_of_another_instructors_lesson) Creating one more lesson dated within 30 minutes of one of Blake's lessons (check Blake's lesson times via the **All** filter above) succeeds with no error

> This notification's recipient (Blake) isn't the persona you're currently acting as, so it can't be observed by switching personas with `change-user.sh` — the swap reassigns `barn_memberships.user_id` away from whichever persona you leave, permanently disconnecting it from the id the notification was written against. Verify the row directly instead (Supabase Studio or a `supabase db` query). The live bell UI these rows feed is exercised on a genuinely different account, in both directions, in [`POST_RELEASE_TEST_CHECKLIST.md`](../../POST_RELEASE_TEST_CHECKLIST.md) — that supplements these row checks rather than replacing them.

- [ ] (e2e: nearby_lesson_writes_a_notification_row_for_the_other_instructor) A `notifications` row exists for Blake's `user_id` with `type = 'instructor_lesson_nearby'` and `link = '/barn/dev-barn/lessons'` (an e2e run reads the row with its own service client — the constraint above is `change-user.sh`'s, not the suite's)
- [ ] (e2e: that_nearby_notification_titles_a_single_new_lesson) That row's `title` reads **"1 new lesson scheduled nearby"** (or an incremented count, e.g. "2 new lessons scheduled nearby", if a prior nearby lesson already landed this same row this pass)
- [ ] (e2e: trainer_edit_form_hides_the_instructor_field_on_their_own_lesson) Editing one of your own lessons shows the instructor field **hidden entirely** — no label, no read-only text, just locked server-side
- [ ] (e2e: trainer_sees_no_edit_link_on_another_instructors_lesson) Blake's lesson, opened from the Lessons list, shows no **Edit** link
- [ ] (e2e: trainer_cannot_save_changes_via_another_instructors_edit_url) Navigating directly to that lesson's `/edit` URL returns **404** — the edit form never renders, so there is no save to reach
- [ ] (e2e: trainer_sees_no_delete_button_on_any_lesson) No **Delete** button is shown on any lesson, your own included
- [ ] (e2e: trainer_sees_a_cancel_button_in_the_header_of_a_lesson_they_instruct) A lesson you instruct shows a **Cancel** button in its detail-page header
- [ ] (e2e: trainer_cancelling_one_group_riders_spot_cancels_only_that_rider) Cancelling a rider's spot (or the whole lesson) from there works the same as the manager flow
- [ ] (e2e: trainer_sees_no_cancel_button_on_another_instructors_lesson) Blake's lesson shows no header **Cancel** button
- [ ] (e2e: trainer_edit_page_of_a_cancelled_lesson_shows_the_cancellation_notes_textarea) Open **Edit Lesson** on an already-cancelled lesson you instruct — the Notes section shows the same **Cancellation Notes** textarea the manager gets
- [ ] (e2e: cancellation_notes_saved_by_a_trainer_render_on_the_lesson_detail_page) On that same lesson, enter cancellation notes in that textarea and Save — its detail page renders the same read-only **Cancellation Notes** row the manager gets
- [ ] (e2e: trainer_lessons_list_row_shows_the_recurring_badge) The recurring lesson created in Phase 3, now reassigned to you, still shows its **Recurring** badge on its Lessons list row
- [ ] (e2e: trainer_lesson_detail_page_shows_the_recurring_badge) That same lesson shows its **Recurring** badge on its detail page
- [ ] (e2e: trainer_edit_page_shows_the_recurring_series_indicator) Its edit page shows a "This is part of a recurring series" indicator above the lesson form
- [ ] (e2e: trainer_edit_page_shows_the_stop_recurring_lessons_button) That page shows a **Stop Recurring Lessons** button in the same place
- [ ] (e2e: trainer_stopping_a_recurring_series_removes_the_series_block_from_the_edit_page) Stopping the series from there works the same as the manager flow
- [ ] (e2e: trainer_horse_document_link_serves_the_stored_pdf) Horse detail page lists documents with working links
- [ ] (e2e: trainer_uploading_a_horse_document_with_a_reminder_date_lists_it) Uploading `scripts/data/test_1_kb.pdf` there works, including setting a Reminder Date
- [ ] (e2e: trainer_documents_table_has_no_actions_column_header) That documents table has **no Actions column at all** — not merely a hidden delete button
- [ ] (e2e: trainer_horse_detail_page_shows_no_exhaustion_thresholds_section) The horse detail page shows **no Exhaustion Thresholds section**
- [ ] (e2e: trainer_reminder_date_column_is_read_only_text) The Reminder Date column there is **read-only**
- [ ] (e2e: trainer_unowned_horse_notes_render_as_read_only_text) Horse detail page shows the Feed Notes/Medication Notes entered as manager as read-only text — no textareas, no Save button
- [ ] (e2e: trainer_unset_notes_field_row_is_dropped_entirely) Setup (as manager, then switch back to the trainer) — clear one of that horse's two notes fields. An e2e run seeds the horse with only one of the two fields set instead
- [ ] (e2e: trainer_unset_notes_field_row_is_dropped_entirely) Reloading that horse's detail page drops the cleared field's row entirely instead of showing it blank
- [ ] (e2e: trainer_owned_horse_notes_render_as_editable_textareas) Setup (as manager, then switch back to the trainer) — grant this trainer a horse-privileges row on **Clover** (Access section), then make them Clover's owning member. An e2e run seeds both in the trainer's own barn instead
- [ ] (e2e: trainer_owned_horse_notes_render_as_editable_textareas) (#1006) Clover's detail page shows **Feed Notes** and **Medication Notes** as editable textareas
- [ ] (e2e: trainer_owned_horse_notes_form_shows_a_save_button) (#1006) That page shows a **Save** button for those fields
- [ ] (e2e: trainer_owned_horse_note_edits_persist_across_a_reload) (#1006) Editing and saving both fields as this trainer persists the new text across a reload
- [ ] (e2e: trainer_my_horses_section_at_the_top_lists_the_owned_horse) (#1000) The Horses list shows a **My Horses** section at the top containing **Clover**
- [ ] (e2e: trainer_owned_horse_card_carries_a_status_badge) (#1000) Clover's card in that section carries a status badge
- [ ] (e2e: trainer_owned_horse_is_absent_from_available_and_unavailable) (#1000) Clover no longer appears under Available/Unavailable
- [ ] (e2e: trainer_sees_the_seeded_photo_on_a_horse_they_do_not_own) Butter's detail page (a horse this trainer does **not** own) displays her seeded photo
- [ ] (e2e: trainer_sees_no_photo_controls_on_a_horse_they_do_not_own) Butter's detail page shows **no Set Photo / Replace Photo / Remove control**
- [ ] (e2e: trainer_sees_a_photo_control_on_the_horse_they_own) (#1003) Clover's detail page (the horse this trainer now owns) does show a **Set Photo**/**Replace Photo** control — owning a horse grants photo write even to a non-manager
- [ ] (e2e: trainer_horse_detail_shows_the_registered_name_row_below_status) Setup (as manager, then switch back to the trainer) — set Apple's **Registered Name** (e.g. "Four-Leaf Clover"). An e2e run seeds the registered name in the trainer's own barn instead
- [ ] (e2e: trainer_horse_detail_shows_the_registered_name_row_below_status) Apple's detail page shows a **Registered Name** row below Status
- [ ] (e2e: trainer_horse_detail_omits_the_registered_name_row_when_it_is_unset) Setup (as manager, then switch back to the trainer) — clear Apple's **Registered Name** again. An e2e run seeds a second horse with no registered name instead
- [ ] (e2e: trainer_horse_detail_omits_the_registered_name_row_when_it_is_unset) Apple's detail page then shows no **Registered Name** row
- [ ] (e2e: members_page_lists_all_four_roster_sections) Members page shows all four sections (You/Managers/Trainers/Riders), same structure as the manager view
- [ ] (e2e: members_page_shows_no_add_member_forms_to_a_non_manager) That page shows no **Add Trainer**/**Add Rider** forms
- [ ] (e2e: trainer_can_upload_a_document_with_a_reminder_date_on_their_own_member_page) Uploading `scripts/data/test_1_kb.pdf` on your own member detail page works, optionally with a Reminder Date set
- [ ] (e2e: own_document_reminder_date_renders_as_read_only_text_to_a_trainer) The Reminder Date column on your own documents is **read-only** — only a manager can edit it
- [ ] (e2e: managed_rider_row_renders_as_a_card_link_to_their_member_page) In the Riders section, a managed/unclaimed row (Gale/Harper Test, whichever are still unclaimed — Indigo Test was removed earlier in the Members phase) renders as a normal card link showing the name only
- [ ] (e2e: managed_rider_row_shows_no_unlinked_badge) No **Unlinked** badge appears on that row
- [ ] (e2e: managed_member_page_shows_no_manage_member_controls_to_a_trainer) No Copy Invite/Revoke controls appear on that row for any role — those live only on the detail page's manager-only Manage Member section, which a trainer viewing that page won't see either
- [ ] (e2e: trainer_sees_em_dashes_for_a_stub_members_blank_contact_fields) Harper Test's member detail page shows Contact Info as read-only, with blank fields rendering "—"
- [ ] (e2e: trainer_sees_no_save_button_in_contact_info) That page shows no Save button for Contact Info
- [ ] (e2e: trainer_opens_a_managers_detail_page_from_the_roster) Another trainer's or a manager's member detail page, opened from the roster, loads (no 404) and shows their name
- [ ] (e2e: trainer_sees_contact_info_on_a_managers_detail_page) (#863) That page shows their **Contact Info** section — a trainer can view any member's Contact Info
- [ ] (e2e: trainer_sees_no_documents_section_on_a_managers_detail_page) That page shows **no Documents section**
- [ ] (e2e: trainer_sees_contact_info_on_a_riders_detail_page) Blake's (a rider's) detail page likewise shows their **Contact Info** section
- [ ] (e2e: trainer_sees_no_documents_section_on_a_riders_detail_page) (#779) Blake's detail page shows no Documents section — #779 narrowed rider-document access to manager/self only
- [ ] (e2e: trainer_finances_route_404s_rather_than_redirecting_to_login) `/barn/dev-barn/finances` is blocked — shows **404**, not a login redirect
- [ ] (e2e: trainer_outstanding_lists_only_the_lessons_they_instruct) `/barn/dev-barn/finances/outstanding` works and shows **only your own** outstanding lessons
- [ ] (e2e: trainer_outstanding_lists_uncollected_cancellation_fees_for_lessons_they_instruct) That page also lists any uncollected cancellation fees for lessons you instruct
- [ ] (e2e: trainer_dashboard_day_view_shows_only_lessons_they_instruct) (#1015) Dashboard's Day view, on a day with other instructors' lessons scheduled too, shows only the lessons you instruct — not the whole barn's schedule
- [ ] (e2e: trainer_dashboard_week_view_shows_only_lessons_they_instruct_across_the_week) (#1016) Switching to Week view shows only lessons you instruct across all 7 days, matching Day view's role-scoping
- [ ] (e2e: trainer_dashboard_reminders_carries_an_unpaid_lessons_card) With unpaid lessons among the ones you instruct, the Dashboard shows a "Reminders" section carrying an "N unpaid lessons" card
- [ ] (e2e: trainer_unpaid_lessons_card_navigates_to_the_outstanding_page) That card links to `/barn/dev-barn/finances/outstanding` — your only nav path to that page, since the nav carries no Finances link
- [ ] (e2e: trainer_profile_reached_from_the_avatar_menu_renders_the_barn_nav_bar) Avatar menu → **Profile** (`/profile?barn=dev-barn`) renders the barn nav bar
- [ ] (e2e: trainer_profile_nav_carries_the_same_four_link_set_as_a_barn_page) That nav bar carries the **full 4-link trainer nav** (Lessons, Horses, Members, Guide) — same set as the regular barn pages
- [ ] (e2e: trainer_calendar_feed_carries_only_lessons_they_instruct) (#1018) On the same Profile page, your Calendar Feed link includes only lessons where you're the instructor (your reassigned Alex lessons), not Blake's
