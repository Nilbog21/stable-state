# Pre-Release Test Checklist

Manual smoke test of all barn workflows against the dev environment. Run the phases **in order** — later phases depend on data created in earlier ones. Every UI route in `ARCHITECTURE.md` is covered at least once (see [Route coverage](#route-coverage) at the bottom).

Paths below are relative — prepend your app origin (local `npm run dev` or Vercel preview URL).

> **Convention:** each checkbox verifies one independent assertion — split multi-clause verifications so a partial failure can be marked cleanly. Setup/data-creation steps that assert nothing are fine to leave bundled. See #934 for the backlog of any remaining bundled checkboxes not yet split.

## Prerequisites

- [ ] `.env.local` at repo root with `DEV_EMAIL`, `DEV_NAME` (must be "First Last" — a single word breaks the name prompt in Phase 1), `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (optionally `DEV_BARN` — only `seed-account.sh` in Phase 1 defaults it to `dev-barn`; `change-user.sh` in Phases 5–7 doesn't use `DEV_BARN` at all — it prompts with a numbered list of barns to pick from)
- [ ] App running (dev server or Vercel preview) and reachable in a browser
- [ ] Email provider enabled in the Supabase dashboard (required by `seed-test-barn.sh` in Phase 7)

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
- [ ] Reset and reseed the dev database:

  ```bash
  bash scripts/reset-db.sh
  ```

  This chains `seed-account.sh`, which prompts for **First name**, **Last name**, and **Barn slug** — each pre-filled from `.env.local` (`DEV_NAME`, `DEV_BARN`), so press **Enter** through all three to accept the defaults. Then, at `reset-db.sh`'s own `Press Enter when logged in, or Escape to skip role selection:` prompt, press **Escape** — you stay manager for now.
- [ ] The script prints `Invite path: /barn/dev-barn/login?token=<uuid>` — open that path on your app origin
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

> The UI creates managed **rider** stubs only. Trainer stubs cannot be created from the UI — the trainer phase (Phase 5) uses the seeded trainers via `change-user.sh` instead.

- [ ] Create managed riders **Gale Test**, **Harper Test**, and **Indigo Test** — each row is a normal card link to its member detail page, alongside an inline amber **Unlinked** badge next to the name (no Copy Invite/Revoke buttons on this list)
- [ ] Open Gale Test's member detail page as manager — a **Manage member** section appears right after the name with an amber notice and **Copy Invite**/**Revoke** buttons
- [ ] While Gale Test is still unclaimed, upload a document on their detail page — confirms manager can upload/delete documents for a managed/unclaimed rider
- [ ] Click **Copy Invite** on Gale Test's detail page → button briefly reads **Copied!** → the copied URL matches `/barn/dev-barn/login?token=<uuid>` (a well-formed UUID token)
- [ ] *(Optional — requires a second Google account signed into a separate browser session; not exercisable on Vercel preview, which supports only one signed-in Google session per environment. This is the only checklist step that exercises the pre-claim-document-readability regression below — if you don't have a second Google account handy, prefer running this step locally with two browser profiles over skipping it outright.)* Open the copied URL as the secondary account → redirected to `/profile/complete` → fill contact fields and save → lands in Dev Barn as rider Gale Test; as Gale Test, open your own member detail page and confirm the document uploaded before claiming still opens via its signed-URL link (regression check: a claimed member's pre-claim documents must remain readable, not just the manager's); back as manager, confirm Gale Test's row no longer shows the Unlinked badge on the list, and their detail page no longer shows the Manage member section
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

- [ ] Compare a lesson's stored `lesson_at` in the DB (Supabase Studio or `supabase db` query) against the wall-clock time you entered when creating it in Phase 3 — confirms UTC storage round-trips correctly for your local timezone, not just that the created time displays back the same way it was entered
- [ ] On the Lessons list and a lesson's detail page, confirm the displayed time matches the wall-clock time you entered (not shifted by your UTC offset) — if your system/browser clock is set to a non-UTC timezone, this also proves the display isn't silently forcing UTC

Dashboard (`/barn/dev-barn`):

- [ ] Dashboard shows a single-day calendar defaulting to today, with Prev/Next links and today's date in the heading
- [ ] Today's seeded lessons and any planned expense scheduled for today (future date+time, no amount yet) appear together, sorted by time
- [ ] Clicking Next twice navigates to the day the seeded Riverside Vet Clinic expense (2 days out) is scheduled for, and it appears there, interleaved by time with that day's lessons
- [ ] A "Today" link appears only while viewing a day other than today, and returns to today's calendar when clicked
- [ ] A date-only planned expense (no time set) does **not** appear on the calendar for its date
- [ ] Expense entries show date/time, recipient, expense type, and horse(s) or "Entire Barn", and link to the expense detail page
- [ ] A "Reminders" section header appears above the document-reminders/unpaid-income cards, and is hidden entirely when none of them have anything to show
- [ ] No document-reminder cards appear under Reminders when no documents are past their reminder date; after setting a past reminder date on a document (see Horses/Members below), a single-line "{owner} — {record type} — {date}" card appears under Reminders (no separate "Document Reminders" heading) and links to that horse's or member's detail page
- [ ] If any lessons/charges are unpaid, "N unpaid lessons" and/or "N unpaid leases/boarding" cards appear under Reminders, each linking to `/barn/dev-barn/finances/outstanding`; each is hidden individually when its own count is zero

Lessons (`/barn/dev-barn/lessons`):

- [ ] Recent lessons (last 7 days) shown immediately; older lessons appear only after the older-lessons toggle
- [ ] Each lesson renders as a full-width, uniformly-sized card link (whole row is tappable to the detail page) — no **Cancel** button on the list
- [ ] Filter pills show `My Lessons | All | By Instructor | By Rider | By Horse | By Tier`, wrapping onto multiple lines at ~390px width instead of requiring horizontal scroll; **All** is active by default and shows every barn lesson; picking **My Lessons** filters to only lessons you instruct
- [ ] Picking **All** shows every barn lesson regardless of instructor
- [ ] Picking **By Instructor → Alex** shows only Alex's lessons and the URL carries `?filter=trainer&id=<uuid>`
- [ ] **By Rider → Dana** filters correctly
- [ ] **By Horse → Apple** filters correctly
- [ ] **By Tier → Custom** (or another tier name found among the barn's lessons) filters correctly
- [ ] Picking **By Tier → Custom** carries the URL `?filter=tier&id=<tier name>`
- [ ] Times display in 12-hour AM/PM format everywhere (no military time)
- [ ] Willow's upcoming lesson shows a **Needs Attention** badge on the Lessons list and on the Dashboard's Day view (navigate to the lesson's date if it isn't today, Willow is seeded inactive); it does not appear on Willow's past lessons or on any cancelled lesson
- [ ] Open Willow's flagged lesson's detail page — a **Needs Attention** banner at the top reads "Willow is inactive"; open the same lesson's edit page — the same banner appears there too; the banner does not block editing or saving
- [ ] On Willow's flagged lesson's edit page, without changing any field, click a nav link (or hit browser back) — a confirm dialog warns about the unresolved horse issue, defaulting to Stay; swap Willow out for an active horse and save, then reopen the edit page and confirm navigating away no longer prompts
- [ ] Open a lesson's detail page (`/barn/dev-barn/lessons/[id]`) — horse notes and rider notes render read-only; Edit link visible; open a lesson with no notes recorded at all and confirm every note label (Horse Notes, Rider Notes, Private, Your Notes, Cancellation Notes) is hidden entirely rather than showing an empty label or a "—" placeholder
- [ ] Edit a lesson (`/barn/dev-barn/lessons/[id]/edit`) — change the fee, save, verify the change on the detail page
- [ ] Edit the group lesson created in Phase 3 → switch type to normal → a downgrade warning asks you to pick one rider/horse to keep (cancel without saving)
- [ ] Delete one seeded lesson — it disappears from the list
- [ ] Open a lesson's detail page → a single **Cancel** button appears in the header next to **Edit**/**Delete**, shown to the manager regardless of who instructs the lesson
- [ ] Click **Cancel** on a **normal** lesson → the confirmation page shows a **Cancelled by Rider** / **Cancelled by Instructor** toggle, defaulting to **Cancelled by Instructor** when you instruct the lesson, else **Cancelled by Rider**; confirm with **Cancelled by Rider** on a lesson >24h out → fee is unaffected on far-out lessons but zeroed on a lesson booked <24h away → lesson shows a **Cancelled** badge and your notes under **Cancellation Notes**
- [ ] Repeat with **Cancelled by Instructor** → fee is zeroed regardless of timing
- [ ] On a **normal** lesson booked <24h away, select **Cancelled by Rider** → an amber "The rider will be due a late cancellation fee." label appears
- [ ] On that same lesson, switch to **Cancelled by Instructor** → the label disappears
- [ ] On a **normal** lesson booked >24h out, select **Cancelled by Rider** → the label does not appear
- [ ] Click **Cancel** on a **group** lesson → the same toggle appears; choosing **Cancelled by Instructor** shows the count and names of enrolled riders who'll be affected and, on confirm, cancels the whole lesson (all riders, fee waived)
- [ ] On that same group lesson's Cancel page, choose **Cancelled by Rider** instead → a rider picker reveals listing the still-active enrolled riders; select one and confirm → only that rider's row shows a **Cancelled** badge, the rest of the lesson (and other riders) is unaffected, and the standard 24-hour fee policy applies to that rider
- [ ] On a **group** lesson booked <24h away, select **Cancelled by Rider** → an amber "Warning: No late cancellation fees are currently leveraged for group lessons." label appears
- [ ] On that same lesson, switch to **Cancelled by Instructor** → the label disappears
- [ ] On a **group** lesson booked >24h out, select **Cancelled by Rider** → the label does not appear
- [ ] On a **normal** lesson, cancel it (there's only one rider) → the lesson itself shows a **Cancelled** badge on the list and detail page
- [ ] (#1015) That same cancelled lesson no longer appears on the Dashboard's Day view for its date, even navigating directly to that day
- [ ] On a **group** lesson, cancel riders one at a time via the picker → after the last active rider is cancelled, the lesson shows a **Cancelled** badge on the list and detail page; cancel the last-but-one and the second-to-last riders and confirm the badge does *not* appear until the final rider is cancelled
- [ ] On an already-cancelled lesson, open **Edit Lesson** (manager and, separately, the instructing trainer) → the Notes section shows a **Cancellation Notes** textarea (confirm it does *not* appear when editing a non-cancelled lesson) → edit it and Save → the detail page shows the updated text read-only under **Cancellation Notes** for every role, including the instructing trainer and a rider; clear the field and Save again → the **Cancellation Notes** row disappears entirely from the detail page
- [ ] As manager, open an **unpaid** lesson's detail page and click **Delete** → confirm the browser prompt → lesson disappears entirely from the Lessons list and Finances (no **Cancelled** badge, no notification to instructor/riders); repeat on an already-cancelled lesson to confirm Delete is reachable regardless of state; as trainer, confirm no **Delete** button is shown on any lesson
- [ ] On a **paid** (or $0-fee) lesson's detail page, click **Delete** → lands on `/barn/dev-barn/lessons/[id]/delete` (not a browser prompt) showing the collected amount and an unchecked-by-default checkbox; confirm without checking it → lesson is gone but its income still shows up in Finances for that month; repeat on another paid lesson, this time checking the box → lesson's income is also gone from Finances

Expenses (`/barn/dev-barn/expenses`):

- [ ] Nav shows **Expenses** between Lessons and Horses
- [ ] Seeded expenses render as full-card links (date/time, recipient, expense type, horse(s)/Entire Barn, amount all visible on the card), split into recent and older (**Show older expenses** toggle), including at least one future-dated planned expense with no amount
- [ ] Tapping anywhere on an expense card opens its edit page — there is no separate row-level Delete link on the list
- [ ] Add a new expense (`/barn/dev-barn/expenses/new`): enter a recipient seen before (e.g. "Dr. Hoof Farrier") and tab out — Expense Type auto-fills and flashes; leave amount blank to save a planned expense, then re-open the form later and fill it in
- [ ] Check **Entire Barn** on the new-expense form — horse checkboxes disable; save and verify the card shows "Entire Barn" instead of specific horses
- [ ] On the new-expense form, set the date to yesterday — the Time field disappears; change it back to today or a future date — the Time field reappears
- [ ] Edit a seeded expense (`/barn/dev-barn/expenses/[id]`) — form opens pre-filled including the correct Entire Barn / specific-horse checkbox state; change the recipient and amount, save, verify the card updates
- [ ] On the new- and edit-expense forms, set a **Payment Type**, save, and confirm it persists on reload
- [ ] From the edit page, click **Delete** on a seeded expense with **no amount set** — confirmation page shows a bare "Confirm Delete" with no checkbox; confirm → expense disappears from the list
- [ ] Delete a seeded expense **with an amount** — confirmation page shows an unchecked-by-default "Also delete the collected record from Finances" checkbox
- [ ] Confirm that delete without checking the box — expense is gone from the list but its record still shows up in Finances for that month
- [ ] Delete another seeded expense with an amount, this time checking the box — its record is also gone from Finances

Horses (`/barn/dev-barn/horses` and `/barn/dev-barn/horses/[id]`):

- [ ] Available section sorted by total exertion ascending (±3 days); Apple/Butter/Clover show an exhaustion bar in different color bands; tap a bar to expand the ±3-day lesson breakdown, tap again (or elsewhere) to dismiss — tapping the bar does not navigate to the horse detail page
- [ ] Open Clover's detail page (no photo seeded) → placeholder icon and **Set Photo** button show
- [ ] Tap **Set Photo** → navigates to the same upload screen used for horse documents, with Document Type locked to "Photo" (no dropdown) and no Notes/Expiration reminder date fields
- [ ] Tap **Choose File** and select a non-square JPG or PNG → upload starts immediately with no separate Upload button click, and you land back on the horse detail page with the photo displayed, scaled to a fixed height with its aspect ratio preserved (not cropped to a square)
- [ ] With a photo set, tap **Replace Photo**, choose a different image → upload starts immediately and the new photo displays
- [ ] Reload the page after replacing a photo → the old photo is gone (confirms it wasn't just a stale client-side preview)
- [ ] With a photo set, tap **Remove** → placeholder and **Set Photo** button return
- [ ] On the photo upload screen, attempt to select a PDF → rejected with an inline error, not a crash
- [ ] As manager, set a photo on a horse with no `owning_member_id` (all seeded horses, until #998 ships owner assignment) → succeeds; replace it again as manager → still succeeds (manager-set photos never lock out other managers)
- [ ] Open Apple's detail page → rename it via the manager form, uncheck Exhaustion Thresholds' "Use barn defaults", set Moderate/High → tap the single **Save** button → name and thresholds both update, a brief "✓ Saved" confirmation appears next to the Save button, values persist on reload, and the toggle is now unchecked
- [ ] The manager form's name field is now labeled **Barn Name**; fill in **Registered Name** (e.g. "Four-Leaf Clover") → Save → persists on reload
- [ ] Apple's card on the Horses list now shows "Apple (Four-Leaf Clover)"; open its detail page as a trainer or rider → a **Registered Name** row appears below Status
- [ ] Clear **Registered Name** back to blank and Save → the card's parenthetical and the non-manager detail row are both gone on reload
- [ ] Re-check "Use barn defaults" and Save → thresholds revert to barn defaults (`5`/`11`) on reload — **known limitation, accepted as-is**: the Moderate/High inputs don't visually refresh until reload
- [ ] With "Use barn defaults" unchecked, try Moderate ≥ High → rejected with a field error, no "✓ Saved" confirmation, and neither the name/status nor the thresholds change
- [ ] Fill in **Feed Notes** and **Medication Notes** → Save → both persist on reload
- [ ] Clear **Feed Notes** back to blank and Save → the field is empty on reload (confirms `NULL` clears it, not just an empty-string no-op)
- [ ] Documents section: tap **Add Document**, upload a PDF → redirects back to this horse's page
- [ ] Open the document via its link (signed URL)
- [ ] Delete it → row disappears
- [ ] On the Add Document page, attempt to upload a document over 4.5MB — rejected with an inline error, not a crash
- [ ] On the Add Document page, the Upload button disables and an indeterminate progress bar shows while the upload is pending
- [ ] Upload another document with an **Expiration reminder date** set → the date persists in the Reminder Date column; edit it inline (tap the field, change the date, tap away) → it saves without a page reload
- [ ] Set that document's Reminder Date to a past date → a **Reminder Due** badge appears next to the date, and a card shows up under the Dashboard's Reminders section, linking back to this horse

Members (`/barn/dev-barn/members` and `/barn/dev-barn/members/[membership_id]`):

- [ ] "You" card plus Managers (Morgan, own entry excluded), Trainers, and Riders sections all render
- [ ] Open a trainer's member detail page → **Contact Info** section shows Phone, Emergency Contact Name, Emergency Contact Phone (or "—" for any that are blank)
- [ ] Open managed/unclaimed rider Harper Test's member detail page → name and **Contact Info** render even though the account has no linked `user_id`; Documents section renders normally (not blocked) with an **Add Document** button
- [ ] On Harper Test's member detail page, **Contact Info** is an editable form (manager viewing an unclaimed/managed member) → set Phone, Emergency Contact Name, Emergency Contact Phone and tap **Save** → values persist on reload
- [ ] On Harper Test's member detail page, tap **Set Photo**, choose a JPG or PNG → upload starts immediately and you land back on the member page with the photo displayed
- [ ] With Harper Test's photo set, tap **Replace Photo** and choose a different image → new photo displays
- [ ] With Harper Test's photo set, tap **Remove** → placeholder and **Set Photo** button return
- [ ] Open a claimed trainer's member detail page → no **Set Photo**/**Replace Photo**/**Remove** control is shown (manager can't edit a claimed member's photo)
- [ ] Open your own manager member detail page → tap **Set Photo** and upload one → photo displays and persists on reload
- [ ] Tap **Add Document** on Harper Test's page, upload a document → redirects back to the member page and the document lists with a working signed-URL link
- [ ] Delete it → row disappears
- [ ] Open a trainer's member detail page → **Add Document** button is present and links to the shared `/barn/dev-barn/documents/new?entity=trainer&id=<id>` page
- [ ] Open rider Gale Test's member detail page — **Add Document** button present, links to `/barn/dev-barn/documents/new?entity=rider&id=<id>`
- [ ] As manager, rider Emery's member detail page shows an **Active Agreements** header with one card each for her seeded lease and boarding agreements (kind, horse, fee), each linking to its agreement detail page; a rider with no active agreements shows **No active agreements** with no add-boarding link; a managed (unclaimed) rider's detail page shows the same section
- [ ] Open a trainer's member detail page → **Instructor Access** section shows **Revoke Instructor Access** (trainers default to `can_instruct=true`) → tap it → a browser confirm prompt appears naming the trainer and warning they'll no longer be assignable to future lessons; **Cancel** it → access is unchanged; tap **Revoke Instructor Access** again and confirm → button now reads **Grant Instructor Access** and the trainer no longer appears in the instructor select on the new-lesson form; tap **Grant Instructor Access** to restore it (no confirm prompt on grant) → trainer reappears in the instructor select
- [ ] Open your own manager member detail page → **Instructor Access** section shows **Grant Instructor Access** → tap it (no confirm prompt) → you now appear in the instructor select on the new-lesson form; tap **Revoke Instructor Access** to undo (confirm prompt appears)
- [ ] Open rider Gale Test's member detail page — no **Instructor Access** section is shown
- [ ] Open Indigo Test's member detail page → a **Remove** button appears top-right of the header, next to the member's name → tap it and confirm the browser prompt → redirected to the Members list and Indigo Test no longer appears there
- [ ] Open your own manager member detail page → no **Remove** button is shown
- [ ] Open second manager Morgan Manager's member detail page → no **Remove** button is shown either (managers can't remove other managers)

Finances (`/barn/dev-barn/finances`):

- [ ] **Outstanding Income** section (renamed from "Outstanding") lists past unpaid lessons; set a payment type on one row via the inline dropdown → it leaves the list
- [ ] A lesson row's date in **Outstanding Income** and in the By Horse/By Rider/By Instructor drill-downs matches the wall-clock time you entered for that lesson, not shifted by your UTC offset — a lease/boarding charge row's date, in contrast, is unaffected by timezone (it's a plain calendar date, not a time-of-day instant)
- [ ] Late-cancel a normal lesson that was already marked paid (**Cancelled by Rider**, within 24 hours of `lesson_at`) → a **Cancellation Fee** row for it appears in **Outstanding Income** with a **Type** of "Cancellation Fee"; mark it paid via the inline dropdown → it leaves the list
- [ ] The **Outstanding Expenses** section (renamed from "Needs an amount", below Outstanding Income) shows a bold total above the list, summing only the expenses in it that have a known amount
- [ ] **Outstanding Expenses** lists the seeded past-due planned expense as a single line (date — recipient — expense type) — confirm it does **not** appear inside the Outstanding Income table itself
- [ ] Tap the ⓘ info icon on **Outstanding Expenses** → shows explanatory text that an entry is listed for a missing amount, a missing payment type, or both
- [ ] Tap the past-due expense's line in **Outstanding Expenses** → lands on its edit page
- [ ] Enter an amount on it (leave Payment Type unset) and save → back on Finances, it still appears under **Outstanding Expenses**, now contributing its amount to the bold total instead of $0
- [ ] That same expense contributes its amount to every tab's footer Total for Expenses that month
- [ ] That same expense also contributes to the By Horse tab's own Expenses column for its horse
- [ ] Now set a Payment Type on that same expense and save → it disappears from **Outstanding Expenses** entirely
- [ ] "View all outstanding" → `/barn/dev-barn/finances/outstanding` lists all barn outstanding lessons, leases/boarding charges, and cancellation fees, each lesson/cancellation-fee row linking to its lesson — confirm outstanding expenses do **not** appear on this page (no Outstanding Expenses equivalent there)
- [ ] Month navigation `←`/`→` works and updates `?month=YYYY-MM`; navigate to the previous month and see the past lesson from Phase 3 (and seeded past-month data) reflected
- [ ] Below the Outstanding sections, only a single **Pending income** line appears for the current month, with no month/year suffix (the month picker above already shows it)
- [ ] No Gross Income / Total Expenses / Net Income summary boxes appear above the Pending income line (#971 removed them, since their numbers didn't reconcile with any one breakdown table below)
- [ ] Every tab shows uniform **Gross | Expenses | Net** columns (`—` for a column a tab has no concept of)
- [ ] Every tab ends in a footer with **Subtotal / Unattributed / Outside this view / Total** rows, in that order
- [ ] **By Horse** is the default tab on page load (no `?tab=` needed)
- [ ] **By Horse** tab shows **Horse | Gross | Expenses | Net** columns
- [ ] By Horse's horse name is an underlined link (not just underlined on hover)
- [ ] Add an expense for a horse with a lesson this month → its Expenses/Net update
- [ ] A horse with `$0` expenses shows **—** (not `$0.00` or blank)
- [ ] A horse with expenses but no lessons this month still appears, with `$0.00` Gross and a negative Net
- [ ] Click a horse → drill-down `/barn/dev-barn/finances/horses/[id]` shows one combined table of lessons, leases/boarding charges, and expenses
- [ ] The horse drill-down's combined table is ordered by date ascending
- [ ] The horse drill-down's combined table has a **Type** column
- [ ] The horse drill-down's expense Amount/Split renders in parentheses (e.g. `($25.00)`)
- [ ] The drill-down's bottom **Net** figure matches this horse's Net on the By Horse tab; month param preserved
- [ ] On page load, By Horse rows are sorted by **Horse** name ascending (A→Z), with a ▲ next to the Horse header
- [ ] Tap the **Gross** header on By Horse → rows re-sort by that column ascending
- [ ] After tapping **Gross**, a ▲ appears on the Gross header (and disappears from Horse)
- [ ] Tapping a sort header does not change the URL (no `?sort=` param, no page reload)
- [ ] Tap the **Gross** header again → order reverses and the indicator flips to ▼
- [ ] Tap the ⓘ next to a **Gross**/**Expenses**/**Net** header on any tab → shows explanatory text
- [ ] Tapping that ⓘ does **not** trigger a sort (the icon sits beside, not inside, the sort button)
- [ ] **By Tier** tab (no longer default, still reachable via the pill) lists your new tiers and seeded tiers
- [ ] By Tier's column order is **Tier | Gross | Expenses | Net** — no Price column, no Lessons count column
- [ ] By Tier's Expenses column (renamed from "Instructor Cut") sums that tier's lessons' own snapshotted cuts, or shows `—` when zero
- [ ] For a tier's row, Gross equals Net plus Expenses
- [ ] A tier with no paid lessons this month still appears (alongside at least one tier that did collect something), with `$0.00` Gross/Net (not omitted from the list)
- [ ] Edit a tier's instructor cut, book a new lesson under it, and confirm the tier's Expenses column reflects a mix of the old and new per-lesson rates rather than the new rate × total count
- [ ] **By Tier empty-state check** (#971): navigate to a month where **no** tier collected any lesson income and no lease/boarding charge was collected either → **By Tier** shows its `EmptyState` instead of a table full of `$0.00` rows (the #771 per-active-tier backfill alone must not keep the table visible)
- [ ] **By Tier charge-only check**: navigate to a month with **no** lesson income but **one** collected lease/boarding charge → **By Tier** shows its table (not `EmptyState`), with the charge amount reflected in the footer's **Outside this view** row for Gross
- [ ] On page load, By Tier rows are sorted by **Tier** name ascending, with a ▲ next to the Tier header
- [ ] Tap the **Net** header on By Tier → rows re-sort by that column ascending
- [ ] After tapping **Net** on By Tier, a ▲ appears on the Net header (and disappears from Tier)
- [ ] Tap the **Net** header on By Tier again → order reverses and the indicator flips to ▼
- [ ] **By Rider** tab shows **Rider | Gross | Expenses | Net** columns
- [ ] By Rider's Expenses column is always `—` and its header isn't clickable/sortable (no rider-level expense concept)
- [ ] By Rider's Net always equals Gross
- [ ] By Rider's rider name is an underlined link to drill-down `/barn/dev-barn/finances/riders/[id]`
- [ ] The rider drill-down shows one combined table (lessons + leases/boarding charges) ordered by date ascending with a **Type** column, matching the By Horse drill-down's layout
- [ ] The rider drill-down's bottom **Total** matches the By Rider summary; month param preserved
- [ ] On page load, By Rider rows are sorted by **Rider** name ascending, with a ▲ next to the Rider header
- [ ] Tap the **Gross** header on By Rider → rows re-sort ascending
- [ ] Tap the **Net** header on By Rider instead → identical resulting order to sorting by Gross (both share a sort key, since the two columns are always equal for this tab)
- [ ] **By Instructor** tab shows **Trainer | Gross | Expenses | Net** columns
- [ ] By Instructor's Gross is the trainer's pre-cut lesson fees
- [ ] By Instructor's Expenses column (renamed from "Instructor Cut") is the deducted amount, parenthesized
- [ ] By Instructor's Net is the take-home figure
- [ ] By Instructor's trainer name is an underlined link to drill-down `/barn/dev-barn/finances/trainers/[id]`
- [ ] The trainer drill-down shows one table of that trainer's paid lessons (date linking to the lesson, Type always "Lesson", fee net of the cut)
- [ ] The trainer drill-down's bottom **Total** matches the By Instructor summary's Net figure; month param preserved
- [ ] On page load, By Instructor rows are sorted by **Trainer** name ascending, with a ▲ next to the Trainer header
- [ ] Tap the **Net** header on By Instructor → rows re-sort by that column ascending
- [ ] After tapping **Net** on By Instructor, a ▲ appears on the Net header (and disappears from Trainer)
- [ ] Tap the **Net** header on By Instructor again → order reverses and the indicator flips to ▼
- [ ] Mark a $0 (comped) lesson paid → its net contribution is negative (cut with no fee to offset it) and renders in parentheses, e.g. `($25.00)`, not with a leading minus sign; it's still included in every tab's Gross/Net totals (not dropped or clamped to zero)
- [ ] Mark the lease's first charge as paid (`/barn/dev-barn/agreements/[id]` → set Payment Type) → back on Finances, **By Tier**'s footer **Outside this view** row for Gross increases by the charge amount (a charge has no tier)
- [ ] Same charge: **By Instructor**'s footer **Outside this view** row for Gross also increases by the charge amount (a charge has no instructor)
- [ ] Same charge: **By Horse** (Apple)'s Gross total includes the full charge amount directly (a charge is horse-tied)
- [ ] Drilling into Apple's row shows the charge as a row in the combined table with a working link back to the agreement
- [ ] Same charge: **By Rider** (Dana)'s Gross total includes the full charge amount directly (a charge is rider-tied)
- [ ] On that trainer's member detail page, tap **Remove** and confirm the browser prompt after they've instructed a paid lesson → you're redirected to the Members list and the removed trainer no longer appears there; back on Finances, the lesson's fee is still counted, now folded into **By Instructor**'s footer **Unattributed** row (tap its ⓘ to confirm the explanation covers a removed instructor) instead of a "No instructor" body row
- [ ] **By Paid To** tab shows **Recipient | Gross | Expenses | Net** columns
- [ ] By Paid To's Gross and Net are always `—` (a recipient has no revenue concept)
- [ ] By Paid To's Expenses column (renamed from "Expense Amount") is the recipient's total
- [ ] By Paid To's recipient name is an underlined link (not just underlined on hover)
- [ ] On page load, By Paid To rows are sorted by **Recipient** name ascending, with a ▲ next to the Recipient header
- [ ] Tap the **Expenses** header on By Paid To → rows re-sort by that column ascending, with the ▲ moving off Recipient; tap again → order reverses and the indicator flips to ▼
- [ ] Add a second expense for the same recipient this month → its **By Paid To** total updates to the combined amount
- [ ] Click a recipient → drill-down `/barn/dev-barn/finances/expenses/[recipient]` lists that recipient's expenses for the month with Date, Type, Amount columns
- [ ] The recipient drill-down's Date column links to the expense's edit page
- [ ] The recipient drill-down's bottom **Total** matches the By Paid To summary
- [ ] A recipient name containing `&` or spaces (e.g. seed a "Dr. Smith & Sons" expense) round-trips correctly through the drill-down link — no broken/garbled URL
- [ ] **Reconciliation check** (#971): open all five tabs for the same month and confirm each one's footer **Total** row shows the identical Gross figure, identical Expenses figure, and identical Net figure across every tab
- [ ] **Unattributed-expense check** (#971): delete a paid expense from `/barn/dev-barn/expenses/[id]/delete` **without** checking "Also delete the collected record from Finances" (its `transactions` row survives with no `horse_expenses` row behind it) → back on Finances, that amount now appears under **Unattributed** in the By Horse and By Paid To footers instead of silently disappearing; tap the ⓘ to confirm the explanation

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

- [ ] On `/profile?barn=dev-barn`, a **Calendar Feed** section appears; tap **Get my calendar link** — a link is revealed containing `/calendar.ics?token=...`
- [ ] Open that link directly (or `curl` it) — returns `Content-Type: text/calendar` and includes VEVENT entries for lessons across the whole barn (manager sees everything), not just your own
- [ ] Tap **Regenerate** — the displayed link changes to a new token, and the old link now 404s

## Phase 5 — Trainer

Switch role (interactive):

```bash
bash scripts/change-user.sh
```

> First prompt is a numbered list of barns — pick **Dev Barn**. Then pick **Alex** from the profile list — this list is scoped to Dev Barn's active members only, so no other barn's profiles appear.
>
> `change-user.sh` copies the selected user's role onto your `DEV_EMAIL` membership and reassigns their lessons to you — you stay logged in as yourself. Refresh the page after it runs.

- [ ] Nav shows only: barn name, Lessons, Horses, Members, Guide — **no Finances, no Manage Barn, no Leases, no Boarding, no Expenses**
- [ ] `/barn/dev-barn/expenses` is blocked — visiting it directly shows **404**, not a login redirect
- [ ] Lessons list defaults to **My Lessons** (only Alex's, now reassigned to you); switch to **All** to see every barn lesson including Blake's — filter pills show the same `My Lessons | All | By Instructor | By Rider | By Horse | By Tier` bar as the manager view
- [ ] Create 2 lessons via `/barn/dev-barn/lessons/new` — the instructor field is locked to you; pick a date and confirm the exhaustion bars render below each horse, same as the manager view
- [ ] Create one more lesson dated within 30 minutes of one of Blake's lessons (check Blake's lesson times via the **All** filter above) — submission succeeds with no error

> This notification's recipient (Blake) isn't the persona you're currently acting as, so it can't be observed by switching personas with `change-user.sh` — the swap reassigns `barn_memberships.user_id` away from whichever persona you leave, permanently disconnecting it from the id the notification was written against. Verify the row directly instead (Supabase Studio or a `supabase db` query).

- [ ] A `notifications` row exists for Blake's `user_id` with `type = 'instructor_lesson_nearby'` and `link = '/barn/dev-barn/lessons'`
- [ ] That row's `title` reads **"1 new lesson scheduled nearby"** (or an incremented count, e.g. "2 new lessons scheduled nearby", if a prior nearby lesson already landed this same row this pass)
- [ ] Edit one of your own lessons — the instructor field is **hidden entirely** (no label, no read-only text — just locked server-side)
- [ ] Open one of Blake's lessons from the Lessons list — no Edit link is shown, and navigating to its `/edit` URL directly does not let you save changes
- [ ] On one of your own lessons, click **Cancel** in the header and cancel a rider's spot (or the whole lesson) — works the same as manager; open Blake's lesson — no header **Cancel** button is shown
- [ ] The recurring lesson created in Phase 3 still shows its **Recurring** badge on the Lessons list row and detail page, now that it's reassigned to you
- [ ] Open the recurring lesson's edit page (now reassigned to you) — "This is part of a recurring series" indicator and **Stop Recurring Lessons** button appear at the top of the page, above the lesson form; stopping works the same as manager
- [ ] Horse detail page: documents are listed with working links, upload works (including setting a Reminder Date), but there is **no Actions column at all** (not just a hidden delete button), **no Exhaustion Thresholds section**, and the Reminder Date column is **read-only**
- [ ] Horse detail page shows the Feed Notes/Medication Notes entered as manager, read-only (no textareas, no Save button); clear one as manager and confirm its row disappears here on reload instead of showing blank
- [ ] Butter's horse detail page: her seeded photo displays, but there is **no Set Photo / Replace Photo / Remove control** (unless this trainer is Butter's `owning_member_id` — not yet assignable via UI until #998 lands, so not manually verifiable here)
- [ ] Members page shows all four sections (You/Managers/Trainers/Riders), same structure as the manager view — no Add Trainer/Add Rider forms; open your own member detail page and upload a document, optionally setting a Reminder Date; the Reminder Date column on your own documents is **read-only** (only a manager can edit it)
- [ ] In the Riders section, the managed/unclaimed rows (Gale/Harper Test, whichever are still unclaimed — Indigo Test was removed earlier in the Members phase) render as normal card links — name only, **no Unlinked badge** (the list never shows Copy Invite/Revoke controls for any role — those now live only on the detail page's manager-only Manage member section, which a trainer viewing that page won't see either)
- [ ] Open Harper Test's member detail page as trainer — Contact Info is read-only (blank fields show "—"), with no Save button
- [ ] Open another trainer's or a manager's member detail page from the roster — page loads (no 404), shows their name and **Contact Info** section (#863 — a trainer can view any member's Contact Info), but **no Documents section**; open Blake's (a rider's) detail page — same: Contact Info shown, Documents hidden (#779 narrowed rider-document access to manager/self only)
- [ ] `/barn/dev-barn/finances` is blocked — shows **404**, not a login redirect; `/barn/dev-barn/finances/outstanding` works and shows **only your own** outstanding lessons, plus any uncollected cancellation fees for lessons you instruct
- [ ] (#1015) Dashboard's Day view, on a day with other instructors' lessons scheduled too, shows only the lessons you instruct — not the whole barn's schedule
- [ ] Dashboard: if any of your instructed lessons are unpaid, a "Reminders" section with an "N unpaid lessons" card appears, linking to `/barn/dev-barn/finances/outstanding` — this is your only nav path to that page (no Finances link in the nav)
- [ ] Avatar menu → **Profile** (`/profile?barn=dev-barn`): barn nav bar renders with the **full 4-link trainer nav** (Lessons, Horses, Members, Guide) — same set as the regular barn pages
- [ ] (#1018) On the same Profile page, get/open your Calendar Feed link — it includes only lessons where you're the instructor (your reassigned Alex lessons), not Blake's

## Phase 6 — Rider

Switch role (pick **Dev Barn**, then **Dana**, from the same barn/member lists as Phase 5):

```bash
bash scripts/change-user.sh
```

- [ ] Nav shows only: barn name, Lessons, Horses, Members, Guide — **no Leases, no Boarding, no Expenses**
- [ ] `/barn/dev-barn/expenses` is blocked — visiting it directly shows **404**, not a login redirect
- [ ] Horses page shows Available/Unavailable cards with name (and unavailability reason) only — **no exhaustion bar**, no Inactive section
- [ ] Tap an Available or Unavailable card → navigates to that horse's detail page (#1002 — cards became linkable so a rider can view the horse's photo)
- [ ] On Butter's detail page, her seeded photo displays, but there is **no Set Photo / Replace Photo / Remove control** (same #998-blocked caveat as the trainer phase above — owner-write can't be manually verified until ownership is UI-assignable)
- [ ] Dashboard's Day view shows only lessons Dana is enrolled in for the viewed day, and no expenses (manager-only) or events outside her role's `visible_to_roles`
- [ ] Lessons list shows only Dana's enrolled lessons, with filter pills `All | By Instructor | By Horse | By Tier` — no **My Lessons** or **By Rider** pill; Dana's own name does not appear on her own lesson cards
- [ ] Open an enrolled lesson's detail page — own rider notes visible read-only; **no private notes** shown
- [ ] Same lesson detail page — no exertion rating shown next to any horse name
- [ ] Open an enrolled **group** lesson's detail page — every co-rider's real name is shown, not a blank or raw ID
- [ ] Copy a lesson ID Dana is **not** enrolled in and visit `/barn/dev-barn/lessons/[id]` directly — page shows **404**, not the lesson details
- [ ] Cancel your own spot in an enrolled lesson via the **Cancel** button in the lesson detail page header (no Cancel button on the Lessons list or Dashboard) → your row shows a **Cancelled** badge on the list, Dashboard, and detail page; the rest of the lesson (and other riders in a group lesson) is unaffected; the instructor receives a "Lesson participation cancelled" notification
- [ ] `/barn/dev-barn/finances` is blocked — shows **404**, not a login redirect
- [ ] `/barn/dev-barn/finances/outstanding` shows only Dana's outstanding lessons, plus her own outstanding lease/boarding charges (if any are past due) and her own uncollected late-cancellation fees, with a Type column — no such column entries for other riders' agreements
- [ ] Dashboard: if Dana has unpaid lessons and/or unpaid leases/boarding, a "Reminders" section with "N unpaid lessons"/"N unpaid leases/boarding" cards appears, each linking to `/barn/dev-barn/finances/outstanding` — this is Dana's only nav path to that page (no Finances link in the nav)
- [ ] (#938) With an outstanding late-cancellation fee but zero unpaid lesson fees, the Dashboard's "N unpaid lessons" card still appears (its count includes the cancellation fee) instead of being hidden
- [ ] `/barn/dev-barn/members` shows all four sections (You/Managers/Trainers/Riders) — no Add Trainer/Add Rider forms, and no Unlinked badge on any managed/unclaimed row (rider never sees it, unlike a manager)
- [ ] Open your own member detail page's Documents section — shows the empty state ("No documents yet"), with **no Add Document button** (#864 — rider self-service is read-only)
- [ ] Open another member's detail page from the roster (a trainer, a manager) — page loads (no 404), shows their name and **Contact Info** section, but no Documents section
- [ ] Open Emery's member detail page (her photo is seeded) → photo displays, but no **Set Photo**/**Replace Photo**/**Remove** control is shown

> Self photo upload/replace/remove is **not** verified here as Dana — `change-user.sh` reassigns `barn_memberships.user_id` to your real login but leaves `profiles.user_id` untouched, so the storage RLS self-write check (keyed on `profiles.user_id`) fails for any impersonated persona regardless of role. This code path is already exercised for real in Phase 2-4's own-photo check (as yourself, no impersonation), which is sufficient coverage — don't re-add a self-photo check to an impersonated phase.
- [ ] Switch to Emery (`change-user.sh` → Dev Barn → Emery) and open her own member detail page — the same Active Agreements cards from Phase 4 render as plain non-clickable cards (no hover state, no navigation on tap) — not links to the manager-only agreement detail page; switch back to Dana afterward
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

- [ ] Run `bash scripts/seed-account.sh`, accepting the default first/last name, and enter `test-barn-checklist` as the barn slug — creates a fresh managed-manager stub invite in that barn and prints `Invite path: /barn/test-barn-checklist/login?token=<uuid>`
- [ ] Open that invite path and click **Sign in with Google** as `DEV_EMAIL` (already signed in elsewhere in this browser, so the Google redirect returns immediately) → claim succeeds and you land in **test-barn-checklist** as manager — no `?error=invite_claim_failed` redirect
- [ ] Run `change-user.sh` → pick **Dev Barn** → pick your own name → restores your manager role in Dev Barn (undoing the Phase 5/6 role swaps)
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
