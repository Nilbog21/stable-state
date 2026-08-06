# Phase 7 — Multi-barn

<!-- Asserting role: manager, across two barns. Cross-barn isolation, not cross-role. -->

> Conventions, phase partitioning, automation tags, and route coverage: [`PRE_RELEASE_TEST_CHECKLIST.md`](../../PRE_RELEASE_TEST_CHECKLIST.md)

- [ ] Create a second barn — completes successfully:

  ```bash
  bash scripts/seed-test-barn.sh test-barn-checklist
  ```

> **Caution:** `reset-db.sh` (Phase 1) wipes **all** barns project-wide, not just Dev Barn. If you need to restart this checklist from the top after this point, re-running it will also delete `test-barn-checklist`.

- [ ] As `DEV_EMAIL`, open `/barn/test-barn-checklist/register` with no `?token=` → shows an "Invite invalid" message, not a self-registration form

`DEV_EMAIL` already has a claimed profile from Phase 1 (`#887` — before that fix, claiming a second-barn invite as an already-claimed user threw an unhandled unique-violation on `profiles.user_id`; the merge fix now re-points the invite's membership onto the existing profile instead):

- [ ] Run `bash scripts/seed-account.sh`, accepting the default first/last name, and enter `test-barn-checklist` as the barn slug — creates a fresh managed-manager stub invite in that barn and prints `Invite path: /barn/test-barn-checklist/register?token=<uuid>`
- [ ] Open that invite path as `DEV_EMAIL` (already signed in elsewhere in this browser) — shows a "Join test-barn-checklist" confirmation with an **Accept Invite** button
- [ ] That confirmation shows no Google sign-in button
- [ ] Click **Accept Invite** → the claim succeeds and you land in **test-barn-checklist** as manager
- [ ] That claim produced no `?error=1` redirect
- [ ] From the nav bar, click into a nested route (e.g. **Lessons**) — no redirect to `/barn/test-barn-checklist/login` despite the valid session (`#1076` — `acceptInvite` previously never set the `barn_session_{slug}` cookie, so this bounced to login on the first non-dashboard route visited)
- [ ] Run `change-user.sh dev-barn` → pick your own name → restores your manager role in Dev Barn (undoing the Phase 5/6 role swaps)
- [ ] Back as `DEV_EMAIL`: the nav barn name now has a caret
- [ ] The **BarnSwitcher** dropdown lists both barns
- [ ] The current barn is checkmarked in that dropdown
- [ ] Clicking the other barn navigates to its dashboard
- [ ] At a mobile viewport (~390px wide, or your browser's device toolbar), the BarnSwitcher caret is still tappable (≥44px target)
- [ ] At that viewport the dropdown behaves the same as desktop
- [ ] Visit `/barns` — one card per membership
- [ ] Both cards show **Manager**
- [ ] Each of those cards links to its barn
- [ ] Visit `/` — as a multi-barn member you are redirected to `/barns`
- [ ] Sign out, then visit `/login` — the connection status dot is green
- [ ] The "Keep me logged in" checkbox is present on that page and checked

Cleanup (optional):

```bash
bash scripts/teardown-test-barn.sh test-barn-checklist
```
