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

- [ ] (e2e: visiting_demo_in_a_fresh_browser_renders_a_spinner) In a fresh/incognito browser (no existing session), visit `/demo` — a spinner renders (requires `DEMO_USER_EMAIL`/`DEMO_USER_PASSWORD` in `.env.local`, from `scripts/setup-demo-user.sh` — `/demo` 404s if unset)
- [ ] (e2e: the_demo_page_renders_an_explore_stable_state_heading) That page renders an "Explore Stable State" heading
- [ ] (e2e: the_demo_flow_lands_in_a_new_demo_barn) After the spinner, you land in a new `/barn/demo-.../` barn
- [ ] (e2e: the_demo_visitor_holds_manager_in_the_demo_barn) You hold **manager** in that demo barn
- [ ] (e2e: visiting_demo_again_in_the_same_browser_resumes_the_same_barn) Visiting `/demo` again in the same browser resumes the same demo barn (same URL) instead of creating a new one
- [ ] (manual, after-suite — needs the app restarted under different server env, which a spec cannot do to the server under test; that restart also kills a suite driving the same origin, and leaves `dev-barn` unbrowsable until the env is put back) With `DEMO_USER_EMAIL` set but `DEMO_USER_PASSWORD` unset, visit `/demo` — you land on `/login`
- [ ] (manual, after-suite — same env restart as the line above) That `/login` page carries a "demo is unavailable" message rather than arriving on a blank redirect
- [ ] (e2e: the_reset_demo_cron_route_rejects_a_request_with_no_authorization_header) `curl -X POST /api/cron/reset-demo` with **no** `Authorization` header — response is `401`
- [ ] (e2e: the_reset_demo_cron_route_rejects_a_wrong_authorization_header) The same request with a **wrong** `Authorization` header — response is `401`
- [ ] (e2e: the_reset_demo_cron_route_reaps_a_backdated_demo_barn) With `CRON_SECRET` set in `.env.local` and a demo barn from the step above manually backdated (`update barns set created_at = now() - interval '7 hours' where slug = '...'`), `curl -X POST /api/cron/reset-demo -H "Authorization: Bearer <CRON_SECRET>"` — response is `{"reaped":1}` (or more). A spec backdates `barns.created_at` with its own service client.
- [ ] (e2e: a_reaped_demo_barn_no_longer_resolves_at_its_url) After that curl, the reaped barn no longer resolves at its old `/barn/demo-.../` URL
- [ ] (e2e: the_demo_barn_dashboard_shows_a_data_reset_banner) On the demo barn's dashboard, a banner reads "This is a demo barn. Data resets at approximately [time]."
- [ ] (e2e: the_demo_barn_dashboard_banner_renders_amber) That banner renders amber
- [ ] (e2e: the_nav_renders_the_demo_barn_name_with_a_demo_suffix) In the nav, the demo barn's name renders as "{name} (DEMO)"
- [ ] (e2e: the_nav_demo_barn_name_renders_amber) That nav name renders amber
- [ ] (e2e: the_user_menu_hides_the_profile_link_for_the_demo_user) The user menu does not show a **Profile** link while signed in as the demo user
- [ ] (e2e: visiting_profile_as_the_demo_user_redirects_away) Visiting `/profile` directly while signed in as the demo user redirects to `/`
- [ ] (manual, before-suite — a spec cannot drive it, and neither can anything else run alongside it: `reset-db.sh` wipes every barn in the dev project, so it destroys the suite's fixtures as readily as its own. It also deletes every auth user, the demo one included, so `scripts/setup-demo-user.sh` has to be re-run — see the Prerequisites — before the suite launches) Reset and reseed the dev database:

  ```bash
  bash scripts/reset-db.sh
  ```

  This chains `seed-account.sh`, which prompts for **First name**, **Last name**, and **Barn slug** — each pre-filled from `.env.local` (`DEV_NAME`, `DEV_BARN`), so press **Enter** through all three to accept the defaults.
- [ ] (manual, before-suite — this is the stdout of the `reset-db.sh` run above, read at the moment that command runs, so it is manual and `before-suite` for the same reasons) The script prints `Invite path: /barn/dev-barn/register?token=<uuid>`
- [ ] (e2e: opening_an_invite_link_with_no_session_redirects_to_the_barn_login_page) Open that path on your app origin (no existing session) — it redirects to `/barn/dev-barn/login?token=<uuid>`
- [ ] (e2e: the_barn_login_page_shows_a_keep_me_logged_in_checkbox) The `/barn/dev-barn/login` page shows the **"Keep me logged in"** checkbox
- [ ] (e2e: the_keep_me_logged_in_checkbox_is_checked_by_default) That checkbox is checked by default
- [ ] (manual — a real Google OAuth consent flow; the suite's logins are password-based) Sign in with the **`DEV_EMAIL`** Google account — you are redirected to `/profile/complete` (fresh claimed stub has no contact info)
- [ ] (e2e: saving_the_contact_fields_on_profile_complete_lands_in_the_app) Fill in phone, emergency contact name, and emergency contact phone → Save → you land in the app. A spec reaches `/profile/complete` from a seeded membership whose profile has blank contact fields, rather than through the OAuth sign-in above
- [ ] (e2e: the_claimed_invite_holds_manager_in_the_barn) You hold **manager** in Dev Barn

> **Mobile viewport:** the block below is automated by `e2e/checklist-phase1-nav-responsive.spec.ts`, which runs on the `@manager` project and puts the drawer half under a per-describe `test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })` (#1423). It does **not** ride the `@mobile` project, and that was the choice rather than the default: these thirteen lines span two widths — the three desktop-nav-bar highlighting lines are explicitly about the desktop nav bar — so Pixel 5 would either dispatch the whole file a second time and seed a second barn, or render the desktop half through Chromium's `isMobile` meta-viewport emulation, which is not what those lines are about. Same call Phase 4's Mobile spot-check made (`checklist-phase4-notifications-profile.spec.ts`), and the spec's header note 1 carries the full reasoning. A test whose claim is *"at this width"* must read `page.viewportSize()!.width` in its own expectation, or it passes at 1280×800 too (`e2e/CLAUDE.md` fact 6, #1207) — every test in that spec does.

- [ ] (e2e: below_the_md_breakpoint_the_desktop_nav_section_links_are_hidden) Shrink the browser below 768px wide — the nav bar's section links disappear
- [ ] (e2e: below_the_md_breakpoint_a_hamburger_button_appears) At that width a ☰ button appears
- [ ] (e2e: tapping_the_hamburger_opens_a_left_drawer) Tapping ☰ opens a left drawer
- [ ] (e2e: the_drawer_lists_the_same_links_the_desktop_nav_bar_carries) That drawer lists the same links the desktop nav bar carries
- [ ] (e2e: the_drawer_closes_when_a_link_in_it_is_tapped) The drawer closes on link tap
- [ ] (e2e: the_drawer_closes_when_the_backdrop_is_tapped) The drawer closes on backdrop tap
- [ ] (e2e: the_drawer_closes_on_escape) The drawer closes on Escape
- [ ] (e2e: at_mobile_width_the_bell_sits_to_the_left_of_the_avatar) The bell icon sits to the left of the avatar at this width (reversed from desktop's avatar-then-bell order)
- [ ] (e2e: the_desktop_nav_bar_highlights_lessons_on_the_lessons_list) **Lessons** is bolded/highlighted in the desktop nav bar while on `/barn/dev-barn/lessons`
- [ ] (e2e: the_desktop_nav_bar_keeps_lessons_highlighted_on_a_lesson_detail_page) It stays bolded/highlighted in that nav bar on a nested page like `/barn/dev-barn/lessons/[id]`
- [ ] (e2e: the_drawer_highlights_lessons_on_the_lessons_list) **Lessons** is bolded/highlighted in the drawer while on `/barn/dev-barn/lessons`
- [ ] (e2e: the_drawer_keeps_lessons_highlighted_on_a_lesson_detail_page) It stays bolded/highlighted in the drawer on a nested page like `/barn/dev-barn/lessons/[id]`
- [ ] (e2e: the_desktop_nav_bar_leaves_the_other_links_unhighlighted) Other links stay unhighlighted

**The global error boundary has no line here, deliberately** (#1561 — three lines, then one, then none; don't re-add one). `src/app/__tests__/error.test.tsx` asserts the heading, the absent stack trace and the **Try again** reset, and nothing a manual walk can do adds to that: the file existing at `src/app/error.tsx` taking `{error, reset}` *is* the whole App Router registration, that test imports it so a rename turns CI red, and a missing `'use client'` fails `next build` and so breaks the Vercel deploy rather than reaching prod. The residue — a real SSR throw reaching the boundary — is framework behaviour, and it cost a production build, a source edit and a mid-run server restart to claim, with a `throw new Error('smoke test')` left in a page as its own worst outcome. The gap likeliest to actually bite was never covered by any of the three: a throw in the root *layout* bypasses a sibling `error.tsx` and needs `global-error.tsx`.

Doc review — read either the page or its repo-root markdown file; they are the same content by construction:

Both pages read that file at request time and render it through `ReactMarkdown` (`src/app/privacy/page.tsx:14,31`). Deliberately unscoped: the line asks for a review and you decide how deep it needs to go.

- [ ] (manual — a doc-accuracy judgement against what actually shipped; no click path asserts that prose is still true) `/terms` still describes what the app does — `TERMS_OF_SERVICE.md`
- [ ] (manual — same judgement, and `CLAUDE.md`'s Privacy Policy section names the change classes that most often invalidate it) `/privacy` still describes what the app collects, stores and shares — `PRIVACY_POLICY.md`

**Seeded baseline after reset** (expect this data alongside anything you create below): trainers Alex, Blake, Casey; riders Dana, Emery, Finley; second manager Morgan Manager; horses Apple, Butter, Clover; horse Willow (retired/inactive with 3 past lessons + 1 upcoming — will not appear in the horse picker or the Horses page's Available/Unavailable sections, only visible to managers under Inactive); horse Hazel (available-flag off, reason "Recovering from minor injury", feed notes but no medication notes — the Horses page lists it under Unavailable); horse Juniper (#1413's calendar-band fixture: exhaustion thresholds lowered to 3/8 and four upcoming lessons, so the New Lesson form's month calendar has an amber day, a red day and a tinted next-month day to compare); tiers Normal Tier ($100, default) and Premium Tier ($150); ~38 lessons spread over the past 3 months (some paid, one group per five, some jumping, 5 upcoming).
