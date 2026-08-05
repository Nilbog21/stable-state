# Phase 2 — Manager seeding

<!-- Asserting role: manager only. Data other phases depend on is created here. -->

> Conventions, phase partitioning, automation tags, and route coverage: [`PRE_RELEASE_TEST_CHECKLIST.md`](../../PRE_RELEASE_TEST_CHECKLIST.md)

Lesson tiers (`/barn/dev-barn/settings` → Add Tier → `/barn/dev-barn/settings/tiers/new`):

- [ ] Create tier **Beginner** — $60, default exertion level 2, jumping off
- [ ] Create tier **Advanced** — $120, default jumping on
- [ ] Create tier **Group Special** — $90, no defaults
- [ ] All three appear in the Lesson Tiers list on the settings page
- [ ] Try saving a tier with a blank price — rejected with "Price is required"
- [ ] Try saving a tier with a $0 price — accepted
- [ ] Try saving a tier with a blank or whitespace-only name — rejected with "Name is required"
- [ ] Edit an existing tier to a blank or whitespace-only name — rejected the same way
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
- [ ] Grant access to rider Emery → Emery appears in the grants list with Documents set to **None**
- [ ] Emery's row shows lesson access **Cannot View**
- [ ] Change Emery's **Documents** dropdown to **Read** → refresh the page → the selection persists
- [ ] Tap Emery's **Cannot View** button → it flips to **Can View**
- [ ] Refresh the page → Emery's **Can View** selection persists
- [ ] Tap **Owner** on Dana's row (the current owner) → it flips back to **Set as Owner**
- [ ] Refresh the page → the "Owner:" line above the photo is gone
- [ ] Tap **Set as Owner** on Dana's row again, then tap **Revoke** on Dana's row (confirm the browser prompt) → Dana no longer appears in the grants list
- [ ] Refresh the page → the "Owner:" line above the photo is still gone (revoking the owner cleared ownership)
- [ ] Tap **Revoke** on Emery's row (confirm the browser prompt) → Emery no longer appears in the grants list
- [ ] Emery is selectable again in the add-member dropdown

Agreements (`/barn/dev-barn/agreements?kind=lease` and `?kind=board`):

- [ ] **Leases** in the nav opens the lease-kind list
- [ ] **Leases** stays highlighted in the nav on that list
- [ ] The URL shows `?kind=lease`
- [ ] **Add Lease** → the nav still shows **Leases** highlighted (not Boarding) on the `/agreements/new` form
- [ ] Select rider Dana, horse Apple, fee $150, cadence Monthly, start date today → Save succeeds
- [ ] **Boarding** in the nav opens the board-kind list
- [ ] **Boarding** stays highlighted in the nav on that list
- [ ] The URL shows `?kind=board`
- [ ] **Add Boarding** → select rider Emery, horse Butter — fee is pre-filled from the barn's default board fee
- [ ] Save that boarding agreement — it succeeds
- [ ] Both agreements appear in their respective kind-scoped lists, each showing rider, horse, fee, and **Active** status
- [ ] The whole card is the link — no separate View/Edit buttons on it
- [ ] On the monthly lease's detail page, leave a past month's charge unpaid (Payment Type blank) → back on the Leases list, that agreement's card shows an amber **Unpaid** pill next to its status
- [ ] Mark that charge paid → refresh the list → the **Unpaid** pill disappears
- [ ] Add a one-time lease (rider Dana, horse Apple, cadence One time) → its card in the Leases list shows **Complete** instead of Active
- [ ] That one-time lease's detail page also shows **Complete**
- [ ] Click the monthly lease's card → detail page shows rider, horse, fee, cadence, and status
- [ ] That detail page's charges table lists the first auto-generated charge
- [ ] The nav still shows **Leases** highlighted (not Boarding) on the detail page
- [ ] **Edit** button top-right → the nav still shows **Leases** highlighted on the edit page too
- [ ] On the edit page, rider, horse, start date, and cadence are read-only
- [ ] Change the fee → Save → the new fee is reflected in the list
- [ ] On the lease detail page's charge row, select a **Payment Type** → the page refreshes and the selection persists
- [ ] A brief "✓ Saved" confirmation appears next to that dropdown
- [ ] Edit the charge's **Fee** field and blur → the new amount persists after refresh
- [ ] The same "✓ Saved" confirmation appears next to the Fee field
- [ ] Click the boarding agreement's card → its detail page shows the nav still highlighting **Boarding** (not Leases)
- [ ] **End Agreement** (confirm the browser prompt) → it now shows **Ended** in the Boarding list
- [ ] On a rider's member detail page with an active boarding agreement, click the **Boarding: $X/month** link → lands on the agreement detail page with **Boarding** still highlighted in the nav

Managed rider stubs (`/barn/dev-barn/members`, inline Add Rider form in the Riders section):

> The UI creates managed **rider** and **trainer** stubs (#564 added the Add Trainer form); **manager** stubs are not creatable — other managers appear only once they join. The steps below use rider stubs; Phase 5's trainer checks still use the seeded trainers via `change-user.sh` rather than a freshly created stub.

- [ ] Create managed riders **Gale Test**, **Harper Test**, and **Indigo Test** — each row is a normal card link to its member detail page
- [ ] Each of those rows carries an inline amber **Unlinked** badge next to the name
- [ ] No Copy Invite/Revoke buttons appear on this list
- [ ] Open Gale Test's member detail page as manager — a **Manage Member** section appears right after the name with an amber notice and **Copy Invite**/**Revoke** buttons
- [ ] While Gale Test is still unclaimed, upload `scripts/data/test_1_kb.pdf` on their detail page — confirms manager can upload/delete documents for a managed/unclaimed rider
- [ ] Click **Copy Invite** on Gale Test's detail page → the button briefly reads **Copied!**
- [ ] The copied URL matches `/barn/dev-barn/register?token=<uuid>` (a well-formed UUID token)

> Actually claiming that invite — and the pre-claim-document-readability regression check that goes with it — needs a genuinely different person, which no local or preview setup produces. It's verified against prod in [`POST_RELEASE_TEST_CHECKLIST.md`](../../POST_RELEASE_TEST_CHECKLIST.md) instead.

- [ ] On Harper Test's detail page, click **Revoke** → click **Copy Invite** again → the copied URL contains a **different** token than before
- [ ] On Indigo Test's detail page, click **Revoke** then immediately click **Copy Invite** (as fast as possible, before the button re-enables) — Copy Invite is disabled/unclickable until the new token has loaded, so it never copies the just-revoked stale token (#939 regression check)
