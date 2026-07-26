# Release Ceremony

The ordered runbook for shipping a release. Two parts, run in order:

- **Part 1 — Wrapup** happens on `release/release-N`, before the merge to `main`.
- **Part 2 — Closeout** happens on `main` and against **prod**, and ends with the `vN.0.0` tag and the next release branch.

Tick through it. Do not reorder — several steps exist only because doing them out of order has broken prod before (migrations pushed after the code deploy, a squash landing while another PR still had a migration in flight).

> **Convention:** same as [`PRE_RELEASE_TEST_CHECKLIST.md`](PRE_RELEASE_TEST_CHECKLIST.md) and [`POST_RELEASE_TEST_CHECKLIST.md`](POST_RELEASE_TEST_CHECKLIST.md) — each checkbox verifies one independent assertion, so a partial failure can be marked cleanly. Steps that assert nothing are fine to leave bundled with the assertion they set up for.

Throughout, `N` is the release series being shipped (e.g. `4` for `v4.0.0`).

---

## Part 1 — Wrapup

On `release/release-N`. Nothing here touches `main` or prod.

### 1. Audit `PRE_RELEASE_TEST_CHECKLIST.md` before running it

The checklist is only as good as its last update, and a release's worth of PRs is exactly when it drifts. Audit first, run second — otherwise you run a stale checklist and find out afterwards.

- [ ] List the issues closed on this release: `gh issue list --label release-N --state closed --limit 300 --json number,title`
- [ ] Each one that added or changed a UI route, workflow, or user-facing feature has a corresponding step in `PRE_RELEASE_TEST_CHECKLIST.md` (or in `POST_RELEASE_TEST_CHECKLIST.md`, if it clears one of that file's bars)
- [ ] Grep both checklists for each closed issue number and remove every remaining **hedge** — a note asserting a capability doesn't exist yet ("until #N lands", "#N-blocked", "not yet assignable via UI") — replacing it with the check it was standing in for. See `CLAUDE.md`'s Pre-Release Checklist section; citations of closed issues as *history* ("since #864") are not hedges and stay
- [ ] Route coverage at the bottom of `PRE_RELEASE_TEST_CHECKLIST.md` lists every route in `ARCHITECTURE.md`

### 2. Line up the second real person for Closeout

`POST_RELEASE_TEST_CHECKLIST.md`'s cross-identity checks need a genuinely different human, with their own Google account, on their own device, reachable while you run it. That is a scheduling dependency, not a task — arrange it days ahead, not on the day.

- [ ] A second person is confirmed for a specific window, and that window is after the merge deploys
- [ ] They know they'll need to sign in with their own Google account and stay reachable by call or chat for the duration

### 3. Run `PRE_RELEASE_TEST_CHECKLIST.md`

- [ ] The checklist is run end to end against dev or a Vercel preview
- [ ] Everything it finds is fixed on `release/release-N` — issue → branch → PR, as normal. These are not "integration bugs"; they're ordinary release work, found before the merge where they're cheap
- [ ] Note any follow-on checklist edits the run itself surfaces (a step that was wrong, ambiguous, or missing) — step 6's documentation review lands them

### 4. Squash the release's migrations

Consolidate whatever `supabase/migrations/` has accumulated since the last squash into a clean set, so `main` inherits a clean history instead of iterative "add → fix → fix again". Mirrors #657/#658 (baseline) and #972 (release-3 round 2).

**Gate — do this check first, and take it seriously.** A migration PR merging after the squash starts has to have its change rolled into the consolidated set and its standalone file dropped; #930 did exactly this mid-#658 and cost a rebase plus a manual archive.

- [ ] `gh issue list --label release-N --state open --json number,title` returns nothing that will touch `supabase/migrations/**`
- [ ] No open PR against `release/release-N` has a file under `supabase/migrations/` — check each with `gh pr view <n> --json files`
- [ ] Everyone working the release knows migrations are frozen until the merge

Then:

- [ ] The pending migrations are consolidated into a small numbered set split by concern (schema / backfills / functions / rls), following the naming of the existing baseline files in `supabase/migrations/`
- [ ] The originals are moved to `supabase/migrations_archive/`, not deleted
- [ ] A `migra` diff between the old replay and the new consolidated replay is **empty**
- [ ] The `Verify Migrations` CI workflow passes on the squash PR — this is the gate, not a push to `stable-state-dev`
- [ ] The squash PR is merged; record its merge SHA, step 7 needs it
- [ ] The shared dev DB is reconciled separately after the squash merges (`scripts/replace-all-migrations.sh`, #659) — `/sync-migrations` does not apply to a squash PR

### 5. CHANGELOG entry

Its own PR onto `release/release-N`, so it rides into `main` on the release's merge commit rather than trailing behind as a follow-up (mirrors #978).

- [ ] `CHANGELOG.md` has a `## vN.0.0 — {Month YYYY}` section at the top, written for barn managers and riders: no jargon, no branch names, no issue numbers
- [ ] It is merged into `release/release-N`

### 6. Documentation review

Its own PR onto `release/release-N`, same reasoning (mirrors #979). A full per-file audit — per-issue doc updates during the release don't substitute for it, because what they miss is exactly what a cross-check catches.

- [ ] `ARCHITECTURE.md` and `docs/architecture/*.md` cross-checked against the release's closed issues
- [ ] `README.md` cross-checked the same way
- [ ] `USER_GUIDE_MANAGER.md`, `USER_GUIDE_TRAINER.md`, `USER_GUIDE_RIDER.md` cross-checked the same way
- [ ] `PRIVACY_POLICY.md` reviewed if the release added personal/financial columns, a third party, or an export flow
- [ ] The follow-on `PRE_RELEASE_TEST_CHECKLIST.md` edits noted while running it in step 3 are applied
- [ ] Any `POST_RELEASE_TEST_CHECKLIST.md` additions identified during the release — a feature that clears one of that file's bars but never got a POST step at the time — are applied. Closeout runs POST as-is; this is the last chance to add to it
- [ ] It is merged into `release/release-N`

### 7. Assert no migration files landed after the squash

- [ ] `git diff --name-only <squash-merge-sha>..origin/release/release-N -- supabase/migrations/` prints nothing. If it doesn't, the new file is folded into the consolidated set and archived before going further

### 8. Assert CI is green

- [ ] CI passes on `release/release-N` at its current tip — `gh run list --branch release/release-N --limit 5`. Not "was green earlier"; green now, at the commit about to merge

### 9. Open the merge PR — do not merge it yet

- [ ] A PR is open from `release/release-N` into `main`
- [ ] It is set to merge with a **merge commit** — never squash, never rebase. The release branch is deleted afterwards, so a squash would destroy the release's history
- [ ] `gh pr view --json mergeable` reports it mergeable
- [ ] It is left **unmerged**. Closeout step 3 merges it, after prod migrations are in — merging now would deploy code against a prod schema that hasn't caught up

---

## Part 2 — Closeout

On `main` and against prod. Migrations first, then code, then POST, then the tag.

### 1. Link the Supabase CLI to prod

- [ ] `npx supabase link --project-ref <prod-project-ref>` (the ref is the string in the dashboard URL, `https://supabase.com/dashboard/project/<project-ref>`)
- [ ] `npx supabase migration list` — capture this before-snapshot. You need it to tell a successful push from a partial one

### 2. Push migrations to prod — before the merge deploys code

Code that expects a column the prod database doesn't have yet is a live outage. Migrations land first, always. This is the step that isn't in the old prose and is the one that bit us.

**Post-squash reconciliation.** Wrapup step 4 rewrote migration history, but prod's `supabase_migrations` table still lists the pre-squash versions. Left alone, the CLI sees the archived files as *missing* and the new consolidated files as *pending*, and tries to replay history that is already live. Reconcile first:

- [ ] Prod's migration list is compared against `supabase/migrations/` — archived versions still marked applied, consolidated versions not yet present
- [ ] A reconciliation branch is prepared from `scripts/repair-migration-history.sh`. That script is **pinned to #657's baseline** — `APPLIED_VERSIONS` hardcodes the three `20260629004610/11/12` versions and `REVERTED_VERSIONS` derives from everything in `supabase/migrations_archive/`. Copy it and swap `APPLIED_VERSIONS` for this release's consolidated versions; the archive-derived revert list needs no change
- [ ] It is run dry (the default) first, and the printed `migration repair` calls are read and match expectation
- [ ] The `Migrate` GitHub Actions workflow is disabled so it cannot race the repair
- [ ] The script is re-run with `--yes` and completes
- [ ] `npx supabase migration list` afterwards shows the consolidated versions applied and nothing pending

Then the push itself:

- [ ] `npx supabase db push` — never with `--include-all`
- [ ] `npx supabase migration list` shows nothing pending
- [ ] The `Migrate` workflow is re-enabled

### 3. Merge the PR

- [ ] The Wrapup step 9 PR is merged with a merge commit
- [ ] Record the merge commit SHA — step 6 tags it
- [ ] The Vercel production deploy for that commit finishes successfully

### 4. Create the `patch-N` label

Before POST runs, so its findings have somewhere to go the moment they're found.

- [ ] `gh label create patch-N --description "Patch to the vN.0.x release series"` (skip if it already exists — it sometimes gets created early)

### 5. Run `POST_RELEASE_TEST_CHECKLIST.md` as the production smoke test

- [ ] [`POST_RELEASE_TEST_CHECKLIST.md`](POST_RELEASE_TEST_CHECKLIST.md) is run end to end against prod, with the second person from Wrapup step 2

This **is** the production smoke test. Do not hand-author a per-release spot-check list into a close-out issue — #977 did that for release-3, and maintaining a list that duplicates POST is how both go stale. Anything worth checking every release belongs in POST, where the next release inherits it.

- [ ] The checklist's own Cleanup section is completed — both throwaway prod test barns torn down

### 6. Cut `vN.0.0`, at the merge commit

Immediately after POST passes. The tag marks the release that shipped, so it goes on the commit that shipped it — not on whatever `main` has drifted to since, and not held back waiting for fixes.

- [ ] `git tag vN.0.0 <merge-commit-sha>` using the SHA from step 3
- [ ] `git push origin vN.0.0`
- [ ] The tag is visible on GitHub and points at the merge commit

### 7. Delete `release/release-N`

- [ ] Only once the tag is confirmed pushed — the tag is what preserves the history the branch held
- [ ] `git push origin --delete release/release-N`

### 8. Cut `release/release-(N+1)`

- [ ] `git checkout main && git pull --ff-only origin main`
- [ ] `git checkout -b release/release-(N+1) && git push -u origin release/release-(N+1)`

### 9. File POST findings as patches

- [ ] Every finding from step 5 becomes its own issue, labeled `patch-N`, branched off `main`, targeting `main` — see the Patches section below

They are **not** `release-N`-labeled integration bugs, and they never hold the tag. The tag was cut in step 6 and stays where it is; a fix ships as `vN.0.1`.

---

## Patches

Patches land on `main` without waiting for the next release.

- Branch off `main` HEAD, named `{issue-number}-{slug}` like any feature branch
- The PR carries the `patch-N` label and targets `main`
- `/finishIssue`'s Step 4.5 handles the close-out automatically once the PR merges: it auto-increments the tag (`vN.0.1`, `vN.0.2`, …), adds the `CHANGELOG.md` entry at tag time, pushes the tag, and merges `main` into `release/release-(N+1)` so the next release picks the patch up
- If the patch includes a migration, push it to prod before the merge deploys, exactly as in Closeout step 2 — minus the reconciliation, which only applies after a squash
- Run [`POST_RELEASE_TEST_CHECKLIST.md`](POST_RELEASE_TEST_CHECKLIST.md) **after** the `vN.0.x` tag, not before. Unlike a release, a patch auto-tags on merge, so there is no pre-tag window to run it in
