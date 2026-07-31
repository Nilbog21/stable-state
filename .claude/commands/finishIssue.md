You are finishing a completed issue: merging its PR, deleting the branch, and closing the issue.

> **Recommended model: Sonnet.** Merge, delete branch, close issue, clean up the work log — a scripted sequence. Set with `/model` before invoking.

---

## Step 0 — Detect worktree and issue

This project is developed across parallel git worktrees — see README.md's "Development worktrees" section for what they are, where they live, how their `.env.local` is arranged, and the port each one uses.

```
bash scripts/workflow-context.sh
```

Parse the `key=value` lines it prints. It never fails — a field it couldn't determine comes back empty, because only this session can prompt for it.

- `worktree` empty → ask "Which worktree do you want to use — {one of `worktrees`}?" and wait for the answer; the worktree path is that name under the `stable-state-worktrees` directory. Re-run the script from there.
- `issue` empty → ask "I couldn't detect an issue number from the branch name. What issue number is this work for?" Wait for the answer, then re-run the script with that number as its argument so `base` is derived too.

Record `worktree`, `worktree_path`, `port`, `issue` as `{N}`, `base` as the expected base branch, and `base_from_label` — Step 1 uses it.

---

## Step 0.5 — Check for outstanding open items

Check whether `{worktree-path}/specs/issue-{N}.md` exists. If it doesn't, skip this step entirely (legacy branch predating this convention).

Read the file's `## Open items` section for unresolved (`- [ ]`) entries.

**If unresolved entries exist:**

> "specs/issue-{N}.md still has unresolved open items:
> {list of unresolved entries}
>
> These are deferred concerns that haven't been resolved via `/beginIssue`'s revise mode. Continue finishing anyway? (yes/no)"

Wait for confirmation. If no, stop — tell the user to run `/beginIssue {N}` to resolve them first. If yes, continue to Step 1 and leave the file as-is.

**If `## Open items` is empty**, nothing to gate on here — continue to Step 1. (Whether the whole file gets deleted or kept around for pending `## Follow-ups` entries is decided at the very end, in Step 6.5 — this step only gates the merge itself.)

---

## Known friction: Auto Mode classifier blocks on Step 4 / Step 5

Auto Mode is a Claude Code harness setting that auto-approves tool calls a safety classifier judges routine, rather than prompting a human for each one. It is not project tooling, and nothing in this repo configures it — but it interacts badly with how this workflow reviews PRs, as follows.

`/reviewIssue` and `/testIssue` never post an actual GitHub PR review (no `gh pr review` call anywhere in either skill) — they do a real review (multi-agent audit, acceptance-criteria walkthrough) entirely inside the session, so every PR this skill merges has zero native review evidence (`reviews: []`, empty `reviewDecision`), and the PR author and the account doing the merge are the same GitHub identity. When Auto Mode is active, its classifier can intermittently (confirmed non-deterministic — same repo state, different verdict run to run) block the Step 4 merge or the Step 5 issue-close, citing "merge without review."

**If this happens, do not try to route around it.** Two things look like fixes but are correctly blocked and will waste turns:
- Posting `gh pr review --approve` yourself to manufacture review evidence — blocked as self-approval (same account approving its own PR).
- Editing `settings.json` to allow-list the blocked command — blocked as self-modification of safety config, even via a delegated skill call.

**What actually works:** tell the user exactly which command got blocked and why, then ask them to toggle Auto Mode off and confirm. Once off, retry the identical command — it routes through a normal human permission prompt instead of the classifier, and goes through immediately. Don't suggest they re-enable Auto Mode; that's their call.

---

## Step 1 — Fetch and confirm PR target

```
gh pr view --json number,title,baseRefName,headRefName,state
```

**If state == MERGED**, this PR was already merged by a prior run. Check the issue:
```
gh issue view {N} --json state
```
- If the issue state is also `CLOSED`: print "Issue #{N} is already finished — PR #{pr} merged and issue closed. Nothing to do." and **stop**. Do not run any further steps.
- If the issue is still `OPEN`: print "PR #{pr} is already merged; resuming to finish closing out issue #{N}." then **skip directly to Step 4.5**, skipping Steps 1.5–4 entirely.

Otherwise, display:
```
PR #{pr}: {title}
  head: {headRefName}
  base: {baseRefName}
  state: {state}
```

**If the PR is still in draft state, determine readiness from the work log instead of asking.** Read `specs/issue-{N}.md`'s status marker:

- `status: ready` → trust it: silently run `gh pr ready {pr}` (idempotent — harmless if it's already ready for some other reason) and continue. No question asked.
- `status: testing` → stop, print: "specs/issue-{N}.md shows /testIssue's last round didn't mark this ready yet (deferred items pending, or it's mid a fresh-session revise). Resolve those, then re-run /testIssue." Do not continue.
- `status: in-progress` or `in-review` (or any other value short of `ready`) → stop, print: "specs/issue-{N}.md shows /testIssue hasn't run yet. Please run /testIssue first." Do not continue.
- **File doesn't exist** (a legacy branch that predates this convention — nothing to trust) → fall back to asking: "PR #{pr} is still a draft. Have you reviewed and tested it? If yes, I'll mark it ready and continue — if not, finish your review first and then re-run `/finishIssue`." Wait for confirmation, then run `gh pr ready {pr}` and continue.

**Reconcile the `in-progress` label.** Whether or not the PR was in draft above, check `gh issue view {N} --json labels`. If `specs/issue-{N}.md` exists (work is or was active on this issue) but `in-progress` is missing — e.g. a `/clear` interrupted an earlier skill before its label call landed — silently re-add it: `gh issue edit {N} --add-label 'in-progress'`. No need to ask; it's removed again at Step 5 as normal.

**Try to auto-verify the target instead of asking.** Step 0's `base` is the expected base branch — derived from the issue's labels by `scripts/workflow-context.sh`, the one place that rule lives.

If Step 0's `base_from_label` is `no`, no label actually decided that base — `main` is just the fallback. Skip straight to asking below rather than auto-confirming: this is the merge, and an issue that reached it untriaged is exactly the case worth a human glance.

Otherwise confirm both:
1. `{baseRefName}` equals `base`.
2. The branch is properly rooted on it, not stale:
   ```
   git -C {worktree-path} fetch origin {base}
   git -C {worktree-path} merge-base --is-ancestor origin/{base} {headRefName}
   ```
   (exit code 0 = head branch already contains that base's current tip)

If both hold, skip the confirmation prompt — print:
> "PR #{pr} targets '{baseRefName}', matching the base expected from the issue's labels and correctly rooted on it — skipping confirmation."

and continue straight to Step 1.5.

Otherwise (`base_from_label` is `no`, base mismatch, or the branch isn't rooted on the expected base's current tip), ask: "PR #{pr} targets branch '{baseRefName}' — is that correct?"

Wait for confirmation before proceeding. If the user says no, stop and tell them to fix the PR target manually using `gh pr edit --base {correct-branch}`, then re-run `/finishIssue`.

---

## Step 1.5 — Verify migrations are synced

Check whether this PR touches migrations:
```
gh pr diff {pr} --name-only | grep '^supabase/migrations/'
```

If no files match, skip this step entirely.

If migration files are present, run:
```
npx supabase migration list
```

For every migration filename found in the PR diff, confirm it appears in **both** the `Local` and `Remote` columns of the output (i.e. it has actually been pushed — not just present locally).

**If any of this PR's migrations are missing from the `Remote` column:**

> "This PR includes migration(s) that haven't been pushed to remote yet: {list}. Merging without syncing leaves the schema live only in this branch's files, not the actual database — the next branch to rebase past this one will hit the same 'remote-only vs pending' mismatch and may need `--include-all` to untangle it. Run `/sync-migrations` first, then re-run `/finishIssue`."

Stop. Do not proceed to Step 2 until the user confirms the sync is done and this check passes.

**If all of this PR's migrations already show in both columns**, continue to Step 2.

---

## Step 2 — Wait for CI and Vercel checks

Wait for CI in a single blocking call — do **not** poll `gh pr checks` yourself:
```
cd {worktree-path} && bash scripts/workflow-ci-wait.sh {pr}
```
Run it with the Bash tool's `timeout` set to `360000` (the default is 120s; the script blocks for up to 5 minutes). The `cd` matters — the script resolves the repo from the working directory. It handles the merge-conflict check, the head-SHA cross-check against the real workflow runs, and the 5-minute cap internally, and prints exactly one verdict line (except on exit 4, which prints nothing — last branch below). Branch on that line:

**`CI: pass`** — continue to Step 3.

**`CI: conflict — rebase needed`** — no new workflow run will ever appear for the current head SHA while the PR is `CONFLICTING`, so this is not a stuck runner. Resolve the conflict inline rather than stopping and deferring to `/reviewIssue`:

1. Confirm the worktree is clean (`git status`) before touching history.
2. `git fetch origin {baseRefName}`, then `git rebase origin/{baseRefName}`.
3. For each conflict git reports, read both sides with intent, not just pick-a-side:
   - `git show {commit}` for the conflicting commit explains what it was trying to do.
   - Check whether the conflict is because this PR's own change (e.g. deleting a whole section/feature) makes one side's content moot — if so, take the deletion, don't try to preserve dead code.
   - Check whether the upstream side made an unrelated concurrent change (e.g. a helper rename, a new field) that both this PR's kept code and the deleted code depended on — if so, thread the upstream change through the surviving code rather than dropping it.
   - After editing, `grep` the whole diff (or repo) for stray `<<<<<<<`/`=======`/`>>>>>>>` markers and for now-unused imports/mocks left behind by whichever side you didn't keep.
4. `git add` each resolved file, `git rebase --continue`, and repeat for any further conflicting commits in the series.
5. Once the rebase finishes, run the affected test files and a full typecheck (`npx tsc --noEmit`) — a clean rebase can still hide a semantic conflict (e.g. two features editing the same function's behavior) that no `<<<<<<<` marker would catch.
6. `git push --force-with-lease origin {headRefName}` (rebase rewrites history, so this is a real force-push — call it out to the user as such before running it, per the standing force-push safety norm).
7. Re-run the script to confirm the conflict is gone and to pick the CI wait back up.

Only fall back to telling the user to resolve it themselves (e.g. via `/reviewIssue`) if the conflict is large/ambiguous enough that guessing intent would be reckless — a docs-table or generated-file conflict is normally safe to resolve inline; a genuine logic conflict between two features' behavior is not.

**`CI: timeout after 5m — {checks}`** — usually a slow or stuck runner, but not always: since #1155 a single unsettled `CONFLICTING` read landing on the deadline also reports the timeout (with `conflict reported once — re-checking` among the pending names) rather than a conflict the gate never confirmed. Stop, print which checks are still running, and tell the user to re-run `/finishIssue` when they complete — if that pending reason is in the list, the re-run is also what settles the mergeability question.

**`CI: fail — {checks}`** —

> "The following checks did not pass: {list}. Fix these before merging."

Stop. Do not continue.

**No verdict line at all (exit 4)** — the script's own `gh` or `jq` call failed (network blip, rate limit, expired auth), not CI. Silence is never a pass, and hand-polling `gh pr checks` is not the fallback — that's the loop this script exists to replace. Re-run the script once; if it exits silently again, stop and ask the user to check `gh auth status` and their network. Never merge without a `CI: pass`.

---

## Step 3 — Set assignee

```
gh api repos/{owner}/{repo}/issues/{pr}/assignees -X POST -f "assignees[]=$(gh api user --jq .login)"
```

(`gh pr edit --add-assignee` fails with exit code 1 due to Projects classic deprecation.)

---

## Step 4 — Merge and delete branch

(If either command below gets denied by the auto mode classifier, see "Known friction" above — don't try to self-approve or edit permissions, ask the user to toggle Auto Mode off and retry.)

**Before merging:** a `CI: pass` taken before a push is stale for the new head — after any push, re-verify by re-running `bash scripts/workflow-ci-wait.sh {pr}` and require a fresh `CI: pass`. Branch on that verdict exactly as Step 2 does; do not merge on anything but a pass.

Re-run it unconditionally here rather than only when this session pushed. Step 2's conflict branch already re-verifies at its own step 7, so that isn't the case this guards — the head can have moved for reasons this skill never saw, such as a `/reviewIssue` fix commit pushed moments before `/finishIssue` started, and there's no cheap local signal for that. On an already-green PR the script reaches a verdict on its first poll, so the unconditional re-run costs seconds and removes the judgment call about whether it was needed.

Merge via the GitHub API to avoid worktree conflicts (the base branch may be checked out in another worktree, which blocks `gh pr merge`):

```
gh api repos/{owner}/{repo}/pulls/{pr}/merge -X PUT -f merge_method=merge -f commit_title="Merge pull request #{pr} — {title}"
```

Then delete the remote branch:

```
gh api repos/{owner}/{repo}/git/refs/heads/{headRefName} -X DELETE
```

Derive `{owner}` and `{repo}` from `gh repo view --json owner,name`.

---

## Step 4.5 — Patch close-out (patch-N issues only)

**Check labels:**
```
gh issue view {N} --json labels
```

If the issue does **not** have a `patch-N` label, skip this step entirely and go to Step 5.

**If this is a patch issue:**

1. **Determine the new tag.** Extract the release series number from the `patch-N` label (e.g. `patch-3` → N=3). Fetch tags and find the latest in that series:
   ```
   git fetch --tags
   git tag --list "v{N}.0.*" | sort -V | tail -1
   ```
   (`sort -V` is a GNU coreutils flag — see README.md's Prerequisites.)
   Increment the patch number by 1 (e.g. `v3.0.0` → `v3.0.1`). Call this `{new-tag}`.

2. **Pull main.** Operate from the repo root (not the worktree) for the post-merge steps:
   ```
   git checkout main
   git pull --ff-only origin main
   ```

3. **Update CHANGELOG.md.** Read the merged PR's title and body, plus the issue body, to understand what changed. Draft a CHANGELOG entry written for barn managers and riders (no jargon, no branch names, no issue numbers). Present it to the user:

   > "Here's a suggested CHANGELOG entry for {new-tag}:
   >
   > {suggested entry}
   >
   > Use this, edit it, or tell me what to write instead."

   Wait for confirmation or edits before proceeding. Add a new section at the top of `CHANGELOG.md` (after the `# Changelog` header):
   ```
   ## {new-tag} — {Month YYYY}

   {user's description}
   ```
   Commit and push directly to main:
   ```
   git add CHANGELOG.md
   git commit -m "[#{N}] Update CHANGELOG for {new-tag}"
   git push origin main
   ```

4. **Create and push the tag:**
   ```
   git tag {new-tag}
   git push origin {new-tag}
   ```

5. **Merge main into release/(N+1).** Fetch and check whether the next release branch exists:
   ```
   git fetch origin
   git branch -r | grep "origin/release/release-{N+1}"
   ```
   If it exists:
   ```
   git checkout release/release-{N+1}
   git pull --ff-only origin release/release-{N+1}
   git merge origin/main
   git push origin release/release-{N+1}
   ```
   Merge (not rebase) — rebasing this branch has caused messier conflict resolution than merging in the past. If the merge produces conflicts, resolve them normally and commit before pushing.
   If the release branch does not exist, skip and note it.

---

## Step 5 — Close issue

(Same auto-mode-classifier caveat as Step 4 applies here — see "Known friction" above.)

```
gh issue close {N}
gh issue edit {N} --remove-label 'in-progress'
```

GitHub auto-close via `Closes #N` only fires when merging into the default branch — not release branches — so this explicit close is always required. The `--remove-label` is a no-op if the label was never applied.

---

## Step 5.5 — Update batch file

Determine the release label for issue #{N}:
```
gh issue view {N} --json labels
```
If it doesn't carry a `release-N` label, skip this step entirely — patch and unlabeled issues aren't tracked in a batch file.

Batch file is `specs/batch_release-N.md`. If it doesn't exist, skip this step.

1. Remove issue #{N}'s own entry from whichever section it's in (Ready/Blocked/In Progress).
2. For every remaining entry whose `deps:` line lists #{N}, remove #{N} from that list.
   - If the list is now empty, move the entry to **Ready**.
   - If it still lists one or more other open dependencies, leave it in **Blocked** with the shortened list — never flip an entry to Ready while any other dependency remains unresolved.
3. Rewrite the file in place, keeping each section sorted by `unblocks` descending, and update (or add) a `_last pruned: {timestamp} (finishIssue #{N})_` line beneath the refresh line.

This is a targeted, O(1) update — it only touches entries that referenced #{N}. It doesn't re-verify the rest of the file against `gh`; that's what `/issueBatch prune` is for.

---

## Step 6 — Stop the worktree's dev server

Use Step 0's `port` — the worktree's fixed dev-server port.

```
PID=$(ss -lptnH "sport = :{port}" | grep -oP 'pid=\K[0-9]+' | head -1)
```

Resolve the pid with `ss`, not `lsof` (#1155). `lsof -ti:{port} -sTCP:LISTEN` returns empty here while the server is demonstrably listening, and the `-sTCP:LISTEN` filter is not the cause — bare `lsof -i:{port}` returns nothing either, for the same live `next-server` that `ss` reports a pid for immediately. Confirmed at two separate close-outs (#1088, and #1092/#1094), each of which leaked its dev server. `ss` is iproute2 and present on every Linux, so it replaces `lsof` rather than being chained behind it; `README.md`'s Prerequisites carry that swap and the `lsof` substitution a macOS developer needs here instead, since iproute2 is Linux-only.

If `PID` is empty, nothing is running — skip silently. Otherwise kill the whole process group (npm/next/next-server all share one PGID) so nothing is left orphaned:

```
PGID=$(ps -o pgid= -p $PID | tr -d ' ')
kill -- -$PGID
```

---

## Step 6.5 — Clean up the work log

Check `specs/issue-{N}.md`. If it doesn't exist, skip this step (legacy branch).

**Before deciding anything, re-read `## Open items` and copy any surviving `- [ ]` entries verbatim into your context — you are about to delete the only copy.** Step 0.5 does not guarantee this section is empty: it also passes when the user chose to finish *despite* unresolved entries, and `/testIssue` deliberately leaves non-gating post-merge reminders standing (an AC can require an action be left undone until after merge). Such an entry often contains a literal command the user must run, and Step 0.5's prompt may be many minutes and a full CI wait behind us by now. Carry these into Step 7's print regardless of which branch below applies.

Then check `## Follow-ups (needs own issue)`:
- **Empty:** the file has no further reason to exist — the issue itself is now closed. Delete `specs/issue-{N}.md`, having first captured any surviving `## Open items` entries per the paragraph above.
- **Non-empty:** keep the file (don't delete it), and record its count/list for Step 7's print below.

---

## Step 7 — Confirm

Print:
```
Done. PR #{pr} merged, branch deleted, issue #{N} closed, dev server on port {port} stopped.
```
(Omit the dev-server clause if none was running.)

If Step 6.5 found unresolved `## Follow-ups`, append:
```
{count} follow-up(s) flagged during this issue but not yet filed. Run /grillMe specs/issue-{N}.md to turn them into issues.
```

If Step 6.5 captured any surviving `## Open items` entries, append them last, under this heading, reproducing each entry **verbatim** — including any command, exactly as written, since the work log that held it is now gone and this print is the user's only remaining copy:
```
STILL TO DO BY HAND (was in specs/issue-{N}.md, now deleted):

{each surviving entry, verbatim}
```
Do not paraphrase, summarize, or reformat these, and do not offer to run them yourself unless the entry says it is safe to — a post-merge step is typically left manual precisely because it is destructive or has timing constraints (e.g. deleting files that branches predating the merge still depend on).
