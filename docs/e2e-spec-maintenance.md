# E2E spec maintenance

Three rules about what a spec is allowed to leave behind. Each is about *shared state the suite
cannot clean up for you* — a `profiles` row global to the Supabase project, a row `teardownBarnData`
can no longer reach, or an assertion that silently accepts nothing — and each was found by a spec
that had already shipped looking correct.

The index — headlines only — is `e2e/CLAUDE.md`'s `## Spec maintenance`, which is auto-loaded
whenever `e2e/` is touched. Rules are numbered so a spec comment can cite one (rule 3 already is,
in `checklist-phase7-multi-barn.spec.ts`); as with the framework facts, **numbering is
append-only**.

Reference implementations are cited by **file and test or block name, never by line number** — a
rename is greppable and a line-number drift is not.

## Rule 1

**Never blind-write the three shared logins** (`manager@`/`trainer@`/`rider@e2e.test`). Their
`profiles` rows are per Supabase *project*, not per barn, so `teardownBarnData` can never reach
them and whatever a spec leaves there is inherited by every later slice and every later run —
#1282 found `trainer@e2e.test` still pointing at a photo in a barn deleted a week earlier.

Capture the old value, write, and restore it in an **unconditional** `afterAll` (no pass/fail gate,
no early return except "the capture never happened"), then read the row back and throw on a
mismatch — an unverified restore is one that can stop working silently.

Restore the row *before* deleting any storage object: an un-restored row is a shared-state failure
every later slice inherits, an orphaned object is only a leak, and deleting first converts the
cheap failure into the expensive one.

Nulling a field instead of restoring it is the same violation.

Reference implementation: `checklist-phase4-members-media.spec.ts`'s
`test.describe.serial('your own member photo')` block — its `beforeAll`/`afterAll` pair, around
`uploading_your_own_photo_displays_it_on_your_member_page`.

## Rule 2

**A spec that deletes a membership orphans that profile.** `teardownBarnData` reaches profile rows
*through* the barn's memberships, so severing the edge leaves the row behind permanently — one per
run per Playwright project, even though the row is a perfectly ordinary stub.

Hand it back with a `describe`-scoped `afterAll` (Playwright completes an inner suite's hooks
before the file-scoped one `withBarn` registers) that deletes the profile **only if no membership
still references it**, so a chain that failed before the removal leaves the row for
`teardownBarnData` rather than tripping the FK.

Demoting a stub to `is_managed = false` needs no such hook — the sweep filters on
`user_id IS NULL` (#1282), which a demotion can't change.

Reference implementation: `checklist-phase4-members-access.spec.ts`'s
`test.describe.serial('removing a member')` block's `afterAll`, around
`confirming_the_remove_prompt_redirects_to_the_members_list`.

## Rule 3

**Never call `allInnerTexts()`/`allTextContents()` on a bare locator** — they don't auto-retry, so
a not-yet-rendered table yields `[]`, and an assertion that accepts an empty array then *passes on
nothing* (#1243 found four such checks reading as covered while asserting nothing).

Read through `settledInnerTexts`/`settledTextContents` in `e2e/support/read.ts`, whose wait doubles
as the non-empty assertion. `evaluateAll` has the same hazard but keeps an inline
`await locator.first().waitFor()` — wrapping a callback reads worse than the guard it replaces.

Reference implementation: `e2e/support/read.ts`'s `settledInnerTexts`/`settledTextContents`, and
its ceiling section for what a settled read cannot reach (framework fact 2).
