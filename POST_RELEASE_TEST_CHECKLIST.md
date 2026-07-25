# Post-Release Test Checklist

Manual verification of the checks that **cannot** be run before release. Run against **prod** after the release tag is cut, in a throwaway prod test barn seeded for the purpose.

Everything else lives in [`PRE_RELEASE_TEST_CHECKLIST.md`](PRE_RELEASE_TEST_CHECKLIST.md). A check belongs here only if no local or Vercel-preview setup can produce it — Vercel preview auth-gates non-team viewers, localhost isn't reachable off-machine, and a second personal Google account isn't a genuinely different user. A check that only needs a *fresh or unauthenticated* session is **not** one of these: incognito covers that, and those stay in PRE.

Paths below are relative — prepend the prod origin.

> **Convention:** same as PRE — each checkbox verifies one independent assertion, so a partial failure can be marked cleanly. Setup steps that assert nothing are fine to leave bundled with the assertion they set up for.

## Prerequisites

- [ ] A second real person lined up, with their own Google account, on their own device, reachable by call or chat while you run this
- [ ] `.env.local` at repo root pointed at **prod** — `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DEV_NAME`
- [ ] Throwaway prod test barn seeded — the script prints a dev-manager invite link at the end:

  ```bash
  bash scripts/seed-test-barn.sh --allow-prod post-release-test
  ```

- [ ] Open that printed invite link in your own browser signed in as your real Google account → you land in the `post-release-test` barn as a manager

## Cross-identity checks

### Invite and claim as a second real person

- [ ] As manager, open `/barn/post-release-test/members` → inline **Add Rider** form → create managed rider **Casey Test**
- [ ] Open Casey Test's member detail page → **Add Document** → upload any PDF → it lists with a working signed-URL link
- [ ] Click **Copy Invite** on Casey Test's detail page → button briefly reads **Copied!** → send the copied URL to the second person
- [ ] The second person opens that URL in their own browser and signs in with their own Google account → they land on `/profile/complete`
- [ ] They fill the contact fields and save → they land in the `post-release-test` barn as rider Casey Test
- [ ] As Casey Test, they open their own member detail page → the document you uploaded **before** they claimed still opens via its signed-URL link (regression check: a claimed member's pre-claim documents must stay readable, not just the manager's)
- [ ] Back as manager, Casey Test's row on `/barn/post-release-test/members` no longer shows the amber **Unlinked** badge
- [ ] Casey Test's detail page no longer shows the **Manage member** section

### Cross-user notifications

> These supplement — they don't replace — PRE's `instructor_lesson_nearby` checks, which verify the `notifications` row by direct DB query because its recipient is never the persona you're acting as. The two below are the only place the live bell UI (unread badge, dropdown entry, working link) is observable on a genuinely different account, and they cover both directions.
>
> `instructor_lesson_nearby` itself can't be moved here: a second real person can only ever claim a **rider** stub (the members UI creates no trainer stubs), and riders are redirected away from `/lessons/new`, so a second real person can never be the instructor a nearby-lesson notification is addressed to.

- [ ] As manager, create two future lessons via `/barn/post-release-test/lessons/new`, both instructed by you and both enrolling Casey Test — date them far enough out that cancelling incurs no late-cancellation fee
- [ ] The second person opens the first lesson's detail page and taps **Cancel** to cancel their own spot
- [ ] Reload **your** screen → the notification bell shows an unread-count badge
- [ ] Open your bell → a **"Lesson participation cancelled"** entry is listed
- [ ] Click that entry → it opens the first lesson's detail page
- [ ] As manager, open the second lesson's detail page and cancel the **whole lesson** (confirm the browser prompt)
- [ ] Reload the **second person's** screen → their notification bell shows an unread-count badge
- [ ] They open their bell → a lesson-cancelled entry is listed, and clicking it opens the second lesson

### Self photo upload as a second real person

> PRE can't check this for an impersonated persona: `change-user.sh` reassigns `barn_memberships.user_id` but leaves `profiles.user_id` untouched, so the storage RLS self-write check (keyed on `profiles.user_id`) fails for any impersonated persona regardless of role. PRE covers self-upload only as *yourself*, a manager — the rider-role version needs a real second account, so it lives here.

- [ ] As Casey Test, on their own member detail page, tap **Set Photo** and choose a JPG or PNG → upload starts immediately and they land back on the member page with the photo displayed
- [ ] Tap **Replace Photo** and choose a different image → the new photo displays
- [ ] Reload the page → the old photo is gone (confirms it wasn't just a stale client-side preview)
- [ ] Tap **Remove** → placeholder and **Set Photo** button return

## Cleanup

- [ ] Tear down the prod test barn — removes the barn and everything scoped to it, including Casey Test's membership:

  ```bash
  bash scripts/teardown-test-barn.sh --allow-prod post-release-test
  ```

- [ ] Open `/barns` as yourself → `post-release-test` is no longer listed

> The second person's own Google account is deliberately left untouched by teardown — it's a real account, not seeded test data. They keep it; it simply no longer has a membership anywhere.
