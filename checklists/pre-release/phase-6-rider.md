# Phase 6 — Rider

<!-- Asserting role: rider — a manager may plant a precondition mid-phase, but never inside a checkbox — a manager mutation gets its own tagged `Setup —` checkbox above the assertions it serves, so every asserting checkbox here is a single rider-eye assertion. -->

> Conventions, phase partitioning, automation tags, and route coverage: [`PRE_RELEASE_TEST_CHECKLIST.md`](../../PRE_RELEASE_TEST_CHECKLIST.md)

Switch role (pick **Dana** from the same member list as Phase 5):

```bash
bash scripts/change-user.sh dev-barn
```

- [ ] (e2e: rider_nav_shows_the_four_link_nav_beside_the_barn_name) Nav shows the **full 4-link rider nav** (Lessons, Horses, Members, Guide) alongside the barn name
- [ ] (e2e: rider_nav_hides_leases_boarding_and_expenses) That nav shows **no Leases, no Boarding, no Expenses**
- [ ] (e2e: rider_expenses_route_404s_rather_than_redirecting_to_login) `/barn/dev-barn/expenses` is blocked — visiting it directly shows **404**, not a login redirect
- [ ] (e2e: rider_available_and_unavailable_cards_carry_only_name_and_reason) Horses page shows Available/Unavailable cards carrying the name (and unavailability reason) only
- [ ] (e2e: rider_horse_cards_show_no_exhaustion_bar) No exhaustion bar appears on those cards (#1391 narrowed this to Available/Unavailable — the owned card below has one)
- [ ] (e2e: rider_horses_page_shows_no_inactive_section) No Inactive section appears on that page
- [ ] (e2e: rider_tapping_an_available_card_opens_the_horse_detail_page) (#1002) Tapping an Available or Unavailable card navigates to that horse's detail page — cards became linkable so a rider can view the horse's photo
- [ ] (e2e: rider_sees_the_seeded_photo_on_a_horse_they_do_not_own) Butter's detail page (Dana does **not** own her) displays her seeded photo in the page header, beside her name
- [ ] (e2e: rider_sees_no_photo_controls_on_a_horse_they_do_not_own) Butter's detail page shows **no Set Photo / Replace Photo / Remove Photo control** in its header
- [ ] (e2e: rider_horse_detail_shows_the_registered_name_row_below_status) Setup (as manager, then switch back to Dana) — set Apple's **Registered Name** (e.g. "Four-Leaf Clover"). An e2e run seeds the registered name in the rider's own barn instead
- [ ] (e2e: rider_horse_detail_shows_the_registered_name_row_below_status) (#1390) Apple's detail page shows her registered name in the page header, under her name — the labelled **Registered Name** row is gone, along with the labelled Status row above it (status is now a badge beside the name)
- [ ] (e2e: rider_horse_detail_omits_the_registered_name_row_when_it_is_unset) Setup (as manager, then switch back to Dana) — clear Apple's **Registered Name** again. An e2e run seeds a second horse with no registered name instead
- [ ] (e2e: rider_horse_detail_omits_the_registered_name_row_when_it_is_unset) Apple's detail page then shows no registered name in the header at all, rather than a blank line where it was
- [ ] (e2e: rider_owned_horse_notes_render_as_editable_textareas) Setup (as manager, then switch back to Dana) — grant Dana a horse-privileges row on **Clover** (Access section), then make her Clover's owning member with **Set as Owner** on that row; this reassigns ownership away from the Phase 5 trainer, which nothing later re-checks. An e2e run seeds both in the rider's own barn instead
- [ ] (e2e: rider_owned_horse_notes_render_as_editable_textareas) (#1006/#1390) Clover's detail page shows **Feed Notes** and **Medication Notes** as editable textareas, inside a **Feed & Medication** section that is open when the page loads
- [ ] (e2e: rider_owned_horse_notes_form_shows_a_save_button) (#1006) That page shows a **Save** button for those fields
- [ ] (e2e: rider_unowned_horse_notes_render_as_read_only_text) (#1006) On **Butter**, whom Dana does *not* own, the same section's Feed Notes/Medication Notes are read-only text
- [ ] (e2e: rider_my_horses_section_at_the_top_lists_the_owned_horse) (#1000) The Horses list shows a **My Horses** section at the top containing **Clover**
- [ ] (e2e: rider_owned_horse_card_carries_a_status_badge) (#1000) Clover's card in that section carries a status badge
- [ ] (e2e: rider_owned_horse_is_absent_from_available_and_unavailable) (#1000) Clover no longer appears under Available/Unavailable
- [ ] (e2e: rider_owned_horse_card_shows_an_exhaustion_bar) (#1391) Clover's card in **My Horses** shows an exhaustion bar — the only exhaustion a rider sees on this page, and it appears because the Set-as-Owner setup above left her a `lesson_read_privileges` grant
- [ ] (e2e: rider_sees_a_photo_control_on_the_horse_they_own) (#1003) Clover's detail page shows a **Set Photo**/**Replace Photo** control in its header — owning a horse grants photo write even to a rider
- [ ] (e2e: rider_setting_the_photo_on_their_own_horse_through_the_upload_screen_succeeds) (#1003) Using it to set `scripts/data/clover-photo.png` as Dana succeeds
- [ ] (e2e: rider_the_photo_they_uploaded_displays_on_their_horses_detail_page) (#1003) That photo then displays on Clover's detail page
- [ ] (e2e: rider_read_document_privilege_shows_the_documents_section) Setup (as manager, then switch back to Dana) — grant Dana `document_privileges='read'` on a horse via its Access section. An e2e run seeds the privileges row in the rider's own barn instead
- [ ] (e2e: rider_read_document_privilege_shows_the_documents_section) (#999) That horse's detail page now shows a **Documents** section for Dana, collapsed, with its document count on the row
- [ ] (e2e: rider_read_document_privilege_hides_the_add_document_button) (#999) That Documents section shows no **Add Document** button
- [ ] (e2e: rider_read_document_privilege_opens_a_seeded_document) (#1359) Tapping a document's filename in that section opens the file
- [ ] (e2e: rider_write_document_privilege_shows_the_add_document_button) Setup (as manager, then switch back to Dana) — change that same grant to `document_privileges='write'`
- [ ] (e2e: rider_write_document_privilege_shows_the_add_document_button) (#999) Expanding that horse's Documents section now shows the **Add Document** button in its header (it is hidden while the section is shut)
- [ ] (e2e: rider_write_document_privilege_upload_succeeds) (#1359) Using that Add Document button as Dana to upload a file succeeds, and the new document's row appears in the horse's Documents section
- [ ] (e2e: rider_without_a_document_privilege_sees_no_documents_section) (#999) On a horse Dana has no document privilege on, no Documents section appears for her at all
- [ ] (e2e: rider_lesson_read_privilege_shows_a_collapsed_upcoming_lessons_section) Setup (as manager, then switch back to Dana) — grant Dana `lesson_read_privileges=true` on a horse with at least one upcoming lesson
- [ ] (e2e: rider_sees_no_exhaustion_bar_on_a_horse_detail_page) (#1390) No **Exhaustion** bar appears on that horse's detail page — nor on one Dana holds no lesson-read privilege on. The bar is the Horses list's signal; this page carries the same schedule as Upcoming Lessons below, in a form a rider can read
- [ ] (e2e: rider_lesson_read_privilege_shows_a_collapsed_upcoming_lessons_section) (#999) That same horse's page shows a collapsed **Upcoming Lessons** section directly under Feed & Medication, listing its scheduled lessons
- [ ] (e2e: rider_tapping_an_unenrolled_upcoming_lesson_loads_its_detail_page) (#999) Tapping a lesson in that Upcoming Lessons list that Dana is **not** enrolled in loads the lesson detail page (no 404)
- [ ] (e2e: rider_without_a_lesson_read_privilege_sees_no_upcoming_lessons_section) (#999) On that same horse, no Upcoming Lessons section appears either
- [ ] (e2e: rider_dashboard_day_view_shows_only_lessons_she_is_enrolled_in) Dashboard's Day view shows only lessons Dana is enrolled in for the viewed day
- [ ] (e2e: rider_dashboard_day_view_shows_no_appointment_cards) (#1148) It shows no appointments — manager and trainer only; riders gained no appointment visibility
- [ ] (e2e: rider_dashboard_day_view_hides_an_event_outside_her_visible_to_roles) It shows no events outside her role's `visible_to_roles`
- [ ] (e2e: rider_dashboard_week_view_shows_only_her_enrolled_lessons_across_the_week) (#1016) Switching to Week view shows only Dana's enrolled lessons across all 7 days
- [ ] (e2e: rider_dashboard_month_view_tints_only_days_she_is_enrolled_on) (#1558) In Month view, only days Dana is enrolled on are tinted — another rider's day is left untinted
- [ ] (e2e: rider_dashboard_month_view_day_panel_shows_no_appointment_cards) (#1558) In Month view, tapping a day shows her enrolled lessons and no appointment cards
- [ ] (e2e: rider_dashboard_month_view_scoping_survives_paging_to_another_month) (#1558) In Month view, paging to another month and back keeps the same rider-scoped tinting
- [ ] (e2e: rider_lessons_list_shows_only_enrolled_lessons) Lessons list shows only Dana's enrolled lessons
- [ ] (e2e: rider_filter_pills_omit_my_lessons_and_by_rider) Its filter pills are `All | By Instructor | By Horse | By Tier` — no **My Lessons** or **By Rider** pill
- [ ] (e2e: rider_own_name_absent_from_own_lesson_cards) Dana's own name does not appear on her own lesson cards
- [ ] (e2e: rider_own_rider_notes_render_read_only_on_the_lesson_detail_page) An enrolled lesson's detail page shows Dana's own rider notes read-only
- [ ] (e2e: rider_private_notes_stay_hidden_on_the_lesson_detail_page) That page shows **no private notes**
- [ ] (e2e: rider_sees_no_exertion_rating_on_an_unprivileged_horse) That page shows no exertion rating next to any horse name (still true for a horse Dana holds no lesson-read privilege on)
- [ ] (e2e: rider_privileged_horse_shows_an_exertion_rating_on_the_lesson_detail_page) (#999) On the lesson detail page reached via the privileged Upcoming Lessons tap above, Dana's privileged horse does show an exertion rating
- [ ] (e2e: rider_privileged_horse_shows_its_horse_notes_on_the_lesson_detail_page) (#999) That same horse shows its horse notes (if any) on that page
- [ ] (e2e: rider_other_riders_notes_stay_hidden_on_the_privileged_lesson_detail_page) (#999) On that page, other riders' rider and private notes stay hidden from Dana
- [ ] (e2e: rider_manager_cancelled_lesson_shows_read_only_cancellation_notes) Setup (as manager, then switch back to Dana) — cancel a lesson Dana is enrolled in and record cancellation notes on it. An e2e run seeds the cancelled lesson and its notes in the rider's own barn instead
- [ ] (e2e: rider_manager_cancelled_lesson_shows_read_only_cancellation_notes) That lesson's detail page renders the same read-only **Cancellation Notes** row the manager gets
- [ ] (e2e: rider_group_lesson_shows_every_co_riders_real_name) An enrolled **group** lesson's detail page shows every co-rider's real name, not a blank or raw ID
- [ ] (e2e: rider_unenrolled_unprivileged_lesson_404s) Visiting `/barn/dev-barn/lessons/[id]` directly for a lesson Dana is **not** enrolled in, with no horse she holds lesson-read privileges on, shows **404** rather than the lesson details
- [ ] (e2e: rider_enrolled_lesson_header_carries_a_cancel_button) An enrolled lesson's detail-page header carries a **Cancel** button
- [ ] (e2e: rider_sees_no_cancel_button_on_the_lessons_list_or_the_dashboard) No Cancel button appears on the Lessons list or the Dashboard
- [ ] (e2e: rider_cancelling_own_spot_marks_the_row_cancelled_on_the_lessons_list) Cancelling your own spot from that header marks your row **Cancelled** on the Lessons list
- [ ] (e2e: rider_cancelled_spot_shows_the_cancelled_badge_on_the_dashboard) That row shows the same **Cancelled** badge on the Dashboard
- [ ] (e2e: rider_cancelled_spot_shows_the_cancelled_badge_on_the_lesson_detail_page) That row shows the same **Cancelled** badge on the lesson detail page
- [ ] (e2e: rider_cancelling_own_spot_leaves_the_co_riders_and_the_lesson_unaffected) The rest of the lesson — other riders in a group lesson included — is unaffected by that cancellation
- [ ] (e2e: rider_cancelling_own_spot_notifies_the_instructor) The instructor receives a "Lesson participation cancelled" notification (verify the `notifications` row directly, as in Phase 5 — the recipient is a different persona; an e2e run reads the row with its own service client)
- [ ] (e2e: rider_finances_route_404s_rather_than_redirecting_to_login) `/barn/dev-barn/finances` is blocked — shows **404**, not a login redirect
- [ ] (e2e: rider_outstanding_lists_only_their_own_lessons) `/barn/dev-barn/finances/outstanding` shows only Dana's outstanding lessons
- [ ] (e2e: rider_outstanding_lists_their_own_past_due_lease_and_boarding_charges) That page also shows her own outstanding lease/boarding charges, if any are past due
- [ ] (e2e: rider_outstanding_lists_their_own_uncollected_late_cancellation_fee) That page also shows her own uncollected late-cancellation fees
- [ ] (e2e: rider_outstanding_type_column_carries_no_other_riders_agreements) That page has a Type column, with no entries for other riders' agreements
- [ ] (e2e: rider_dashboard_reminders_carries_an_unpaid_lessons_card) With unpaid lessons, the Dashboard shows a "Reminders" section carrying an "N unpaid lessons" card
- [ ] (e2e: rider_dashboard_reminders_carries_an_unpaid_leases_boarding_card) With unpaid leases/boarding, that section also carries an "N unpaid leases/boarding" card
- [ ] (e2e: rider_reminder_cards_link_to_the_outstanding_page) Each of those cards links to `/barn/dev-barn/finances/outstanding` — Dana's only nav path to that page, since the nav carries no Finances link
- [ ] (e2e: rider_unpaid_lessons_card_still_appears_with_only_a_cancellation_fee_outstanding) (#938) With an outstanding late-cancellation fee but zero unpaid lesson fees, the Dashboard's "N unpaid lessons" card still appears (its count includes the cancellation fee) instead of being hidden
- [ ] (e2e: dashboard_reminders_header_hidden_for_rider_with_no_reminders) For a rider with nothing outstanding of their own, the Dashboard shows no **Reminders** header at all — even while the barn holds unpaid items belonging to *another* rider, which proves the reminders query is rider-scoped rather than merely empty (Dana has her own unpaid items by this point, so verify as a rider who does not — the e2e run seeds exactly that pair)
- [ ] (e2e: members_page_lists_all_four_roster_sections) `/barn/dev-barn/members` shows all four sections (You/Managers/Trainers/Riders)
- [ ] (e2e: members_page_shows_no_add_member_forms_to_a_non_manager) That page shows no **Add Trainer**/**Add Rider** forms
- [ ] (e2e: managed_rider_row_shows_no_unlinked_badge) No **Unlinked** badge appears on any managed/unclaimed row (a rider never sees it, unlike a manager)
- [ ] (e2e: rider_own_documents_section_shows_the_empty_state) Your own member detail page's Documents section shows the empty state ("No documents yet")
- [ ] (e2e: rider_own_documents_section_has_no_add_document_button) (#864) That section shows **no Add Document button** — rider self-service is read-only
- [ ] (e2e: rider_opens_a_managers_detail_page_from_the_roster) Another member's detail page (a trainer, a manager), opened from the roster, loads (no 404) and shows their name
- [ ] (e2e: rider_sees_contact_info_on_a_managers_detail_page) (#863) That page shows their **Contact Info** section
- [ ] (e2e: rider_sees_no_documents_section_on_a_managers_detail_page) That page shows no Documents section
- [ ] (e2e: rider_sees_the_seeded_photo_on_another_members_page) Emery's member detail page (her photo is seeded) displays that photo
- [ ] (e2e: rider_sees_no_photo_controls_on_another_members_page) That page shows no **Set Photo**/**Replace Photo**/**Remove** control

> Self photo upload/replace/remove is **not** verified here as Dana — but no longer because it would *fail*. Since #1563 `change-user.sh` moves `profiles.user_id` alongside `barn_memberships.user_id`, so the storage RLS self-write check (keyed on `profiles.user_id`) now passes under impersonation like any other write. It stays out because it would be a second walk down a path already covered: Phase 2-4's own-photo check exercises it on **your own** profile, and there's no role branch in the path. What impersonation still can't produce is a self-write whose author is a genuinely different *account* — that needs a real second person and is verified against prod in [`POST_RELEASE_TEST_CHECKLIST.md`](../../POST_RELEASE_TEST_CHECKLIST.md). Don't add a self-photo check to an impersonated phase for coverage's sake; it duplicates Phase 2-4 rather than extending it.

- [ ] (e2e: rider_own_member_page_renders_their_active_agreement_cards) Setup — switch to Emery (`change-user.sh dev-barn` → Emery), who holds the Active Agreements from Phase 4, and switch back to Dana once the next three lines are done. An e2e run seeds those agreements on the rider persona's own membership instead, so no switch is needed
- [ ] (e2e: rider_own_member_page_renders_their_active_agreement_cards) Her own member detail page renders the same Active Agreements cards from Phase 4
- [ ] (e2e: rider_active_agreement_cards_are_not_links) Those cards do not navigate on tap — they are not links to the manager-only agreement detail page
- [ ] (e2e: rider_profile_reached_from_the_avatar_menu_renders_the_barn_nav_bar) Avatar menu → **Profile** (`/profile?barn=dev-barn`) renders the barn nav bar
- [ ] (e2e: rider_profile_nav_carries_the_same_four_link_set_as_a_barn_page) That nav bar carries the **full 4-link rider nav** (Lessons, Horses, Members, Guide) — same set as the regular barn pages
- [ ] (e2e: rider_calendar_feed_carries_only_lessons_they_are_enrolled_in) (#1018) On the same Profile page, Dana's Calendar Feed link includes only lessons Dana is enrolled in, not other riders' lessons

Visual sweep — one pass per feature area, walked at the end of the phase while still acting as the rider (#1414):

The no-hover-state rubric bullet is the line that used to sit under Active Agreements — it is asked once here rather than twice. This phase is a flat list rather than sectioned, so the areas below are the pages it actually visits.

> **(manual) — one verdict, one rubric, stated here instead of on every line** — the section-scoped reason [`PRE_RELEASE_TEST_CHECKLIST.md`](../../PRE_RELEASE_TEST_CHECKLIST.md)'s Automation tags convention permits. A suite run proves behaviour; it cannot prove the app reads well. Each line below asks the same question of one feature area: does it read cleanly?
>
> - spacing, alignment and typography are consistent with the rest of the app
> - it is correct in **both light and dark mode**
> - it is readable at ~390px wide
> - nothing in it is reachable or dismissible only by hover
> - nothing non-interactive carries a hover state implying it is clickable

- [ ] (manual) **Dashboard** — Day, Week and Month views and the Reminders section, as the rider sees them (`/barn/dev-barn`)
- [ ] (manual) **Lessons** — the list and its filter pills, an enrolled lesson's detail page, and the cancel page (`/barn/dev-barn/lessons` and below)
- [ ] (manual) **Horses** — the list's My Horses/Available/Unavailable cards and a detail page's header, Feed & Medication, Documents and Upcoming Lessons sections (`/barn/dev-barn/horses`, `/horses/[id]`)
- [ ] (manual) **Members** — the roster, your own member page's Documents and Active Agreements cards, and another member's detail page (`/barn/dev-barn/members`, `/members/[membership_id]`)
- [ ] (manual) **Outstanding** — the rider-scoped outstanding page reached from the Reminders cards (`/barn/dev-barn/finances/outstanding`)
- [ ] (manual) **Profile and nav** — the 4-link rider nav bar, the avatar menu, and `/profile?barn=dev-barn` with its Calendar Feed section

Doc review — read either the guide page or its repo-root markdown file; they are the same content by construction:

The page picks the file by role at `src/app/barn/[slug]/(protected)/guide/page.tsx:11-13` and renders it through `ReactMarkdown`. Deliberately unscoped: the line asks for a review and you decide how deep it needs to go.

- [ ] (manual — a doc-accuracy judgement against what actually shipped; no click path asserts that prose is still true) The rider guide at `/barn/dev-barn/guide` still describes what a rider can actually do — `USER_GUIDE_RIDER.md`
