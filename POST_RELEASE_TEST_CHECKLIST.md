# Post-Release Test Checklist

Manual verification of the checks that **cannot** be run before release. Run against **prod**, in throwaway prod test barns seeded for the purpose.

**When to run it** — [`RELEASE_CEREMONY.md`](RELEASE_CEREMONY.md) is the invocation point:

- **Release:** once the release merge has deployed and **before** the `vN.0.0` tag is cut. This is the release's production smoke test, and the tag waits on it.
- **Patch:** **after** the `vN.0.x` tag, since a patch auto-tags on merge and so has no pre-tag window.

Everything else lives in [`PRE_RELEASE_TEST_CHECKLIST.md`](PRE_RELEASE_TEST_CHECKLIST.md). A check belongs here only if no local or Vercel-preview setup can produce it — Vercel preview auth-gates non-team viewers, localhost isn't reachable off-machine, and a second personal Google account isn't a genuinely different user. A check that only needs a *fresh or unauthenticated* session is **not** one of these: incognito covers that, and those stay in PRE.

Paths below are relative — prepend the prod origin.

> **Convention:** same as PRE — each checkbox verifies one independent assertion, so a partial failure can be marked cleanly. Setup steps that assert nothing are fine to leave bundled with the assertion they set up for.

> **Why two barns:** the second person needs to be a **rider** for the claim and photo checks and a **trainer** for the notification checks, and one account can hold only one role per barn — `register/page.tsx` redirects an already-active member straight to the barn home rather than offering a second Accept Invite. So they claim a rider stub in the first barn and a trainer stub in the second.

## Prerequisites

- [ ] A second real person lined up, with their own Google account, on their own device, reachable by call or chat while you run this
- [ ] `.env.local` at repo root pointed at **prod** — `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DEV_NAME`
- [ ] Both throwaway prod test barns seeded — each run prints a dev-manager invite link at the end, so keep both:

  ```bash
  bash scripts/seed-test-barn.sh --allow-prod post-release-test
  bash scripts/seed-test-barn.sh --allow-prod post-release-test-2
  ```

- [ ] Open the `post-release-test` invite link in your own browser signed in as your real Google account → you land in that barn as a manager
- [ ] Open the `post-release-test-2` invite link the same way → you land in that barn as a manager too

## Cross-identity checks

### Invite and claim as a second real person

Barn: `post-release-test`. The second person joins here as a **rider**.

- [ ] As manager, open `/barn/post-release-test/members` → inline **Add Rider** form → create managed rider **Casey Test**
- [ ] Open Casey Test's member detail page → **Add Document** → upload any PDF → it lists with a working signed-URL link
- [ ] Click **Copy Invite** on Casey Test's detail page → button briefly reads **Copied!** → send the copied URL to the second person
- [ ] The second person opens that URL in their own browser and signs in with their own Google account → they land on `/profile/complete`
- [ ] They fill the contact fields and save → they land in the `post-release-test` barn as rider Casey Test
- [ ] As Casey Test, they open their own member detail page → the document you uploaded **before** they claimed still opens via its signed-URL link (regression check: a claimed member's pre-claim documents must stay readable, not just the manager's — and a rider is read-only on their own documents since #864, so this exercises `rider_documents` RLS specifically)
- [ ] Back as manager, Casey Test's row on `/barn/post-release-test/members` no longer shows the amber **Unlinked** badge
- [ ] Casey Test's detail page no longer shows the **Manage Member** section

### Self photo upload as a second real person

Barn: `post-release-test`, still as Casey Test.

> PRE can't check this for anyone but you: `change-user.sh` reassigns `barn_memberships.user_id` but leaves `profiles.user_id` untouched, so the storage RLS self-write check (keyed on `profiles.user_id`) fails for any impersonated persona — your own profile is the only locally-linked one PRE can cover. There is no role branch in this path (`documents/new/page.tsx` gates on `isOwnPage`, `profile_photos_self_write` on `profiles.user_id`), so what's new here is a *different person's* claimed profile, not a different role.

- [ ] As Casey Test, on their own member detail page, tap **Set Photo** and choose a JPG or PNG → upload starts immediately and they land back on the member page with the photo displayed
- [ ] Tap **Replace Photo** and choose a different image → the new photo displays
- [ ] Reload the page → the old photo is gone (confirms it wasn't just a stale client-side preview)
- [ ] Tap **Remove** → placeholder and **Set Photo** button return

### Cross-user notifications

Barn: `post-release-test-2`. The second person joins here as a **trainer**, since a nearby-lesson notification is only ever addressed to a lesson's instructor.

> These supplement — they don't replace — PRE's `instructor_lesson_nearby` checks, which verify the `notifications` row by direct DB query because its recipient is never the persona you're acting as (`change-user.sh` reassigns `barn_memberships.user_id` away from whichever persona you leave). The checks below are the only place the live bell UI — unread badge, dropdown entry, working link — is observable on a genuinely different account, in both directions.

- [ ] As manager in `post-release-test-2`, open `/barn/post-release-test-2/members` → inline **Add Trainer** form → create managed trainer **Riley Test**
- [ ] **Copy Invite** on Riley Test's detail page → send the URL to the second person → they claim it with the same Google account → they land in `post-release-test-2` as trainer Riley Test
- [ ] On Riley Test's detail page, the **Instructor Access** section reads "Cannot be assigned as an instructor." with a **Grant Instructor Access** button
- [ ] Click **Grant Instructor Access** → the section now reads "Can be assigned as an instructor." and the button becomes **Revoke Instructor Access**
- [ ] On your own member detail page in this barn, click **Grant Instructor Access** for yourself too (the seeded dev-manager stub arrives with `can_instruct` false)
- [ ] As manager, create a future lesson via `/barn/post-release-test-2/lessons/new` with **Riley Test** as the instructor
- [ ] Create a second lesson instructed by **yourself**, within 30 minutes of that first lesson's time → submission succeeds with no error
- [ ] The second person reloads their screen → their notification bell shows an unread-count badge
- [ ] They open the bell → an entry reading **"1 new lesson scheduled nearby"** (or an incremented count if a prior nearby lesson already landed this row)
- [ ] Clicking that entry opens `/barn/post-release-test-2/lessons`
- [ ] Now the reverse: as Riley Test, they create a lesson via `/barn/post-release-test-2/lessons/new` within 30 minutes of the lesson **you** instruct — the instructor field is locked to them
- [ ] Reload **your** screen → your notification bell shows an unread-count badge
- [ ] Open your bell → a **"1 new lesson scheduled nearby"** entry is listed
- [ ] Clicking that entry opens `/barn/post-release-test-2/lessons`

## Cleanup

- [ ] Tear down both prod test barns — removes each barn and everything scoped to it, including Casey Test's and Riley Test's memberships:

  ```bash
  bash scripts/teardown-test-barn.sh --allow-prod post-release-test
  bash scripts/teardown-test-barn.sh --allow-prod post-release-test-2
  ```

- [ ] Open `/barns` as yourself → neither `post-release-test` nor `post-release-test-2` is listed

> The second person's own Google account is deliberately left untouched by teardown — it's a real account, not seeded test data. They keep it; it simply no longer has a membership anywhere.
