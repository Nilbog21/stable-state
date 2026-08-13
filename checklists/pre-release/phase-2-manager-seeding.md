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

- [ ] (e2e-candidate) Create horses **Daisy**, **Eclipse**, and **Flint**
- [ ] (e2e-candidate) Open Daisy's detail page → set status pill to **Unavailable**, enter reason "Thrown shoe" → Save
- [ ] (e2e-candidate) Horses page now shows Daisy under **Unavailable** with the reason visible
- [ ] (e2e-candidate) On Eclipse's detail page, in the **Access** section, select rider Dana and tap **Grant Access** → Dana appears in the grants list
- [ ] (e2e-candidate) Dana's row carries an **Owner** column showing **Set as Owner**
- [ ] (e2e-candidate) Tap **Set as Owner** on Dana's row → the button changes to **Owner**
- [ ] (e2e-candidate) (#1069) Dana's row now shows **Write** selected in the **Documents** column without tapping it directly (auto-elevated on becoming owner)
- [ ] (e2e-candidate) (#1069) Dana's row now shows lesson access **Can View** without tapping the toggle directly (auto-elevated on becoming owner)
- [ ] (e2e-candidate) Refresh the page → an "Owner: Dana Rider" line appears above the photo
- [ ] (e2e-candidate) That "Owner: Dana Rider" line links to Dana's member detail page
- [ ] (e2e-candidate) Refresh the page → Dana's row in the Access table still shows **Owner**, not **Set as Owner**
- [ ] (e2e-candidate) Grant access to rider Emery → Emery appears in the grants list
- [ ] (e2e-candidate) Emery's row shows Documents set to **None**
- [ ] (e2e-candidate) Emery's row shows lesson access **Cannot View**
- [ ] (e2e: a_document_access_choice_survives_a_reload) Tap **Read** in Emery's **Documents** column → refresh the page → **Read** is still the selected one
- [ ] (e2e-candidate) Tap Emery's **Cannot View** button → it flips to **Can View**
- [ ] (e2e-candidate) Refresh the page → Emery's **Can View** selection persists
- [ ] (e2e-candidate) Tap **Owner** on Dana's row (the current owner) → it flips back to **Set as Owner**
- [ ] (e2e-candidate) Refresh the page → the "Owner:" line above the photo is gone
- [ ] (e2e-candidate) Tap **Set as Owner** on Dana's row again, then tap **Revoke** on Dana's row (confirm the browser prompt) → Dana no longer appears in the grants list
- [ ] (e2e-candidate) Refresh the page → the "Owner:" line above the photo is still gone (revoking the owner cleared ownership)
- [ ] (e2e-candidate) Tap **Revoke** on Emery's row (confirm the browser prompt) → Emery no longer appears in the grants list
- [ ] (e2e-candidate) Emery is selectable again in the add-member dropdown

Agreements (`/barn/dev-barn/agreements?kind=lease` and `?kind=board`):

- [ ] (e2e-candidate) **Leases** in the nav opens the lease-kind list
- [ ] (e2e-candidate) **Leases** stays highlighted in the nav on that list
- [ ] (e2e-candidate) The URL shows `?kind=lease`
- [ ] (e2e-candidate) **Add Lease** → the nav still shows **Leases** highlighted (not Boarding) on the `/agreements/new` form → select rider Dana, horse Apple, fee $150, cadence Monthly, start date today → Save
- [ ] (e2e-candidate) **Boarding** in the nav opens the board-kind list
- [ ] (e2e-candidate) **Boarding** stays highlighted in the nav on that list
- [ ] (e2e-candidate) The URL shows `?kind=board`
- [ ] (e2e-candidate) **Add Boarding** → select rider Emery, horse Butter — fee is pre-filled from the barn's default board fee → Save
- [ ] (e2e-candidate) Both agreements appear in their respective kind-scoped lists
- [ ] (e2e-candidate) Each of those cards shows its rider
- [ ] (e2e-candidate) Each of those cards shows its horse
- [ ] (e2e-candidate) Each of those cards shows its fee
- [ ] (e2e-candidate) Each of those cards shows **Active** status
- [ ] (e2e-candidate) The whole card is the link
- [ ] (e2e-candidate) No separate View/Edit buttons appear on that card
- [ ] (e2e-candidate) On the monthly lease's detail page, leave a past month's charge unpaid (Payment Type blank) → back on the Leases list, that agreement's card shows an amber **Unpaid** pill next to its status
- [ ] (e2e-candidate) Mark that charge paid → refresh the list → the **Unpaid** pill disappears
- [ ] (e2e-candidate) Add a one-time lease (rider Dana, horse Apple, cadence One time) → its card in the Leases list shows **Complete** instead of Active
- [ ] (e2e-candidate) That one-time lease's detail page also shows **Complete**
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
- [ ] (e2e-candidate) On the lease detail page's charge row, select a **Payment Type** → the page refreshes and the selection persists
- [ ] (e2e-candidate) A brief "✓ Saved" confirmation appears next to that dropdown
- [ ] (e2e-candidate) Edit the charge's **Fee** field and blur → the new amount persists after refresh
- [ ] (e2e-candidate) The same "✓ Saved" confirmation appears next to the Fee field
- [ ] (e2e-candidate) Click the boarding agreement's card → its detail page shows the nav still highlighting **Boarding** (not Leases)
- [ ] (e2e-candidate) **End Agreement** (confirm the browser prompt) → it now shows **Ended** in the Boarding list
- [ ] (e2e-candidate) On a rider's member detail page with an active boarding agreement, click the **Boarding: $X/month** link → lands on the agreement detail page
- [ ] (e2e-candidate) **Boarding** is still highlighted in the nav on that page

Managed rider stubs (`/barn/dev-barn/members`, inline Add Rider form in the Riders section):

> The UI creates managed **rider** and **trainer** stubs (#564 added the Add Trainer form); **manager** stubs are not creatable — other managers appear only once they join. The steps below use rider stubs; Phase 5's trainer checks still use the seeded trainers via `change-user.sh` rather than a freshly created stub.

- [ ] (e2e-candidate) Create managed riders **Gale Test**, **Harper Test**, and **Indigo Test** — each row is a normal card link to its member detail page
- [ ] (e2e-candidate) Each of those rows carries an inline amber **Unlinked** badge next to the name
- [ ] (e2e-candidate) No Copy Invite/Revoke buttons appear on this list
- [ ] (e2e-candidate) Open Gale Test's member detail page as manager — a **Manage Member** section appears right after the name
- [ ] (e2e-candidate) That **Manage Member** section carries an amber notice
- [ ] (e2e-candidate) That **Manage Member** section carries **Copy Invite** and **Revoke** buttons
- [ ] (e2e-candidate) While Gale Test is still unclaimed, upload `scripts/data/test_1_kb.pdf` on their detail page — confirms manager can upload/delete documents for a managed/unclaimed rider
- [ ] (e2e-candidate) Click **Copy Invite** on Gale Test's detail page → the button briefly reads **Copied!**
- [ ] (e2e-candidate) The copied URL matches `/barn/dev-barn/register?token=<uuid>` (a well-formed UUID token)

> Actually claiming that invite — and the pre-claim-document-readability regression check that goes with it — needs a genuinely different person, which no local or preview setup produces. It's verified against prod in [`POST_RELEASE_TEST_CHECKLIST.md`](../../POST_RELEASE_TEST_CHECKLIST.md) instead.

- [ ] (e2e-candidate) On Harper Test's detail page, click **Revoke** → click **Copy Invite** again → the copied URL contains a **different** token than before
- [ ] (e2e-candidate) On Indigo Test's detail page, click **Revoke** then immediately click **Copy Invite** (as fast as possible, before the button re-enables) — Copy Invite is disabled/unclickable until the new token has loaded, so it never copies the just-revoked stale token (#939 regression check)

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
