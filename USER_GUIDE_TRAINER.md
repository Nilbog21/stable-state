# Stable State — Trainer Guide

Stable State is a barn management app for scheduling lessons, tracking horses and riders. Sign in with Google, then select your barn. Leave "Keep me logged in" checked on the sign-in page to stay signed in for up to 30 days, even after closing your browser. The nav bar shows all sections available to you as a trainer, with the section you're currently on highlighted. On a narrower screen, tap the ☰ button to open a side menu with the same links.

---

## Dashboard

Go to **Dashboard** to see your upcoming lessons for the next 7 days.

## Lessons

**View lessons** — Go to **Lessons** to see your recent lessons. Tap **Show older lessons** to see the full history. Lessons with a non-zero fee that have not been marked paid show an **Unpaid** badge next to the fee.

**Filter by rider** — A scrollable pill bar above the lesson list shows **All** plus one pill per rider who appears in your lessons. Tap a rider's name to filter to their lessons; tap **All** to clear. The selection is stored in the URL so it survives a page refresh.

**Book a lesson** — Go to **Lessons → New Lesson**, fill in the date, select a horse and rider, choose a fee tier, optionally select a payment type if payment was collected at booking, and click **Submit**. Selecting a tier cascades its defaults into the form: if the tier has a jumping preference, the jumping checkbox updates automatically; if it has a default exertion level, all currently selected horses' exertion fields update. Horses marked as unavailable appear grayed out and cannot be selected; their unavailability reason is shown next to the name. A fee is required for every lesson, including named tiers — enter `0` if the lesson is free. Checking **Recurring (weekly)** creates this lesson as the start of a weekly series (only the first lesson is created now — future weekly lessons are coming in a later update).

**Edit a lesson** — Open any of your lessons and click **Edit**. You can update the date, horse, rider, fee tier, and other fields. The instructor field shows your name and cannot be changed. Adding a new horse or rider inline is not available during an edit — contact your barn manager if you need to add a participant that is not in the list. Unavailable horses that were already assigned to the lesson remain shown (checked but grayed out) and will stay on the lesson when saved. If the lesson is part of an active recurring series you instruct, an indicator appears below the form. Editing a lesson only changes that single occurrence — it never changes the series template or any other lesson in the series. On the series' first lesson, a **Stop Recurring Lessons** button also appears — stopping only prevents future lessons from being generated; any lessons already created remain on the calendar and must be edited or deleted individually.

**Cancel a lesson** — For eligible lessons you instruct (upcoming, or unpaid), click **Cancel** on the Lessons list, optionally add a note explaining why, and confirm. The lesson stays on the list with a **Cancelled** badge instead of being removed, its fee is zeroed, and it drops off Outstanding. Cancelling notifies your barn manager(s) and enrolled riders.

**Cancel one rider's spot** — To drop a single rider from a lesson you instruct without cancelling the whole thing (e.g. a no-show, or a group lesson where only one rider can't make it), open the lesson and click **Cancel** next to that rider's name. Choose **Cancelled by Rider** (the rider backed out — the standard 24-hour policy applies: cancelling within 24 hours of the lesson keeps the fee, earlier cancellations waive it) or **Cancelled by Instructor** (your call — the fee is always waived). Add an optional note and confirm; that rider's row shows a **Cancelled** badge, the rest of the lesson is unaffected, and the affected rider is notified (plus your barn manager(s), since you initiated it).

**Lesson notes** — Open any lesson to see per-horse and per-rider notes inline (read-only). To edit notes, tap the **Edit** button on the lesson and use the Notes section below the main form. Private notes (visually distinguished) are visible to trainers and managers only.

## Outstanding payments

If you have past lessons with unpaid balances, you will receive a notification. Tap the notification to open the **Outstanding Payments** page, which lists all your past unpaid lessons with their date, riders, and fee. Tap any row to open the lesson detail.

## Notifications

Tap the bell icon in the nav bar to view your notifications.

- **Lesson cancelled** — a lesson you instructed was cancelled by a manager. Tap the notification to open the lesson.
- **Complete your profile** — your profile is missing a phone number or emergency contact. Tap the notification to go directly to your profile and fill in the missing fields. This notification clears automatically the next time you sign in once your profile is complete.

## Horses

Go to **Horses** to see horses grouped into two sections:

- **Available** — horses in active rotation, sorted by total exertion (7d) ascending. Each card shows the name and an exhaustion bar reflecting exertion from lessons within 3 days of today; tap the bar to see the individual lessons behind it.
- **Unavailable** — horses temporarily out of rotation; each card shows the horse name, the reason entered by your barn manager, and the same exhaustion bar.

Tap any card to open the horse's detail page for full availability details and documents. The **Documents** section shows uploaded files in a table with columns **Type**, **Notes**, **Link**, **Reminder Date**, and **Action**. Tap a filename in the **Link** column to open the document (link is valid for 5 minutes). The **Reminder Date** column is read-only for you — only your barn manager can change it after upload. A **Reminder Due** badge appears next to the date once it's arrived. To upload a new file, tap **Choose File** in the Upload Document form, select a file (the filename appears next to the button once chosen), add optional notes, optionally set an **Expiration reminder date**, and tap **Upload**. Accepted types: PDF, JPG, PNG, DOCX (max 5 MB). Document types: **Insurance Binder**, **Coggins**, **Shot Record**, **Contract**, **Other**.

## Profile & Guide

Tap your avatar (your initials) in the top-right corner to open the account menu. From there you can access your **Profile** to update your contact information, or tap **User Guide** to open this guide from any page. When you open Profile from within a barn, the full barn nav bar appears at the top so you can navigate back to any section without losing your place.

If you are a member of more than one barn, a **▾** caret appears next to the barn name in the nav bar. Tap the caret to open a barn-switcher dropdown and jump directly to any of your barns.

## Members

Go to **Members** to view the barn's rider roster. Your own card appears at the top; the Riders section lists all active riders with links to their detail pages.

Tap your own card or any rider card to see a **Contact Info** section with phone number and emergency contact (blank fields show as "—"). Tap your own card to manage your documents. Documents are shown in a table with columns **Type**, **Notes**, **Link**, **Reminder Date**, and **Action**. Tap a filename in the **Link** column to open the document (link is valid for 5 minutes). The **Reminder Date** column is read-only — only your barn manager can change it after upload. A **Reminder Due** badge appears next to the date once it's arrived. Tap **Delete** to remove one of your own documents. To upload a new file, tap **Choose File** (the filename appears next to the button once chosen), add optional notes, optionally set an **Expiration reminder date**, and tap **Upload**. Accepted types: **Instructor Contract**, **Other** — PDF, JPG, PNG, or DOCX (max 5 MB). Tap any rider card to view that rider's documents in the same table layout (read-only — you cannot upload or delete rider documents).
