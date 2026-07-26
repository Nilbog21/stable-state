---
name: backlogReview
description: Triage open GitHub issues after a batch creation event (e.g. post-client-meeting dump). Detects clones, conflicts, missing/circular dependencies, stale assumptions, orphaned issues, and high-priority candidates. Also surfaces unprocessed specs and ready-to-start issues. Proposes changes as a plan, then implements after user review.
---

> **Recommended model: Opus (1M context).** Cross-references ~200 issue bodies for clones, conflicts, and circular dependencies; context-bound rather than reasoning-bound. Set with `/model` before invoking.

You are running a structured backlog triage. This skill is designed for post-dump states — after a client meeting or batch issue creation — where the goal is to bring order to a flood of new issues.

## Step 1 — Brain dump

Before loading anything, ask the user exactly this (do not paraphrase):

> "Do you have any current concerns, or insights you wish to provide before I parse the open issues?"

Wait for their response. Record everything they say — it informs your analysis.

## Step 2 — Load context

Fetch all open GitHub issues:
```
gh issue list --state open --limit 200 --json number,title,body,labels
```

Read every file in the `specs/` directory. The specs directory is a personal working directory for raw material that has not yet been run through `/grillMe` to generate issues. Specs are not ground truth — they are upstream of the issue tracker. Use them to answer: are there specs here that have no corresponding open issue and that look ready to be formalized?

## Step 3 — Analyze

Work through the full issue list. For each finding, note the issue number(s) involved, the finding type, and your proposed action.

If you encounter ambiguity that only the user can resolve — an assumption you cannot verify from closed issues or the issue bodies themselves — stop and ask. One question at a time. Do not accumulate a list of questions to dump at the end.

### Finding types (in priority order)

**Clones / conflicts** — two issues describing the same work, or two issues whose implementations would contradict each other. Proposed action: close the weaker one with a comment referencing the survivor, or flag for the user to decide which wins.

**Circular dependencies** — A depends on B depends on A (or longer cycles). These will deadlock the backlog. Proposed action: identify the cycle, propose which dependency edge to cut or restructure, and flag for user confirmation.

**Missing dependencies** — an issue assumes work that doesn't have its own issue yet, or references a dependency issue that is already closed (stale reference). Proposed action: create a missing issue, or remove/update the stale dependency reference in the body.

**Stale assumptions** — an issue's premise contradicts a known completed decision (e.g. a closed issue, or a role/schema change already merged). Proposed action: edit the issue body to correct the assumption, or close the issue if it is fully invalidated.

**Mislabeled or unlabeled issues** — issues missing a semantic label that would help `/createIssueBatch` make better selection decisions. Fetch the label list with descriptions to calibrate:
```bash
gh label list --json name,description
```
Apply the appropriate label based on the issue's nature:
- `rearchitecture` — changes module structure that other issues implicitly assume
- `data-migration` — touches DB schema; imposes ordering on dependents
- `testing-improvement` — adds test coverage; easy to underweight without the signal
- `quick-win` — small and self-contained; useful for filling short groups
- `high-priority` — manual override only; do not apply this automatically; flag for user to decide

Proposed action: apply the appropriate label(s); note any issues where the right label is ambiguous and flag for user confirmation.

**Orphaned issues** — issues with no connection to any spec, any other issue, or any discernible current direction. May be forgotten experiments or ideas that no longer fit. Proposed action: flag for the user to close, park with a comment, or confirm they are still intentional.

**Scope / size** — issues that are clearly too large for a single PR, independent of dependencies. Proposed action: suggest a split for reviewability.

**`pending-review` candidates** — issues waiting on an external decision (client input, open barn manager question) that are not actionable until resolved. Proposed action: apply `pending-review` label so they don't clutter the active queue.

**Unprocessed specs** — files in `specs/` that have no corresponding open or closed issue and appear ready to be formalized. Proposed action: flag for the user to run `/grillMe` on them, or note that they are intentionally parked.

**Parallelization opportunities** — an issue has deep sequential dependencies that could be split so parts run in parallel. Lower priority than the above; only flag if the split is clean and materially reduces wall-clock time.

## Step 4 — Produce a plan

Present findings in two sections:

### Ready to start
List every issue that has all dependencies satisfied and is unblocked right now. These can be fed directly into `/beginIssue`.

### Proposed changes
A numbered list of all proposed changes. For each item:
- The issue number(s) or spec file involved
- What you will do (close, edit body, create new issue, add/remove label, add comment, flag for `/grillMe`)
- One-line rationale

Group by finding type in the order listed above. Do not implement anything yet.

## Step 5 — Implement

Ask: "Shall I proceed with this plan, or are there items you want to skip or modify?"

After the user confirms, implement each item in plan order using `gh` CLI commands:

- **Body edits:** `gh api repos/OWNER/REPO/issues/N -X PATCH -f body="..."` (not `gh issue edit` — silent deprecation failures)
- **New issues:** `gh issue create`
- **Label changes:** `gh issue edit --add-label` or `--remove-label`
- **Close with comment:** post the comment first, then close

After all changes, print a summary: what was done, what was skipped, and any open questions that remain unresolved.
