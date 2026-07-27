You are determining the next step in an issue's `/beginIssue` → `/reviewIssue` → `/testIssue` → `/finishIssue` → `/grillMe` pipeline by reading its work log (`specs/issue-{N}.md`), then invoking the appropriate skill. This skill takes exactly one hop — it diagnoses and kicks off the next single skill, it does not chain through the whole pipeline itself. Run `/continueIssue` again after that skill finishes to advance further.

> **Recommended model: Sonnet.** Pure dispatch — switch model again for whichever skill this one points you at. Set with `/model` before invoking.

---

## Step 0 — Detect worktree, branch, and issue

This project is developed across parallel git worktrees — see README.md's "Development worktrees" section for what they are, where they live, how their `.env.local` is arranged, and the port each one uses.

```
bash scripts/workflow-context.sh
```

Parse the `key=value` lines it prints. It never fails — a field it couldn't determine comes back empty, because only this session can prompt for it.

- `worktree` empty → ask "Which worktree do you want to use — {one of `worktrees`}?" and wait for the answer; the worktree path is that name under the `stable-state-worktrees` directory.
- `issue` empty → tell the user no issue branch was detected here and stop. `/continueIssue` only operates on an existing issue branch; there's no argument form, cd into the right worktree/branch first.

Record `worktree`, `worktree_path`, and `issue` as `{N}`.

---

## Step 1 — Read the work log

Check `specs/issue-{N}.md`.

**If it doesn't exist:** don't guess at whether this is unstarted or already finished — ask the user directly: "No specs/issue-{N}.md found for this branch. Is this not yet started (I can run /beginIssue {N}), or already finished (nothing to do)?" Act on their answer. Stop — do not run the decision tree below.

**If it exists**, read:
- The status marker (`<!-- status: ... -->`): `in-progress`, `in-review`, `testing`, or `ready`.
- `## Open items` — any unresolved (`- [ ]`) entries?
- `## Follow-ups (needs own issue)` — empty or not?

---

## Step 2 — Decide the next step

Evaluate in this order — stop at the first rule that matches:

1. **`## Open items` has unresolved entries** → next step is `/beginIssue` (no arguments). This branch already has an open PR and deferred concerns (from `/reviewIssue` or `/testIssue`) waiting on a revise-mode pass. Reason: "Open items unresolved ({count} deferred) → revise mode."

2. **`## Follow-ups (needs own issue)` is non-empty:** check whether the issue itself is actually done — `gh issue view {N} --json state`.
   - If `state` is `CLOSED`: `/finishIssue` already merged and closed this issue and only kept the file around for its Follow-ups → next step is `/grillMe specs/issue-{N}.md`. Reason: "Issue closed, {count} follow-up(s) unfiled → grillMe."
   - If `state` is `OPEN`: Follow-ups are just accumulating for later and don't affect routing — fall through to the status-marker check below.

3. **Status marker `in-progress`:** check Step 0's `pr`.
   - Non-empty → next step is `/reviewIssue`. Reason: "in-progress, PR #{pr} open → review."
   - Empty → next step is `/beginIssue` (no arguments). Reason: "in-progress, no PR yet → resume plan/implementation." `/beginIssue`'s own Step 0 resume logic (existing branch, no unresolved Open items) picks this up correctly.

4. **Status marker `in-review`:** next step is `/testIssue`. Reason: "in-review, review round clean → testIssue."

5. **Status marker `testing`:** next step is `/testIssue`. Reason: "testing, resuming AC verification."

6. **Status marker `ready`:** next step is `/finishIssue`. Reason: "ready → finishIssue."

---

## Step 3 — Announce and invoke

Print the diagnosis in one line using the reason from whichever rule matched, e.g.:
```
status: in-review, Open items clear → running /testIssue
```

Then invoke the determined skill via the `Skill` tool (pass `specs/issue-{N}.md` as `args` only for the `/grillMe` case; the other skills take no arguments and self-detect from the branch).

Stop once that skill is invoked — do not re-diagnose after it completes.
