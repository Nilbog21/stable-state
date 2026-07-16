# Changelog

All notable changes to Stable State are documented here. Written for barn managers and riders.

---

## v3.0.0 — July 2026

### Leases & Boarding Agreements

- **New Agreements area for managers.** Create a lease or boarding agreement between a rider and a horse, with a fee and billing schedule (one-time or monthly).
- **Monthly charges generate automatically** each month for active agreements. A default board fee can be set for the barn to speed up new boarding agreements.
- **Agreement charges show up in Finances** and on the Outstanding page, with an "Unpaid" badge on past-due agreement cards.
- **Active Agreements** appear as cards on a rider's member detail page.

### Recurring Lessons

- **Mark a new lesson "Recurring (weekly)"** and it keeps generating itself every week automatically.
- **Stop a recurring series** any time from the lesson edit page.

### Lesson Cancellation

- **One Cancel button** on the lesson page now handles cancelling the whole lesson or just your own participation in a group lesson.
- **24-hour fee policy.** Cancelling a private lesson within 24 hours keeps the fee unless the instructor waives it — an amber warning explains this before you confirm.
- **Cancellation reasons are visible** on the lesson page to everyone involved.

### Lessons

- **Trainers now see the whole barn's lessons**, not just their own, matching the manager's Lessons page.
- **"By Tier" filter** added to the Lessons list alongside By Instructor, By Rider, and By Horse.
- **Managers can hard-delete a lesson entered by mistake.** Removes it entirely — no cancellation fee, no notifications, no record left behind — with a confirmation prompt first since it can't be undone.

### Horse Exhaustion Tracking

- **Exhaustion bars on the Horses page** show each horse's recent lesson load at a glance, so you can see which horses need rest.
- **Configurable thresholds.** Managers can set barn-wide exhaustion thresholds, or override them for an individual horse.
- **Live exhaustion bars on the lesson form** while picking horses, updating as you change the date or exertion level.
- **Visible to managers and trainers only.** Riders don't see exhaustion bars or exertion ratings on horses or lessons.

### Expenses

- **New Expenses page for managers** — log recipient, date, amount, expense type, and which horse(s) an expense applies to (or the whole barn).
- **Plan an expense before you know the amount**, then fill it in later.
- **Expenses now appear in Finances** — in the monthly summary, the By Horse breakdown, and a per-horse drill-down.
- **The dashboard's "Barn Schedule"** shows upcoming planned expenses alongside upcoming lessons.
- **Outstanding Expenses section** on Finances lists expenses still missing an amount or payment type.

### Finances

- **Gross / Expenses / Net terminology**, with a running reconciliation at the bottom of each breakdown table.
- **Income is now net of each lesson's instructor cut**, which managers set per fee tier in Manage Barn settings.
- **New "By Instructor" and "By Paid To" (recipient) tabs**, each with its own drill-down page.
- **Sortable table columns** — click a header to re-sort.

### Members & Documents

- **Any barn member can browse the full roster** — Managers, Trainers, and Riders sections — not just their own.
- **Add a trainer the same way you add a rider** — a name-only record with a personal invite link to share once they're ready to join.
- **Invite links are now personal and single-use**, rather than one link shared barn-wide.
- **Contact info is visible to any active barn member** on a member's detail page; managers can edit it directly for members who haven't signed in yet.
- **Grant or revoke instructor access** for any member from their member detail page.
- **Document expiration reminders.** Give a document an optional reminder date; a "Reminder Due" badge and dashboard reminder appear once that date passes.
- **Riders can view their own documents but no longer upload or edit them** — ask a manager to add or update a rider's documents.
- **Manage Barn settings page** is now organized into collapsible sections.

### Sign-in

- **"Keep me logged in" checkbox** on the login page keeps you signed in for 30 days instead of just a few hours.

### Notifications

- **Overnight reminders.** Outstanding payment reminders (unpaid lessons and agreements) and past-due expense reminders now generate automatically overnight, so managers see them even without a recent login.
- **Read notifications are cleaned up automatically** after 30 days.
- **Dashboard reminders** now also flag outstanding late-cancellation fees.

### Navigation

- **Mobile menu.** Section links collapse into a slide-out drawer on small screens, with the current page highlighted.
- **Dashboard split into "Today" and "This Week"** for upcoming lessons, with upcoming scheduled expenses interleaved for managers.

### Bug fixes

- Lesson times could shift by a few hours depending on your timezone (#935)
- Riders could view lessons they weren't enrolled in by guessing the URL (#549)
- A page layout bug could cause content to appear off-center on desktop (#590)
- Notifications meant for another person (e.g. a cancellation alert) sometimes failed to deliver (#591)
- Joining a second barn with an invite link could fail if you already had an account (#887)
- A lesson's fee couldn't be edited unless it was switched off its fee tier first (#740)
- A read notification could flip back to unread the next time you logged in (#742)
- Saving a blank lesson tier name silently failed with no error shown (#743)
- Riders couldn't cancel their own spot in a group lesson (#747)
- Phone number fields accepted any input, with no format check (#755)
- A horse's exertion bar and its position in the Horses list sort could disagree (#936)
- Lease/boarding rows on the Outstanding page weren't clickable through to the agreement (#931)

---

## v2.0.4 — July 2026

**Fixed document uploads failing for files over 1 MB.** You can now upload horse, trainer, and rider documents up to 4.5 MB (previously some uploads over 1 MB would fail with a confusing error, due to a mismatch between our app's limit and Vercel's own cap). Upload errors now show a clear message on the page instead of a blank crash.

---

## v2.0.3 — July 2026

**Streamlined behind-the-scenes database setup files.** No user-facing changes.

---

## v2.0.2 — June 2026

**Fixed an issue that prevented automated tests from running correctly.** No user-facing changes.

---

## v2.0.1 — June 2026

**You can now add riders before they have an account.** On the Members page, use the new **Add Rider** form to create a rider record right away — no sign-in required. Add them to lessons immediately, then share their personal invite link when you're ready. When they tap the link and sign in, their account links automatically and all lesson history carries over. Use **Revoke** to invalidate and regenerate a link if it's shared with the wrong person.

---

## v2.0.0 — June 2026

### Profile & Contact Info

- **Profile page.** Update your name, phone number, and emergency contact from the avatar menu → Profile.
- **Contact fields required.** New members are asked to complete their contact info before accessing the barn. A notification reminds you if any fields are still missing.

### Notifications

- **Notification bell in the nav bar.** A bell icon shows an unread count badge. Click it to see recent alerts and mark them read.
- **Alerts include:** outstanding payment reminders, pending approval requests (managers), incomplete profile warnings, and lesson cancellation alerts.

### Dashboard

- **Upcoming lessons cards.** The dashboard now shows your next 7 days of lessons as cards — upcoming lessons you're teaching (trainers), enrolled in (riders), or scheduled at the barn (managers).
- **Lesson times shown in your local time zone.**
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

- **Horses and Manage Horses merged.** All roles now use a single Horses page. The page shows three sections: Available, Unavailable, and Inactive (managers only). Horses appear as cards, sorted automatically by recent exertion (lowest first).
- **Simpler status control (managers).** The horse detail page has a single form: pick Active, Unavailable (and enter a reason), or Inactive — then click Save once.
- **Horse documents visible to trainers.** Trainers can see and upload horse documents from the horse detail page. Managers can upload and delete.

### Lessons

- **Trainers can edit their own lessons.** An Edit button appears on lesson detail pages for lessons the trainer instructed.
- **Filter lessons by person.** Trainers see a pill row to filter by rider. Managers see a two-level filter: first choose "All," "By Trainer," or "By Rider," then pick a specific person.
- **Tier defaults pre-fill the lesson form.** When you select a fee tier, the lesson form pre-fills the price, exertion level, and jumping field with the tier's defaults (if set).
- **Lesson notes editing moved to Edit Lesson.** Horse notes and rider notes can only be edited on the Edit Lesson page. The lesson detail page shows them read-only. Trainers and managers can also leave private notes on a rider that the rider cannot see.
- **Navigation warning.** If you navigate away from a lesson edit with unsaved changes, you'll be asked to confirm before leaving.

### Members & Documents

- **Members page.** A full Members list is now available to managers and trainers. Managers see Managers, Trainers, and Riders sections. Trainers see Riders.
- **Member detail page.** Click a member's card to see their profile and documents.
- **Document uploads for managers.** Manager accounts support document uploads, the same as trainers and riders.
- **"Other" document type.** When uploading a document for a horse, trainer, or rider, you can now choose "Other" as the type.
- **Cleaner document list.** Uploaded documents appear in a table with a clearly labeled upload button.

### Finances

- **Outstanding income shown first (managers).** Unpaid past lessons appear above the collected income summary. Trainers and riders can also view their own outstanding lessons from the Finances page.
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
- A navigation bar on every barn page that shows different links depending on your role
- Sign-out for all roles
- Users who aren't signed in or haven't been approved are redirected to the login page

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
