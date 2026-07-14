# Stable State — Trainer Guide

Stable State is a barn management app for scheduling lessons, tracking horses and riders. Sign in with Google, then select your barn. Leave "Keep me logged in" checked on the sign-in page to stay signed in for up to 30 days, even after closing your browser. The nav bar shows all sections available to you as a trainer, with the section you're currently on highlighted. On a narrower screen, tap the ☰ button to open a side menu with the same links.

---

## Dashboard

Go to **Dashboard** to see your upcoming lessons for the next 7 days. If any of your lessons are unpaid, a **Reminders** section appears above them with an "N unpaid lessons" card — tap it to open the full **Outstanding Payments** list. The section is hidden when you have nothing unpaid.

## Lessons

**View lessons** — Go to **Lessons** to see every lesson in the barn, not just your own. Tap **Show older lessons** to see the full history. Lessons with a non-zero fee that have not been marked paid show an **Unpaid** badge next to the fee. A lesson that's part of a recurring series shows a **Recurring** badge, both on the list and on its detail page.

**Filter lessons** — A pill bar above the lesson list lets you narrow by dimension. The list opens on **My Lessons** by default, showing only lessons you instruct. Tap **All** to see every barn lesson, or tap **By Instructor**, **By Rider**, or **By Horse** to reveal a second row of specific names or horses; tap any pill there to filter to that instructor, rider, or horse. The active filter is preserved in the URL, so the page can be bookmarked or refreshed without losing your selection.

**Book a lesson** — Go to **Lessons → New Lesson**, fill in the date, select a horse and rider, choose a fee tier, optionally select a payment type if payment was collected at booking, and click **Submit**. Selecting a tier cascades its defaults into the form: if the tier has a jumping preference, the jumping checkbox updates automatically; if it has a default exertion level, all currently selected horses' exertion fields update; the fee field is pre-filled with the tier's price but stays editable, so you can adjust it for a one-off discount or surcharge without switching the lesson off its tier. Horses marked as unavailable appear grayed out and cannot be selected; their unavailability reason is shown next to the name. The horse list is sorted with any already-selected horses first, then available horses, then inactive/unavailable horses last — each group ordered from least to most worked. Once a date is picked, each active, available horse shows an exhaustion bar reflecting how worked that horse already is around that date — a lighter "ghost" segment previews the effect of the exertion level you've selected for a checked horse, updating live as you change it; no bar is shown for a horse that's inactive/unavailable and not currently selected, or once the lesson's date/time is in the past. A fee is required for every lesson, including named tiers — enter `0` if the lesson is free. Checking **Recurring (weekly)**, shown above the date field, creates this lesson as the start of a weekly series and relabels the date field to **Starting Date**; a nightly job keeps generating the next occurrence automatically, about a month ahead at all times.

**Edit a lesson** — Open any of your lessons and click **Edit**. You can update the date, horse, rider, fee tier, and other fields. The instructor field is not shown — it's locked to you automatically. Adding a new horse or rider inline is not available during an edit — contact your barn manager if you need to add a participant that is not in the list. Unavailable horses that were already assigned to the lesson remain shown (checked but grayed out) and will stay on the lesson when saved. Editing a lesson only changes that single occurrence — it never changes the series template or any other lesson in the series. If the lesson is the start of an active recurring series you instruct, an indicator and a **Stop Recurring Lessons** button appear above the form — stopping only prevents future lessons from being generated; it does not affect this or any already-created lesson.

**Cancel a lesson** — For eligible lessons you instruct (upcoming, or unpaid), open the lesson and click **Cancel** in the header, next to **Edit**. Choose **Cancelled by Rider** (cancelling within 24 hours of the lesson keeps the fee, earlier cancellations waive it) or **Cancelled by Instructor** (the fee is always waived), optionally add a note explaining why, and confirm. For a **normal** lesson (1 rider), that's the whole flow — cancelling the lesson and cancelling its one rider's spot are the same event. For a **group** lesson (e.g. a no-show, or one rider who can't make it), choosing **Cancelled by Instructor** cancels the whole lesson (all riders, fee waived, and the confirmation lists everyone who'll be affected); choosing **Cancelled by Rider** instead reveals a list of the enrolled riders so you can pick just one to drop — the rest of the lesson is unaffected. The lesson (or that rider's row) shows a **Cancelled** badge instead of being removed, your notes appear on the lesson detail page, and it drops off Outstanding whenever the fee is waived. Cancelling notifies your barn manager(s) and enrolled riders. If dropping one rider from a group lesson leaves no one else enrolled, the whole lesson is automatically marked **Cancelled** too — you don't need a separate whole-lesson cancellation.

**Edit cancellation notes** — On an already-cancelled lesson you instruct, the **Cancellation Notes** field on the detail page stays editable — useful for filling it in after a cancellation cascaded automatically, or correcting a note later. Just edit the text and click away to save.

**Lesson notes** — Open any lesson to see per-horse and per-rider notes inline (read-only). To edit notes, tap the **Edit** button on the lesson and use the Notes section below the main form. Private notes (visually distinguished) are visible to trainers and managers only.

## Outstanding payments

If you have past lessons with unpaid balances, an "N unpaid lessons" card appears in the Dashboard's **Reminders** section — tap it to open the **Outstanding Payments** page, which lists all your past unpaid lessons with their date, riders, and fee. Tap any row to open the lesson detail.

## Notifications

Tap the bell icon in the nav bar to view your notifications.

- **Lesson cancelled** — a lesson you instructed was cancelled by a manager. Tap the notification to open the lesson.
- **Complete your profile** — your profile is missing a phone number or emergency contact. Tap the notification to go directly to your profile and fill in the missing fields. This notification clears automatically the next time you sign in once your profile is complete.
- **Recurring series stopped** — a weekly recurring series you instruct stopped generating new lessons because a rider on it is no longer an active member. Tap the notification to review your lessons.
- **Recurring lesson generated with an unavailable horse** — the nightly job generated the next occurrence of a recurring series, but the horse assigned to it is currently marked unavailable or inactive. Tap the notification to review the lesson and reassign the horse if needed.

## Horses

Go to **Horses** to see horses grouped into two sections:

- **Available** — horses in active rotation, sorted by total exertion (7d) ascending. Each card shows the name and an exhaustion bar reflecting exertion from lessons within 3 days of today; tap the bar to see the individual lessons behind it.
- **Unavailable** — horses temporarily out of rotation; each card shows the horse name, the reason entered by your barn manager, and the same exhaustion bar.

Tap any card to open the horse's detail page for full availability details and documents. The **Documents** section shows uploaded files in a table with columns **Type**, **Notes**, **Link**, and **Reminder Date** (no Action column — you can't delete horse documents). Tap a filename in the **Link** column to open the document (link is valid for 5 minutes). The **Reminder Date** column is read-only for you — only your barn manager can change it after upload. A **Reminder Due** badge appears next to the date once it's arrived. To upload a new file, tap **Add Document** — this opens a new page where you choose a file (the filename appears next to the button once chosen), add optional notes, optionally set an **Expiration reminder date**, and tap **Upload**; you're returned to this page when done. Accepted types: PDF, JPG, PNG, DOCX (max 4.5 MB). Document types: **Insurance Binder**, **Coggins**, **Shot Record**, **Contract**, **Other**.

## Profile & Guide

Tap your avatar (your initials) in the top-right corner to open the account menu. From there you can access your **Profile** to update your contact information, or tap **User Guide** to open this guide from any page. When you open Profile from within a barn, the full barn nav bar appears at the top so you can navigate back to any section without losing your place.

If you are a member of more than one barn, a **▾** caret appears next to the barn name in the nav bar. Tap the caret to open a barn-switcher dropdown and jump directly to any of your barns.

## Members

Go to **Members** to view the full barn roster — Managers, Trainers, and Riders sections, with your own card at the top. Tapping any card opens that member's detail page, but what you see there depends on who you're viewing: tap your own card or any rider's card to see a **Contact Info** section with phone number and emergency contact (blank fields show as "—"); viewing another trainer or a manager shows only their name.

Tap your own card to manage your documents. Documents are shown in a table with columns **Type**, **Notes**, **Link**, **Reminder Date**, and **Action**. Tap a filename in the **Link** column to open the document (link is valid for 5 minutes). The **Reminder Date** column is read-only — only your barn manager can change it after upload. A **Reminder Due** badge appears next to the date once it's arrived. Tap **Delete** to remove one of your own documents. To upload a new file, tap **Add Document** — this opens a new page where you choose a file (the filename appears next to the button once chosen), add optional notes, optionally set an **Expiration reminder date**, and tap **Upload**; you're returned to this page when done. Accepted types: **Instructor Contract**, **Other** — PDF, JPG, PNG, or DOCX (max 4.5 MB). Other members' Documents sections are no longer visible to you — only a manager or the member themself can see them.

## If something goes wrong

If a page shows a "Something went wrong" message, tap **Try again**. If the problem continues, contact your barn manager.
