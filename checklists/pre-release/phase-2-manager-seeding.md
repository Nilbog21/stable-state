# Phase 2 — Manager seeding

<!-- Asserting role: manager -->

> Conventions, phase partitioning, automation tags, and route coverage: [`PRE_RELEASE_TEST_CHECKLIST.md`](../../PRE_RELEASE_TEST_CHECKLIST.md)

Lesson tiers (`/barn/dev-barn/settings` → Add Tier → `/barn/dev-barn/settings/tiers/new`):

- [ ] (e2e: creating_a_tier_stores_its_price_exertion_default_and_jumping_off) Create tier **Beginner** — $60, default exertion level 2, jumping off
- [ ] (e2e: creating_a_tier_stores_its_price_and_jumping_on_default) Create tier **Advanced** — $120, default jumping on
- [ ] (e2e: creating_a_tier_with_no_defaults_stores_neither_default) Create tier **Group Special** — $90, no defaults
- [ ] (e2e: every_created_tier_appears_in_the_lesson_tiers_list) All three appear in the Lesson Tiers list on the settings page
- [ ] (e2e: saving_a_tier_with_a_blank_price_is_rejected_as_price_required) Try saving a tier with a blank price — rejected with "Price is required"
- [ ] (e2e: saving_a_tier_with_a_zero_price_stores_the_tier) Try saving a tier with a $0 price — accepted
- [ ] (e2e: saving_a_tier_with_a_whitespace_only_name_is_rejected_as_name_required) Try saving a tier with a blank or whitespace-only name — rejected with "Name is required"
- [ ] (e2e: editing_a_tier_to_a_whitespace_only_name_is_rejected_as_name_required) Edit an existing tier to a blank or whitespace-only name — rejected the same way
- [ ] (e2e: saving_a_tier_with_a_blank_name_and_price_reports_both_errors) Try saving a tier with both name and price blank — rejected with both errors shown together ("Name is required, Price is required")

Horses (`/barn/dev-barn/horses`, inline Add Horse form in the page header):

- [ ] (e2e: adding_three_horses_through_the_inline_form_lists_all_three) Create horses **Daisy**, **Eclipse**, and **Flint**
- [ ] (e2e: marking_a_horse_unavailable_with_a_reason_stores_both) Open Daisy's detail page → set status pill to **Unavailable**, enter reason "Thrown shoe" → Save
- [ ] (e2e: the_horses_list_shows_an_unavailable_horse_with_its_reason) Horses page now shows Daisy with an **Unavailable** badge and the reason visible — under **My Horses**, since the manager who adds a horse through this form becomes its owner (#998)
- [ ] (e2e: granting_a_rider_access_adds_them_to_the_grants_list) On Eclipse's detail page, in the **Access** section, select rider Dana and tap **Grant Access** → Dana appears in the grants list
- [ ] (e2e: a_granted_riders_row_offers_set_as_owner) Dana's row carries an **Owner** column showing **Set as Owner**
- [ ] (e2e: promoting_a_granted_rider_to_owner_elevates_their_document_and_lesson_access) Tap **Set as Owner** on Dana's row → the button changes to **Owner**
- [ ] (e2e: promoting_a_granted_rider_to_owner_elevates_their_document_and_lesson_access) (#1069) Dana's row now shows **Write** selected in the **Documents** column without tapping it directly (auto-elevated on becoming owner)
- [ ] (e2e: promoting_a_granted_rider_to_owner_elevates_their_document_and_lesson_access) (#1069) Dana's row now shows lesson access **Can View** without tapping the toggle directly (auto-elevated on becoming owner)
- [ ] (e2e: the_identity_header_owner_line_names_the_new_owner) Refresh the page → the identity header's owner line beside the photo now reads "Dana Rider" (it named the manager who created the horse before)
- [ ] (e2e: the_identity_header_owner_line_links_to_the_owners_member_detail_page) That owner line links to Dana's member detail page
- [ ] (e2e: the_owner_button_still_reads_owner_after_a_reload) Refresh the page → Dana's row in the Access table still shows **Owner**, not **Set as Owner**
- [ ] (e2e: granting_a_second_rider_adds_them_to_the_grants_list) Grant access to rider Emery → Emery appears in the grants list
- [ ] (e2e: a_new_grants_document_access_starts_at_none) Emery's row shows Documents set to **None**
- [ ] (e2e: a_new_grants_lesson_access_starts_at_cannot_view) Emery's row shows lesson access **Cannot View**
- [ ] (e2e: a_document_access_choice_survives_a_reload) Tap **Read** in Emery's **Documents** column → refresh the page → **Read** is still the selected one
- [ ] (e2e: tapping_cannot_view_flips_a_grant_to_can_view) Tap Emery's **Cannot View** button → it flips to **Can View**
- [ ] (e2e: a_lesson_access_choice_survives_a_reload) Refresh the page → Emery's **Can View** selection persists
- [ ] (e2e: an_owner_button_taps_back_to_set_as_owner) Tap **Owner** on Dana's row (the current owner) → it flips back to **Set as Owner**
- [ ] (e2e: clearing_the_owner_leaves_the_identity_header_reading_no_owner_set) Refresh the page → the identity header's owner line beside the photo now reads "No owner set" and no longer links to a member (there is no literal "Owner:" prefix in the app, and the line itself always renders — as the owner's name, or as this)
- [ ] (e2e: revoking_the_owners_grant_removes_them_from_the_grants_list) Tap **Set as Owner** on Dana's row again, then tap **Revoke** on Dana's row (confirm the browser prompt) → Dana no longer appears in the grants list
- [ ] (e2e: revoking_the_owners_grant_leaves_the_horse_with_no_owner) Refresh the page → that owner line still reads "No owner set" — revoking the owner's grant cleared ownership
- [ ] (e2e: revoking_a_grant_empties_the_grants_list) Tap **Revoke** on Emery's row (confirm the browser prompt) → Emery no longer appears in the grants list
- [ ] (e2e: a_revoked_member_is_offered_in_the_grant_dropdown_again) Emery is selectable again in the add-member dropdown

Agreements (`/barn/dev-barn/agreements?kind=lease` and `?kind=board`):

- [ ] (e2e: clicking_leases_in_the_nav_opens_the_lease_kind_list) **Leases** in the nav opens the lease-kind list
- [ ] (e2e: the_lease_list_highlights_leases_and_not_boarding) **Leases** stays highlighted in the nav on that list
- [ ] (e2e: the_lease_list_url_carries_kind_lease) The URL shows `?kind=lease`
- [ ] (e2e: the_add_lease_form_highlights_leases_and_not_boarding) (e2e: saving_the_add_lease_form_adds_the_lease_to_the_lease_list) **Add Lease** → the nav still shows **Leases** highlighted (not Boarding) on the `/agreements/new` form → select rider Dana, horse Apple, fee $150, cadence Monthly, start date today → Save
- [ ] (e2e: clicking_boarding_in_the_nav_opens_the_board_kind_list) **Boarding** in the nav opens the board-kind list
- [ ] (e2e: the_board_list_highlights_boarding_and_not_leases) **Boarding** stays highlighted in the nav on that list
- [ ] (e2e: the_board_list_url_carries_kind_board) The URL shows `?kind=board`
- [ ] (e2e: the_add_boarding_form_prefills_the_barns_default_board_fee_and_saves) **Add Boarding** → select rider Emery, horse Butter — fee is pre-filled from the barn's default board fee → Save
- [ ] (e2e: both_agreements_appear_only_in_their_own_kind_scoped_list) Both agreements appear in their respective kind-scoped lists
- [ ] (e2e: each_agreement_card_shows_its_rider) Each of those cards shows its rider
- [ ] (e2e: each_agreement_card_shows_its_horse) Each of those cards shows its horse
- [ ] (e2e: each_agreement_card_shows_its_fee) Each of those cards shows its fee
- [ ] (e2e: each_agreement_card_shows_active_status) Each of those cards shows **Active** status
- [ ] (e2e: the_whole_agreement_card_is_the_link) The whole card is the link
- [ ] (e2e: no_view_or_edit_buttons_appear_on_an_agreement_card) No separate View/Edit buttons appear on that card
- [ ] (e2e: an_unpaid_past_charge_shows_an_amber_unpaid_pill_beside_the_card_status) On the monthly lease's detail page, leave a past month's charge unpaid (Payment Type blank) → back on the Leases list, that agreement's card shows an amber **Unpaid** pill next to its status
- [ ] (e2e: marking_the_past_charge_paid_removes_the_unpaid_pill) Mark that charge paid → refresh the list → the **Unpaid** pill disappears
- [ ] (e2e: a_one_time_lease_card_shows_complete_instead_of_active) Add a one-time lease (rider Dana, horse Apple, cadence One time) → its card in the Leases list shows **Complete** instead of Active
- [ ] (e2e: a_one_time_leases_detail_page_shows_complete) That one-time lease's detail page also shows **Complete**
- [ ] (e2e-candidate) Click the monthly lease's card → its detail page shows the rider
- [ ] (e2e-candidate) That detail page shows the horse
- [ ] (e2e-candidate) That detail page shows the fee
- [ ] (e2e-candidate) That detail page shows the cadence
- [ ] (e2e-candidate) That detail page shows the status
- [ ] (e2e-candidate) That detail page's charges table lists the first auto-generated charge
- [ ] (e2e-candidate) The nav still shows **Leases** highlighted (not Boarding) on the detail page
- [ ] (e2e-candidate) **Edit** button top-right → the nav still shows **Leases** highlighted on the edit page too
- [ ] (e2e-candidate) On the edit page, the rider is read-only
- [ ] (e2e-candidate) On the edit page, the horse is read-only
- [ ] (e2e-candidate) On the edit page, the start date is read-only
- [ ] (e2e-candidate) On the edit page, the cadence is read-only
- [ ] (e2e-candidate) Change the fee → Save → the new fee is reflected in the list
- [ ] (e2e: selecting_a_payment_type_on_a_charge_row_persists_across_a_reload) On the lease detail page's charge row, select a **Payment Type** → the page refreshes and the selection persists
- [ ] (e2e: selecting_a_payment_type_flashes_a_saved_confirmation_beside_the_dropdown) A brief "✓ Saved" confirmation appears next to that dropdown
- [ ] (e2e: editing_a_charge_fee_and_blurring_persists_across_a_reload) Edit the charge's **Fee** field and blur → the new amount persists after refresh
- [ ] (e2e: editing_a_charge_fee_flashes_a_saved_confirmation_beside_the_fee_field) The same "✓ Saved" confirmation appears next to the Fee field
- [ ] (e2e: the_boarding_list_card_opens_a_detail_page_with_boarding_highlighted_in_the_nav) Click the boarding agreement's card → its detail page shows the nav still highlighting **Boarding** (not Leases)
- [ ] (e2e: ending_a_boarding_agreement_makes_the_boarding_list_show_ended) **End Agreement** (confirm the browser prompt) → it now shows **Ended** in the Boarding list
- [ ] (e2e: the_member_detail_boarding_card_links_to_the_agreement_detail_page) On a rider's member detail page with an active boarding agreement, click the **Boarding · `<horse>` · $X/month** link → lands on the agreement detail page
- [ ] (e2e: the_member_detail_boarding_link_lands_with_neither_leases_nor_boarding_highlighted) Neither **Leases** nor **Boarding** is highlighted in the nav on that page — the member-detail card's link carries no `?kind=`, which is what the nav's highlight rule matches on. **Suspected UI defect, characterised here rather than endorsed**

Managed rider stubs (`/barn/dev-barn/members`, inline Add Rider form in the Riders section):

> The UI creates managed **rider** and **trainer** stubs (#564 added the Add Trainer form); **manager** stubs are not creatable — other managers appear only once they join. The steps below use rider stubs; Phase 5's trainer checks still use the seeded trainers via `change-user.sh` rather than a freshly created stub.

- [ ] (e2e: creating_three_managed_riders_through_the_add_rider_form_adds_a_card_link_for_each) Create managed riders **Gale Test**, **Harper Test**, and **Indigo Test** — each row is a normal card link to its member detail page
- [ ] (e2e: each_managed_rider_row_carries_an_inline_amber_unlinked_badge) Each of those rows carries an inline amber **Unlinked** badge next to the name
- [ ] (e2e: the_members_list_shows_no_copy_invite_or_revoke_buttons) No Copy Invite/Revoke buttons appear on this list
- [ ] (e2e: a_managed_riders_detail_page_shows_a_manage_member_section_right_after_the_name) Open Gale Test's member detail page as manager — a **Manage Member** section appears right after the name
- [ ] (e2e: the_manage_member_sections_notice_renders_amber) That **Manage Member** section carries an amber notice
- [ ] (e2e: the_manage_member_section_carries_copy_invite_and_revoke_buttons) That **Manage Member** section carries **Copy Invite** and **Revoke** buttons
- [ ] (e2e: a_manager_can_upload_a_document_for_an_unclaimed_managed_rider) While Gale Test is still unclaimed, upload `scripts/data/test_1_kb.pdf` on their detail page — confirms manager can upload documents for a managed/unclaimed rider
- [ ] (e2e: copy_invite_flashes_copied_after_writing_the_invite_link) Click **Copy Invite** on Gale Test's detail page → the button briefly reads **Copied!**
- [ ] (e2e: the_copied_invite_url_carries_a_well_formed_uuid_token) The copied URL matches `/barn/dev-barn/register?token=<uuid>` (a well-formed UUID token)

> Actually claiming that invite — and the pre-claim-document-readability regression check that goes with it — needs a genuinely different person, which no local or preview setup produces. It's verified against prod in [`POST_RELEASE_TEST_CHECKLIST.md`](../../POST_RELEASE_TEST_CHECKLIST.md) instead.

- [ ] (e2e: revoking_an_invite_makes_copy_invite_yield_a_different_token) On Harper Test's detail page, click **Revoke** → click **Copy Invite** again → the copied URL contains a **different** token than before
- [ ] (e2e: copy_invite_stays_disabled_until_the_revoked_token_has_loaded) On Indigo Test's detail page, click **Revoke** — Copy Invite is disabled/unclickable until the new token has loaded, so it never copies the just-revoked stale token (#939 regression check)

Visual sweep — one pass per feature area, walked at the end of the phase with the data it just created (#1414):

> **(manual) — one verdict, one rubric, stated here instead of on every line** — the section-scoped reason [`PRE_RELEASE_TEST_CHECKLIST.md`](../../PRE_RELEASE_TEST_CHECKLIST.md)'s Automation tags convention permits. A suite run proves behaviour; it cannot prove the app reads well. Each line below asks the same question of one feature area: does it read cleanly?
>
> - spacing, alignment and typography are consistent with the rest of the app
> - it is correct in **both light and dark mode**
> - it is readable at ~390px wide
> - nothing in it is reachable or dismissible only by hover
> - nothing non-interactive carries a hover state implying it is clickable

- [ ] (manual) **Lesson Tiers** — the settings section and the tier form (`/barn/dev-barn/settings`, `/settings/tiers/new`)
- [ ] (manual) **Horses** — the list's Available/Unavailable sections and a horse's detail page including its Access table (`/barn/dev-barn/horses`, `/horses/[id]`)
- [ ] (manual) **Agreements** — both kind-scoped lists, the add form, and a detail page with its charges table (`/barn/dev-barn/agreements`, `/agreements/new`, `/agreements/[id]`)
- [ ] (manual) **Members** — the roster's four sections, the inline add forms, and a managed stub's detail page with its Manage Member notice (`/barn/dev-barn/members`, `/members/[membership_id]`)
