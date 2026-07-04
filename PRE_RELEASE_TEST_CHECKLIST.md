# Pre-Release Test Checklist

Manual smoke test of all barn workflows against the dev environment. Run the phases **in order** — later phases depend on data created in earlier ones. Every UI route in `ARCHITECTURE.md` is covered at least once (see [Route coverage](#route-coverage) at the bottom).

Paths below are relative — prepend your app origin (local `npm run dev` or Vercel preview URL).

## Prerequisites

- [ ] `.env.local` at repo root with `DEV_EMAIL`, `DEV_NAME` (must be "First Last" — a single word breaks the name prompt in Phase 1), `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (optionally `DEV_BARN` — only `seed-account.sh` in Phase 1 defaults it to `dev-barn`; `change-user.sh` in Phases 5–7 has no default and requires it set or typed manually)
- [ ] App running (dev server or Vercel preview) and reachable in a browser
- [ ] A **secondary Google account** (not `DEV_EMAIL`) available for the stub-claim step in Phase 2 — one Google account can only claim one managed stub
- [ ] Email provider enabled in the Supabase dashboard (required by `seed-test-barn.sh` in Phase 7)

## Phase 1 — Setup

- [ ] Reset and reseed the dev database:

  ```bash
  bash scripts/reset-db.sh
  ```

  This chains `seed-account.sh`, which prompts for **First name**, **Last name**, and **Barn slug** — each pre-filled from `.env.local` (`DEV_NAME`, `DEV_BARN`), so press **Enter** through all three to accept the defaults. Then, at `reset-db.sh`'s own `Press Enter when logged in, or Escape to skip role selection:` prompt, press **Escape** — you stay manager for now.
- [ ] The script prints `Invite path: /barn/dev-barn/login?token=<uuid>` — open that path on your app origin
- [ ] The `/barn/dev-barn/login` page shows the **"Keep me logged in"** checkbox (checked by default) — sign in with the **`DEV_EMAIL`** Google account
- [ ] You are redirected to `/profile/complete` (fresh claimed stub has no contact info)
- [ ] Fill in phone, emergency contact name, and emergency contact phone → Save → you land in the app as manager of Dev Barn
- [ ] Shrink the browser below 768px wide — the nav bar's section links disappear and a ☰ button appears; tapping it opens a left drawer listing the same links, which closes on link tap, backdrop tap, and Escape; the bell icon now sits to the left of the avatar (reversed from desktop's avatar-then-bell order)

**Seeded baseline after reset** (expect this data alongside anything you create below): trainers Alex, Blake, Casey; riders Dana, Emery, Finley; pending rider Quinn Pending; second manager Morgan Manager; horses Apple, Butter, Clover; horse Willow (retired/inactive with 2 past lessons — will not appear in the horse picker or the Horses page's Available/Unavailable sections, only visible to managers under Inactive); tiers Normal Tier ($100, default) and Premium Tier ($150); ~36 lessons spread over the past 3 months (some paid, one group per five, some jumping, 5 upcoming).

## Phase 2 — Manager seeding

Lesson tiers (`/barn/dev-barn/settings` → Add Tier → `/barn/dev-barn/settings/tiers/new`):

- [ ] Create tier **Beginner** — $60, default exertion level 2, jumping off
- [ ] Create tier **Advanced** — $120, default jumping on
- [ ] Create tier **Group Special** — $90, no defaults
- [ ] All three appear in the Lesson Tiers list on the settings page

Horses (`/barn/dev-barn/horses`, inline Add Horse form in the page header):

- [ ] Create horses **Daisy**, **Eclipse**, and **Flint**
- [ ] Open Daisy's detail page → set status pill to **Unavailable**, enter reason "Thrown shoe" → Save
- [ ] Horses page now shows Daisy under **Unavailable** with the reason visible

Agreements (`/barn/dev-barn/agreements?kind=lease` and `?kind=board`):

- [ ] **Leases** in the nav opens the lease-kind list; **Add Lease** → select rider Dana, horse Apple, fee $150, cadence Monthly, start date today → Save
- [ ] **Boarding** in the nav opens the board-kind list; **Add Boarding** → select rider Emery, horse Butter — fee is pre-filled from the barn's default board fee → Save
- [ ] Both agreements appear in their respective kind-scoped lists with rider, horse, fee, and **Active** status
- [ ] Open the lease's **Edit** page → rider, horse, start date, and cadence are read-only; change the fee → Save → new fee reflected in the list
- [ ] Open the lease's **View** page → shows rider, horse, fee, cadence, and status, plus a charges table with the first auto-generated charge
- [ ] On that charge row, select a **Payment Type** → page refreshes and the selection persists; edit the **Fee** field and blur → new amount persists after refresh
- [ ] **End Agreement** on the boarding agreement (confirm the browser prompt) → it now shows **Ended** in the Boarding list

Managed rider stubs (`/barn/dev-barn/members`, inline Add Rider form in the Riders section):

> The UI creates managed **rider** stubs only. Trainer stubs cannot be created from the UI — the trainer phase (Phase 5) uses the seeded trainers via `change-user.sh` instead.

- [ ] Create managed riders **Gale Test**, **Harper Test**, and **Indigo Test** — each row shows an **Unlinked** badge with **Copy invite** and **Revoke** buttons
- [ ] Click **Copy invite** on Gale Test → in a browser where you're signed in to your **secondary Google account** (or logged out), open the copied URL (`/barn/dev-barn/login?token=<uuid>`) and sign in with the secondary account
- [ ] The secondary account is redirected to `/profile/complete` — fill contact fields and save → lands in Dev Barn as rider Gale Test
- [ ] Back as manager: Gale Test's row no longer shows the Unlinked badge and now links to a member detail page
- [ ] Click **Revoke** on Harper Test → click **Copy invite** again → the copied URL contains a **different** token than before

## Phase 3 — Manager lesson entry

All via `/barn/dev-barn/lessons/new`. Times entered here should display later in 12-hour AM/PM format.

Past month (previous calendar month):

- [ ] Lesson 1: Beginner tier, trainer Alex, rider Dana, horse Apple
- [ ] Lesson 2: Advanced tier, trainer Blake, rider Emery, horse Butter

Current month (past dates where possible):

- [ ] Lesson 3: Beginner tier, trainer Alex, rider Dana, horse Clover — after saving, mark it **paid** (set a payment type)
- [ ] Lesson 4: **Group** lesson — Group Special tier, trainer Blake, riders Dana + Emery, horse Butter
- [ ] Lesson 5: Advanced tier with **jumping** on, trainer Casey, rider Finley, horse Apple
- [ ] Lesson 6: Normal Tier, trainer Alex, rider Gale Test, horse Clover (leave unpaid)

Future:

- [ ] Lesson 7: next week, Beginner tier, trainer Alex, rider Dana, horse Apple
- [ ] Lesson 8: next week, Premium Tier, trainer Blake, rider Emery, horse Eclipse
- [ ] Daisy (Unavailable) appears **disabled** in the horse picker while creating lessons

## Phase 4 — Manager verification

Dashboard (`/barn/dev-barn`):

- [ ] Upcoming-lessons preview shows lessons in the next 7 days
- [ ] Pending-requests badge is visible (Quinn Pending) and links to settings

Lessons (`/barn/dev-barn/lessons`):

- [ ] Recent lessons (last 7 days) shown immediately; older lessons appear only after the older-lessons toggle
- [ ] Filter pills show `All | By Trainer | By Rider | By Horse`; picking **By Trainer → Alex** shows only Alex's lessons and the URL carries `?filter=trainer&id=<uuid>`
- [ ] **By Rider → Dana** filters correctly
- [ ] **By Horse → Apple** filters correctly
- [ ] Times display in 12-hour AM/PM format everywhere (no military time)
- [ ] Open a lesson's detail page (`/barn/dev-barn/lessons/[id]`) — horse notes and rider notes render read-only; Edit link visible
- [ ] Edit a lesson (`/barn/dev-barn/lessons/[id]/edit`) — change the fee, save, verify the change on the detail page
- [ ] Edit the group lesson (Lesson 4) → switch type to normal → a downgrade warning asks you to pick one rider/horse to keep (cancel without saving)
- [ ] Delete one seeded lesson — it disappears from the list
- [ ] On a lesson's detail page, click **Cancel** next to a rider's name → confirm with **Cancelled by Rider** on a lesson >24h out → fee is unaffected on far-out lessons but zeroed on a lesson booked <24h away; that rider shows a **Cancelled** badge and the rest of the lesson is unaffected
- [ ] Repeat with **Cancelled by Instructor** → fee is zeroed regardless of timing

Expenses (`/barn/dev-barn/expenses`):

- [ ] Nav shows **Expenses** between Lessons and Horses
- [ ] Seeded expenses render, split into recent and older (**Show older expenses** toggle), including at least one future-dated planned expense with no amount
- [ ] Add a new expense (`/barn/dev-barn/expenses/new`): enter a recipient seen before (e.g. "Dr. Hoof Farrier") and tab out — Expense Type auto-fills and flashes; leave amount blank to save a planned expense, then re-open the form later and fill it in
- [ ] Check **Entire Barn** on the new-expense form — horse checkboxes disable; save and verify the row shows "Entire Barn" instead of specific horses
- [ ] Delete one seeded expense — it disappears from the list
- [ ] Trainer and rider logins do not see the Expenses nav link and are redirected away from `/barn/dev-barn/expenses` if visited directly

Horses (`/barn/dev-barn/horses` and `/barn/dev-barn/horses/[id]`):

- [ ] Available section sorted by total exertion ascending; cards show exertion, lesson count, jumping count (7d)
- [ ] Open Apple's detail page → rename it via the manager form → Save → name updates
- [ ] Documents section: upload a PDF to a horse, open it via its link (signed URL), then delete it

Members (`/barn/dev-barn/members` and `/barn/dev-barn/members/[membership_id]`):

- [ ] "You" card plus Managers (Morgan, own entry excluded), Trainers, and Riders sections all render
- [ ] `/barn/dev-barn/riders` redirects to `/barn/dev-barn/members`
- [ ] Open a trainer's member detail page → upload a document → it lists with a working link → delete it
- [ ] Open rider Gale Test's member detail page — document upload form is available (manager can manage rider docs)

Finances (`/barn/dev-barn/finances`):

- [ ] **Outstanding** section lists past unpaid lessons; set a payment type on one row via the inline dropdown → it leaves the outstanding list
- [ ] "View all outstanding" → `/barn/dev-barn/finances/outstanding` lists all barn outstanding lessons, each row linking to its lesson
- [ ] Month navigation `←`/`→` works and updates `?month=YYYY-MM`; navigate to the previous month and see Lessons 1–2 reflected
- [ ] **By Tier** tab: your new tiers and seeded tiers listed with price, lesson count, subtotal
- [ ] **By Horse** tab: collected income per horse; click a horse → drill-down `/barn/dev-barn/finances/horses/[id]` with per-lesson splits; total matches the summary; month param preserved
- [ ] **By Rider** tab: same, with drill-down `/barn/dev-barn/finances/riders/[id]`
- [ ] **By Trainer** tab: collected income per trainer full name
- [ ] Collected vs Pending income figures are consistent with what you marked paid

Manage Barn (`/barn/dev-barn/settings`):

- [ ] Invite Link section shows a copyable barn invite link
- [ ] **Approve** Quinn Pending under Pending Requests → Quinn moves to Active Members
- [ ] **Remove** Quinn from Active Members
- [ ] Toggle `can_instruct` on for a rider → they appear in the instructor dropdown on the new-lesson form; toggle it back off
- [ ] Edit a tier (`/barn/dev-barn/settings/tiers/[id]`): change its price → Save
- [ ] Set a different tier as **default** → new-lesson form pre-selects it
- [ ] **Deactivate** the Group Special tier → it no longer appears when creating a lesson; **reactivate** it

Notifications and profile:

- [ ] Notification bell shows an unread-count badge; opening it lists notifications with title/body/timestamp
- [ ] **Mark all read** clears the badge
- [ ] Avatar menu → **Profile** (`/profile?barn=dev-barn`): barn nav bar renders; edit phone → Save → redirected back to the barn
- [ ] Avatar menu → **User Guide** (`/barn/dev-barn/guide`) renders the manager guide

Mobile spot-check (resize the browser to ~390px wide, or use your browser's device toolbar):

- [ ] Nav bar and its dropdowns (avatar menu, notification bell) remain usable — reachable and dismissible by tap, with no reliance on hover
- [ ] Lessons and Horses lists stay readable without horizontal scrolling

## Phase 5 — Trainer

Switch role (interactive):

```bash
bash scripts/change-user.sh
```

> First prompt is **Barn slug** — type `dev-barn` if `DEV_BARN` isn't set in `.env.local` (unlike `seed-account.sh`, this script has no built-in default and errors on a blank input). Then pick **Alex** from the profile list — this list is global (every profile, not barn-scoped), so pick carefully.
>
> `change-user.sh` copies the selected user's role onto your `DEV_EMAIL` membership and reassigns their lessons to you — you stay logged in as yourself. Refresh the page after it runs.

- [ ] Nav shows only: barn name, Lessons, Horses, Members, Guide — **no Finances, no Manage Barn, no Leases, no Boarding, no Expenses**
- [ ] `/barn/dev-barn/expenses` is blocked (redirect) if visited directly
- [ ] Lessons list shows only lessons where you (Alex) are the instructor; filter pills show riders only (`All | <rider> | ...`)
- [ ] Create 2 lessons via `/barn/dev-barn/lessons/new` — the instructor field is locked to you
- [ ] Edit one of your own lessons — the instructor field is **read-only**
- [ ] Open one of Blake's lessons by direct URL (`/barn/dev-barn/lessons/[id]`) — no Edit link is shown, and navigating to its `/edit` URL directly does not let you save changes
- [ ] On one of your own lessons, cancel a rider's spot — works the same as manager; on Blake's lesson, the per-rider Cancel link is not shown
- [ ] Horse detail page: documents are listed with working links, upload works, but there is **no delete** button
- [ ] Members page shows the Riders section only; open your own member detail page and upload a document
- [ ] `/barn/dev-barn/finances` is blocked (redirect); `/barn/dev-barn/finances/outstanding` works and shows **only your own** outstanding lessons

## Phase 6 — Rider

Switch role (pick **Dana** from the list — same `Barn slug` prompt as Phase 5):

```bash
bash scripts/change-user.sh
```

- [ ] Nav shows only: barn name, Lessons, Horses, Guide — **no Members link, no Leases, no Boarding, no Expenses**
- [ ] `/barn/dev-barn/expenses` is blocked (redirect) if visited directly
- [ ] Dashboard upcoming-lessons preview shows only lessons Dana is enrolled in
- [ ] Lessons list shows only Dana's enrolled lessons, with **no filter pills**
- [ ] Open an enrolled lesson's detail page — own rider notes visible read-only; **no private notes** shown
- [ ] Cancel your own spot in an enrolled lesson (from the Lessons list, Dashboard, or the lesson detail page) → your row shows a **Cancelled** badge on the list, Dashboard, and detail page; the rest of the lesson (and other riders in a group lesson) is unaffected
- [ ] `/barn/dev-barn/finances` is blocked (redirect)
- [ ] `/barn/dev-barn/finances/outstanding` shows only Dana's outstanding lessons
- [ ] `/barn/dev-barn/members` shows only the "You" card — no Managers/Trainers/Riders management sections

## Phase 7 — Multi-barn

Restore yourself to manager first (pick **your own name** from the list — same `Barn slug` prompt as Phase 5):

```bash
bash scripts/change-user.sh
```

Create a second barn:

```bash
bash scripts/seed-test-barn.sh test-barn-checklist
```

> **Caution:** `reset-db.sh` (Phase 1) wipes **all** barns project-wide, not just Dev Barn. If you need to restart this checklist from the top after this point, re-running it will also delete `test-barn-checklist`.

- [ ] As `DEV_EMAIL`, open `/barn/test-barn-checklist/register` → request access as **rider** → redirected to the pending page
- [ ] In a private/incognito window, sign in at `/barn/test-barn-checklist/login` as `manager@test-barn-checklist.e2e` / `TestPass123!` → approve the pending request in Manage Barn → sign out
- [ ] Back as `DEV_EMAIL`: the nav barn name now has a caret — the **BarnSwitcher** dropdown lists both barns, current one checkmarked; clicking the other navigates to its dashboard
- [ ] At a mobile viewport (~390px wide, or your browser's device toolbar), the BarnSwitcher caret is still tappable (≥44px target) and the dropdown behaves the same as desktop
- [ ] Visit `/barns` — one card per membership showing role, each linking to its barn
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
| `/barn/[slug]/riders` (redirect) | Phase 4 |
| `/barn/[slug]/finances` | Phases 4, 5, 6 |
| `/barn/[slug]/finances/outstanding` | Phases 4, 5, 6 |
| `/barn/[slug]/finances/horses/[id]` | Phase 4 |
| `/barn/[slug]/finances/riders/[id]` | Phase 4 |
| `/barn/[slug]/settings` | Phases 2, 4, 7 |
| `/barn/[slug]/settings/tiers/new` | Phase 2 |
| `/barn/[slug]/settings/tiers/[id]` | Phase 4 |
| `/barn/[slug]/guide` | Phase 4 |
| `/profile` | Phase 4 |
| `/profile/complete` | Phases 1, 2 |
