# Pre-Release Test Checklist

Manual smoke test of all barn workflows against the dev environment. Run the phases **in order** — later phases depend on data created in earlier ones. Every UI route in `ARCHITECTURE.md` is covered at least once (see [Route coverage](#route-coverage) at the bottom).

Paths below are relative — prepend your app origin (local `npm run dev` or Vercel preview URL).

## Prerequisites

- [ ] `.env.local` at repo root with `DEV_EMAIL`, `DEV_NAME` (must be "First Last" — a single word breaks the name prompt in Phase 1), `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (optionally `DEV_BARN` — only `seed-account.sh` in Phase 1 defaults it to `dev-barn`; `change-user.sh` in Phases 5–7 doesn't use `DEV_BARN` at all — it prompts with a numbered list of barns to pick from)
- [ ] App running (dev server or Vercel preview) and reachable in a browser
- [ ] A **secondary Google account** (not `DEV_EMAIL`) available for the stub-claim step in Phase 2 — one Google account can only claim one managed stub
- [ ] Email provider enabled in the Supabase dashboard (required by `seed-test-barn.sh` in Phase 7)

## Phase 1 — Setup

- [ ] Reset and reseed the dev database:

  ```bash
  bash scripts/reset-db.sh
  ```

  This chains `seed-account.sh`, which prompts for **First name**, **Last name**, and **Barn slug** — each pre-filled from `.env.local` (`DEV_NAME`, `DEV_BARN`), so press **Enter** through all three to accept the defaults. Then, at `reset-db.sh`'s own `Press Enter when logged in, or Escape to skip role selection:` prompt, press **Escape** — you stay manager for now.
- [ ] The script prints `Invite path: /barn/dev-barn/login?token=<uuid>` — open that path on your app origin
- [ ] The `/barn/dev-barn/login` page shows the **"Keep me logged in"** checkbox (checked by default) — sign in with the **`DEV_EMAIL`** Google account
- [ ] You are redirected to `/profile/complete` (fresh claimed stub has no contact info)
- [ ] Fill in phone, emergency contact name, and emergency contact phone → Save → you land in the app as manager of Dev Barn
- [ ] Shrink the browser below 768px wide — the nav bar's section links disappear and a ☰ button appears; tapping it opens a left drawer listing the same links, which closes on link tap, backdrop tap, and Escape; the bell icon now sits to the left of the avatar (reversed from desktop's avatar-then-bell order)
- [ ] **Lessons** is bolded/highlighted in both the desktop nav bar and the drawer while on `/barn/dev-barn/lessons` or a nested page like `/barn/dev-barn/lessons/[id]`; other links stay unhighlighted
- [ ] Temporarily `throw new Error('smoke test')` at the top of any page or Server Action, load it, then revert — confirm the global error boundary (`src/app/error.tsx`) renders "Something went wrong" with a working **Try again** button instead of a raw stack trace

**Seeded baseline after reset** (expect this data alongside anything you create below): trainers Alex, Blake, Casey; riders Dana, Emery, Finley; pending rider Quinn Pending; second manager Morgan Manager; horses Apple, Butter, Clover; horse Willow (retired/inactive with 3 past lessons + 1 upcoming — will not appear in the horse picker or the Horses page's Available/Unavailable sections, only visible to managers under Inactive); tiers Normal Tier ($100, default) and Premium Tier ($150); ~38 lessons spread over the past 3 months (some paid, one group per five, some jumping, 5 upcoming).

## Phase 2 — Manager seeding

Lesson tiers (`/barn/dev-barn/settings` → Add Tier → `/barn/dev-barn/settings/tiers/new`):

- [ ] Create tier **Beginner** — $60, default exertion level 2, jumping off
- [ ] Create tier **Advanced** — $120, default jumping on
- [ ] Create tier **Group Special** — $90, no defaults
- [ ] All three appear in the Lesson Tiers list on the settings page
- [ ] Try saving a tier with a blank price — rejected with "Price is required"; $0 price is accepted
- [ ] Try saving a tier with a blank or whitespace-only name — rejected with "Name is required" (same for editing an existing tier)
- [ ] Try saving a tier with both name and price blank — rejected with both errors shown together ("Name is required, Price is required")

Horses (`/barn/dev-barn/horses`, inline Add Horse form in the page header):

- [ ] Create horses **Daisy**, **Eclipse**, and **Flint**
- [ ] Open Daisy's detail page → set status pill to **Unavailable**, enter reason "Thrown shoe" → Save
- [ ] Horses page now shows Daisy under **Unavailable** with the reason visible

Agreements (`/barn/dev-barn/agreements?kind=lease` and `?kind=board`):

- [ ] **Leases** in the nav opens the lease-kind list and stays highlighted; **Add Lease** → the nav still shows **Leases** highlighted (not Boarding) on the `/agreements/new` form → select rider Dana, horse Apple, fee $150, cadence Monthly, start date today → Save
- [ ] **Boarding** in the nav opens the board-kind list and stays highlighted; **Add Boarding** → select rider Emery, horse Butter — fee is pre-filled from the barn's default board fee → Save
- [ ] Both agreements appear as full-card links in their respective kind-scoped lists, each showing rider, horse, fee, and **Active** status — no separate View/Edit buttons on the card, the whole card is the link
- [ ] Add a one-time lease (rider Dana, horse Apple, cadence One time) → its card shows **Complete** instead of Active, both in the Leases list and on its detail page
- [ ] Click the monthly lease's card → detail page shows rider, horse, fee, cadence, and status, plus a charges table with the first auto-generated charge; **Edit** button top-right → rider, horse, start date, and cadence are read-only; change the fee → Save → new fee reflected in the list
- [ ] On the lease detail page's charge row, select a **Payment Type** → page refreshes and the selection persists; edit the **Fee** field and blur → new amount persists after refresh
- [ ] **End Agreement** on the boarding agreement (confirm the browser prompt) → it now shows **Ended** in the Boarding list

Managed rider stubs (`/barn/dev-barn/members`, inline Add Rider form in the Riders section):

> The UI creates managed **rider** stubs only. Trainer stubs cannot be created from the UI — the trainer phase (Phase 5) uses the seeded trainers via `change-user.sh` instead.

- [ ] Create managed riders **Gale Test**, **Harper Test**, and **Indigo Test** — each row shows an **Unlinked** badge with **Copy invite** and **Revoke** buttons
- [ ] Click **Copy invite** on Gale Test → in a browser where you're signed in to your **secondary Google account** (or logged out), open the copied URL (`/barn/dev-barn/login?token=<uuid>`) and sign in with the secondary account
- [ ] The secondary account is redirected to `/profile/complete` — fill contact fields and save → lands in Dev Barn as rider Gale Test
- [ ] Back as manager: Gale Test's row no longer shows the Unlinked badge and now links to a member detail page
- [ ] Click **Revoke** on Harper Test → click **Copy invite** again → the copied URL contains a **different** token than before

## Phase 3 — Manager lesson entry

All via `/barn/dev-barn/lessons/new`. Times entered here should display later in 12-hour AM/PM format.

Past month (previous calendar month):

- [ ] Lesson 1: Beginner tier, trainer Alex, rider Dana, horse Apple
- [ ] Lesson 2: Advanced tier, trainer Blake, rider Emery, horse Butter

Current month (past dates where possible):

- [ ] Lesson 3: Beginner tier, trainer Alex, rider Dana, horse Clover — after saving, mark it **paid** (set a payment type)
- [ ] Lesson 4: **Group** lesson — Group Special tier, trainer Blake, riders Dana + Emery, horse Butter
- [ ] Lesson 5: Advanced tier with **jumping** on, trainer Casey, rider Finley, horse Apple
- [ ] Lesson 6: Normal Tier, trainer Alex, rider Gale Test, horse Clover (leave unpaid)

Future:

- [ ] Lesson 7: next week, Beginner tier, trainer Alex, rider Dana, horse Apple
- [ ] Lesson 8: next week, Premium Tier, trainer Blake, rider Emery, horse Eclipse
- [ ] Daisy (Unavailable) appears **disabled** in the horse picker while creating lessons
- [ ] Try saving a lesson with a blank fee (Custom tier) — rejected with "fee is required"; in edit mode, blank fee is rejected too
- [ ] Select a named tier (e.g. Beginner) — fee field stays visible and editable, pre-filled with the tier's price; change the fee and save — lesson saves with the edited fee and keeps the tier's name (not "Custom")
- [ ] On the new-lesson form, check **Recurring (weekly)** — the Date field label changes to "Starting Date" (reverts to "Date" when unchecked); the checkbox sits directly above the date field
- [ ] Lesson 9: check **Recurring (weekly)**, Beginner tier, trainer Alex, rider Dana, horse Apple — saves successfully; the checkbox does not appear when editing this (or any) lesson
- [ ] Lesson 9 shows a **Recurring** badge on the Lessons list row and on its Lesson Detail page
- [ ] Open Lesson 9's edit page as manager — "This is part of a recurring series" indicator and **Stop Recurring Lessons** button appear at the top of the page, above the lesson form; confirm the dialog, click Stop — button and indicator disappear on reload, the lesson itself is unchanged (still shows its Recurring badge on list/detail, since it's still that lesson's own occurrence of the series)
- [ ] On the new-lesson form, pick a date and check Apple, Butter, and Clover in turn — each shows an exhaustion bar below its name (no bars before a date is picked); adjust a checked horse's exertion level and watch its ghost segment move live, while unchecked horses' bars stay solid (no ghost); change the date and confirm the bars refresh; open Lesson 3's edit page and confirm Clover's bar still renders (excluding Lesson 3 itself from its own window)

## Phase 4 — Manager verification

Dashboard (`/barn/dev-barn`):

- [ ] Section is titled "Barn Schedule" and shows lessons and upcoming planned expenses (future date+time, no amount yet) together in the next 7 days, split into a "Today" section (only when something is scheduled today) and a "This Week" section (the remaining 6 days) — the seeded Riverside Vet Clinic expense 2 days out appears interleaved by time between that day's lessons
- [ ] A date-only planned expense (no time set) does **not** appear on the dashboard
- [ ] Expense entries show date/time, recipient, expense type, and horse(s) or "Entire Barn", and link to the expense detail page
- [ ] Pending-requests badge is visible (Quinn Pending) and links to settings
- [ ] Document Reminders section is hidden when no documents are past their reminder date; after setting a past reminder date on a document (see Horses/Members below), it appears here and links to that horse's or member's detail page

Lessons (`/barn/dev-barn/lessons`):

- [ ] Recent lessons (last 7 days) shown immediately; older lessons appear only after the older-lessons toggle
- [ ] Each lesson renders as a full-card link (whole row is tappable to the detail page); the **Cancel** button sits beside the card, not inside it
- [ ] Filter pills show `My Lessons | All | By Instructor | By Rider | By Horse`, wrapping onto multiple lines at ~390px width instead of requiring horizontal scroll; **My Lessons** is active by default and shows only lessons you instruct
- [ ] Picking **All** shows every barn lesson regardless of instructor
- [ ] Picking **By Instructor → Alex** shows only Alex's lessons and the URL carries `?filter=trainer&id=<uuid>`
- [ ] **By Rider → Dana** filters correctly
- [ ] **By Horse → Apple** filters correctly
- [ ] Times display in 12-hour AM/PM format everywhere (no military time)
- [ ] Open a lesson's detail page (`/barn/dev-barn/lessons/[id]`) — horse notes and rider notes render read-only; Edit link visible
- [ ] Edit a lesson (`/barn/dev-barn/lessons/[id]/edit`) — change the fee, save, verify the change on the detail page
- [ ] Edit the group lesson (Lesson 4) → switch type to normal → a downgrade warning asks you to pick one rider/horse to keep (cancel without saving)
- [ ] Delete one seeded lesson — it disappears from the list
- [ ] On a lesson's detail page, click **Cancel** next to a rider's name → confirm with **Cancelled by Rider** on a lesson >24h out → fee is unaffected on far-out lessons but zeroed on a lesson booked <24h away; that rider shows a **Cancelled** badge and the rest of the lesson is unaffected
- [ ] Repeat with **Cancelled by Instructor** → fee is zeroed regardless of timing
- [ ] From the Lessons list, click **Cancel** on a **normal** lesson (whole-lesson cancel) → the confirmation page shows a **Cancelled by Rider** / **Cancelled by Instructor** toggle identical to the per-rider cancel page; confirm with notes → lesson shows a **Cancelled** badge and your notes under **Cancellation Notes** on the detail page
- [ ] Whole-lesson cancel on a **group** lesson → no toggle shown; confirmation text instead lists the count and names of enrolled riders who will be affected
- [ ] On a **normal** lesson, per-rider-cancel the only rider (do not use the whole-lesson Cancel link) → the lesson itself now shows a **Cancelled** badge on the list, detail page, and Dashboard, even though you never used the whole-lesson cancel flow
- [ ] On a **group** lesson, per-rider-cancel every enrolled rider one at a time → after the last one, the lesson shows a **Cancelled** badge everywhere; cancel the last-but-one and the second-to-last riders and confirm the badge does *not* appear until the final rider is cancelled
- [ ] On an already-cancelled lesson's detail page, edit the **Cancellation Notes** field (manager and, separately, the instructing trainer) → blur to save, refresh the page, confirm the new text persists; a rider viewing the same lesson sees the notes as read-only text, no input field
- [ ] As manager, open a lesson's detail page and click **Delete** → confirm the browser prompt → lesson disappears entirely from the Lessons list and Finances (no **Cancelled** badge, no notification to instructor/riders); repeat on an already-cancelled lesson and a past/paid lesson to confirm Delete is reachable regardless of state; as trainer, confirm no **Delete** button is shown on any lesson

Expenses (`/barn/dev-barn/expenses`):

- [ ] Nav shows **Expenses** between Lessons and Horses
- [ ] Seeded expenses render, split into recent and older (**Show older expenses** toggle), including at least one future-dated planned expense with no amount
- [ ] Add a new expense (`/barn/dev-barn/expenses/new`): enter a recipient seen before (e.g. "Dr. Hoof Farrier") and tab out — Expense Type auto-fills and flashes; leave amount blank to save a planned expense, then re-open the form later and fill it in
- [ ] Check **Entire Barn** on the new-expense form — horse checkboxes disable; save and verify the row shows "Entire Barn" instead of specific horses
- [ ] Edit a seeded expense (`/barn/dev-barn/expenses/[id]`) — form opens pre-filled including the correct Entire Barn / specific-horse checkbox state; change the recipient and amount, save, verify the row updates
- [ ] Delete one seeded expense — it disappears from the list
- [ ] Trainer and rider logins do not see the Expenses nav link and are redirected away from `/barn/dev-barn/expenses` if visited directly

Horses (`/barn/dev-barn/horses` and `/barn/dev-barn/horses/[id]`):

- [ ] Available section sorted by total exertion ascending (7d); Apple/Butter/Clover show an exhaustion bar in different color bands; tap a bar to expand the ±3-day lesson breakdown, tap again (or elsewhere) to dismiss — tapping the bar does not navigate to the horse detail page
- [ ] Open Apple's detail page → rename it via the manager form → Save → name updates
- [ ] Documents section: tap **Add Document**, upload a PDF → redirects back to this horse's page; open the document via its link (signed URL), then delete it
- [ ] On the Add Document page, attempt to upload a document over 4.5MB — rejected with an inline error, not a crash
- [ ] On the Add Document page, the Upload button disables and an indeterminate progress bar shows while the upload is pending
- [ ] Exhaustion Thresholds section: "Use barn defaults" is checked and inputs are disabled/pre-filled with barn defaults (`5`/`11`) for a horse with no override; uncheck it, set Moderate/High, Save → values persist on reload and the toggle is now unchecked; re-check "Use barn defaults" and Save → inputs revert to barn defaults; try Moderate ≥ High while unchecked → rejected with a field error and values unchanged
- [ ] Upload another document with an **Expiration reminder date** set → the date persists in the Reminder Date column; edit it inline (tap the field, change the date, tap away) → it saves without a page reload
- [ ] Set that document's Reminder Date to a past date → a **Reminder Due** badge appears next to the date, and the document shows up in the Dashboard's Document Reminders section, linking back to this horse

Members (`/barn/dev-barn/members` and `/barn/dev-barn/members/[membership_id]`):

- [ ] "You" card plus Managers (Morgan, own entry excluded), Trainers, and Riders sections all render
- [ ] Open a trainer's member detail page → **Contact Info** section shows Phone, Emergency Contact Name, Emergency Contact Phone (or "—" for any that are blank)
- [ ] Open managed/unclaimed rider Harper Test's member detail page → name and **Contact Info** render (blank fields show "—") even though the account has no linked `user_id`; Documents section still shows "No account linked — documents unavailable"
- [ ] On Harper Test's member detail page, **Contact Info** is an editable form (manager viewing an unclaimed/managed member) → set Phone, Emergency Contact Name, Emergency Contact Phone and tap **Save** → values persist on reload; a trainer opening the same page sees Contact Info read-only, with no Save button
- [ ] Open a trainer's member detail page → tap **Add Document**, upload a document → redirects back to this member's page; it lists with a working link → delete it
- [ ] On the Add Document page, attempt to upload a document over 4.5MB — rejected with an inline error, not a crash
- [ ] On the Add Document page, the Upload button disables and an indeterminate progress bar shows while the upload is pending
- [ ] On that same document, edit the Reminder Date inline (tap the field, set a date, tap away) → it saves
- [ ] Set that document's Reminder Date to a past date → a **Reminder Due** badge appears next to the date, and the document shows up in the Dashboard's Document Reminders section, linking back to this member
- [ ] Open rider Gale Test's member detail page — **Add Document** button is available (manager can manage rider docs)
- [ ] Rider Emery's member detail page shows **Boarding: $X/month** linking to their boarding agreement; a rider with no boarding agreement shows an **Add boarding** link into `/agreements?kind=board`; a managed (unclaimed) rider's detail page shows the same boarding status line
- [ ] Open a trainer's member detail page → **Instructor Access** section shows **Revoke Instructor Access** (trainers default to `can_instruct=true`) → tap it → button now reads **Grant Instructor Access** and the trainer no longer appears in the instructor select on the new-lesson form; tap **Grant Instructor Access** to restore it → trainer reappears in the instructor select
- [ ] Open your own manager member detail page → **Instructor Access** section shows **Grant Instructor Access** → tap it → you now appear in the instructor select on the new-lesson form; tap **Revoke Instructor Access** to undo
- [ ] Open rider Gale Test's member detail page — no **Instructor Access** section is shown

Finances (`/barn/dev-barn/finances`):

- [ ] **Outstanding** section lists past unpaid lessons; set a payment type on one row via the inline dropdown → it leaves the outstanding list
- [ ] "View all outstanding" → `/barn/dev-barn/finances/outstanding` lists all barn outstanding lessons, each row linking to its lesson
- [ ] Month navigation `←`/`→` works and updates `?month=YYYY-MM`; navigate to the previous month and see Lessons 1–2 reflected
- [ ] Summary rows appear in order **Collected income → Total Expenses → Net → Pending income**, none with a month/year suffix (the month picker above already shows it); Net equals Collected income minus Total Expenses
- [ ] **By Horse** is the default tab on page load (no `?tab=` needed)
- [ ] **By Horse** tab: **Horse | Income | Expenses | Net** columns; add an expense for a horse with a lesson this month → its Expenses/Net update; a horse with $0 expenses shows `$0.00` (not blank); a horse with expenses but no lessons this month still appears, with `$0.00` Income and a negative Net; click a horse → drill-down `/barn/dev-barn/finances/horses/[id]` shows one combined table (lessons, leases/boarding charges, and expenses) ordered by date ascending, with a **Type** column and expense Amount/Split in parentheses (e.g. `($25.00)`); the bottom **Net** figure matches this horse's Net on the By Horse tab; month param preserved
- [ ] **By Tier** tab (no longer default, still reachable via the pill): your new tiers and seeded tiers listed with price, lesson count, an **Instructor Cut** column (sum of that tier's lessons' own snapshotted cuts, or `—` when zero), and a net Subtotal; Collected income matches the sum of net Subtotals plus any Non-lesson income; edit a tier's instructor cut, book a new lesson under it, and confirm the tier's Instructor Cut column reflects a mix of the old and new per-lesson rates rather than the new rate × total count
- [ ] **By Rider** tab: collected income per rider, net of the instructor cut, with drill-down `/barn/dev-barn/finances/riders/[id]`
- [ ] **By Instructor** tab: collected income per trainer full name, net of the instructor cut
- [ ] Mark a $0 (comped) lesson paid → its net contribution is negative (cut with no fee to offset it) and renders in parentheses, e.g. `($25.00)`, not with a leading minus sign; it's still included in Collected income (not dropped or clamped to zero)
- [ ] Collected vs Pending income figures are consistent with what you marked paid, net of the instructor cut; the **Outstanding** section above stays at the raw (gross) fee
- [ ] Mark the lease's first charge as paid (`/barn/dev-barn/agreements/[id]` → set Payment Type) → back on Finances, Collected income increases and **By Tier** shows a **Non-lesson income** row with a tap-to-toggle ⓘ ("Includes leases and boarding") and a blank Lessons cell (not a charge count); **By Horse** (Apple) and **By Rider** (Dana) totals include the full charge amount; drilling into Apple's row shows the charge as a row in the combined table with a working link back to the agreement
- [ ] **By Instructor** tab also shows the same **Non-lesson income** row
- [ ] Remove a trainer's membership after they've instructed a paid lesson → **By Instructor** tab shows a **No instructor** row (plain text, not a link) with a tap-to-toggle ⓘ; the lesson's fee is still counted in Collected income (the **No horse**/**No rider** rows are defensive-only for legacy data and aren't reachable through the current lesson form or DB triggers, so skip trying to trigger them manually)

Manage Barn (`/barn/dev-barn/settings`):

- [ ] **Approve** Quinn Pending under Pending Requests → Quinn moves to Active Members
- [ ] **Remove** Quinn from Active Members (confirm the browser prompt)
- [ ] Toggle `can_instruct` on for a rider → they appear in the instructor dropdown on the new-lesson form; toggle it back off
- [ ] **Default Instructor Cut** field shows the current value (default `25`); change it and **Save** → value persists on reload; try `0` (allowed) and blank (rejected — field stays unchanged); confirm the helper text says the change doesn't affect past lessons, not that it recalculates historical income
- [ ] Edit a tier (`/barn/dev-barn/settings/tiers/[id]`): change its price → an amber warning appears noting past lessons are unaffected; revert to the original price → warning disappears → Save
- [ ] On that same tier edit page, change its **Instructor Cut** → the same style amber warning appears ("won't affect past lessons"); revert → warning disappears; **Add Tier** a new tier and confirm its Instructor Cut field pre-fills from the barn's Default Instructor Cut
- [ ] Set a different tier as **default** → new-lesson form pre-selects it
- [ ] **Deactivate** the Group Special tier → it no longer appears when creating a lesson; **reactivate** it
- [ ] Edit **Default Board Fee**, confirm the non-retroactive helper text is visible → Save → a pre-existing boarding agreement's fee is unchanged, but a newly created boarding agreement pre-fills the new fee
- [ ] **Horse Exhaustion Thresholds** fields show the current Moderate/High values (defaults `5`/`11`); change both and **Save** → values persist on reload; try setting Moderate ≥ High → rejected with a field error and values unchanged

Notifications and profile:

- [ ] Notification bell shows an unread-count badge; opening it lists notifications with title/body/timestamp
- [ ] **Mark all read** clears the badge
- [ ] Avatar menu → **Profile** (`/profile?barn=dev-barn`): barn nav bar renders; edit phone → Save → redirected back to the barn
- [ ] Avatar menu → **User Guide** (`/barn/dev-barn/guide`) renders the manager guide

Mobile spot-check (resize the browser to ~390px wide, or use your browser's device toolbar):

- [ ] Nav bar and its dropdowns (avatar menu, notification bell) remain usable — reachable and dismissible by tap, with no reliance on hover
- [ ] Lessons and Horses lists stay readable without horizontal scrolling

## Phase 5 — Trainer

Switch role (interactive):

```bash
bash scripts/change-user.sh
```

> First prompt is a numbered list of barns — pick **Dev Barn**. Then pick **Alex** from the profile list — this list is scoped to Dev Barn's members only (active or pending), so no other barn's profiles appear. If the selected profile's membership is **pending**, you'll be prompted to activate it (y/N) before the switch proceeds.
>
> `change-user.sh` copies the selected user's role onto your `DEV_EMAIL` membership and reassigns their lessons to you — you stay logged in as yourself. Refresh the page after it runs.

- [ ] Nav shows only: barn name, Lessons, Horses, Members, Guide — **no Finances, no Manage Barn, no Leases, no Boarding, no Expenses**
- [ ] `/barn/dev-barn/expenses` is blocked — visiting it directly shows **404**, not a login redirect
- [ ] Lessons list defaults to **My Lessons** (only Alex's, now reassigned to you); switch to **All** to see every barn lesson including Blake's — filter pills show the same `My Lessons | All | By Instructor | By Rider | By Horse` bar as the manager view
- [ ] Create 2 lessons via `/barn/dev-barn/lessons/new` — the instructor field is locked to you; pick a date and confirm the exhaustion bars render below each horse, same as the manager view
- [ ] Edit one of your own lessons — the instructor field is **read-only**
- [ ] Open one of Blake's lessons from the Lessons list — no Edit link is shown, and navigating to its `/edit` URL directly does not let you save changes
- [ ] On one of your own lessons, cancel a rider's spot — works the same as manager; on Blake's lesson, the per-rider Cancel link is not shown
- [ ] Open Lesson 9's edit page (now reassigned to you) — "This is part of a recurring series" indicator and **Stop Recurring Lessons** button appear; stopping works the same as manager
- [ ] Horse detail page: documents are listed with working links, upload works (including setting a Reminder Date), but there is **no delete** button, **no Exhaustion Thresholds section**, and the Reminder Date column is **read-only**
- [ ] Members page shows the Riders section only; open your own member detail page and upload a document, optionally setting a Reminder Date; the Reminder Date column on your own documents is **read-only** (only a manager can edit it)
- [ ] `/barn/dev-barn/finances` is blocked — shows **404**, not a login redirect; `/barn/dev-barn/finances/outstanding` works and shows **only your own** outstanding lessons

## Phase 6 — Rider

Switch role (pick **Dev Barn**, then **Dana**, from the same barn/member lists as Phase 5):

```bash
bash scripts/change-user.sh
```

- [ ] Nav shows only: barn name, Lessons, Horses, Members, Guide — **no Leases, no Boarding, no Expenses**
- [ ] `/barn/dev-barn/expenses` is blocked — visiting it directly shows **404**, not a login redirect
- [ ] Horses page shows Available/Unavailable cards with name (and unavailability reason) only — **no exhaustion bar**, no Inactive section
- [ ] Dashboard upcoming-lessons preview shows only lessons Dana is enrolled in — no "Barn Schedule" heading and no expenses shown (manager-only)
- [ ] Lessons list shows only Dana's enrolled lessons, with filter pills `All | By Instructor | By Horse` — no **My Lessons** or **By Rider** pill; Dana's own name does not appear on her own lesson cards
- [ ] Open an enrolled lesson's detail page — own rider notes visible read-only; **no private notes** shown
- [ ] Copy a lesson ID Dana is **not** enrolled in and visit `/barn/dev-barn/lessons/[id]` directly — page shows **404**, not the lesson details
- [ ] Cancel your own spot in an enrolled lesson (from the Lessons list, Dashboard, or the lesson detail page) → your row shows a **Cancelled** badge on the list, Dashboard, and detail page; the rest of the lesson (and other riders in a group lesson) is unaffected
- [ ] `/barn/dev-barn/finances` is blocked — shows **404**, not a login redirect
- [ ] `/barn/dev-barn/finances/outstanding` shows only Dana's outstanding lessons, plus her own outstanding lease/boarding charges (if any are past due) with a Type column — no such column entries for other riders' agreements
- [ ] `/barn/dev-barn/members` shows only the "You" card — no Managers/Trainers/Riders management sections

## Phase 7 — Multi-barn

Restore yourself to manager first (pick **Dev Barn**, then **your own name**, from the same barn/member lists as Phase 5):

```bash
bash scripts/change-user.sh
```

Create a second barn:

```bash
bash scripts/seed-test-barn.sh test-barn-checklist
```

> **Caution:** `reset-db.sh` (Phase 1) wipes **all** barns project-wide, not just Dev Barn. If you need to restart this checklist from the top after this point, re-running it will also delete `test-barn-checklist`.

- [ ] As `DEV_EMAIL`, open `/barn/test-barn-checklist/register` with no `?token=` → shows an "Invite invalid" message, not a self-registration form
- [ ] In a private/incognito window, sign in at `/barn/test-barn-checklist/login` as `manager@test-barn-checklist.e2e` / `TestPass123!` → create a managed rider in Members → **Copy invite** → sign out
- [ ] As `DEV_EMAIL`, open the copied invite URL (`/barn/test-barn-checklist/login?token=<uuid>`) and sign in → claims the stub directly (active membership, no approval step) and lands on the barn dashboard
- [ ] Still as manager, create a second managed rider and **Copy invite**; as `DEV_EMAIL` (already signed in), open the `/register?token=<uuid>` URL directly instead of the copied `/login?token=...` one → shows a "Join test-barn-checklist" confirmation with an **Accept Invite** button (no auto-claim on page load); tapping it claims the stub and lands on the barn dashboard
- [ ] Back as `DEV_EMAIL`: the nav barn name now has a caret — the **BarnSwitcher** dropdown lists both barns, current one checkmarked; clicking the other navigates to its dashboard
- [ ] At a mobile viewport (~390px wide, or your browser's device toolbar), the BarnSwitcher caret is still tappable (≥44px target) and the dropdown behaves the same as desktop
- [ ] Visit `/barns` — one card per membership showing role, each linking to its barn
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
| `/barn/[slug]/settings` | Phases 2, 4, 7 |
| `/barn/[slug]/settings/tiers/new` | Phase 2 |
| `/barn/[slug]/settings/tiers/[id]` | Phase 4 |
| `/barn/[slug]/guide` | Phase 4 |
| `/profile` | Phase 4 |
| `/profile/complete` | Phases 1, 2 |
