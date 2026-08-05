# Phase 3 — Manager lesson entry

<!-- Asserting role: manager only. -->

> Conventions, phase partitioning, automation tags, and route coverage: [`PRE_RELEASE_TEST_CHECKLIST.md`](../../PRE_RELEASE_TEST_CHECKLIST.md)

All via `/barn/dev-barn/lessons/new`. Times entered here should display later in 12-hour AM/PM format. `reset-db.ts` seeds ~43 varied lessons across past/current/future dates, tiers, jumping, and exertion — only create the purpose-built lessons below; verify everything else against seeded data (including the seeded Custom-tier lesson).

- [ ] Create a **past lesson** (dated ~5 weeks ago, previous calendar month): Beginner tier, trainer Alex, horse Apple, rider Dana
- [ ] Try saving a lesson with a blank fee (Custom tier, no tier selected) — rejected with "fee is required"; in edit mode, blank fee is rejected too
- [ ] Select a named tier (e.g. Beginner) — fee field stays visible and editable, pre-filled with the tier's price; change the fee and save — lesson saves with the edited fee and keeps the tier's name (not "Custom")
- [ ] Create a **current-month paid lesson** (dated a few days ago, before today): Beginner tier, trainer Alex, horse Clover, rider Dana — after saving, mark it **paid**
- [ ] While creating it, pick a date and check Apple, Butter, and Clover in turn — each shows an exhaustion bar (no bars before a date is picked); adjust a checked horse's exertion level and watch its ghost segment move live, unchecked horses stay solid; change the date and confirm bars refresh
- [ ] Open this lesson's edit page afterward and confirm Clover's bar still renders (excluding the lesson itself from its own window)

**#1019 — month conflict calendar on the Date field.** All on `/barn/dev-barn/lessons/new` unless stated.

- [ ] (#1019) The Date field renders as a month calendar grid, not a native date box
- [ ] (#1019) Days before today are greyed out, making today the first fully-coloured day on the grid
- [ ] (#1019) With neither a horse nor a rider selected, no day is tinted
- [ ] (#1019) With neither a horse nor a rider selected, no day shows a dot
- [ ] (#1019) Select rider Dana and no horse — days where Dana already has a lesson are tinted
- [ ] (#1019) Still rider-only, no day shows a dot
- [ ] (#1019) Now also check horse Apple — the flat rider tint is replaced by exertion shading
- [ ] (#1019) A day where Apple already has a lesson shows a small red dot below the date number
- [ ] (#1019) A day shaded amber/red only by neighbouring days' lessons shows no dot
- [ ] (#1019) Check a second horse alongside Apple — a day loaded for either horse takes the heavier of the two shadings
- [ ] (#1019, #1021) Change the **Start Time** field in the day panel from an early hour to a late one — at least one day's shading shifts
- [ ] (#1019) Schedule a vet/farrier expense for Apple on a future day — **set a time and an amount on it** (#1148's Phase 5 checks in `phase-5-trainer.md` need both) — then reopen this form with Apple selected — that day shows a dot
- [ ] (#1147) Schedule a farrier expense on another future day with **Applies to all horses** checked, then reopen this form with Apple selected — that day shows a dot even though the expense names no horse
- [ ] (#1147) That barn-wide day's exertion shading is unchanged from before the expense was booked (an appointment is not a workload)
- [ ] (#1019) With Apple selected, a greyed-out past day shows no shading
- [ ] (#1019) With Apple selected, a greyed-out past day shows no dot
- [ ] (#1019, #1021) Tap a day that has a lesson on it — the day panel below the grid lists that day's items
- [ ] (#1019) That day panel shows each item's time in 12-hour AM/PM format
- [ ] (#1019) That day panel shows each item's horse and rider names
- [ ] (#1019) Tap a day with nothing on it — the day panel reads "Nothing scheduled for this day."
- [ ] (#1019) Tapping a day also selects it as the lesson's date (the tapped day gains a selection ring)
- [ ] (#1019) Tap **&gt;** — the grid advances one month
- [ ] (#1019) The **&lt;** / **&gt;** month arrows are the same size as the ones on the Finances page
- [ ] (#1019) After advancing a month, the new grid's shading reflects that month's lessons
- [ ] (#1019) A day carried in from the neighbouring month renders dimmed
- [ ] (#1019) That dimmed neighbouring-month day is still selectable
- [ ] (#1019) In **dark mode**, an amber day and a red day are clearly different colours from each other
- [ ] (#1019) In **dark mode**, the date number on a tinted neighbouring-month day is still readable
- [ ] (#1019) The popup opened by tapping a day in the calendar's first row does not cover that day
- [ ] (#1019) The exhaustion bar under a horse's checkbox uses the same amber/red as that horse's calendar shading
- [ ] (#1019) Check **Recurring (weekly)** — the calendar's field label changes to "Starting Date"
- [ ] (#1019) Manage Barn → Events → Add Event still uses a plain native date box, not the month calendar
- [ ] Create a **group lesson** (dated a few days ago): Group Special tier, trainer Blake, horse Butter, riders Dana + Emery — horse picker legend reads "Horses (select at least one)" (a Normal lesson reads plain "Horse", already exercised above)
- [ ] On any lesson form, set the fee to `0` — Payment Type field disappears; raise it back above `0` — field reappears
- [ ] Daisy (Unavailable) appears **disabled** in the horse picker
- [ ] Check one horse and confirm it jumps to the top of the list ahead of unchecked available horses (ordered least-to-most worked), Daisy sorted last; set the date/start time to the past — no bars render; set it back — bars reappear
- [ ] Check **Recurring (weekly)** — Date field label changes to "Starting Date" (reverts when unchecked); checkbox sits directly above the date field
- [ ] Create a **recurring lesson** (dated 7 days out): check **Recurring (weekly)**, Beginner tier, trainer Alex, horse Apple, rider Dana — saves; the checkbox doesn't appear when editing
- [ ] The recurring lesson shows a **Recurring** badge on the Lessons list row and its detail page
- [ ] Open its edit page — "part of a recurring series" indicator + **Stop Recurring Lessons** button appear; confirm, click Stop — both disappear on reload, the lesson itself keeps its Recurring badge
- [ ] Open Willow's seeded upcoming lesson's edit page — Willow (inactive) still appears checked, sorted first, still shows its bar; uncheck it — moves to the bottom (grouped with Unavailable), bar disappears

*(Dropped the manual "create a Custom-tier lesson" step from the original goals — that's now covered by #950's seed addition instead.)*
