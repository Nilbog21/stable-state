You are helping the user pick the next GitHub issue to work on and begin implementing it through iterative design review.

> **Recommended model: Opus.** Design review plus the first implementation — mistakes made here propagate into every downstream skill. Set with `/model` before invoking.

## Step 0 — Check worktree and issue

**Detect context first:**

This project is developed across parallel git worktrees — see README.md's "Development worktrees" section for what they are, where they live, how their `.env.local` is arranged, and the port each one uses.

```bash
bash scripts/workflow-context.sh
```
Parse the `key=value` lines it prints. It never fails — a field it couldn't determine comes back empty, because only this session can prompt for it. Record `worktree`, `worktree_path`, `port`, `branch`, and `issue`. If `worktree` is empty, note that worktree selection is pending (it happens after issue confirmation).

**Check for an issue number.** If the user provided one when invoking the skill (e.g. `/beginIssue 42`), use it and skip to **Issue confirmation** below. Otherwise:

**If `worktree` is non-empty**, check whether the current branch is already mid-revise before doing anything else. If the script reported an `issue` (i.e. the branch is in `{issue-number}-{slug}` format), check for a matching specs file: `ls specs/issue-{N}.md`. If it exists, work has already started on this issue — treat `{N}` as if the user had typed it (skip the batch-file/Ready-list flow entirely) and go straight to **Issue confirmation** below. Worktree Setup will then recognize the branch already exists and continue on it (no new branch, no base-branch checkout). (Whether this is specifically a revise-mode resume (deferred concerns from `/testIssue` or `/reviewIssue`), vs. just picking a normal in-progress session back up, is decided by the **Revise mode** section below based on the file's `## Open items` contents — the file's mere existence isn't a strong enough signal on its own, since every issue gets one from its first `/beginIssue` touch onward.)

If the script reported no `issue`, or there's no matching specs file, fall through to the normal flow: determine the current release and read the batch file:

```bash
git fetch --all -p
git branch -r --list 'origin/release/release-*' | sed 's|.*origin/release/||' | sort -t- -k2 -n | tail -1
```
Record as `{release-label}`. Batch file is `specs/batch_{release-label}.md`.

If that file doesn't exist, tell the user to run `/issueBatch create` first and stop.

Invoke `/issueBatch pick 1` and use what it returns. The count is 1 because the worktree this session is already standing in is the slot being filled — `pick`'s free-worktree detection isn't consulted here.

Read the **Blocked** section as-is for display — no live re-check needed there, `/issueBatch create`/`prune` keep it current.

Display `pick`'s fill plan (a single entry, given `N` = 1), preceded by the batch context:
```
## Current Batch — {release-label}

**Ready:**
- #N — Title [labels] — unblocks: {K}
...

**Blocked:**
- #N — Title — blocked by #M, #P
...
```

Then ask: "Which issue do you want to work on?" — `pick`'s suggestion is a recommendation, not a selection, and the user may name any issue. Wait for their answer.

**Issue confirmation:** fetch the chosen issue with `gh issue view <N> --json number,title,labels,body`, check whether it has a `blocked`, `needs-*`, or `depends-on` label, or body text matching `depends on #N`, `blocked by #N`, `prerequisite: #N`, or `requires #N` where N is still open. If so, warn the user before continuing. Then go to **Worktree Setup** below, then skip directly to Step 4 (Design review).

---

## Worktree Setup

Run this after issue confirmation (Step 0), before entering Plan mode.

**Determine the base branch:**
```bash
bash scripts/workflow-context.sh {N}
```
Re-run with the chosen issue number as the argument — the branch may not exist yet, so the labels of `{N}` are what the base has to come from. `base` is the answer; `scripts/workflow-context.sh` is the one place that label rule lives.

- If `base` is a `release/release-N` branch, record `release-N` as `{release-label}` if not already set from Step 0 — Step 4 uses it to update the batch file.
- Check that branch exists on the remote: `git fetch origin {base} 2>&1`. If it does **not** exist, tell the user: "The release branch `{base}` doesn't exist yet. Should I create it from `main` now?" Wait for confirmation before running: `git checkout -b {base} main && git push -u origin {base}`

**Select the worktree:**
- If Step 0's `worktree` is non-empty, use `worktree_path`.
- Otherwise, ask: "Which worktree do you want to use — {one of Step 0's `worktrees`}?" and wait for the answer. The worktree path is that name under the `stable-state-worktrees` directory. Don't re-run the script here — unlike the other four skills, this one selects a worktree *after* Step 0 and after `base` is settled, and every command below passes `{worktree-path}` explicitly, so a re-run would only surface the leftover branch/PR of whatever was last checked out there.

**Pull latest and create issue branch:**

Branch name format: `{issue-number}-{slugified-title}` (lowercase, spaces → hyphens, strip special characters).

Check whether the branch already exists:
```
git -C {worktree-path} fetch origin
git -C {worktree-path} branch --list {branch-name}
```

- If the branch **does not exist**, create it:
  ```
  git -C {worktree-path} checkout {base}
  git -C {worktree-path} pull --ff-only origin {base}
  git -C {worktree-path} checkout -b {branch-name}
  ```
- If the branch **already exists**, check `{worktree-path}/specs/issue-{N}.md`'s `## Open items` section first. If it has unresolved entries, this is a resumed `/testIssue` session with deferred concerns to resolve — always continue on the existing branch (`git -C {worktree-path} checkout {branch-name}`), never ask about recreating it; recreating would destroy the work already on it. Otherwise (no unresolved entries, or no file at all), ask the user: "Branch `{branch-name}` already exists — continue on it, or delete and recreate from `{base}`?" Then:
  - **Continue:** `git -C {worktree-path} checkout {branch-name}`
  - **Recreate:** `git -C {worktree-path} branch -D {branch-name} && git -C {worktree-path} checkout {base} && git -C {worktree-path} pull --ff-only origin {base} && git -C {worktree-path} checkout -b {branch-name}`

All subsequent commands must run inside this worktree. Use `cd /absolute/path/to/worktree && ...` for every command.

Tell the user the worktree path and branch name so they can open it in their editor.

---

## Revise mode — resolving deferred /testIssue concerns

Check `{worktree-path}/specs/issue-{N}.md`. If it doesn't exist, or exists but its `## Open items` section has no unresolved (`- [ ]`) entries, skip this whole section — proceed to Step 4 below as normal (Step 4 will read the file if present rather than create it fresh).

**If `## Open items` has unresolved entries**, this issue already has an open PR and was sent back here by `/testIssue`'s "start a fresh session later" path or `/reviewIssue`'s deferred-substantial-finding path. Skip Step 4's assign/in-progress-label calls entirely (already done in the original session) and run this instead:

1. Print the file's `## Open items` entries so the user sees the scope.
2. **Read `ARCHITECTURE.md`** from the worktree, same as Step 4 would.
3. Enter Plan mode (`EnterPlanMode`, loaded via `ToolSearch select:EnterPlanMode` if not already loaded) scoped **only** to closing the gaps listed in the file — not a fresh review of the issue's full original acceptance criteria. The plan should cover, per deferred entry: the fix approach and the test(s) that will cover it.
4. After approval, run the same TDD loop Step 5 uses below, plus a lint pass (this is the whole reason revise mode exists — the deferred items were substantial enough to warrant going through this properly instead of a rushed inline fix):
   - Write a failing test, confirm red (`npx vitest run {test-file}`, or the single-spec Playwright command from Step 5's "Which runner the red-green loop uses" when the deliverable is an e2e spec), commit `[#{N}] Add failing tests: {short description}`.
   - Implement, confirm green, commit `[#{N}] {short description}`.
   - Coverage: `bash scripts/check-coverage.sh` — fix gaps, re-run until clean.
   - Lint: `npm run lint` — fix issues, re-run until clean.
   - Remove the resolved entry from `## Open items` as each one lands. The same deviation checkpoint from Step 5 above applies here too — any incidental unrelated change gets the same ask-and-log treatment.
5. Documentation check (same criteria as Step 5 below) if any deferred fix touched routes, schema, roles, config, or architecture — update `ARCHITECTURE.md`/`README.md` and amend.
6. Once every `## Open items` entry is resolved, strip that section down to just its `since_sha` header comment — leave `## Log`, `## Accepted deviations`, and `## Follow-ups (needs own issue)` untouched. `/reviewIssue` uses the `since_sha` marker to scope its next review pass to just these fix commits, and clears it itself once that pass is done. Append `- {date} {time} — /beginIssue: revise-mode fixes complete, PR #{pr} updated.` to `## Log` and set the status marker to `in-progress`.
7. Push the branch (a PR already exists, so skip Step 5's PR-creation entirely):
   ```
   cd {worktree-path} && git push
   ```
8. Print:
   ```
   Resolved. PR #{pr} updated — run /reviewIssue next.
   ```
   (fetch `{pr}` via `gh pr view --json number` if not already known). Stop — do not run Step 4 or Step 5 below.

---

## Step 4 — Assign and design review

**Create or read the work log:** check `{worktree-path}/specs/issue-{N}.md`.
- **If it doesn't exist** (the normal case — this is the very first `/beginIssue` touch on this issue), create it now:
  ```markdown
  # Issue #{N} — Work Log

  <!-- status: in-progress -->

  ## Log
  - {date} {time} — /beginIssue: started.

  ## Accepted deviations

  ## Open items

  ## Follow-ups (needs own issue)
  ```
- **If it already exists** (rare outside revise mode, e.g. a re-run after an interrupted session), read it for context and leave it as-is for now — the Step 5 append below still applies.

**Assign the issue before entering Plan mode:**
- Run: `gh api repos/{owner}/{repo}/issues/{N}/assignees -X POST -f "assignees[]=$(gh api user --jq .login)"`
- (`gh issue edit --add-assignee` fails with exit code 1 due to Projects classic deprecation.)
- Confirm the assignment succeeded before proceeding.

**Mark the issue in-progress:**
- Run: `gh issue edit {N} --add-label 'in-progress'`

**Update the batch file:** if `{release-label}` is set and `specs/batch_{release-label}.md` exists and contains an entry for `#{N}`, move that entry — its first line **and every indented line beneath it, `note:` lines included** — from Ready or Blocked into the **In Progress** section, then append ` (in progress: branch {branch-name})` to the end of its existing first line. Move the lines that are already there; don't retype the entry from a template — a reconstructed line has nowhere to put the `note:` prose beneath it, which is exactly how this step destroyed notes until #1237. See `/issueBatch`'s "The batch file format" section. If the batch file doesn't exist, or has no entry for this issue (e.g. it was picked by number directly and never went through `/issueBatch create`), skip silently — this is a best-effort sync, not a requirement.

**Read `ARCHITECTURE.md`** from the worktree (`{worktree-path}/ARCHITECTURE.md`) before drafting the plan. This is the authoritative source for the current database schema and architecture — do not trawl through migrations instead.

Then enter Plan mode by calling the `EnterPlanMode` tool (load it first with `ToolSearch select:EnterPlanMode` — it is a deferred tool, **not** a skill; never call `Skill("EnterPlanMode")`). Walk through the implementation design with the user iteratively. The plan should cover:
1. Scope: what is and is not included in this issue
2. Approach: the high-level technical strategy
3. Test plan: which behaviors to test and how (follow TDD — tests are written before implementation)
4. Implementation steps: ordered list of discrete coding tasks

Do not exit Plan mode or write any code until the user has explicitly approved the plan.

## Step 5 — Execute after approval

**Deviation checkpoint — before every commit in this section:** check whether the staged files include anything not obviously covered by the approved plan's implementation steps. If everything staged matches the plan, commit as normal, no further action. If something doesn't (an incidental unrelated fix, a stray config tweak, etc.), stop and ask:

> "`{file}` isn't part of the plan for #{N} — keep it in this PR (low-impact, roll with it), revert it, or does it need its own issue?"

- **Roll with it:** commit as normal, then append to `specs/issue-{N}.md`'s `## Accepted deviations`: `- {date} {time} — {file}: {one-line description}. {one-line reason it's fine to include}.`
- **Revert:** unstage/discard the change before committing. No log entry needed — nothing shipped.
- **Needs its own issue:** commit as normal (the change still ships in this PR if it's already made and low-impact — same as "roll with it" — unless the user says otherwise), then append to `specs/issue-{N}.md`'s `## Follow-ups (needs own issue)`: `- {date} {time} — {2-4 sentence paragraph: what it is, how it was noticed, why it's out of scope for #{N}}.` This does not create a GitHub issue directly — per existing convention, `/grillMe` is the path for turning findings into issues (run `/grillMe specs/issue-{N}.md` whenever, or `/finishIssue` will remind you at the end if it's still there).

After plan approval, do the following in order:

**Which runner the red-green loop uses:** `npx vitest run {test-file}` for a unit/integration test, but when the deliverable *is* an e2e spec (as it is for every issue in the #1187–#1208 checklist-automation batch), the loop runs Playwright instead:

```
cd /absolute/path/to/worktree && bash scripts/run-checklist-suite.sh --base-url http://localhost:{port} --spec {spec-file}
```

**Only the spec under construction** — no regression subset, no full suite. `/testIssue` Step 4 computes the diff's blast radius and runs it minutes later anyway, so a broader run here is duplicated cost, and on `/fableFleet` a full run also burns the fleet-wide mutex. The run protocol — backgrounding it, reading `{worktree-path}/checklist-suite.log` rather than the tool result, the freshness header and exit terminator that say the log is yours and finished, the worktree port — is stated once in `/testIssue` Step 4. Follow it there; it isn't restated here. The mutex itself is `/fableFleet`'s, and is stated in its Step 5.

A new spec also needs its `// covers:` declaration lines (see `scripts/CLAUDE.md`) — `scripts/ci.sh` fails without them.

If this issue will **add** a `PRE_RELEASE_TEST_CHECKLIST.md` line (step 4's doc check states the rule), settle that line's tag *now*, before step 1. `(e2e: <test name>)` makes the covering spec a deliverable of this issue, and it goes through the red-green loop below like any other test — deciding it at step 4 instead strands the spec after the loop it was supposed to drive.

1. **Write failing tests first** — following the project's TDD convention. Run the tests to confirm they are red before committing:
   ```
   cd /absolute/path/to/worktree && npx vitest run {test-file}
   ```
   Once confirmed red, commit:
   ```
   cd /absolute/path/to/worktree && git add {test-files} && git commit -m "[#{number}] Add failing tests: {short description}"
   ```

2. **Implement** the issue by making the failing tests pass. Run the tests to confirm they are green before committing:
   ```
   cd /absolute/path/to/worktree && npx vitest run {test-file}
   ```
   Once confirmed green, commit:
   ```
   cd /absolute/path/to/worktree && git add {changed-files} && git commit -m "[#{number}] {short description}"
   ```

3. **Verify coverage after implementation:**
   Once the tests are passing, run the coverage check from within the worktree:
   ```
   cd /absolute/path/to/worktree && bash scripts/check-coverage.sh
   ```
   The script fails with a list of uncovered lines if any `src/` code is not exercised by tests. If it fails, write additional tests to cover the missing lines, then commit:
   ```
   cd /absolute/path/to/worktree && git add {test-files} && git commit --amend --no-edit
   ```

4. **Update documentation if relevant:**
   After all tests pass and coverage is satisfied, review the changes in the worktree:
   ```
   cd /absolute/path/to/worktree && git diff {base}...HEAD -- src/
   ```
   Check whether any of the following changed in a way that affects the project's documentation:
   - New or renamed routes, pages, or API endpoints
   - New or changed database tables, columns, or relationships
   - New or changed roles, permissions, or RLS policies
   - New or changed environment variables or configuration
   - New or changed architectural patterns, abstractions, or dependencies
   - Removed or deprecated features

   If any of the above apply, re-read `CLAUDE.md`'s documentation rules and update every doc they mandate for this change — do not assume `README.md` and `ARCHITECTURE.md` are the only two. `CLAUDE.md` is the authority; the sections that can be triggered are Architecture Docs (schema/RPC/route/DAL detail goes in `docs/architecture/*.md`, with only a one-line index entry in `ARCHITECTURE.md`), Barn Data Backup (`src/lib/db/backup.ts`), Privacy Policy, User Guides, Pre-Release Checklist, and Post-Release Checklist. If this change **adds** a `PRE_RELEASE_TEST_CHECKLIST.md` line, that section's born-automated-or-justified-manual rule applies: tag it `(e2e: <test name>)`, with the covering spec written in this same PR — through the red-green loop above, not here — or `(manual)` with the reason stated on the line. Leaving the line untagged and tagging it `(e2e-candidate)` are equally not options for a line you are adding. Stage and commit whatever you changed:
   ```
   cd /absolute/path/to/worktree && git add {changed-doc-files} && git commit --amend --no-edit
   ```
   If no doc needs changes, skip this step without creating a commit.

5. **Open a PR:**
   Push the branch from within the worktree:
   ```
   cd /absolute/path/to/worktree && git push -u origin {branch-name}
   ```
   Then create the PR:
   ```
   gh pr create --draft --base {base} --title "#{number} — {title}" --body "$(cat <<'EOF'
   Closes #{number}

   {deviations — omit this section entirely if there are none}
   EOF
   )"
   ```
   The body should contain only deviations from the issue — anything added, removed, or done differently. If the implementation exactly matches the issue, the body is just `Closes #{number}` with nothing else. Do not re-summarize the issue.

   Then assign the PR via REST (capture PR number from the URL returned above):
   ```
   gh api repos/{owner}/{repo}/issues/{pr}/assignees -X POST -f "assignees[]=$(gh api user --jq .login)"
   ```

   Return the PR URL to the user.

**Append to the work log:** append `- {date} {time} — /beginIssue: plan approved, PR #{pr} opened.` to `specs/issue-{N}.md`'s `## Log`. `specs/` is gitignored, so this is just a file write — no git add/commit. Status marker stays `in-progress`.

**Never push Supabase migrations.** Do not run `npx supabase db push`, `supabase db push`, or `/sync-migrations` at any point. The developer running this skill reviews and pushes migrations by hand, in a separate step.

Don't mention that in the summary you return to the user either (this is about your chat reply, not the PR body — that's covered above) — no closing "not pushed: the migration, you'll push it manually" remark. Migrations are *always* left unpushed here by design, and deciding what to do about them is `/reviewIssue`/`/testIssue`'s step, not a decision point for the user at this moment. Repeating it is noise.

**Migration file naming:** Use `date +%Y%m%d00%M%S` for the timestamp prefix (real minutes+seconds, HH fixed to `00`). Never use a sequential counter.
