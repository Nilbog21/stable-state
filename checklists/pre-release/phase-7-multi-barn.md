# Phase 7 — Multi-barn

<!-- Asserting role: manager — across two barns. Cross-barn isolation, not cross-role. -->

> Conventions, phase partitioning, automation tags, and route coverage: [`PRE_RELEASE_TEST_CHECKLIST.md`](../../PRE_RELEASE_TEST_CHECKLIST.md)

- [ ] (manual — a spec cannot drive it: a local shell script writing to the shared dev project with the service-role key from `.env.local`; a spec seeds its own second barn through the fixture noted below instead) Create a second barn — completes successfully:

  ```bash
  bash scripts/seed-test-barn.sh test-barn-checklist
  ```

> **Caution:** `reset-db.sh` (Phase 1) wipes **all** barns project-wide, not just Dev Barn. If you need to restart this checklist from the top after this point, re-running it will also delete `test-barn-checklist`.

> **Prerequisite for every `(e2e-candidate)` below: a two-barn fixture.** `withBarn` (`e2e/support/test.ts:122`) is single-barn by construction — one slug from `barnSlugFor`, one `createBarn`, one `teardownBarn` in `afterAll` — so a second barn seeded today leaks. `createBarn`/`addMemberships` are plain exported functions taking a client, so the missing piece is only teardown registration: a helper, or spec-local calls plus their own teardown. **Not written here** — it belongs to the cross-barn-isolation slice (#1415), which needs the same fixture. The mobile lines further down need that fixture *and* the existing `@mobile` project (see Phase 1's mobile note).

- [ ] (e2e-candidate) As `DEV_EMAIL`, open `/barn/test-barn-checklist/register` with no `?token=` → shows an "Invite invalid" message
- [ ] (e2e-candidate) That page shows no self-registration form

`DEV_EMAIL` already has a claimed profile from Phase 1 (`#887` — before that fix, claiming a second-barn invite as an already-claimed user threw an unhandled unique-violation on `profiles.user_id`; the merge fix now re-points the invite's membership onto the existing profile instead):

- [ ] (manual — a spec cannot drive it: `seed-account.sh` prompts on a TTY for first name, last name and barn slug) Run `bash scripts/seed-account.sh`, accepting the default first/last name, and enter `test-barn-checklist` as the barn slug — creates a fresh managed-manager stub invite in that barn and prints `Invite path: /barn/test-barn-checklist/register?token=<uuid>`
- [ ] (e2e-candidate) Open that invite path as `DEV_EMAIL` (already signed in elsewhere in this browser) — shows a "Join test-barn-checklist" confirmation
- [ ] (e2e-candidate) That confirmation carries an **Accept Invite** button
- [ ] (e2e-candidate) That confirmation shows no Google sign-in button
- [ ] (e2e-candidate) Click **Accept Invite** → the claim succeeds and you land in **test-barn-checklist**
- [ ] (e2e-candidate) You hold **manager** in that barn
- [ ] (e2e-candidate) That claim produced no `?error=1` redirect
- [ ] (e2e-candidate) From the nav bar, click into a nested route (e.g. **Lessons**) — no redirect to `/barn/test-barn-checklist/login` despite the valid session (`#1076` — `acceptInvite` previously never set the `barn_session_{slug}` cookie, so this bounced to login on the first non-dashboard route visited)
- [ ] (manual — `change-user.sh` is an interactive local shell script rewriting `barn_memberships` rows) Run `change-user.sh dev-barn` → pick your own name → restores your manager role in Dev Barn (undoing the Phase 5/6 role swaps)
- [ ] (e2e-candidate) Back as `DEV_EMAIL`: the nav barn name now has a caret
- [ ] (e2e-candidate) The **BarnSwitcher** dropdown lists both barns
- [ ] (e2e-candidate) The current barn is checkmarked in that dropdown
- [ ] (e2e-candidate) Clicking the other barn navigates to its dashboard
- [ ] (e2e-candidate) At a mobile viewport (~390px wide, or your browser's device toolbar), the BarnSwitcher caret is still tappable (≥44px target)
- [ ] (e2e-candidate) At that viewport the dropdown lists both barns
- [ ] (e2e-candidate) At that viewport the current barn is checkmarked in it
- [ ] (e2e-candidate) At that viewport clicking the other barn navigates to its dashboard
- [ ] (e2e-candidate) Visit `/barns` — one card per membership
- [ ] (e2e-candidate) Both cards show **Manager**
- [ ] (e2e-candidate) Each of those cards links to its barn
- [ ] (e2e-candidate) Visit `/` — as a multi-barn member you are redirected to `/barns`
- [ ] (e2e-candidate) Sign out, then visit `/login` — the connection status dot is green (the sign-out is the unauthenticated context of Phase 1's note, reached the other way round)
- [ ] (e2e-candidate) The "Keep me logged in" checkbox is present on that page
- [ ] (e2e-candidate) That checkbox is checked

Cleanup (optional):

```bash
bash scripts/teardown-test-barn.sh test-barn-checklist
```
