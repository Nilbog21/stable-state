# Phase 7 — Multi-barn

<!-- Asserting role: manager — across two barns. Cross-barn isolation, not cross-role. -->

> Conventions, phase partitioning, automation tags, and route coverage: [`PRE_RELEASE_TEST_CHECKLIST.md`](../../PRE_RELEASE_TEST_CHECKLIST.md)

- [ ] (manual — a spec cannot drive it: a local shell script writing to the shared dev project with the service-role key from `.env.local`; a spec seeds its own second barn through the fixture noted below instead) Create a second barn — completes successfully:

  ```bash
  bash scripts/seed-test-barn.sh test-barn-checklist
  ```

> **Caution:** `reset-db.sh` (Phase 1) wipes **all** barns project-wide, not just Dev Barn. If you need to restart this checklist from the top after this point, re-running it will also delete `test-barn-checklist`.

> **The two-barn fixture every line below needs is `withSecondBarn`** (`e2e/support/test.ts`, #1415) — `withBarn`'s twin, called *after* it at module scope, keyed through `secondBarnKey` so neither barn's slug (nor the name `createBarn` derives from it) contains the other's, and torn down on its own `afterAll` so nothing leaks into the shared dev project. `checklist-phase7-cross-barn-isolation.spec.ts` and `checklist-phase7-multi-barn.spec.ts` both consume it unchanged; a new slice here should too rather than seeding a second barn by hand. **The two `(e2e-candidate)` lines immediately below are the exception and need only one barn** — `register/page.tsx` returns **Invite invalid** on a missing `?token=` before it reads the session or looks up a membership, so neither line reaches anything a second barn would change. **The mobile lines further down need no separate Playwright project**: `checklist-phase7-multi-barn.spec.ts` runs the whole phase on `@manager` and sets the width on the context it holds — the same call Phase 1's mobile note records for its own two-width block, with this file's extra reason (a second dispatch would re-seed both barns *and* mint a second throwaway login) in that spec's header note 3.

- [ ] (e2e: the_register_page_with_no_token_shows_invite_invalid) As `DEV_EMAIL`, open `/barn/test-barn-checklist/register` with no `?token=` → shows an "Invite invalid" message
- [ ] (e2e: the_register_page_with_no_token_shows_no_self_registration_form) That page shows no self-registration form

`DEV_EMAIL` already has a claimed profile from Phase 1 (`#887` — before that fix, claiming a second-barn invite as an already-claimed user threw an unhandled unique-violation on `profiles.user_id`; the merge fix now re-points the invite's membership onto the existing profile instead):

- [ ] (manual — a spec cannot drive it: `seed-account.sh` prompts on a TTY for first name, last name and barn slug) Run `bash scripts/seed-account.sh`, accepting the default first/last name, and enter `test-barn-checklist` as the barn slug — creates a fresh managed-manager stub invite in that barn and prints `Invite path: /barn/test-barn-checklist/register?token=<uuid>`
- [ ] (e2e: opening_the_second_barns_invite_while_signed_in_shows_a_join_confirmation) Open that invite path as `DEV_EMAIL` (already signed in elsewhere in this browser) — shows a "Join test-barn-checklist" confirmation
- [ ] (e2e: the_second_barns_join_confirmation_carries_an_accept_invite_button) That confirmation carries an **Accept Invite** button
- [ ] (e2e: the_second_barns_join_confirmation_shows_no_google_sign_in_button) That confirmation shows no Google sign-in button
- [ ] (e2e: accepting_the_second_barns_invite_lands_in_that_barn) Click **Accept Invite** → the claim succeeds and you land in **test-barn-checklist**
- [ ] (e2e: the_claimed_second_barn_membership_is_manager) You hold **manager** in that barn
- [ ] (e2e: the_second_barn_claim_produced_no_error_redirect) That claim produced no `?error=1` redirect
- [ ] (e2e: a_nested_route_after_the_second_barn_claim_does_not_bounce_to_its_login) From the nav bar, click into a nested route (e.g. **Lessons**) — no redirect to `/barn/test-barn-checklist/login` despite the valid session (`#1076` — `acceptInvite` previously never set the `barn_session_{slug}` cookie, so this bounced to login on the first non-dashboard route visited)
- [ ] (manual — `change-user.sh` is an interactive local shell script rewriting `barn_memberships` rows) Run `change-user.sh dev-barn` → pick your own name → restores your manager role in Dev Barn (undoing the Phase 5/6 role swaps)
- [ ] (e2e: the_nav_barn_name_gains_a_switcher_caret_once_a_second_barn_is_held) Back as `DEV_EMAIL`: the nav barn name now has a caret
- [ ] (e2e: the_barn_switcher_lists_both_barns) The **BarnSwitcher** dropdown lists both barns
- [ ] (e2e: the_current_barn_is_checkmarked_in_the_barn_switcher) The current barn is checkmarked in that dropdown
- [ ] (e2e: clicking_the_other_barn_in_the_switcher_navigates_to_its_dashboard) Clicking the other barn navigates to its dashboard
- [ ] (e2e: at_mobile_width_the_switcher_caret_is_at_least_a_44px_tap_target) At a mobile viewport (~390px wide, or your browser's device toolbar), the BarnSwitcher caret is still tappable (≥44px target)
- [ ] (e2e: at_mobile_width_the_barn_switcher_lists_both_barns) At that viewport the dropdown lists both barns
- [ ] (e2e: at_mobile_width_the_current_barn_is_checkmarked_in_the_barn_switcher) At that viewport the current barn is checkmarked in it
- [ ] (e2e: at_mobile_width_clicking_the_other_barn_navigates_to_its_dashboard) At that viewport clicking the other barn navigates to its dashboard
- [ ] (e2e: the_barns_page_shows_one_card_per_membership) Visit `/barns` — one card per membership
- [ ] (e2e: both_barns_page_cards_show_manager) Both cards show **Manager**
- [ ] (e2e: each_barns_page_card_links_to_its_own_barn) Each of those cards links to its barn
- [ ] (e2e: the_root_route_redirects_a_multi_barn_member_to_the_barns_page) Visit `/` — as a multi-barn member you are redirected to `/barns`
- [ ] (e2e: signing_out_lands_on_the_login_page_with_a_green_connection_dot) Sign out, then visit `/login` — the connection status dot is green (the sign-out is the unauthenticated context of Phase 1's note, reached the other way round)
- [ ] (e2e: the_login_page_after_signing_out_shows_a_keep_me_logged_in_checkbox) The "Keep me logged in" checkbox is present on that page
- [ ] (e2e: the_keep_me_logged_in_checkbox_after_signing_out_is_checked) That checkbox is checked

Cross-barn isolation — the invariant this phase is named after (`#1415`). Every line here is performed against two seeded barns by a manager holding an active membership in both; the direct-URL lines are the ones that reach RLS rather than the UI's own scoping:

- [ ] Under Barn B's slug, the Horses list shows Barn B's horse and none of Barn A's (e2e: barn_b_horses_page_lists_only_barn_b_horses)
- [ ] Under Barn B's slug, the Lessons list shows Barn B's lesson and none of Barn A's (e2e: barn_b_lessons_page_lists_only_barn_b_lessons)
- [ ] Under Barn B's slug, the Members list shows Barn B's memberships and none of Barn A's (e2e: barn_b_members_page_lists_only_barn_b_members)
- [ ] A member who holds a membership in *both* barns is present in that same list — the members-side positive control: isolation means Barn A's rows are absent, not that a shared person is (e2e: barn_b_members_page_lists_only_barn_b_members)
- [ ] Under Barn B's slug, Finances shows only Barn B's horse, at Barn B's own Gross figure (e2e: barn_b_finances_shows_only_barn_b_income)
- [ ] A Barn A **horse** id addressed directly under Barn B's slug 404s at that URL rather than rendering the horse (e2e: a_barn_a_horse_id_under_barn_b_404s)
- [ ] A Barn A **lesson** id addressed directly under Barn B's slug 404s at that URL rather than rendering the lesson (e2e: a_barn_a_lesson_id_under_barn_b_404s)
- [ ] A Barn A **membership** id addressed directly under Barn B's slug 404s at that URL rather than rendering the member (e2e: a_barn_a_membership_id_under_barn_b_404s)
- [ ] Barn B's *own* horse id at that same URL shape renders — the positive control, without which the three 404s above would also pass against a broken route (e2e: barn_b_own_horse_id_under_barn_b_renders)
- [ ] After visiting Barn A and then Barn B, the nav barn name and the page title both name Barn B, not the barn last visited (e2e: the_barn_chrome_follows_the_url_not_the_previously_visited_barn)

Cleanup (optional):

```bash
bash scripts/teardown-test-barn.sh test-barn-checklist
```
