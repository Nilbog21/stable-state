# Changelog

All notable changes to Stable State are documented here. Written for barn managers and riders.

---

## v2.0.0 — June 2026

### Profile & Contact Info

- **Profile page.** Update your name, phone number, and emergency contact from the avatar menu → Profile.
- **Contact fields required.** New members are asked to complete their contact info before accessing the barn. A notification reminds you if any fields are still missing.

### Notifications

- **Notification bell in the nav bar.** A bell icon shows an unread count badge. Click it to see recent alerts and mark them read.
- **Alerts include:** outstanding payment reminders, pending approval requests (managers), and incomplete profile warnings.

### Dashboard

- **Upcoming lessons cards.** The dashboard now shows your next 7 days of lessons as cards — upcoming lessons you're teaching (trainers), enrolled in (riders), or scheduled at the barn (managers).
- **Lesson times shown in your local time zone.** Times no longer display in UTC.
- **Pending-requests badge.** Managers see a badge on the dashboard when there are members waiting for approval, with a link to Manage Barn.

### Navigation

- **Barn name is now the home link.** Click the barn name in the nav bar to return to the dashboard.
- **Avatar dropdown.** Click your initials in the top-right corner to access: your name and email, Profile, Switch Barn, User Guide, and Sign Out. Sign Out has moved here from the dashboard.
- **Switch barns from the nav bar.** If you belong to more than one barn, a small arrow (▾) appears next to the barn name. Click it to switch barns without leaving the page.
- **Profile page keeps barn navigation visible.** When you visit your Profile from inside a barn, the full nav bar stays at the top.
- **Page titles.** Browser tabs now show "<Barn Name> | Stable State" (or just "Stable State" for non-barn pages).
- **User Guide link** in the avatar dropdown takes you straight to your role's guide.

### Manage Barn (managers)

- **Manage Barn page.** The former Approvals page and Settings page are combined into a single "Manage Barn" page. The nav link is now called "Manage Barn."
- **Lesson tiers redesigned.** The tier list is now a clean read-only table with an Edit button on each row.
- **Tiers have dedicated Add and Edit pages.** Managing tiers is done on their own pages instead of inline.
- **"Set as default" checkbox.** When saving a tier on the Edit page, you can check a box to make it the default — no separate button needed.

### Horses

- **Horses and Manage Horses merged.** All roles now use a single Horses page. The page shows three sections: Available, Unavailable, and Inactive (managers only). Horses appear as cards, not a table.
- **Sort the horse summary by clicking column headers.** Click any column header (name, exertion, lessons, jumping) to sort the list.
- **Simpler status control (managers).** The horse detail page has a single form: pick Active, Unavailable (and enter a reason), or Inactive — then click Save once.
- **Horse documents visible to trainers.** Trainers can see and upload horse documents from the horse detail page. Managers can upload and delete.

### Lessons

- **Trainers can edit their own lessons.** An Edit button appears on lesson detail pages for lessons the trainer instructed.
- **Filter lessons by person.** Trainers see a pill row to filter by rider. Managers see a two-level filter: first choose "All," "By Trainer," or "By Rider," then pick a specific person.
- **Tier defaults pre-fill the lesson form.** When you select a fee tier, the lesson form pre-fills the price, exertion level, and jumping field with the tier's defaults (if set).
- **Lesson notes editing moved to Edit Lesson.** Horse notes and rider notes can only be edited on the Edit Lesson page. The lesson detail page shows them read-only.
- **Navigation warning.** If you navigate away from a lesson edit with unsaved changes, you'll be asked to confirm before leaving.

### Members & Documents

- **Members page.** A full Members list is now available to managers and trainers. Managers see Managers, Trainers, and Riders sections. Trainers see Riders.
- **Member detail page.** Click a member's card to see their profile and documents.
- **Document uploads for managers.** Manager accounts support document uploads, the same as trainers and riders.
- **"Other" document type.** When uploading a document for a horse, trainer, or rider, you can now choose "Other" as the type.
- **Cleaner document list.** Uploaded documents appear in a table with a clearly labeled upload button.

### Finances (managers)

- **Outstanding income shown first.** Unpaid past lessons appear above the collected income summary.
- **"By Trainer" tab added.** A new tab on the Finances page breaks down collected income by instructor.
- **Income summaries show collected (paid) income only.** Breakdowns no longer mix paid and unpaid lessons.
- **Info labels.** Each section of the Finances page has a label explaining what it shows.
- **Income drill-down pages.** Click any horse in the "By Horse" tab, or any rider in the "By Rider" tab, to see a detailed list of their paid lessons for that month.

### Empty states

- **Helpful empty states.** When a page has no data — no lessons scheduled, no horses added, no members yet — it now shows a short message and a button to get started instead of a blank list.

### Bug fixes

- Finance horse income was counting lessons from other barns (#434)
- New Lesson and Edit Lesson pages now open at the top of the page, not scrolled down (#473)
- Rider names were sometimes missing from lesson details (#407)
- Trainers can now see the Riders section on the Members page (#476)

---

## v1.0.0 — June 2026

### Auth & Access

- Sign in with Google
- Each barn has its own login and registration page
- New members wait for manager approval before accessing the barn
- Roles: managers, trainers, and riders each see different features
- Barn selector page for users who belong to multiple barns
- Role-aware navigation bar on every barn page
- Sign-out for all roles
- Unapproved and unauthenticated users are redirected to login

### Lessons

- Add a lesson: date/time, instructor, horse with exertion level, rider
- Group lessons: add multiple riders to a single lesson
- Jumping field: mark whether a lesson included jumping
- Fee tiers: managers configure named tiers (e.g. "30-min private," "Group") with prices; the tier name appears on the lesson list
- Edit lesson (managers)
- Warning when downgrading a group lesson to a private lesson
- Lessons listed newest-first; older lessons are behind a "Show older" toggle

### Horses

- Add and manage horses (managers)
- Horses overview: per-horse exertion summary for the last 7 days, with lesson count and jumping count
- All roles can view the Horses page

### Finances (managers)

- Month-by-month navigation with prev/next arrows
- Outstanding lessons: all unpaid past lessons with a fee, with inline payment recording
- Collected vs. pending income split
- Income breakdowns by fee tier, horse, and rider

### Settings (managers)

- Manage lesson tiers: add, edit, set default, deactivate
