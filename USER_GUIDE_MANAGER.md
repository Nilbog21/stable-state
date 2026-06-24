# Stable State — Manager Guide

Stable State is a barn management app for scheduling lessons, tracking horses and riders, and managing finances. Sign in with Google, then select your barn. The nav bar shows all sections available to you as a manager.

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

On the horse's detail page, managers see additional sections:

- **Name** — pre-filled text input with the current name and a **Save** button to rename the horse.
- **Activation** — at the bottom of the page. When the horse is active, a **Set Inactive** button appears; tapping it shows an inline confirmation with **Confirm** and **Cancel** before submitting. When the horse is already inactive, a **Set Active** button appears and submits immediately without confirmation.
- **Documents** — lists all uploaded files for this horse, labeled by document type. Tap a file name to open the document (link is valid for 5 minutes). Tap **Delete** to remove a document. Use the **Upload Document** form to add a new file; accepted types are PDF, JPG, PNG, and DOCX (max 5 MB). Document types: **Insurance Binder**, **Coggins**, **Shot Record**, **Contract**.

## Members

Go to **Members** to browse the barn roster. You will see a Trainers section and a Riders section, each listing active members with links to their detail pages. Your own card appears at the top. When you approve a membership request, a rider record is created automatically.

Tap any member card to open their detail page. From there you can view their documents, upload new ones, or delete existing ones. Accepted file types are PDF, JPG, PNG, and DOCX (max 5 MB per file). Document types for trainers: **Instructor Contract**. Document types for riders: **Liability Waiver**, **Lease Agreement**, **Boarding Contract**. Tap a file name to open the document (link is valid for 5 minutes).

## Lessons

**View lessons** — Go to **Lessons** to see recent activity. Older lessons are hidden by default; tap **Show older lessons** to expand them. Lessons with a non-zero fee that have not been marked paid show an **Unpaid** badge next to the fee.

**Filter lessons** — A pill bar above the lesson list lets you narrow by dimension. Tap **By Trainer** or **By Rider** to reveal a second scrollable row of specific names; tap any name to filter to that person's lessons. Tap **All** to clear the filter. The active filter is preserved in the URL, so the page can be bookmarked or refreshed without losing your selection.

**Create a lesson** — Go to **Lessons → New Lesson**, fill in the date, select a horse and rider (or multiple riders for a group lesson), choose a fee tier, optionally select a payment type if payment was collected at booking, and click **Submit**. Horses marked as unavailable appear grayed out and cannot be selected; their unavailability reason is shown next to the name.

**Edit a lesson** — Open any lesson from the Lessons list and click **Edit**. All fields are editable. Downgrading a group lesson to a normal lesson requires selecting one rider and one horse to keep. Unavailable horses that were already assigned to the lesson remain shown (checked but grayed out) and will stay on the lesson when saved.

**Delete a lesson** — From the Lessons list, click the delete icon on any lesson.

**Lesson notes** — Open any lesson to see per-horse and per-rider note fields. Tap any note field to edit it inline; changes are saved immediately. Private notes (visually distinguished) are visible to trainers and managers only — riders cannot see them.

## Finances

Go to **Finances** to review payment status. The **Outstanding** section at the top lists all past unpaid lessons with a non-zero fee — select a payment type from the dropdown next to any lesson to mark it paid, or tap **View all outstanding** to open a full read-only list at a glance. Below that, use the **←** / **→** arrows to browse monthly summaries of collected and pending income, with breakdowns by tier, horse, rider, and trainer.

In the **By Horse** tab, tap any horse name to open a drill-down page listing each lesson that contributed to that horse's income for the selected month. Each row shows the lesson date (linked to the lesson detail), the full lesson fee, the number of horses in that lesson, and the horse's split amount. The total at the bottom matches the amount shown in the By Horse summary.

In the **By Rider** tab, tap any rider name to open a drill-down page listing each lesson that contributed to that rider's income for the selected month. Each row shows the lesson date (linked to the lesson detail), the full lesson fee, the number of riders in that lesson, and the rider's split amount. The total at the bottom matches the amount shown in the By Rider summary.

## Settings

Go to **Settings** to manage fee tiers. You can add a new tier, edit an existing tier's name or price, set a default exertion level and jumping preference for a tier, set a tier as the default for new lessons, or deactivate a tier. The default tier cannot be deactivated until a different tier is set as default first.

## Approvals

Go to **Settings** to review pending membership requests. Approving a request grants the member active access to the barn and, for rider-role requests, automatically creates their rider record.

## Profile & Guide

Tap your avatar (your initials) in the top-right corner to open the account menu. From there you can access your **Profile** to update your contact information, or tap **User Guide** to open this guide from any page.

## Notifications

You will receive notifications for situations that need attention. Tap the bell icon in the nav bar to view them; tap **Mark all read** to dismiss them.

- **Complete your profile** — your profile is missing a phone number or emergency contact. Tap the notification to go to your profile and fill in the missing fields.
- **Some barn members have incomplete profiles** — one or more barn members are missing contact information. This notification clears automatically the next time you sign in once all members have completed their profiles.
