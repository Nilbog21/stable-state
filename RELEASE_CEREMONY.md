# Release Ceremony

The ordered runbook for shipping a release. Two parts, run in order:

- **Part 1 — Wrapup** happens on `release/release-N`, before the merge to `main`.
- **Part 2 — Closeout** happens against **prod** and then on `main`, and ends with the `vN.0.0` tag and the next release branch.

Tick through it. Do not reorder — several steps exist only because doing them out of order has broken prod before (migrations pushed after the code deploy, a squash landing while another PR still had a migration in flight).

To run this ceremony, invoke `/releaseCeremony` — it walks the steps in order, recording progress and captured values in `specs/release-ceremony-{N}.md` rather than in this file.

> **Convention:** same as [`PRE_RELEASE_TEST_CHECKLIST.md`](PRE_RELEASE_TEST_CHECKLIST.md) and [`POST_RELEASE_TEST_CHECKLIST.md`](POST_RELEASE_TEST_CHECKLIST.md) — each checkbox verifies one independent assertion, so a partial failure can be marked cleanly. Steps that assert nothing are fine to leave bundled with the assertion they set up for.

> **Automation tags:** every checkbox below carries exactly one of `(auto)`, `(prompt)` or `(manual)`, stated immediately after the box. **Machine-checked** (#1542): `scripts/check-ceremony-tags.sh`, wired into `ci.sh`, fails the PR if a checkbox carries none, two, or an unrecognised one. `/releaseCeremony` refuses to start on an untagged line, and without the gate that refusal arrives weeks into a ceremony rather than in the PR that added the line.
>
> The tag answers **"can Claude satisfy or verify this checkbox without me?"** — *not* "who does the work?".
>
> - `(auto)` — yes, safely, and without confirmation
> - `(prompt)` — yes, but confirm first: the step is timing-sensitive, or a mistake costs a cleanup
> - `(manual)` — no; you do it and report back
>
> That reading is why "It is worked through the normal pipeline and its PR is merged" is `(auto)`: the work is days of `/beginIssue`→`/finishIssue` in other sessions, but *verifying it happened* is one `gh` call, and if it hasn't, the ceremony parks there.
>
> Checkboxes under an **"Acceptance criteria to paste into that issue:"** lead-in are exempt and carry no tag — they are text destined for a GitHub issue body, not ceremony steps.

Throughout, `N` is the release series being shipped (e.g. `4` for `v4.0.0`).

---

## Part 1 — Wrapup

On `release/release-N`. Nothing here touches `main` or prod.

### 1. Audit `PRE_RELEASE_TEST_CHECKLIST.md` before running it

The checklist is only as good as its last update, and a release's worth of PRs is exactly when it drifts. Audit first, run second — otherwise you run a stale checklist and find out afterwards.

**This is a whole issue, not a checkbox.** Cross-checking a few hundred closed issues against a checklist is hours of mechanical reading, which is the wrong shape for a human ticking through a runbook and the right shape for the normal `/beginIssue` pipeline. File it and work it like any other release issue — the audit's product is a PR against `checklists/pre-release/`, so it wants review and a merge anyway.

- [ ] (prompt) An issue is filed on the release, labeled `release-N`, titled something like "Audit `PRE_RELEASE_TEST_CHECKLIST.md` for release N", with the four bullets below as its acceptance criteria
- [ ] (auto) It is worked through the normal pipeline and its PR is merged into `release/release-N`

Acceptance criteria to paste into that issue:

- [ ] Every issue closed on this release is enumerated: `gh issue list --label release-N --state closed --limit 300 --json number,title`
- [ ] Each closed issue that added or changed a UI route, workflow, or user-facing feature has a corresponding step in the relevant `checklists/pre-release/phase-*.md` (or in `POST_RELEASE_TEST_CHECKLIST.md`, if it clears one of that file's bars)
- [ ] `checklists/pre-release/` and `POST_RELEASE_TEST_CHECKLIST.md` are grepped for each closed issue number and every remaining **hedge** is removed — a note asserting a capability doesn't exist yet ("until #N lands", "#N-blocked", "not yet assignable via UI") — replaced with the check it was standing in for. See `CLAUDE.md`'s Pre-Release Checklist section; citations of closed issues as *history* ("since #864") are not hedges and stay
- [ ] Route coverage at the bottom of `PRE_RELEASE_TEST_CHECKLIST.md` lists every route in `ARCHITECTURE.md`

### 2. Line up the second real person for Closeout

`POST_RELEASE_TEST_CHECKLIST.md`'s cross-identity checks need a genuinely different human, with their own Google account, on their own device, reachable while you run it. That is a scheduling dependency, not a task — arrange it days ahead, not on the day.

- [ ] (manual) A second person is confirmed for a specific window
- [ ] (manual) That window falls after the merge deploys
- [ ] (manual) They know they'll need to sign in with their own Google account
- [ ] (manual) They know to stay reachable by call or chat for the duration

### 3. Run `PRE_RELEASE_TEST_CHECKLIST.md`

- [ ] (manual) The checklist is run end to end against dev or a Vercel preview
- [ ] (manual) Everything it finds is written up as an issue labeled `release-N`. These are not "integration bugs"; they're ordinary release work, found before the merge where they're cheap
- [ ] (manual) Every one of those issues is worked to merge on `release/release-N` — issue → branch → PR, as normal — **before moving to step 4**. Do not carry findings forward as open work: step 4's squash gate is "zero open `release-N` issues touching `supabase/migrations/**`", and a fix that needs a migration has to land before the squash starts or it gets folded in by hand afterwards
- [ ] (manual) Note any follow-on checklist edits the run itself surfaces (a step that was wrong, ambiguous, or missing) — step 6's documentation review lands them

The whole step is `(manual)`, including the first two, which hand off to `/runChecklist` and `/grillMe` in fresh sessions rather than being run from here. `/releaseCeremony` could try to auto-tick the first by grepping for a complete `specs/checklist-run-*.md`, but a stale run file from the previous release would falsely satisfy it, and a false green here means shipping on an unrun checklist. The fourth is a note taken here and consumed by an issue filed in step 6, potentially a week later — the run file is the only thing carrying it.

### 4. Squash the release's migrations

Consolidate whatever `supabase/migrations/` has accumulated since the last squash into a clean set, so `main` inherits a clean history instead of iterative "add → fix → fix again". Mirrors #657/#658 (baseline) and #972 (release-3 round 2).

**This is a whole issue, not a checkbox.** Authoring a consolidated set and proving it schema-equivalent is a day of work with a correctness argument, which is the shape `/beginIssue` exists for — and its product is a PR that wants review before it rewrites the release's migration history.

**Gate — do this check first, and take it seriously.** A migration PR merging after the squash starts has to have its change rolled into the consolidated set and its standalone file dropped; #930 did exactly this mid-#658 and cost a rebase plus a manual archive.

- [ ] (prompt) `gh issue list --label release-N --state open --json number,title` returns nothing that will touch `supabase/migrations/**`
- [ ] (auto) No open PR against `release/release-N` has a file under `supabase/migrations/` — check each with `gh pr view <n> --json files`
- [ ] (manual) Everyone working the release knows migrations are frozen until the merge

The gate's two halves are tagged differently on purpose: a PR's file list is greppable, and an issue title is not evidence about migrations either way.

Then:

- [ ] (prompt) An issue is filed, labeled `release-N`, `data-migration` and `rearchitecture`, titled something like "Squash release-N's pending migrations", with the gate's result recorded in its body and the bullets below as its acceptance criteria
- [ ] (auto) It is worked through the normal pipeline and its PR is merged into `release/release-N`
- [ ] (auto) The squash PR's merge SHA is recorded — step 7 needs it
- [ ] (prompt) The shared dev DB is reconciled separately after the squash merges (`scripts/replace-all-migrations.sh`, #659) — `/sync-migrations` does not apply to a squash PR

Acceptance criteria to paste into that issue:

- [ ] Re-confirm at execution time that no other `release-N` issue or PR has pending migration changes — the ceremony's gate was checked when this issue was filed, not when it was worked
- [ ] Author a consolidated set split by concern (schema / backfills / functions / rls, one fresh timestamp), following the naming of the existing baseline files in `supabase/migrations/`
- [ ] `bash scripts/verify-migration-equivalence.sh --self-check` passes both polarities, run **before** the equivalence check below. Nothing else exercises this script — it is deliberately out of `ci.sh` (no Postgres there), so between squashes it can rot unobserved: a `pg_dump` rendering change, a normalisation that stops normalising. What the next criterion rests on is that the tool works *now*, not that it worked whenever someone last edited it
- [ ] `git fetch origin && bash scripts/verify-migration-equivalence.sh --before-ref "$(git rev-parse origin/release/release-N)"` reports **identical**. The operand is the base branch tip *at the time of the run*, not the SHA the consolidated set was authored against: if `release/release-N` moved in between, the older SHA proves equivalence to a state that no longer exists and the green is false. The script replays both sets into throwaway databases and diffs `pg_dump --schema-only` including every ACL. Do not substitute a by-hand `migra` run: that was the procedure for all three previous squashes and #657's first push still dropped 11 GRANTs, caught by a human reviewer rather than by the diff (`bf620567`)
- [ ] The superseded originals are moved to `supabase/migrations_archive/`, not deleted
- [ ] `docs/architecture/schema.md`'s migration-history paragraph names the new consolidated file set
- [ ] `Verify Migrations` CI passes on the squash PR

The prod-reconciliation carve-out is deliberately *not* repeated in those criteria — it is Closeout step 2's block, and #972's "no reconciliation needed" criterion just restated it.

### 5. CHANGELOG entry

Its own issue and PR onto `release/release-N`, so it rides into `main` on the release's merge commit rather than trailing behind as a follow-up (mirrors #978).

- [ ] (prompt) An issue is filed, labeled `release-N`, titled something like "CHANGELOG entry for vN.0.0", with the bullet below as its acceptance criteria
- [ ] (auto) It is worked through the normal pipeline and its PR is merged into `release/release-N`

Acceptance criteria to paste into that issue:

- [ ] `CHANGELOG.md` has a `## vN.0.0 — {Month YYYY}` section at the top, written for barn managers and riders: no jargon, no branch names, no issue numbers

### 6. Documentation review

Its own issue and PR onto `release/release-N`, same reasoning (mirrors #979). A full per-file audit — per-issue doc updates during the release don't substitute for it, because what they miss is exactly what a cross-check catches. Like step 1, that's hours of mechanical cross-referencing rather than a checkbox you tick in passing.

- [ ] (prompt) An issue is filed, labeled `release-N`, titled something like "Documentation review for release N", with the six bullets below as its acceptance criteria
- [ ] (auto) It is worked through the normal pipeline and its PR is merged into `release/release-N`

Acceptance criteria to paste into that issue:

- [ ] `ARCHITECTURE.md` and `docs/architecture/*.md` cross-checked against the release's closed issues
- [ ] `README.md` cross-checked the same way
- [ ] `USER_GUIDE_MANAGER.md`, `USER_GUIDE_TRAINER.md`, `USER_GUIDE_RIDER.md` cross-checked the same way
- [ ] `PRIVACY_POLICY.md` reviewed if the release added personal/financial columns, a third party, or an export flow
- [ ] The follow-on `checklists/pre-release/` edits noted while running it in step 3 are applied
- [ ] Any `POST_RELEASE_TEST_CHECKLIST.md` additions identified during the release — a feature that clears one of that file's bars but never got a POST step at the time — are applied. Closeout runs POST as-is; this is the last chance to add to it

### 7. Assert no migration files landed after the squash

- [ ] (auto) `git diff --name-only <squash-merge-sha>..origin/release/release-N -- supabase/migrations/` prints nothing. If it doesn't, the new file is folded into the consolidated set and archived before going further

The squash SHA comes from step 4, possibly a week earlier. Without something carrying it, this checkbox has no operand and gets skipped.

### 8. Assert CI is green

- [ ] (auto) CI passes on `release/release-N` at its current tip — `gh run list --branch release/release-N --limit 5`. Not "was green earlier"; green now, at the commit about to merge

`(auto)` **only** when the check compares the run's `headSha` to `git rev-parse origin/release/release-N`. A bare `gh run list --branch` satisfies the weak reading and reports success for a run that passed three commits ago.

### 9. Open the merge PR — do not merge it yet

- [ ] (prompt) A PR is open from `release/release-N` into `main`
- [ ] (auto) `gh pr view --json mergeable` reports it mergeable
- [ ] (auto) It is left **unmerged**. Closeout step 3 merges it, after prod migrations are in — merging now would deploy code against a prod schema that hasn't caught up

The merge-commit requirement is asserted in Closeout step 3, at the moment of danger, rather than here: stated here it would be an intention about a future action, with nothing to verify.

---

## Part 2 — Closeout

Against prod, and then on `main` from step 3 onwards. Migrations first, then code, then POST, then the tag.

Steps 1–2 run **from a `release/release-N` checkout**, not `main` — the consolidated migration files don't reach `main` until step 3 merges them. Run them from `main` and `supabase db push` finds nothing to push while every check in this step still reports success.

### 1. Link the Supabase CLI to prod

- [ ] (auto) Record the ref currently in `supabase/.temp/project-ref` — that's the dev project, and step 10 links back to it. The link is machine-local state, not a repo file, so nothing restores it for you
- [ ] (prompt) `npx supabase link --project-ref <prod-project-ref>` (the ref is the string in the dashboard URL, `https://supabase.com/dashboard/project/<project-ref>`)
- [ ] (auto) `npx supabase migration list` — capture this before-snapshot. You need it to tell a successful push from a partial one

The link itself is `(prompt)` for a boring reason: nothing in the repo holds the prod ref, so it has to be asked for, which *is* a prompt.

### 2. Push migrations to prod — before the merge deploys code

Code that expects a column the prod database doesn't have yet is a live outage. Migrations land first, always. This is the step that isn't in the old prose and is the one that bit us.

**Why by hand, when `Migrate` exists.** The `Migrate` workflow (`.github/workflows/migrate.yml`) already runs `supabase db push` against prod on every push to `main`, so step 3's merge would migrate prod on its own. It is not enough: Vercel deploys `main` through its own Git integration (`vercel.json`), outside GitHub Actions, so the merge fires both systems at once and nothing sequences them. Pushing here makes the ordering deterministic and leaves `Migrate` a no-op. Don't delete this step as redundant — it stops being necessary only once Vercel's `main` deploy is triggered *by* `Migrate` rather than alongside it.

**Post-squash reconciliation — only after a baseline-style squash, and before the push.** Skip this whole block unless Wrapup step 4 consolidated migrations that are **already applied on prod**. A normal release squash doesn't: the release's migrations reach prod for the first time in this very step, so prod's `supabase_migrations` table has never heard of them and there is nothing to reconcile. That held for both #658 and #972 — see `supabase/migrations_archive/README.md`. Only #657's from-scratch baseline, which re-expressed history that was already live, needed it.

Reconciling when you didn't need to is worse than skipping it when you did: `supabase migration repair --status applied` writes bookkeeping and never runs SQL, so marking a release's brand-new consolidated versions "applied" turns both the push below and `Migrate` into no-ops, and prod silently never gets the schema.

Whether the block applies is **asked once and recorded, never inferred** — that asymmetry is why. For a normal release squash the answer is always skip, and the whole block is recorded as skipped, with the reason.

If the squash *did* re-express live history:

- [ ] (auto) Prod's migration list still marks the archived versions applied
- [ ] (auto) Prod's migration list does not yet contain the consolidated versions
- [ ] (manual) A reconciliation branch is prepared from `scripts/repair-migration-history.sh`. That script is **pinned to #657's baseline** — `APPLIED_VERSIONS` hardcodes the three `20260629004610/11/12` versions and `REVERTED_VERSIONS` derives from everything in `supabase/migrations_archive/`. Copy it and swap `APPLIED_VERSIONS` for the consolidated versions that replaced the live ones; the archive-derived revert list needs no change. Its header comment describes #657's own post-merge run — the ordering here supersedes it
- [ ] (prompt) It is run dry (the default) first, and the printed `migration repair` calls match expectation
- [ ] (prompt) The `Migrate` GitHub Actions workflow is disabled so it cannot race the repair
- [ ] (manual) The script is re-run with `--yes` and completes
- [ ] (auto) `npx supabase migration list` afterwards shows the consolidated versions applied
- [ ] (auto) `npx supabase migration list` afterwards shows nothing pending

Then the push itself:

- [ ] (manual) `bash scripts/assert-dev-project.sh --allow-prod && npx supabase db push` — never with `--include-all`. This is the one place in the repo that push is *meant* to hit prod, so it takes the flag; the guard prints the linked ref rather than passing silently, which is the last chance to catch step 1 having linked the wrong project (#1291)
- [ ] (auto) `npx supabase migration list` shows nothing pending
- [ ] (prompt) The `Migrate` workflow is re-enabled, if the reconciliation above disabled it

The push stays yours. The guard half is read-only and may be run first on its own — `assert-dev-project.sh --allow-prod` prints the linked ref and nothing else.

### 3. Merge the PR

- [ ] (prompt) The Wrapup step 9 PR is merged **with a merge commit** — never squash, never rebase. `gh pr merge <n> --merge`. The release branch is deleted in step 7, so a squash would destroy the release's history
- [ ] (auto) Record the merge commit SHA — step 6 tags it
- [ ] (manual) The Vercel production deploy for that commit finishes successfully

The Vercel checkbox is `(manual)` on evidence rather than caution: `npx vercel inspect`/`logs` return nothing in this environment, so a production deploy cannot be observed from here at all.

### 4. Create the `patch-N` label

Before POST runs, so its findings have somewhere to go the moment they're found.

- [ ] (auto) `gh label create patch-N --description "Patch to the vN.0.x release series"` (skip if it already exists — it sometimes gets created early)

### 5. Run `POST_RELEASE_TEST_CHECKLIST.md` as the production smoke test

- [ ] (manual) [`POST_RELEASE_TEST_CHECKLIST.md`](POST_RELEASE_TEST_CHECKLIST.md) is run end to end against prod, with the second person from Wrapup step 2

This **is** the production smoke test. Do not hand-author a per-release spot-check list into a close-out issue — #977 did that for release-3, and maintaining a list that duplicates POST is how both go stale. Anything worth checking every release belongs in POST, where the next release inherits it.

- [ ] (manual) The checklist's own Cleanup section is completed — both throwaway prod test barns torn down

### 6. Cut `vN.0.0`, at the merge commit

Immediately after POST passes. The tag marks the release that shipped, so it goes on the commit that shipped it — not on whatever `main` has drifted to since, and not held back waiting for fixes.

- [ ] (prompt) `git tag vN.0.0 <merge-commit-sha>` using the SHA from step 3
- [ ] (prompt) `git push origin vN.0.0`
- [ ] (auto) The tag is visible on GitHub
- [ ] (auto) It points at the merge commit

The two commands are `(prompt)` with the SHA already filled in from step 3, which is the best case for that tag — the likeliest failure here is a mistyped SHA. The two verifications below them double as this step's already-done guard on a re-invocation.

### 7. Delete `release/release-N`

- [ ] (auto) Only once the tag is confirmed pushed — the tag is what preserves the history the branch held
- [ ] (prompt) `git push origin --delete release/release-N`

The first is a precondition rather than an action: step 6's two verifications already prove it, so it ticks off their result and runs nothing of its own.

### 8. Cut `release/release-(N+1)`

- [ ] (prompt) `git checkout main && git pull --ff-only origin main`
- [ ] (prompt) `git checkout -b release/release-(N+1) && git push -u origin release/release-(N+1)`

### 9. File POST findings as patches

- [ ] (manual) Every finding from step 5 becomes its own issue, labeled `patch-N`, branched off `main`, targeting `main` — see the Patches section below

They are **not** `release-N`-labeled integration bugs, and they never hold the tag. The tag was cut in step 6 and stays where it is; a fix ships as `vN.0.1`.

This hands off to `/grillMe` in a fresh session, the only path from a finding to a filed issue. When it asks which release to slate the findings for, answer **`patch-N`** — its default steer is `release-(N+1)`, and there is no `specs/batch_patch-N.md` for it to append to.

### 10. Relink the Supabase CLI to dev

Step 1 pointed the CLI at prod and nothing points it back. Leave it there and the next routine `npx supabase db push` — or `/sync-migrations`, which runs one — pushes an unreviewed dev migration straight to production.

- [ ] (prompt) `npx supabase link --project-ref <dev-project-ref>`, using the ref recorded in step 1
- [ ] (auto) `cat supabase/.temp/project-ref` shows the dev ref

Prefer relinking over `npx supabase unlink`: unlinked, the next `db push` fails on a missing project rather than doing the wrong thing, but you'll be re-linking under time pressure at the worst moment instead of calmly here.

---

## Patches

Patches land on `main` without waiting for the next release.

- Branch off `main` HEAD, named `{issue-number}-{slug}` like any feature branch
- The PR carries the `patch-N` label and targets `main`
- `/finishIssue`'s Step 4.5 handles the close-out automatically once the PR merges: it auto-increments the tag (`vN.0.1`, `vN.0.2`, …), adds the `CHANGELOG.md` entry at tag time, pushes the tag, and merges `main` into `release/release-(N+1)` so the next release picks the patch up
- If the patch includes a migration, push it to prod from the patch branch before merging, exactly as in Closeout step 2 — minus the reconciliation, which a patch never needs. `Migrate` would push it on merge anyway, but that races the Vercel deploy; pushing first makes the order deterministic. Relink to dev afterwards, as in Closeout step 10 — the hazard is the same here
- Run [`POST_RELEASE_TEST_CHECKLIST.md`](POST_RELEASE_TEST_CHECKLIST.md) **after** the `vN.0.x` tag, not before. Unlike a release, a patch auto-tags on merge, so there is no pre-tag window to run it in
