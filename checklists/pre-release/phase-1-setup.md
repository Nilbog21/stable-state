# Phase 1 — Setup

<!-- Asserting role: role-agnostic setup — an unauthenticated visitor, then the shared demo user, then the developer's own account pre-membership and as its manager. -->

> Conventions, phase partitioning, automation tags, and route coverage: [`PRE_RELEASE_TEST_CHECKLIST.md`](../../PRE_RELEASE_TEST_CHECKLIST.md)

- [ ] Visit `/login` — a **Terms of Service** link is present
- [ ] Clicking the link opens `/terms`
- [ ] The `/terms` page renders the drafted terms content
- [ ] Visit `/login` — a **Privacy Policy** link is present
- [ ] Clicking the link opens `/privacy`
- [ ] The `/privacy` page renders the drafted privacy policy content
- [ ] In a fresh/incognito browser (no existing session), visit `/demo` — a spinner and "Explore Stable State" heading render, then you land in a new `/barn/demo-.../` barn as its manager (requires `DEMO_USER_EMAIL`/`DEMO_USER_PASSWORD` in `.env.local`, from `scripts/setup-demo-user.sh` — `/demo` 404s if unset)
- [ ] Visiting `/demo` again in the same browser resumes the same demo barn (same URL) instead of creating a new one
- [ ] With `DEMO_USER_EMAIL` set but `DEMO_USER_PASSWORD` unset, visit `/demo` — you land on `/login` with a "demo is unavailable" message instead of a blank redirect
- [ ] `curl -X POST /api/cron/reset-demo` with a missing or wrong `Authorization` header — response is `401`
- [ ] With `CRON_SECRET` set in `.env.local` and a demo barn from the step above manually backdated (`update barns set created_at = now() - interval '7 hours' where slug = '...'`), `curl -X POST /api/cron/reset-demo -H "Authorization: Bearer <CRON_SECRET>"` — response is `{"reaped":1}` (or more)
- [ ] After that curl, the reaped barn no longer resolves at its old `/barn/demo-.../` URL
- [ ] On the demo barn's dashboard, an amber banner reads "This is a demo barn. Data resets at approximately [time]."
- [ ] In the nav, the demo barn's name renders as "{name} (DEMO)" in amber
- [ ] The user menu does not show a **Profile** link while signed in as the demo user
- [ ] Visiting `/profile` directly while signed in as the demo user redirects to `/`
- [ ] Reset and reseed the dev database:

  ```bash
  bash scripts/reset-db.sh
  ```

  This chains `seed-account.sh`, which prompts for **First name**, **Last name**, and **Barn slug** — each pre-filled from `.env.local` (`DEV_NAME`, `DEV_BARN`), so press **Enter** through all three to accept the defaults.
- [ ] The script prints `Invite path: /barn/dev-barn/register?token=<uuid>` — open that path on your app origin (no existing session, so it redirects to `/barn/dev-barn/login?token=<uuid>`)
- [ ] The `/barn/dev-barn/login` page shows the **"Keep me logged in"** checkbox (checked by default) — sign in with the **`DEV_EMAIL`** Google account
- [ ] You are redirected to `/profile/complete` (fresh claimed stub has no contact info)
- [ ] Fill in phone, emergency contact name, and emergency contact phone → Save → you land in the app as manager of Dev Barn
- [ ] Shrink the browser below 768px wide — the nav bar's section links disappear and a ☰ button appears
- [ ] Tapping ☰ opens a left drawer listing the same links
- [ ] The drawer closes on link tap
- [ ] The drawer closes on backdrop tap
- [ ] The drawer closes on Escape
- [ ] The bell icon sits to the left of the avatar at this width (reversed from desktop's avatar-then-bell order)
- [ ] **Lessons** is bolded/highlighted in the desktop nav bar while on `/barn/dev-barn/lessons` or a nested page like `/barn/dev-barn/lessons/[id]`
- [ ] **Lessons** is bolded/highlighted in the drawer under the same conditions
- [ ] Other links stay unhighlighted
- [ ] Temporarily `throw new Error('smoke test')` at the top of any page or Server Action, load it, then revert — confirm the global error boundary (`src/app/error.tsx`) renders "Something went wrong" with a working **Try again** button instead of a raw stack trace

**Seeded baseline after reset** (expect this data alongside anything you create below): trainers Alex, Blake, Casey; riders Dana, Emery, Finley; second manager Morgan Manager; horses Apple, Butter, Clover; horse Willow (retired/inactive with 3 past lessons + 1 upcoming — will not appear in the horse picker or the Horses page's Available/Unavailable sections, only visible to managers under Inactive); tiers Normal Tier ($100, default) and Premium Tier ($150); ~38 lessons spread over the past 3 months (some paid, one group per five, some jumping, 5 upcoming).
