# Stable State — Trainer Guide

Stable State is a barn management app for scheduling lessons, tracking horses and riders. Sign in with Google, then select your barn. The nav bar shows all sections available to you as a trainer.

---

## Dashboard

Go to **Dashboard** to see your upcoming lessons for the next 7 days.

## Lessons

**View lessons** — Go to **Lessons** to see your recent lessons. Tap **Show older lessons** to see the full history. Lessons with a non-zero fee that have not been marked paid show an **Unpaid** badge next to the fee.

**Filter by rider** — A scrollable pill bar above the lesson list shows **All** plus one pill per rider who appears in your lessons. Tap a rider's name to filter to their lessons; tap **All** to clear. The selection is stored in the URL so it survives a page refresh.

**Book a lesson** — Go to **Lessons → New Lesson**, fill in the date, select a horse and rider, choose a fee tier, optionally select a payment type if payment was collected at booking, and click **Submit**. Selecting a tier cascades its defaults into the form: if the tier has a jumping preference, the jumping checkbox updates automatically; if it has a default exertion level, all currently selected horses' exertion fields update. Horses marked as unavailable appear grayed out and cannot be selected; their unavailability reason is shown next to the name.

**Edit a lesson** — Open any of your lessons and click **Edit**. You can update the date, horse, rider, fee tier, and other fields. The instructor field shows your name and cannot be changed. Adding a new horse or rider inline is not available during an edit — contact your barn manager if you need to add a participant that is not in the list. Unavailable horses that were already assigned to the lesson remain shown (checked but grayed out) and will stay on the lesson when saved.

**Lesson notes** — Open any lesson to see per-horse and per-rider note fields. Tap any note field to edit it inline; changes are saved immediately. Private notes (visually distinguished) are visible to trainers and managers only.

## Outstanding payments

If you have past lessons with unpaid balances, you will receive a notification. Tap the notification to open the **Outstanding Payments** page, which lists all your past unpaid lessons with their date, riders, and fee. Tap any row to open the lesson detail.

## Notifications

Tap the bell icon in the nav bar to view your notifications. If your profile is missing a phone number or emergency contact, you will receive a **Complete your profile** notification — tap it to go directly to your profile and fill in the missing fields. This notification clears automatically the next time you sign in once your profile is complete.

## Horses

Go to **Horses** to see horses grouped into two sections:

- **Available** — horses in active rotation, sorted by total exertion (7d) ascending. Each card shows name, total exertion, lesson count, and jumping count for the last 7 days.
- **Unavailable** — horses temporarily out of rotation; each card shows the horse name and the reason entered by your barn manager.

Tap any card to open the horse's detail page for full availability details and documents. The **Documents** section shows uploaded files in a table with columns **Type**, **Notes**, **Link**, and **Action**. Tap a filename in the **Link** column to open the document (link is valid for 5 minutes). To upload a new file, tap **Choose File** in the Upload Document form, select a file (the filename appears next to the button once chosen), add optional notes, and tap **Upload**. Accepted types: PDF, JPG, PNG, DOCX (max 5 MB). Document types: **Insurance Binder**, **Coggins**, **Shot Record**, **Contract**, **Other**.

## Profile & Guide

Tap your avatar (your initials) in the top-right corner to open the account menu. From there you can access your **Profile** to update your contact information, or tap **User Guide** to open this guide from any page. When you open Profile from within a barn, the full barn nav bar appears at the top so you can navigate back to any section without losing your place.

If you are a member of more than one barn, a **▾** caret appears next to the barn name in the nav bar. Tap the caret to open a barn-switcher dropdown and jump directly to any of your barns.

## Members

Go to **Members** to view the barn's rider roster. Your own card appears at the top; the Riders section lists all active riders with links to their detail pages.

Tap your own card to manage your documents. Documents are shown in a table with columns **Type**, **Notes**, **Link**, and **Action**. Tap a filename in the **Link** column to open the document (link is valid for 5 minutes). Tap **Delete** to remove one of your own documents. To upload a new file, tap **Choose File** (the filename appears next to the button once chosen), add optional notes, and tap **Upload**. Accepted types: **Instructor Contract**, **Other** — PDF, JPG, PNG, or DOCX (max 5 MB). Tap any rider card to view that rider's documents in the same table layout (read-only — you cannot upload or delete rider documents).
