You are landing the output of a completed `/overnightRefactor` run: verifying the whole branch, filing one issue per commit after the fact, and merging the night's single PR.

> **Recommended model: Opus.** The judgment is in writing 20+ issue bodies that read as if the work were still ahead, and in telling a real regression apart from a pre-existing red. Set with `/model` before invoking.

Run this from the same worktree the overnight loop ran in — the ledger it depends on is gitignored and exists nowhere else.

**Why issues at all, when the code is already written:** this repo's rule is that no change reaches a branch without an issue and a PR. The overnight loop necessarily breaks the first half of that — a subagent at 3am can't file and groom an issue. This skill pays that debt back in the morning, so `git log` and the issue tracker agree about what happened.

---

## Step 0 — Preflight

1. `bash scripts/workflow-context.sh` — record `worktree`, `port`, `branch`, `pr`, `pr_state`.
2. **Terminal-state check.** If `pr_state` is not `OPEN`, or `branch` doesn't match `overnight/refactor-*`, stop and say so — this night is already landed, or this isn't an overnight worktree. Do not proceed.
3. Read the ledger `specs/overnight-{date}.md`. Extract, per iteration: the **Outcome** line's final SHA(s), the **Task statement**, and the **Navigability payoff** sentence. Skip iterations whose outcome is `failed` — those were reset out of the branch and have no commit.
4. `git log --reverse --format='%h%x09%s' origin/release/{release}..HEAD`.

   **Expect more commits than iterations.** An iteration that deferred its first commit until CI passed on the whole change set produced two. Reconcile the list against the ledger's `**Implementation:** committed …` lines before going further — and note that a SHA there may have been amended during review, so the **Outcome** line is the authority, not the Implementation line.

---

## Step 1 — Verify the whole branch

The loop verified each commit in isolation via `scripts/ci.sh`, which **does not run e2e**. Nothing has yet checked the night's commits as a set, or against a browser.

1. Confirm a dev server is up on `{port}` and serving this worktree:
   ```
   for p in $(pgrep -f "next dev"); do echo "$p $(readlink /proc/$p/cwd)"; done
   ```
   Match the cwd to `{worktree_path}`. If nothing is serving it, ask the user to start it — don't start it yourself, the port may be deliberately free.
2. `npm run test:checklist:auto -- --base-url http://localhost:{port}` — run it in the background and keep working.
3. `npm run build`.

**On an e2e failure, establish pre-existing versus caused before reporting it as a regression.** Re-run the failing spec alone; check open issues for a matching flake (`gh issue list --state open --search e2e`); and check whether the same failure reproduces on `origin/release/{release}`. Timezone- and time-of-day-dependent specs are the usual suspects.

---

## Step 2 — Aim the manual smoke test, then hand it to the user

Do not ask for a general smoke test. An overnight branch is overwhelmingly test-file moves, JSDoc comments and `docs/architecture/*.md` prose — none of it observable. Find the small number of commits that touch rendered output:

```
git diff origin/release/{release}...HEAD --name-only | grep -vE '__tests__|\.md$|^docs/|^scripts/'
```

For each surviving file, name the concrete screen and the specific thing to look at, and pull real IDs from the dev DB (`mcp__supabase__execute_sql`, barn slug `dev-barn`) so the user gets URLs rather than instructions to go find something. Where a seeded row doesn't exist, say so and give a create-then-check path instead.

State explicitly which observable oddities are **pre-existing** and not part of the change — a user who trips over a long-standing quirk while smoke-testing a refactor will report it as a regression otherwise.

Wait for the user. Do not proceed on their behalf.

---

## Step 3 — One issue per commit

**One commit, one issue.** Not one per iteration: the iterations that produced two commits bundle unrelated work, and a compound title ("split the tests **and** delete the dead exports") makes a bad permanent record.

Ask the user to confirm the granularity and labels before writing anything — that conversation is the point of this step.

### Labels

These issues are **born closed**. `quick-win`, `rearchitecture`, `testing-improvement` and `high-priority` are batch-*scheduling* signals that `/issueBatch` and `/estimateRelease` read; hanging them on already-done work pollutes `specs/batch_{release-label}.md` and inflates the release's velocity history.

- **`refactor`** on every issue — "Structure-only change: splits, renames, dead-code removal, doc/comment accuracy. No behavior change." Create the label if it doesn't exist. It's also what makes a night's output greppable and filterable out of velocity stats later.
- **The release label** matching the branch's base.
- **`documentation`** only where the commit touches `docs/architecture/**` or `ARCHITECTURE.md`. In-source JSDoc headers are not `documentation` — they're `refactor`.
- Nothing else.

### Issue bodies

**The ledger is gitignored and will be deleted.** Never cite it — not "see iteration 12", not "per tonight's plan". The only durable anchors are the **commit SHA** and the **PR number**. An issue body that points at a file the reader can't open is worse than a terse one.

Each body:
- A short paragraph of the problem **as it stood before the commit**, in the present tense — the line count, the duplication, the false doc claim. This is the part the ledger's Task statement gives you.
- **Why:** one sentence, from the iteration's Navigability payoff.
- **Acceptance criteria** — 3–5 checkboxes, written as work still to be done. Prefer the criteria the reviewer actually checked: byte-identical moved bodies, preserved test counts, no stale cross-references, claims verified against the implementation rather than against another doc, pure-comment diffs.
- A footer naming the SHA and the PR.

Write the bodies to files and create with `gh issue create --body-file`; assemble a `manifest.tsv` of key/SHA/labels/title first so the creation loop is mechanical and re-runnable.

**Present the full list to the user and wait for explicit confirmation before creating anything.**

Two steps of the normal `/grillMe` flow are deliberately skipped here, and say so rather than silently omitting them: **dependency analysis** (nothing can block an issue that's already implemented) and **appending to `specs/batch_{release-label}.md`** (that file is a work-selection queue).

---

## Step 4 — Make the PR the durable record

Rewrite the PR body — it outlives the ledger, and after this it's the only place the commit↔issue mapping exists.

Include: what the loop is and that each commit was planned/implemented/reviewed in three separate fresh contexts; the structure-only guarantee; the Step 1 and Step 2 verification results with real numbers; a **commit → issue → title** table; and one `Closes #N` line per issue.

`gh pr edit` silently swallows the body on a deprecation warning. Use:
```
gh api repos/{owner}/{repo}/pulls/{pr} -X PATCH -F body=@body.md
```
then verify with `gh pr view {pr} --json body`.

Then `gh pr ready {pr}`.

---

## Step 5 — Merge

Check `gh pr checks {pr}`.

**A red check is not automatically yours.** Before reporting one as a blocker, compare it against the base branch's own HEAD:
```
gh api repos/{owner}/{repo}/commits/$(git rev-parse origin/release/{release})/status
```
An identical failure there is pre-existing and the merge is unaffected — report it as a separate finding, with that evidence, rather than as a reason to stop. A Vercel failure with a green local `npm run build` is nearly always environmental; the CLI is unavailable in this setup, so ask the user for the dashboard error rather than guessing.

Present the full gate table — ci, local build, e2e, manual smoke, deploy preview, mergeability, commit count — and **ask before merging.**

Merge with `--merge` (a merge commit). Squashing would collapse the night into one commit and destroy the per-change history the issues were just written to describe.

**`gh pr merge --delete-branch` will fail here**, after the merge has already gone through: it tries to move this worktree onto the base branch, which the primary checkout holds. That's a local-cleanup failure, not a failed merge — confirm with `gh pr view {pr} --json state,mergeCommit`, then delete the remote branch by hand with `git push origin --delete {branch}`.

**The `Closes #N` lines will not fire.** GitHub only auto-closes linked issues when a PR merges into the repository's **default** branch; this one targets a release branch. Close all of them explicitly:
```
gh issue close {n} --reason completed --comment "Landed on \`release/{release}\` via #{pr} (merge commit \`{sha}\`)."
```
Then verify per-issue with `gh issue view {n} --json state` — `gh issue list --label refactor` reads a search index that lags by a minute or two and will under-report what's closed.

---

## Step 6 — Clean up

Delete `specs/overnight-{date}.md`. Its every durable claim is now in the issues and the PR body; leaving it invites a future session to cite a file that only exists on one machine.

**Except the `Future-night candidates` lines** — those are the running scoreboard of what the loop has already cleared and what it should skip, and the next `/overnightRefactor` planner reads sibling `specs/overnight-*.md` files for exactly that. Before deleting, check whether the ledger carries any candidate the next run would waste a night rediscovering, and if so keep just that content.

Finally: scan the ledger for anything flagged as **out of overnight scope** — items the loop couldn't act on because they'd need a migration, an `.claude/commands/**` edit, or a product judgment call. These are real work and this skill does not handle them. List them for the user and point at `/grillMe`; they need their own issues, branches and PRs like anything else.
