# E2E spec maintenance

Five rules about what a spec is allowed to leave behind, and what it is allowed to take for granted.
Each is about *state the suite cannot check for you* — a `profiles` row global to the Supabase
project, a row `teardownBarnData` can no longer reach, an assertion that silently accepts nothing, or
a setup write that silently did nothing — and each was found by a spec that had already shipped
looking correct.

The index — headlines only — is `e2e/CLAUDE.md`'s `## Spec maintenance`, which is auto-loaded
whenever `e2e/` is touched. Rules are numbered so a spec comment can cite one (rule 3 already is,
in `checklist-phase7-multi-barn.spec.ts`, and rule 4 in three of the specs it changed); as with the
framework facts, **numbering is append-only**.

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

## Rule 4

**Every absence assertion must be preceded, in the same test, by a positive assertion proving the
page region rendered.** `toHaveCount(0)`, `not.toBeVisible`, `not.toBeAttached` and their
equivalents are all satisfied on the matcher's **first** poll (framework fact 18), so one run
straight after a `page.goto` can be read before the page has drawn the thing whose absence it
claims — green in exactly the scenario the check exists to catch.

The anchor has to be on the **same page state**, between the navigation and the absence. A
`waitForURL` is not one, at either setting: under this suite's `{ waitUntil: 'commit' }` convention
it resolves before the new document renders at all, and on Playwright's default `'load'` the event
still fires before React has drawn the route's client subtree. Either way a URL sync point proves
the navigation and nothing about the render. Two of this suite's sites were reached that way rather
than through a bare `goto` — one inline, one inherited from a helper ending on it — which is the
form that hides best.

**A paired positive test does not satisfy this rule.** A sibling test asserting the *identical*
locator is visible under the opposite condition is genuinely worth having — it is what turns a
typo'd locator into a failure instead of a silent pass — but it is a different page load and can
say nothing about whether *this* one rendered. The two holes are separate; only the same-test
anchor closes both at once. `checklist-phase4-dashboard.spec.ts`'s `todayLink` comment states the
pairing's own half and points here for the rest.

A bare page heading is a legitimate anchor and is the ordinary case — it proves the route rendered,
which is exactly what this rule asks for, and it is the only right answer for a helper spanning
many routes (`smoke.spec.ts`'s `assertPageClean` uses the single `<h1>` every route renders, which
`app/error.tsx` renders too, leaving the assertion itself to say which page arrived). Reach past a
heading when a sharper anchor is already to hand: one the file defines and asserts positively
elsewhere, or one whose presence makes the absence a real discrimination — the same recipient in
the section it *does* belong to, the other manager in the same roster section. That buys a second
thing the heading does not, catching a typo'd absence locator, but it is a bonus rather than the
bar.

Reference implementation: `checklist-phase56-horses-notes.spec.ts`'s
`trainer_unowned_horse_notes_render_as_read_only_text`, which asserts the read-only note values
before asserting the editable controls are absent.

## Rule 5

**A fixture mutation whose later assertions depend on it having matched rows uses `mustAffect`**
(`e2e/support/must-affect.ts`), which takes the mutation's `.select('id')` result and throws when the
affected-row count is wrong. `mustSucceed` throws only on `result.error`, and a PostgREST
`.update().eq(...)` matching **no row** is `data: []`, `error: null` — so a setup write whose filter
has drifted off its target succeeds loudly and does nothing.

**A mutation pass cannot find this**, which is what makes it worth a rule. Mutation testing scores
*assertions* against a live fixture; when the assertion is correct and the setup produced nothing,
every mutant still dies and the pass goes green having measured an empty set. #1424 shipped exactly
that — the demo-reaper's `barns.created_at` backdate updated zero rows, so both reaper checks were
passing against nothing, through a 15/15 mutation pass. A review agent caught it. **The check belongs
on the setup call's row count, not on the assertion.**

Pass an exact count only when the target is a single row by primary key. Omit it — "at least one" —
whenever the count varies with the fixture: collecting a lesson's transactions is one row without an
instructor cut on the tier and two with it, and an over-tight exact count is a flake that catches
nothing at-least-one wouldn't.

Two sites need nothing. A mutation already ending `.select(...).single()` is **already guarded** —
PostgREST fails a `.single()` matching zero rows with `PGRST116`, which `mustSucceed` throws on; 22
of the suite's 46 mutation sites are of this shape. And a mutation whose zero-row result is
**legitimate** stays on `mustSucceed` **and says why in a comment** — `support/fixtures.ts`'s
`deleteThrowawayAuthUser` deletes a profile that exists only once the throwaway login claimed an
invite, so matching nothing is the ordinary shape of a run that failed before the claim.

That last case is why the check is opt-in at the call site and is **never** folded into
`mustSucceed`: a blanket check would fire on correct code, and a gate that fires on correct code is
one people route around.

Reference implementation: `checklist-phase1-demo.spec.ts`'s
`the_reset_demo_cron_route_reaps_a_backdated_demo_barn`, whose backdate is the write #1424 found, and
whose comment states what the two checks below it would otherwise be measuring.
