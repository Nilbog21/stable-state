---
name: estimateRelease
description: Estimate how long the current release will take (from historical velocity + backlog-growth data) and break its open issues down by feature slice, to support a cut conversation with the customer. Reads/writes specs/release-estimate-history.md in the active project.
---

> **Recommended model: Sonnet.** Velocity arithmetic and feature-slice bucketing. Set with `/model` before invoking.

You are producing a release-duration estimate and a feature-slice breakdown of the open backlog, to help the user have a productive scope-cutting conversation with their customer.

## Data file

History lives at `specs/release-estimate-history.md` in the current project's working directory (create the file and the `specs/` directory if either is missing — leave the table empty). Read it with the Read tool before doing anything else.

## Step 1 — Determine the target release

```bash
git fetch --all -p
git branch -r --list 'origin/release/release-*' | sed 's|.*origin/release/||' | sort -t- -k2 -n | tail -1
```

If the user passed an explicit release number in `$ARGUMENTS`, use that instead. If no release branch exists, tell the user and stop.

## Step 2 — Check whether the target release is already finalized

```bash
git tag -l 'vN.0.0'   # N = target release number
```

**If tagged AND not already a row in the history table:**

1. Compute its actuals:
   - `gh issue list --state closed --label release-N --json number,title,closedAt,stateReason --limit 200` — exclude `stateReason == "NOT_PLANNED"` and anything that's a PR.
   - Convert `closedAt` to America/New_York local dates, count distinct days with ≥1 closure = working days. Rate = closed count / working days.
   - Cutoff = the timestamp of tag `v(N-1).0.0` (when `release/release-N` was cut from main). `gh issue list --label release-N --json number,createdAt --limit 200`, split by `createdAt` vs cutoff → before-cutoff count, final count (= closed count computed above, since the release is done), growth factor = final / before-cutoff.
   - **Judgment call**: if the release branch shows evidence it never really "started" until later (e.g. its only early activity was patch/CHANGELOG/process commits, not feature PRs — check `git log origin/main..origin/release/release-N --oneline` for this), don't use the tag-cut date as the pre-start cutoff. Instead treat the release's *entire* final issue count as if it were captured at one snapshot and skip the before/after split for that row (leave growth factor blank), noting why in your report. This mirrors the correction already made when release-3 was first analyzed.
2. Append a row to the history table with these actuals.
3. Recompute and update the "Blended velocity so far" / "Blended growth factor so far" lines at the bottom of the file (blended velocity = union of working days across all rows / total closed across all rows; blended growth factor = average of all non-blank growth-factor rows).
4. Report the recorded actuals to the user in chat.
5. Continue to Step 3, but now the **target release for projection is N+1** (the next unstarted release) — re-run Step 1's branch detection logic against `release-(N+1)` if it exists; if it doesn't exist yet, tell the user release-N is recorded and stop.

**If not tagged:** this release (N) is the one to project. Continue to Step 3 with target = N.

## Step 3 — Project the target release

1. Blended velocity = union of working days across all history rows / total issues closed across all history rows (recompute fresh from the table, don't trust stale bottom-of-file numbers).
2. Blended growth factor = average of all non-blank growth-factor rows in the table.
3. Fetch the target release's current open backlog:
   ```bash
   gh issue list --state open --label release-N --json number,title,body,labels --limit 200
   ```
   (exclude `not_planned` — there shouldn't be any in `open` state, but check labels defensively.)
4. Treat the full open backlog count as the pre-start baseline (same logic as the release-3 correction: don't split by a cutoff date unless the release has demonstrably already started with real feature work — check `git log origin/main..origin/release/release-N --oneline` same as Step 2).
5. Projected total scope = backlog count × blended growth factor.
6. Estimated working days = projected total / blended velocity.

## Step 4 — Slice breakdown

Cluster the fetched open backlog issues into logical feature slices by user-facing capability (same judgment as `/issueBatch`'s vertical-slice grouping — read titles/bodies, group by what the customer would recognize as one capability, not by architectural layer). There's no `slice:` label to rely on; this is a fresh read each run.

For each slice, report: issue count, and a proportional day estimate = (slice count / backlog count) × estimated total days from Step 3.

## Step 5 — Report to the user (chat only, no file written)

Print, in plain language suitable for relaying to a non-technical customer:

- Velocity used and how many past releases it's based on (flag if n=1 or n=2 — small sample)
- Growth factor used and how many data points it's based on (flag if n=1 — provisional)
- Current open backlog count for the target release
- Projected total scope (backlog × growth factor) and what that implies about likely additional issues to come
- Estimated working days for the release
- A table of feature slices: name, issue count, proportional day estimate
- Close with a one-line prompt inviting a conversation about what to cut or de-scope, pointing at the largest/least-essential-looking slices as natural starting points

Do not write any file for this report — it's a conversation aid, not a deliverable.
