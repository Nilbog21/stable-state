# Stable State — Manager Guide

Stable State is a barn management app for scheduling lessons, tracking horses and riders, and managing finances. Sign in with Google, then select your barn. Leave "Keep me logged in" checked on the sign-in page to stay signed in for up to 30 days, even after closing your browser. The nav bar shows all sections available to you as a manager.

---

## Dashboard

Go to **Dashboard** to see your upcoming lessons for the next 7 days (lessons where you are the instructor).

## Horses

Use **Horses** in the nav to see horses grouped into three sections:

- **Available** — horses in active rotation, sorted by total exertion (7d) ascending so the most-rested horses appear first. Each card shows name, total exertion, lesson count, and jumping count for the last 7 days.
- **Unavailable** — horses temporarily out of rotation; each card shows the horse name and the reason entered when marking them unavailable.
- **Inactive** — soft-deleted horses (visible to managers only); each card shows the horse name.

Empty sections are hidden. Tap any card to open the horse's detail page. To add a new horse, use the **Horse name** input and **Add** button in the page header (top right).

### Horse detail page (manager controls)

On the horse's detail page, managers see a unified form and a documents section:

- **Name** — pre-filled text input with the current name.
- **Status** — a three-state pill control: **Active**, **Unavailable**, **Inactive**. Tap a pill to select the new status. When **Unavailable** is selected, a **Reason** textarea appears to record why the horse is out of rotation. When **Inactive** is selected for a currently active horse, a warning appears noting the horse will be removed from the roster and lesson scheduling. Tap **Save** to apply all changes (name, status, and reason) in one step — no separate confirmation is required.
- **Documents** — displays uploaded files in a table with columns **Type**, **Notes**, **Link**, and **Action**. Tap the filename in the **Link** column to open the document (link is valid for 5 minutes). Tap **Delete** in the **Action** column to remove a document. To upload a new file, tap **Choose File** in the Upload Document form, select a file (the filename appears next to the button once chosen), fill in any optional notes, then tap **Upload**. Accepted types: PDF, JPG, PNG, DOCX (max 5 MB). Document types: **Insurance Binder**, **Coggins**, **Shot Record**, **Contract**, **Other**.

## Members

Go to **Members** to browse the barn roster. You will see a **Managers** section (other managers in the barn), a **Trainers** section, and a **Riders** section, each listing active members with links to their detail pages. Your own card appears at the top under **You**.

**Adding a rider without an account** — At the top of the Riders section, enter a first and last name and tap **Add Rider**. This creates a record immediately so you can enter their lessons right away, even if they have not signed in yet. Managed riders show an **Unlinked** badge and two controls instead of a link:
- **Copy invite** — copies a personal invite link to the clipboard. Share this with the rider; when they tap the link and sign in with Google, their account is automatically linked to the existing record and lesson history.
- **Revoke** — invalidates the current invite link and generates a new one. Use this if a link is shared with the wrong person. The previous link stops working immediately.

Once a rider claims their invite, the **Unlinked** badge disappears and their row becomes a normal link to their detail page.

Tap any member card to open their detail page. Documents are shown in a table with columns **Type**, **Notes**, **Link**, and **Action**. Tap a filename in the **Link** column to open the document (link is valid for 5 minutes). Tap **Delete** to remove it. To add a new file, tap **Choose File**, select a file (the filename appears next to the button once chosen), add optional notes, and tap **Upload**. Accepted file types: PDF, JPG, PNG, DOCX (max 5 MB). Document types for managers and trainers: **Instructor Contract**, **Other**. Document types for riders: **Liability Waiver**, **Lease Agreement**, **Boarding Contract**, **Other**.

## Lessons

**View lessons** — Go to **Lessons** to see recent activity. Older lessons are hidden by default; tap **Show older lessons** to expand them. Lessons with a non-zero fee that have not been marked paid show an **Unpaid** badge next to the fee.

**Filter lessons** — A pill bar above the lesson list lets you narrow by dimension. Tap **By Trainer**, **By Rider**, or **By Horse** to reveal a second scrollable row of specific names or horses; tap any pill to filter the lesson list to that trainer, rider, or horse. Tap **All** to clear the filter. The active filter is preserved in the URL, so the page can be bookmarked or refreshed without losing your selection.

**Create a lesson** — Go to **Lessons → New Lesson**, fill in the date, select a horse and rider (or multiple riders for a group lesson), choose a fee tier, optionally select a payment type if payment was collected at booking, and click **Submit**. Selecting a tier cascades its defaults into the form: if the tier has a jumping preference, the jumping checkbox is updated automatically; if it has a default exertion level, all currently selected horses' exertion fields are updated. Selecting **Custom** resets jumping to off and exertion to the default. Horses marked as unavailable appear grayed out and cannot be selected; their unavailability reason is shown next to the name.

**Edit a lesson** — Open any lesson from the Lessons list and click **Edit**. All fields are editable. Downgrading a group lesson to a normal lesson requires selecting one rider and one horse to keep. Unavailable horses that were already assigned to the lesson remain shown (checked but grayed out) and will stay on the lesson when saved.

**Cancel a lesson** — For eligible lessons (upcoming, or unpaid), click **Cancel** on the Lessons list, optionally add a note explaining why, and confirm. The lesson stays on the list with a **Cancelled** badge instead of being removed, its fee is zeroed, and it drops off Outstanding and income totals. Cancelling notifies the instructor and enrolled riders.

**Cancel one rider's spot** — To drop a single rider from a lesson without cancelling the whole thing, open the lesson and click **Cancel** next to that rider's name. Choose **Cancelled by Rider** (the rider backed out — cancelling within 24 hours of the lesson keeps the fee, earlier cancellations waive it) or **Cancelled by Instructor** (the fee is always waived). Add an optional note and confirm; that rider's row shows a **Cancelled** badge and the rest of the lesson is unaffected. The affected rider is notified.

**Lesson notes** — Open any lesson to see per-horse and per-rider notes inline (read-only). To edit notes, tap the **Edit** button on the lesson and use the Notes section below the main form. Private notes (visually distinguished) are visible to trainers and managers only — riders cannot see them.

## Finances

Go to **Finances** to review payment status. The **Outstanding** section at the top lists all past unpaid lessons with a non-zero fee — select a payment type from the dropdown next to any lesson to mark it paid, or tap **View all outstanding** to open a full read-only list at a glance. Below that, use the **←** / **→** arrows to browse monthly summaries of collected and pending income, with breakdowns by tier, horse, rider, and trainer.

In the **By Horse** tab, tap any horse name to open a drill-down page listing each lesson that contributed to that horse's income for the selected month. Each row shows the lesson date (linked to the lesson detail), the full lesson fee, the number of horses in that lesson, and the horse's split amount. The total at the bottom matches the amount shown in the By Horse summary.

In the **By Rider** tab, tap any rider name to open a drill-down page listing each lesson that contributed to that rider's income for the selected month. Each row shows the lesson date (linked to the lesson detail), the full lesson fee, the number of riders in that lesson, and the rider's split amount. The total at the bottom matches the amount shown in the By Rider summary.

## Settings

Go to **Settings** to manage fee tiers. The tier list shows each tier's name, price, default status, and active/inactive state. Tap **Edit** next to any tier to open its detail page, where you can rename it, change the price, set jumping and exertion defaults, set it as the default for new lessons, or deactivate it. Tap **Add tier** to create a new tier.

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
