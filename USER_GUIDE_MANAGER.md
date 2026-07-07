# Stable State — Manager Guide

Stable State is a barn management app for scheduling lessons, tracking horses and riders, and managing finances. Sign in with Google, then select your barn. Leave "Keep me logged in" checked on the sign-in page to stay signed in for up to 30 days, even after closing your browser. The nav bar shows all sections available to you as a manager, with the section you're currently on highlighted. On a narrower screen, tap the ☰ button to open a side menu with the same links.

---

## Dashboard

Go to **Dashboard** to see your **Barn Schedule** — upcoming lessons (where you are the instructor) and upcoming scheduled expenses (planned expenses with a date and time but no amount entered yet, like a vet visit) for the next 7 days, interleaved together in order and split into "Today" and "This Week". Tap an expense entry to open its detail page. If any horse, member, or your own documents have an expiration reminder date that's arrived, a **Document Reminders** section lists them — tap an entry to open that horse's or member's detail page. The section is hidden when nothing is due.

## Horses

Use **Horses** in the nav to see horses grouped into three sections:

- **Available** — horses in active rotation, sorted by total exertion (7d) ascending so the most-rested horses appear first. Each card shows the name and an exhaustion bar reflecting exertion from lessons within 3 days of today; tap the bar to see the individual lessons behind it.
- **Unavailable** — horses temporarily out of rotation; each card shows the horse name, the reason entered when marking them unavailable, and the same exhaustion bar.
- **Inactive** — soft-deleted horses (visible to managers only); each card shows the horse name.

Empty sections are hidden. Tap any card to open the horse's detail page. To add a new horse, use the **Horse name** input and **Add** button in the page header (top right).

### Horse detail page (manager controls)

On the horse's detail page, managers see a unified form and a documents section:

- **Name** — pre-filled text input with the current name.
- **Status** — a three-state pill control: **Active**, **Unavailable**, **Inactive**. Tap a pill to select the new status. When **Unavailable** is selected, a **Reason** textarea appears to record why the horse is out of rotation. When **Inactive** is selected for a currently active horse, a warning appears noting the horse will be removed from the roster and lesson scheduling. Tap **Save** to apply all changes (name, status, and reason) in one step — no separate confirmation is required.
- **Documents** — displays uploaded files in a table with columns **Type**, **Notes**, **Link**, **Reminder Date**, and **Action**. Tap the filename in the **Link** column to open the document (link is valid for 5 minutes). The **Reminder Date** column is editable — tap into the field and change the date, then tap away to save; leave it blank if the document doesn't expire. A **Reminder Due** badge appears next to the date once it's arrived, and the document shows up in the Dashboard's Document Reminders section. Tap **Delete** in the **Action** column to remove a document. To upload a new file, tap **Choose File** in the Upload Document form, select a file (the filename appears next to the button once chosen), fill in any optional notes, optionally set an **Expiration reminder date**, then tap **Upload**. Accepted types: PDF, JPG, PNG, DOCX (max 5 MB). Document types: **Insurance Binder**, **Coggins**, **Shot Record**, **Contract**, **Other**.

## Leases & Boarding

Use **Leases** and **Boarding** in the nav to manage rider agreements for a horse. Each list shows rider, horse, fee, and status (**Active**/**Ended**), with an **Add Lease** / **Add Boarding** button in the page header and **View** / **Edit** buttons per row.

**Create an agreement** — Tap **Add Lease** or **Add Boarding**, select a rider and horse, set the fee (Boarding pre-fills the barn's default board fee, editable per agreement), and pick a start date (defaults to today). Leases can be billed **One time** or **Monthly**; Boarding agreements are always monthly.

**Edit an agreement** — Open **Edit** from the list to change the fee. Rider, horse, start date, and billing cadence cannot be changed after creation — to change any of those, end the agreement and create a new one.

**End an agreement** — Tap **End Agreement** on the edit page and confirm. This does not delete the record — past charges remain, and the agreement shows as **Ended** in the list.

**View charge history** — Tap **View** from the list to open the agreement detail page. It shows the rider, horse, fee, cadence, and status, followed by every billing charge generated for the agreement. Each charge row has its own **Payment Type** dropdown (mark it paid, or **Unpaid** to clear) and an editable **Fee** field — use the fee field to pro-rate a single occurrence without changing the agreement's ongoing fee.

## Members

Go to **Members** to browse the barn roster. You will see a **Managers** section (other managers in the barn), a **Trainers** section, and a **Riders** section, each listing active members with links to their detail pages. Your own card appears at the top under **You**.

**Adding a trainer without an account** — At the top of the Trainers section, enter a first and last name and tap **Add Trainer**. This creates a record immediately, with instructing permissions already enabled. They can be assigned as the instructor on lessons right away, even before they sign in and claim their invite — share the invite link with them when they're ready to get started.

**Adding a rider without an account** — At the top of the Riders section, enter a first and last name and tap **Add Rider**. This creates a record immediately so you can enter their lessons right away, even if they have not signed in yet.

Managed trainers and riders both show an **Unlinked** badge and two controls instead of a link:
- **Copy invite** — copies a personal invite link to the clipboard. Share this with them; when they tap the link and sign in with Google, their account is automatically linked to the existing record and lesson history.
- **Revoke** — invalidates the current invite link and generates a new one. Use this if a link is shared with the wrong person. The previous link stops working immediately.

Once someone claims their invite, the **Unlinked** badge disappears and their row becomes a normal link to their detail page.

Tap any member card to open their detail page. A **Contact Info** section shows their phone number and emergency contact (blank fields show as "—") — this works even for members who haven't claimed their invite yet. Documents are shown in a table with columns **Type**, **Notes**, **Link**, **Reminder Date**, and **Action**. Tap a filename in the **Link** column to open the document (link is valid for 5 minutes). The **Reminder Date** column is editable — tap into the field and change the date, then tap away to save; leave it blank if the document doesn't expire. A **Reminder Due** badge appears next to the date once it's arrived, and the document shows up on the Dashboard's Document Reminders section. Tap **Delete** to remove it. To add a new file, tap **Choose File**, select a file (the filename appears next to the button once chosen), add optional notes, optionally set an **Expiration reminder date**, and tap **Upload**. Accepted file types: PDF, JPG, PNG, DOCX (max 5 MB). Document types for managers and trainers: **Instructor Contract**, **Other**. Document types for riders: **Liability Waiver**, **Lease Agreement**, **Boarding Contract**, **Other**.

A rider's detail page also shows a **Boarding** status line: if they have an active boarding agreement, it shows the monthly fee linked to the agreement detail page; otherwise it shows an **Add boarding** link straight into the Boarding form. This works even for a rider who hasn't claimed their invite yet.

## Lessons

**View lessons** — Go to **Lessons** to see recent activity. Older lessons are hidden by default; tap **Show older lessons** to expand them. Lessons with a non-zero fee that have not been marked paid show an **Unpaid** badge next to the fee.

**Filter lessons** — A pill bar above the lesson list lets you narrow by dimension. Tap **By Trainer**, **By Rider**, or **By Horse** to reveal a second scrollable row of specific names or horses; tap any pill to filter the lesson list to that trainer, rider, or horse. Tap **All** to clear the filter. The active filter is preserved in the URL, so the page can be bookmarked or refreshed without losing your selection.

**Create a lesson** — Go to **Lessons → New Lesson**, fill in the date, choose an instructor, select a horse and rider (or multiple riders for a group lesson), choose a fee tier, optionally select a payment type if payment was collected at booking, and click **Submit**. The Instructor dropdown lists every trainer with instructing permissions, including trainers who haven't claimed their invite yet. Selecting a tier cascades its defaults into the form: if the tier has a jumping preference, the jumping checkbox is updated automatically; if it has a default exertion level, all currently selected horses' exertion fields are updated. Selecting **Custom** resets jumping to off and exertion to the default. Horses marked as unavailable appear grayed out and cannot be selected; their unavailability reason is shown next to the name. A fee is required for every lesson, including named tiers — enter `0` if the lesson is free. Checking **Recurring (weekly)** creates this lesson as the start of a weekly series (only the first lesson is created now — future weekly lessons are coming in a later update).

**Edit a lesson** — Open any lesson from the Lessons list and click **Edit**. All fields are editable. Downgrading a group lesson to a normal lesson requires selecting one rider and one horse to keep. Unavailable horses that were already assigned to the lesson remain shown (checked but grayed out) and will stay on the lesson when saved. If the lesson is part of an active recurring series, an indicator appears below the form. Editing a lesson only changes that single occurrence — it never changes the series template or any other lesson in the series. On the series' first lesson, a **Stop Recurring Lessons** button also appears — stopping only prevents future lessons from being generated; any lessons already created remain on the calendar and must be edited or deleted individually.

**Cancel a lesson** — For eligible lessons (upcoming, or unpaid), click **Cancel** on the Lessons list, optionally add a note explaining why, and confirm. The lesson stays on the list with a **Cancelled** badge instead of being removed, its fee is zeroed, and it drops off Outstanding and income totals. Cancelling notifies the instructor and enrolled riders.

**Cancel one rider's spot** — To drop a single rider from a lesson without cancelling the whole thing, open the lesson and click **Cancel** next to that rider's name. Choose **Cancelled by Rider** (the rider backed out — cancelling within 24 hours of the lesson keeps the fee, earlier cancellations waive it) or **Cancelled by Instructor** (the fee is always waived). Add an optional note and confirm; that rider's row shows a **Cancelled** badge and the rest of the lesson is unaffected. The affected rider is notified.

**Lesson notes** — Open any lesson to see per-horse and per-rider notes inline (read-only). To edit notes, tap the **Edit** button on the lesson and use the Notes section below the main form. Private notes (visually distinguished) are visible to trainers and managers only — riders cannot see them.

## Expenses

**View expenses** — Go to **Expenses** to see recent spending. Older expenses are hidden by default; tap **Show older expenses** to expand them. Each row shows the date, time (if scheduled), who was paid, the expense type, which horse(s) it covers (or "Entire Barn"), and the amount — shown as a dash if not yet entered.

**Add an expense** — Tap **Add Expense**. Enter who was paid and pick a date; everything else is optional. Leave the amount blank to log a planned visit (like a farrier appointment scheduled for next week) and fill it in later once you know the cost, or enter it right away for something you're paying for on the spot. If you've paid this recipient before, the expense type fills in automatically based on what you've entered for them in the past — you can still change it. Check **Entire Barn** if the expense covers every horse, or check off specific horses instead.

**Edit an expense** — Click **Edit** on any expense row to fill in a cost after a planned visit or fix a mistake. The form opens pre-filled, including the Entire Barn / specific-horses state; change anything and save.

**Delete an expense** — Click **Delete** on any expense row, then confirm. This cannot be undone.

## Finances

Go to **Finances** to review payment status. The **Outstanding** section at the top lists all past-due unpaid lessons with a non-zero fee, plus any unpaid lease or boarding charges from a prior month, with a **Type** column showing which — select a payment type from the dropdown next to any row to mark it paid, or tap **View all outstanding** to open a full read-only list at a glance. This section shows the raw fee, not reduced by the instructor cut. Below that, **Collected income**, **Total Expenses**, **Net** (Collected income minus Total Expenses), and — for the current month only — **Pending income** summarize the selected month, with no month/year suffix since the **←** / **→** arrows above already show which month you're viewing. Collected and pending income figures are net of the instructor cut set on the Settings page (see below) — leases and boarding charges are never reduced by the cut, since they don't involve an instructor; expenses aren't related to the cut and are simply subtracted in full. Below the summary, a pill switcher lets you browse breakdowns by horse, tier, rider, and trainer. **By Horse** is shown first and by default: its **Horse | Income | Expenses | Net** columns list every horse with income or expenses that month — a horse with no expenses shows $0.00 rather than a blank, and a horse with expenses but no lessons (e.g. one that's injured and only seeing vet bills) still appears, with $0.00 income and a negative Net. In the **By Tier** tab, an **Instructor Cut** column shows the total cut deducted for that tier that month (as a parenthesized amount), and the Subtotal column is the net figure after that deduction. In the **By Tier** and **By Trainer** tabs, a **Non-lesson income** row appears whenever a charge was collected that month (tap the ⓘ next to it for a reminder that it covers leases and boarding). A lesson given away for free (comped) can show a negative net contribution — a pure cost to the barn — displayed in parentheses. Two more edge-case rows can appear, each shown as plain text (not a link) with its own ⓘ explanation: a **No instructor** row on the **By Trainer** tab if a lesson's instructor was later removed from the barn, and a **No horse** or **No rider** row on the **By Horse**/**By Rider** tabs if a lesson was somehow saved with no horse or rider attached. These keep the breakdown totals matching Collected income even in those unusual cases.

In the **By Horse** tab, tap any horse name to open a drill-down page listing every lesson, lease/boarding charge, and expense that contributed to that horse's figures for the selected month in one combined table, ordered by date, with a **Type** column showing which. Lesson rows show the lesson date (linked to the lesson detail), the fee net of the instructor cut, the number of horses in that lesson, and the horse's split amount. Lease/boarding rows show the charge date (linked to the agreement) and its full fee. Expense rows show the expense date (linked to the expense), and their Amount and Split in parentheses, e.g. `($25.00)`. The **Net** row at the bottom (income minus expenses) matches the horse's Net shown in the By Horse summary.

In the **By Rider** tab, tap any rider name to open a drill-down page listing each lesson that contributed to that rider's income for the selected month, plus a **Leases & Boarding** table of that rider's paid charges (linked back to the agreement). Each lesson row shows the lesson date (linked to the lesson detail), the lesson fee net of the instructor cut, the number of riders in that lesson, and the rider's split amount. The total at the bottom matches the amount shown in the By Rider summary.

## Settings

Go to **Settings** to set the barn's instructor cut — a flat per-lesson amount representing the instructor's take. Changing it affects all historical collected and pending income figures, not just future lessons.

Go to **Settings** to manage fee tiers. The tier list shows each tier's name, price, default status, and active/inactive state. Tap **Edit** next to any tier to open its detail page, where you can rename it, change the price, set jumping and exertion defaults, set it as the default for new lessons, or deactivate it. Tap **Add tier** to create a new tier. A price is required — enter `0` for a free tier.

**Default Board Fee** — Set the monthly fee suggested when creating a new boarding agreement. Changing this only affects boarding agreements created afterward — existing boarders are unaffected.

**Horse Exhaustion Thresholds** — Set the barn-wide **Moderate threshold** and **High threshold** used to flag a horse as getting overworked, based on its recent exertion total. These are barn-wide defaults; an individual horse can be given its own thresholds that override them. The moderate threshold must be lower than the high threshold.

## Approvals

Go to **Settings** to review pending membership requests. Approving a request grants the member active access to the barn.

## Profile & Guide

Tap your avatar (your initials) in the top-right corner to open the account menu. From there you can access your **Profile** to update your contact information, or tap **User Guide** to open this guide from any page. When you open Profile from within a barn, the full barn nav bar appears at the top so you can navigate back to any section without losing your place.

If you are a member of more than one barn, a **▾** caret appears next to the barn name in the nav bar. Tap the caret to open a barn-switcher dropdown and jump directly to any of your barns.

## Notifications

You will receive notifications for situations that need attention. Tap the bell icon in the nav bar to view them; tap **Mark all read** to dismiss them.

- **New membership request** — a rider has requested to join the barn. Tap the notification to go to **Settings** and approve or reject the request.
- **Lesson cancelled** — a lesson you instructed was cancelled by another manager, or a trainer cancelled a lesson somewhere in the barn.
- **Complete your profile** — your profile is missing a phone number or emergency contact. Tap the notification to go to your profile and fill in the missing fields.
- **Some barn members have incomplete profiles** — one or more barn members are missing contact information. This notification clears automatically the next time you sign in once all members have completed their profiles.
- **Outstanding payment** — the barn has past-due unpaid lessons or lease/boarding charges. Tap the notification to go to the full outstanding list. This is checked and updated once nightly, so it may take up to a day to clear after you mark everything paid.
