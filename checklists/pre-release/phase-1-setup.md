# Phase 1 — Setup

<!-- Asserting role: role-agnostic — setup: an unauthenticated visitor, then the shared demo user, then the developer's own account pre-membership and as its manager. -->

> Conventions, phase partitioning, automation tags, and route coverage: [`PRE_RELEASE_TEST_CHECKLIST.md`](../../PRE_RELEASE_TEST_CHECKLIST.md)

> **Unauthenticated context:** no Playwright *project* supplies one — all four in `playwright.config.ts` bind a `storageState`. A spec gets one from `browser.newContext({ storageState: { cookies: [], origins: [] } })`, and only from that exact form: the `request` fixture and a bare `playwright.request.newContext()` both silently carry the auth cookie, so the wrong form passes for the wrong reason (`e2e/CLAUDE.md` fact 4, #1208; worked example in `checklist-phase4-calendar-feed.spec.ts`). That is a note, not a blocker — it applies to the six terms/privacy lines below, to the `/demo` and invite-redirect lines, and to the sign-out line at the end of Phase 7.

- [ ] (e2e: the_login_page_shows_a_terms_of_service_link) Visit `/login` — a **Terms of Service** link is present
- [ ] (e2e: clicking_the_terms_of_service_link_opens_the_terms_page) Clicking the link opens `/terms`
- [ ] (e2e: the_terms_page_renders_the_drafted_terms_content) The `/terms` page renders the drafted terms content
- [ ] (e2e: the_login_page_shows_a_privacy_policy_link) Visit `/login` — a **Privacy Policy** link is present
- [ ] (e2e: clicking_the_privacy_policy_link_opens_the_privacy_page) Clicking the link opens `/privacy`
- [ ] (e2e: the_privacy_page_renders_the_drafted_privacy_policy_content) The `/privacy` page renders the drafted privacy policy content

The `/demo` lines below are verdicted individually rather than as a block: they do not share an answer. Only the one needing the server restarted under different environment variables is out of a spec's reach — a fresh-context `/demo` visit and the `/api/cron/reset-demo` calls are ordinary Playwright work.

- [ ] (e2e-candidate) In a fresh/incognito browser (no existing session), visit `/demo` — a spinner renders (requires `DEMO_USER_EMAIL`/`DEMO_USER_PASSWORD` in `.env.local`, from `scripts/setup-demo-user.sh` — `/demo` 404s if unset)
- [ ] (e2e-candidate) That page renders an "Explore Stable State" heading
- [ ] (e2e-candidate) After the spinner, you land in a new `/barn/demo-.../` barn
- [ ] (e2e-candidate) You hold **manager** in that demo barn
- [ ] (e2e-candidate) Visiting `/demo` again in the same browser resumes the same demo barn (same URL) instead of creating a new one
- [ ] (manual — needs the app restarted under different server env, which a spec cannot do to the server under test) With `DEMO_USER_EMAIL` set but `DEMO_USER_PASSWORD` unset, visit `/demo` — you land on `/login`
- [ ] (manual — same env restart as the line above) That `/login` page carries a "demo is unavailable" message rather than arriving on a blank redirect
- [ ] (e2e-candidate) `curl -X POST /api/cron/reset-demo` with **no** `Authorization` header — response is `401`
- [ ] (e2e-candidate) The same request with a **wrong** `Authorization` header — response is `401`
- [ ] (e2e-candidate) With `CRON_SECRET` set in `.env.local` and a demo barn from the step above manually backdated (`update barns set created_at = now() - interval '7 hours' where slug = '...'`), `curl -X POST /api/cron/reset-demo -H "Authorization: Bearer <CRON_SECRET>"` — response is `{"reaped":1}` (or more). A spec backdates `barns.created_at` with its own service client. **Prerequisite for this line and the one below:** `CRON_SECRET` reaches the spec's `process.env`. It is in no `.env.local` today (it lives as a Vercel env var — `vercel.json` runs this route hourly), and `run-checklist-suite.sh` parses a fixed four-var list out of `.env.local` rather than sourcing it, so the slice adds the var *and* a pass-through for it. The two `401` lines above need neither: an unset `CRON_SECRET` still denies everyone (`src/app/api/cron/reset-demo/route.ts`)
- [ ] (e2e-candidate) After that curl, the reaped barn no longer resolves at its old `/barn/demo-.../` URL
- [ ] (e2e-candidate) On the demo barn's dashboard, a banner reads "This is a demo barn. Data resets at approximately [time]."
- [ ] (e2e-candidate) That banner renders amber
- [ ] (e2e-candidate) In the nav, the demo barn's name renders as "{name} (DEMO)"
- [ ] (e2e-candidate) That nav name renders amber
- [ ] (e2e-candidate) The user menu does not show a **Profile** link while signed in as the demo user
- [ ] (e2e-candidate) Visiting `/profile` directly while signed in as the demo user redirects to `/`
- [ ] (manual — a spec cannot drive it: `reset-db.sh` wipes every barn in the dev project, so a spec running it destroys its own fixtures mid-run) Reset and reseed the dev database:

  ```bash
  bash scripts/reset-db.sh
  ```

  This chains `seed-account.sh`, which prompts for **First name**, **Last name**, and **Barn slug** — each pre-filled from `.env.local` (`DEV_NAME`, `DEV_BARN`), so press **Enter** through all three to accept the defaults.
- [ ] (manual — a spec cannot drive it: this is the stdout of the `reset-db.sh` run above, which is manual for the same reason) The script prints `Invite path: /barn/dev-barn/register?token=<uuid>`
- [ ] (e2e-candidate) Open that path on your app origin (no existing session) — it redirects to `/barn/dev-barn/login?token=<uuid>`
- [ ] (e2e-candidate) The `/barn/dev-barn/login` page shows the **"Keep me logged in"** checkbox
- [ ] (e2e-candidate) That checkbox is checked by default
- [ ] (manual — a real Google OAuth consent flow; the suite's logins are password-based) Sign in with the **`DEV_EMAIL`** Google account — you are redirected to `/profile/complete` (fresh claimed stub has no contact info)
- [ ] (e2e-candidate) Fill in phone, emergency contact name, and emergency contact phone → Save → you land in the app. A spec reaches `/profile/complete` from a seeded membership whose profile has blank contact fields, rather than through the OAuth sign-in above
- [ ] (e2e-candidate) You hold **manager** in Dev Barn

> **Mobile viewport:** the `@mobile` project already supplies this width — Pixel 5 on the manager `storageState` (`playwright.config.ts`), exercised today by `dashboard_today_indicator_visible_on_current_day` (`checklist-phase4-dashboard.spec.ts`) — so the block below is tagging, not new-harness work. Whether these lines ride that project or take a per-describe `test.use` is the slice's call: Phase 4's Mobile spot-check chose `test.use` deliberately, because `@mobile` would have dispatched that whole mixed-role file a second time and seeded a second barn for four tests (`checklist-phase4-notifications-profile.spec.ts`) — a drawer-only spec doesn't carry that cost. A test whose claim is *"at this width"* must read `page.viewportSize()!.width` in its own expectation, or it passes at 1280×800 too (`e2e/CLAUDE.md` fact 6, #1207).

- [ ] (e2e-candidate) Shrink the browser below 768px wide — the nav bar's section links disappear
- [ ] (e2e-candidate) At that width a ☰ button appears
- [ ] (e2e-candidate) Tapping ☰ opens a left drawer
- [ ] (e2e-candidate) That drawer lists the same links the desktop nav bar carries
- [ ] (e2e-candidate) The drawer closes on link tap
- [ ] (e2e-candidate) The drawer closes on backdrop tap
- [ ] (e2e-candidate) The drawer closes on Escape
- [ ] (e2e-candidate) The bell icon sits to the left of the avatar at this width (reversed from desktop's avatar-then-bell order)
- [ ] (e2e-candidate) **Lessons** is bolded/highlighted in the desktop nav bar while on `/barn/dev-barn/lessons`
- [ ] (e2e-candidate) It stays bolded/highlighted in that nav bar on a nested page like `/barn/dev-barn/lessons/[id]`
- [ ] (e2e-candidate) **Lessons** is bolded/highlighted in the drawer while on `/barn/dev-barn/lessons`
- [ ] (e2e-candidate) It stays bolded/highlighted in the drawer on a nested page like `/barn/dev-barn/lessons/[id]`
- [ ] (e2e-candidate) Other links stay unhighlighted
- [ ] (manual — needs source edited to `throw new Error('smoke test')` and the app reloaded; a spec cannot patch the app under test) Temporarily `throw new Error('smoke test')` at the top of any page or Server Action and load it — the global error boundary (`src/app/error.tsx`) renders "Something went wrong"
- [ ] (manual — same source edit as the line above) That page shows no raw stack trace
- [ ] (manual — same source edit as the line above) That error boundary's **Try again** button works (then revert the thrown error)

**Seeded baseline after reset** (expect this data alongside anything you create below): trainers Alex, Blake, Casey; riders Dana, Emery, Finley; second manager Morgan Manager; horses Apple, Butter, Clover; horse Willow (retired/inactive with 3 past lessons + 1 upcoming — will not appear in the horse picker or the Horses page's Available/Unavailable sections, only visible to managers under Inactive); tiers Normal Tier ($100, default) and Premium Tier ($150); ~38 lessons spread over the past 3 months (some paid, one group per five, some jumping, 5 upcoming).
