You are reviewing a pull request for a completed `/beginIssue` session. This skill wraps the base multi-agent code review with worktree awareness, project-specific convention checks, and an interactive fix-and-commit feedback loop.

> **Recommended model: Opus.** The finding work is delegated to subagents, but this session applies the fix commits. Sonnet is fine if you are only triaging findings and not fixing them. Set with `/model` before invoking.

---

## Step 0 — Worktree and issue detection

**Detect worktree:**
Check `pwd`. If the path contains `stable-state-worktrees/alpha`, `stable-state-worktrees/beta`, `stable-state-worktrees/gamma`, `stable-state-worktrees/delta`, or `stable-state-worktrees/epsilon`, record that as the active worktree.

If not inside a worktree, ask: "Which worktree do you want to use — **alpha**, **beta**, **gamma**, **delta**, or **epsilon**?" and wait for the answer. The worktree path is `../stable-state-worktrees/{alpha|beta|gamma|delta|epsilon}` resolved from `git rev-parse --show-toplevel`.

All subsequent commands must run inside this worktree using absolute paths.

**Detect issue number from branch:**
Run:
```
git -C {worktree-path} rev-parse --abbrev-ref HEAD
```

If the branch name matches the format `{N}-{slug}` (leading digits followed by a hyphen), extract `N` as the issue number.

If the branch does not match this format, ask: "I couldn't detect an issue number from the branch name. What issue number is this work for?" Wait for the answer.

---

## Step 1 — Determine base branch and rebase

**Determine base branch:**
Fetch the issue:
```
gh issue view {N} --json number,title,labels,body
```

If the issue has a `patch-N` label (e.g. `patch-3`), the base branch is `main`. Otherwise, if the issue has a `release-N` label (e.g. `release-1`), the base branch is `release/release-N`. Otherwise the base branch is `main`.

**Fetch and rebase:**
```
git -C {worktree-path} fetch origin
git -C {worktree-path} rebase origin/{base-branch}
```

If the rebase completes cleanly, continue.

If there are conflicts, attempt to resolve each one using judgment about the intent of both sides. For each conflicted file, read the conflict markers and apply the resolution that preserves both the base branch changes and the issue branch intent.

After resolving each file, run:
```
git -C {worktree-path} add {file} && git -C {worktree-path} rebase --continue
```

If any conflict cannot be confidently resolved without guessing at intent, run:
```
git -C {worktree-path} rebase --abort
```
Then tell the user exactly which files and hunks could not be resolved and stop. Ask them to resolve those conflicts manually and re-run `/reviewIssue`.

---

## Step 2 — CI gate

Find the open PR for the current branch:
```
gh pr view --json number,title,state,isDraft,headRefName
```

Wait for CI in a single blocking call — do **not** poll `gh pr checks` yourself:
```
cd {worktree-path} && bash scripts/workflow-ci-wait.sh {pr}
```
Run it with the Bash tool's `timeout` set to `360000` (the default is 120s; the script blocks for up to 5 minutes). The `cd` matters — the script resolves the repo from the working directory. It handles the merge-conflict case, the `gh pr checks`-lags-real-CI-state case, and the 5-minute cap internally, and prints exactly one verdict line. Branch on that line:

**`CI: pass`** — proceed directly to the review, do not ask for confirmation.

**`CI: conflict — rebase needed`** — the PR is `CONFLICTING`, so GitHub will not trigger a workflow run for this branch at all until it's resolved. This is *not* a stuck runner and waiting longer will never help. Rebase onto the base branch (`git -C {worktree-path} fetch origin && git -C {worktree-path} rebase origin/{base-branch}`, resolving conflicts per Step 1's rules), push (`git -C {worktree-path} push --force-with-lease`), then re-run the script.

**`CI: timeout after 5m — {checks}`** — stop and ask the user: "CI hasn't completed after 5 minutes — could you check the Actions tab / PR checks and let me know what's going on? (e.g. stuck runner, workflow didn't trigger, etc.)" Wait for their answer before re-running the script or taking further action.

**`CI: fail — {checks}`** — handle per check below.

**If the Vercel check failed:** Do NOT attempt `npx vercel inspect` or `npx vercel logs` — the Vercel CLI is not available. Instead:
1. Run `npm run build` locally to check for TypeScript/build errors. If errors are found, fix them, commit, push, and re-run the script.
2. If the local build passes but Vercel still fails, ask the user to paste the Vercel error from the dashboard.

**If `Verify Migrations` failed:** diagnose the root cause (read the failure logs, identify which migration needs to sort later and why) and explain it to the user — but do NOT rename/reorder/`git mv`/commit the fix yourself, and do not auto-invoke `sync-migrations`. Surface it and stop; let the user decide whether to hand off to `/testIssue` or explicitly authorize a one-off fix in this session.

---

## Step 3 — Fetch context

Fetch all context needed for the review:

```
gh issue view {N} --json number,title,labels,body
gh pr view --json number,title,body,baseRefName,headRefName
gh pr diff
gh issue list --state open --json number,title,body --limit 100
```

From the issue list, filter for issues whose body contains any of the following (where N is the current issue number): `depends on #{N}`, `blocked by #{N}`, `prerequisite: #{N}`, or `requires #{N}`. This is the **downstream issue list**.

**Read the work log:** `{worktree-path}/specs/issue-{N}.md` should exist by now — `/beginIssue` creates it on first touch. If it's genuinely missing (a legacy branch that predates this convention), skip everything below in this subsection and review the full `gh pr diff` as usual. Otherwise:

- Pull the `## Accepted deviations` section — pass its contents to Step 4's Agent 6 as already-approved context: these changes were explicitly signed off during `/beginIssue` and must not be re-flagged as out-of-scope.
- **Check for a scoped re-review marker:** look at `## Open items`. This section is left with only a `<!-- since_sha: {sha} -->` comment and no unresolved entries when `/beginIssue`'s revise mode has just resolved a round of `/testIssue`'s deferred concerns.
  - **If `## Open items` has no `since_sha` marker (normal first-pass review):** review the full `gh pr diff` as usual, no other change.
  - **If it has the marker:** read `since_sha` and additionally compute `git -C {worktree-path} diff {since_sha}...HEAD`. Use this scoped diff (not the full `gh pr diff`) as the diff every Step 4 agent reviews, and tell each agent explicitly that this is a follow-up review of fix commits addressing previously-deferred `/testIssue` concerns, not a first-pass review of the whole PR — still give them the full issue body/ACs for background, just scope the actual diff under review. Remember this marker is present; Step 6 clears it (not the whole file) once this review pass concludes.

---

## Step 4 — Multi-agent review

Use a Haiku agent to fetch `gh pr view --json state,isDraft` and check completion:

- **If `state` is `MERGED` or `CLOSED`:** print "PR #{pr} is already merged/closed — nothing to review. Stopping." and **stop**. Do not run any further steps.
- **If `isDraft` is `false`:** this PR was already marked ready (Step 7 already ran for it). Print "PR #{pr} is already marked ready for review — nothing new to review. Stopping." and **stop**. Do not run any further steps.
- **Otherwise:** the PR is open and still a draft — proceed to the review below.

Then launch **6 parallel Sonnet agents in the foreground** (`run_in_background: false` on each) — Step 5 needs every agent's findings before it can score anything, so block on them directly. Never wrap this wait in a `/loop`/`ScheduleWakeup` poll: background agents already auto-notify on completion, and a polling loop here just burns wakeups re-asking whether they're done. Give each agent the issue body (including acceptance criteria), the PR body, and the full PR diff. Each agent should return a list of issues with a reason for each finding.

- **Agent 1:** Audit the changes for CLAUDE.md compliance. Use the root CLAUDE.md and any CLAUDE.md files in directories the PR modifies.
- **Agent 2:** Shallow scan for obvious bugs in the changed lines only. Focus on large bugs; ignore nitpicks and things a linter/typechecker would catch.
- **Agent 3:** Read the git blame and commit history of modified files. Flag any bugs that only make sense in light of that historical context.
- **Agent 4:** Read comments on previous PRs that touched the same files. Flag anything in those comments that also applies to this PR.
- **Agent 5:** Read code comments in the modified files. Flag any changes that contradict guidance in those comments.
- **Agent 6:** Audit for project-specific conventions. Give this agent the `## Accepted deviations` list pulled from the work log above, with the instruction: these changes are already-approved and out of scope by design — do not flag them again.
  - All commits on the branch must use the prefix `[#{N}]`
  - Every insert, update, or delete must verify the caller's role before executing — no authorization bypasses
  - New tables must follow RLS conventions: manager=barn-scoped, trainer=self-only write + barn read, rider=barn read; use `auth_is_*` helper functions; RLS policies in a separate migration
  - No reference to an `admin` role anywhere — the only roles are `manager`, `trainer`, and `rider`
  - Null guards must be present at all runtime boundaries (user input, external API responses)
  - Existing migration files must not be edited — any database change requires a new migration file
  - Check whether the implementation *attempts* to satisfy the issue's acceptance criteria (code exists that addresses each AC). AC *verification* — running the app, running named e2e/checklist tests, confirming behavior end-to-end — is always `/testIssue`'s job, never `/reviewIssue`'s; do not flag an AC as a finding just because it hasn't been verified yet (e.g. `npm run test:checklist:auto` not run). Only flag here if the diff itself shows no attempt to address an AC at all.
  - **Never flag migration file timestamp/ordering** (e.g. a new migration's filename sorting before another migration it references, depends on, or is a "follow-up" to) as a finding of any kind — not as a blocking issue, not as a low-confidence nitpick, not as an "accepted deviation" aside. If `Verify Migrations` passed in Step 2, the ordering is non-blocking by definition, and `/testIssue`'s `sync-migrations` step renames every migration into correct order automatically before merge regardless of what order they were created in during review — surfacing it here is pure noise the user has to re-dismiss every round. This applies to every agent's output, not just this one; drop any such finding before it reaches Step 5's output.
  - If the PR diff includes any file under `supabase/migrations/`, add a low-confidence suggestion (score 25 by default): "This PR changes schema — verify whether `reset-db.ts` needs to reflect the change (new required columns, renamed tables, new RPC signatures, or removed columns it references)." Raise to score 50 only if the diff clearly adds a NOT NULL column or modifies a table/RPC that `reset-db.ts` writes to.
  - **E2E spec maintenance (CLAUDE.md's "E2E spec maintenance" rule):** if the diff removes, renames, or restructures a page, component, or user-facing flow, grep `e2e/*.spec.ts` for the route/selector/copy the diff touches. If any spec references it and the diff includes no matching change under `e2e/`, add a finding at score 75 by default (this is the exact mechanical check CLAUDE.md's rule already prescribes, not a stylistic judgment call): "This PR changes UI that `{spec file}` asserts on ({matched selector/text}) but doesn't update that spec — it will likely start failing or silently testing removed UI." Don't flag PRs whose diff has no matching `e2e/` reference at all — this check is only for UI changes with existing coverage, not a blanket "add e2e tests" nag.
  - If a finding relates to work that is explicitly covered by one of the downstream open issues (from Step 3), suppress it and note which downstream issue covers it instead

For each issue found, launch a parallel Sonnet agent with the issue description, the PR diff, and the relevant CLAUDE.md content. (Sonnet, not Haiku: this is the gate that silently drops anything scoring below 50, and the rubric asks the agent to *verify* a finding against the diff rather than classify it — a wrong 0 loses a real bug with no trace.) Ask it to score confidence on this rubric (give the agent this verbatim):

> a. 0: Not confident at all. False positive that doesn't stand up to light scrutiny, or a pre-existing issue.
> b. 25: Somewhat confident. Might be real, but hard to verify. If stylistic, not explicitly called out in CLAUDE.md.
> c. 50: Moderately confident. Verified as real but may be a nitpick or rare in practice.
> d. 75: Highly confident. Double-checked, very likely to be hit in practice. Important issue or directly mentioned in CLAUDE.md.
> e. 100: Absolutely certain. Definitely real, will happen frequently. Evidence directly confirms it.

Filter out any findings with a score below 50.

---

## Step 5 — Output findings

Print all findings to the terminal in this format:

```
### Review findings

Found {N} issue(s):

1. <brief description> (<reason: CLAUDE.md says "..." / bug due to <context> / convention: <rule>>)

   <file path and relevant line range>

2. ...
```

If no issues passed the confidence threshold, print:

```
### Review findings

No issues found. Checked for bugs, CLAUDE.md compliance, and project conventions.
```

---

## Step 6 — Feedback loop

After printing the findings, ask: "What changes would you like to make? (or say 'done' to finish)"

Wait for the user's response.

**If the user says "done":** check `## Open items` for unresolved (`- [ ]`) entries first (see the classification step below — this round may have just added some).

- **If none:** if `## Open items` had the `since_sha` marker at Step 3 (the scoped-re-review case), clear just that marker line now — leave the rest of `specs/issue-{N}.md` alone, it's a persistent work log, not a scratch file this skill owns. Append `- {date} {time} — /reviewIssue: {N} round(s) of fixes, done.` to `## Log` and set the status marker to `in-review`. Then print:
  ```
  Next: run /testIssue to sync migrations if needed, start the local dev server, and verify acceptance criteria against it.
  ```
  Stop. Do not run any further steps.
- **If unresolved entries exist:** this round deferred at least one substantial in-scope finding (see below) — it needs a proper TDD pass via `/beginIssue`'s revise mode, not further work in this session. Leave the status marker as-is (still `in-progress`) and the PR in draft. Append `- {date} {time} — /reviewIssue: {count} concern(s) deferred, PR staying in draft — resume via /beginIssue {N}.` to `## Log`. Then print:
  ```
  PR #{pr} stays in draft. Run /beginIssue (no arguments) to resolve the deferred concerns in specs/issue-{N}.md via proper TDD, then re-run /reviewIssue.
  ```
  Stop. Do not run any further steps.

**If the user dismisses a finding instead of asking for a fix** (e.g. "that one's fine, leave it" / "that's a separate issue, not this PR's problem"): don't silently drop it — classify and log it, same as any other input:
- **Accepted as-is:** append to `## Accepted deviations`: `- {date} {time} — {finding summary}. {one-line reason it's fine}.`
- **Real but out of scope, needs its own issue:** append to `## Follow-ups (needs own issue)`: `- {date} {time} — {2-4 sentence paragraph: what it is, why it's out of scope for #{N}}.`

Then move to the next finding, or re-ask "anything else?" if that was the last one — this doesn't require the coverage/doc/commit/push steps below since no code changed.

**If the user provides inputs requesting an actual fix, classify before touching any code** — same rubric `/testIssue` uses for deferred findings:

**Minor vs. substantial**, stated with a one-line reason (e.g. "Minor — single existing assertion needs updating." / "Substantial — this needs new test coverage for a state transition that doesn't exist yet."). The user can override in the moment — treat that as final.

- **Minor** (a self-contained tweak: copy, style, an off-by-one, updating one existing test's assertion): fix inline now:
  1. Make the requested change in the worktree.
  2. Run coverage:
     ```
     cd {worktree-path} && bash scripts/check-coverage.sh
     ```
     If coverage fails, read the output to identify uncovered lines. Write tests to cover those lines. Re-run coverage until it passes.
  3. Run the documentation check. Inspect the diff between the base branch and HEAD:
     ```
     git -C {worktree-path} diff {base-branch}...HEAD -- src/
     ```
     Check whether any of the following changed in a way that affects documentation:
     - New or renamed routes, pages, or API endpoints
     - New or changed database tables, columns, or relationships
     - New or changed roles, permissions, or RLS policies
     - New or changed environment variables or configuration
     - New or changed architectural patterns, abstractions, or dependencies
     - Removed or deprecated features

     If any apply, re-read `CLAUDE.md`'s documentation rules and update every doc they mandate for this change — not just `ARCHITECTURE.md` and `README.md`. `CLAUDE.md` is the authority; the sections that can be triggered are Architecture Docs (schema/RPC/route/DAL detail goes in `docs/architecture/*.md`, with only a one-line index entry in `ARCHITECTURE.md`), Barn Data Backup (`src/lib/db/backup.ts`), Privacy Policy, User Guides, Pre-Release Checklist, and Post-Release Checklist. Stage whatever you changed alongside the other changes.
  4. Generate a short commit message describing what was changed and commit:
     ```
     cd {worktree-path} && git add {changed-files} && git commit -m "[#{N}] {short description}"
     ```
  5. Push the commit:
     ```
     cd {worktree-path} && git push
     ```
  6. Ask: "Anything else to address, or are you done?"

- **Substantial** (needs new test cases for new logic/behavior, touches DB schema/RPC, spans multiple files or introduces a new abstraction, or is better described as a design gap than a bug): **do not modify code.** Also classify **in-scope vs. out-of-scope**, stated with a one-line reason (same override rule applies):
  - **In-scope:** append (in memory, for this round) an entry for `## Open items`: `{finding summary} — found in review. Why deferred: {reason}`. No code changes, no commit — the actual fix happens later via `/beginIssue`'s revise mode.
  - **Out-of-scope:** append to `## Follow-ups (needs own issue)`: `- {date} {time} — {2-4 sentence paragraph: what it is, why it's out of scope for #{N}}.`

  Either way, ask "Anything else to address, or are you done?" and move on — this finding doesn't get fixed in this session.

Repeat from the top of this step until the user signals done.

**Once the whole round is exhausted** (right before evaluating the "done" branch above), if this round produced any new `## Open items` entries, write them: refresh the `<!-- since_sha: {current HEAD sha} -->` comment to the current HEAD (adding it if the section had none) and append each new entry as `- [ ] {entry text}`, keeping any pre-existing unresolved entries from a prior round.

---

That's the end of `/reviewIssue`. Once the user has said "done" and a next-step hint above has been printed, this skill's job is finished — the next step in the workflow is `/testIssue` (clean round) or `/beginIssue` (deferred concerns to resolve first).
