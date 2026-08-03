Maintain a single mutable candidate-issue file for the current release — `specs/batch_{release-label}.md` — so the process skill suite (`/beginIssue`, `/finishIssue`, `/grillMe`) can read "what's ready to work on" without repeatedly polling `gh`. Subcommands: `create`, `pick`, `prune`, `defer`.

> **Recommended model: Opus.** Scoring and ordering work across a whole release — bad prioritization stays invisible until it is expensive. Set with `/model` before invoking.

## Step 0 — Parse subcommand and determine release

Read the first word of `$ARGUMENTS`. If it isn't `create`, `pick`, `prune`, or `defer`, stop and print:
```
Usage: /issueBatch create | pick [N] | prune | defer <N> "<reason>"
```

Determine the current release label:
```bash
git fetch --all -p
git branch -r --list 'origin/release/release-*' | sed 's|.*origin/release/||' | sort -t- -k2 -n | tail -1
```
Record as `{release-label}`. If no release branch exists, tell the user and stop.

Batch file path: `specs/batch_{release-label}.md`. Record as `{batch-file}`.

Jump to the matching subcommand section below.

---

## The batch file format

All four subcommands read and write this shape, as do `/grillMe`, `/beginIssue`, and `/finishIssue`. Two parts of it are **prose written by humans and by `/grillMe`, and no skill that writes this file may ever discard them**:

```
# Batch — {release-label}
_last full refresh: {timestamp} (issueBatch create)_

## Insights
- Free-text, release-wide. Strategy that doesn't attach to any single issue.

## Ready
- #N — Title [labels] — unblocks: {K}
  deps: none
  note: free-text, issue-specific. Sequencing, file conflicts, why it's deprioritized.

## Blocked
- #N — Title [labels] — unblocks: {K}
  deps: #M, #P

## In Progress
- #N — Title [labels] (assignee: {login})
```

`note:` lines and the `## Insights` section are where this file's real value accumulates. `unblocks:` counts a dependency graph; the prose records everything a graph can't hold — that landing #1218 before #1206 saves rewriting brand-new specs, that two issues collide on different hunks of the same file, that a slice was excluded from a fleet batch on purpose. That knowledge is expensive to rediscover and exists nowhere else: not in the issue bodies, not in git history.

So: **an entry may carry any number of `note:` lines, and every skill that writes this file carries them forward verbatim** — this command's four subcommands, and equally `/beginIssue` and `/finishIssue` when they move an entry between sections. Same for `## Insights`. `create` rebuilds scores and sections from scratch and still preserves both. A skill that rewrites this file and drops the prose has destroyed the thing the file is for. (This is not hypothetical — `create` did exactly that until #1231, which is why the notes in it are worth reading before you trust the numbers.)

---

## `create`

Full rebuild — fetches everything and recomputes scores and sections.

Ensure the `in-progress` label exists (used later by `/beginIssue` Step 4, not by this command directly):
```bash
gh label list --json name | jq -r '.[].name' | grep -q '^in-progress$' || gh label create 'in-progress' --color '#0075ca' --description 'Actively being worked on'
```

Fetch candidates and label context:
```bash
gh issue list --state open --label {release-label} --json number,title,labels,body,assignees --limit 100
gh label list --json name,description
```

**Before writing anything, read the existing `{batch-file}` if it exists** and hold on to two things: the `## Insights` section verbatim, and every `note:` line keyed by its issue number. These are re-attached below. If you cannot read the file for any reason, stop and say so — do not proceed with a rebuild that would silently drop them.

**Classify every fetched issue:**
- **In Progress** — has the `in-progress` label, or has any assignee.
- **Blocked** — (and not already In Progress) has a label whose name starts with `blocked`/`needs-`, or equals `depends-on`, OR its body mentions `depends on #N` / `blocked by #N` / `prerequisite: #N` / `requires #N` where `#N` is itself open.
- **Ready** — everything else.

**Build the dependency graph** across all fetched issues (not just Ready ones) from the same four body phrasings: an edge `N → M` means M depends on (is blocked by) N.

**Score every issue** with `unblocks` = the number of other fetched issues transitively reachable by following dependency edges forward from it — how much downstream work clearing it would open up. Treat this as one input to `pick`'s judgment, not a ranking that decides anything by itself; the notes routinely outrank it.

**Write `{batch-file}`** in the format above, re-attaching the preserved `## Insights` section and re-attaching each preserved `note:` line under its issue's entry, wherever that entry now lands. A note whose issue is no longer fetched (closed, or dropped from the release) goes away with its entry — that's the one case where losing a note is correct.

Sort each section by `unblocks` descending. Omit a section entirely if it has zero entries, except `## Insights`, which is omitted only when it has never had content.

Print:
```
Batch refreshed — {release-label}: {ready} ready, {blocked} blocked, {in-progress} in progress. {X} notes and the Insights section preserved. Written to {batch-file}.
```

---

## `pick`

Answers: **what should I start right now, and where should I put it?**

If `{batch-file}` doesn't exist, stop and tell the user to run `/issueBatch create` first — don't build it implicitly.

### How many

```bash
bash scripts/workflow-context.sh
```
Read the `worktree_state=` line — `alpha:free beta:busy …`. `N` = the number of `free` worktrees, unless `$ARGUMENTS` supplied a count after `pick`, which wins. If invoked from `/beginIssue`, `N` is 1 and the target worktree is the one the session is already in.

If nothing is free and no count was given, say so, name what's occupying each worktree, and stop.

### What you are optimizing for

Pick the set that best serves, in the developer's own words:

1. **Finish the release quickly.**
2. **Avoid rework on issues still to come** in the release — which serves (1).
3. **Improve tests early in the release to avoid introducing failures** — which also serves (1).

There is no rule table here, and no weighting to apply. Reason about the backlog and make the call. What follows is not how to decide; it's what you are not allowed to have missed.

### What a fill plan must account for

- **Mutual blocking within the set.** No pick may be able to block another pick in the same set. This is the constraint that matters most, because a block is not a short wait: the blocked worktree sits idle through the blocker's whole begin → review → test cycle, and complex issues are the likeliest to need a second one. Today's instance is migrations — all worktrees share one dev Supabase project, so migration-bearing issues serialize on sync and the rest park — but state the condition, not the instance: any two picks where one must land before the other can proceed belong in different rounds, not in the same fill.
- **File conflicts among the chosen set.** The `note:` lines name these explicitly, often down to the hunk. Two issues touching different regions of one file are usually fine; two rewriting the same region are not.
- **Sequencing and rework, from the notes.** "Land X before Y or Y gets rewritten" is criterion (2) stated directly, and it is nearly always recorded as prose rather than as a `deps:` edge, because it isn't a hard dependency — just an ordering that saves work.
- **e2e-spec gating.** `scripts/select-specs.sh` defines which specs a change can break. An issue that rewrites UI another issue is about to write specs against is a rework generator; that's criterion (3).
- **What's already in flight.** Busy worktrees hold work that can conflict with a pick. Read the In Progress section, not just Ready.
- **Downstream reach.** `unblocks:` — a keystone that frees a large blocked set is usually worth taking early even when it is not itself urgent.
- **Deprioritization notes.** A `note: deprioritized — {reason}` records a human's judgment about why something should wait. Weigh it. It is a strong signal, not an absolute veto — if the reason has since evaporated, say so and pick it anyway, but say so.

### Reading depth

The `note:` lines and `## Insights` are the substrate — reason over them first and form a shortlist of roughly `N + 2` candidates. Then read those candidates' full issue bodies (`gh issue view {N} --json title,body,labels,state,assignees`) before committing to the plan; the batch entry is one line and criteria (2) and (3) are claims about what an issue actually does. Don't read all of Ready — that re-derives what the notes already say, at the cost of a body read per entry.

Confirm each finalist is still open, unassigned, and hasn't picked up a blocking or `in-progress` label since the last refresh. Drop and replace any that fails.

### Output

A fill plan, not a ranked list:

```
## Fill plan — {release-label} ({N} free: {names})

{worktree}: #N — Title
  {why this issue, and why this worktree if placement matters}
...

Held back:
- #M — {what it's waiting on, and why}

{Any set-level note: what nearly made it and didn't, a constraint that shaped the whole plan.}
```

Then ask which the user wants to start, and tell them to run `/beginIssue {N}` in that worktree. If invoked from within `/beginIssue`'s own flow, take the answer and continue directly into that skill's Worktree Setup step.

`pick` is **ephemeral — it writes nothing to `{batch-file}`.** Durable knowledge belongs in `note:`/`## Insights` lines, written by `/grillMe` and by hand, from sessions that actually learned something. A persisted pick list is a cache of a cheap re-derivation that goes stale the moment a worktree changes; the `## Active Picks` section that used to live here was deleted in #1231 having never once been written in two releases.

### Follow-up: quick claim (same session)

If, later in the same session, the user says something like "i picked up #N" / "grabbing N" / "starting on N" — don't touch `{batch-file}` at all: no edit, no `gh` verification, no re-read. Just drop that issue from the plan you last displayed and reprint what's left. The batch file is only updated by `prune` once the issue actually shows an assignee or `in-progress` label upstream — a quick claim is the user telling you, not a confirmed state change.

---

## `prune`

Maintenance pass — verifies and updates existing entries. Never adds issues that aren't already in the file (that's `create`'s job).

If `{batch-file}` doesn't exist, tell the user there's nothing to prune and stop.

Collect every issue number currently listed in `{batch-file}` (all three sections), then fetch their live state in as few calls as practical:
```bash
gh issue list --state all --json number,state,assignees,labels,body --limit 200
```
filtered client-side to just those numbers (cheaper than one `gh issue view` per entry).

**Apply, per entry:**
- **Closed** → remove its own entry. Then, for every remaining entry whose `deps:` line lists this number, remove that number from the list — if the list becomes empty, move the entry to Ready; if other open dependencies remain, leave it in Blocked with the shortened list.
- **Reassigned to someone else** → remove (no longer a candidate).
- **Gained a blocking label or body reference not already reflected** → move to Blocked, add the new dependency.
- **Lost a blocking label/reference** (distinct from that blocker closing, e.g. label removed by hand) → move to Ready.
- **Gained the `in-progress` label or an assignee** → move to In Progress.
- **No change** → leave as-is.

An entry's `note:` lines travel with it between sections — a note is about the issue, not about which section it currently sits in. `## Insights` is untouched.

Rewrite `{batch-file}` in place: same section format and sort as `create`, and update (or add) the `_last pruned: {timestamp}_` line beneath the refresh line.

Print a one-line summary:
```
Pruned {release-label} batch — removed {X} closed, {Y} reassigned; unblocked {Z}; moved {W} to in progress.
```

---

## `defer`

Records that an issue should wait, and **why** — so `pick` can weigh the reason rather than obey a flag.

If `{batch-file}` doesn't exist, stop and tell the user to run `/issueBatch create` first.

Parse the issue number and the reason from the rest of `$ARGUMENTS`. If either is missing, stop and print:
```
Usage: /issueBatch defer <N> "<reason>"
```
The reason is required. A bare "skip this" carries no information `pick` can act on, and the whole point of recording it as prose is that a future session can tell whether it still holds.

Find `#N` in `{batch-file}`. If it isn't there at all, print `#N isn't in this batch — nothing to defer.` and stop. Otherwise append a note line to its entry:
```
  note: deprioritized {date} — {reason}
```
If the entry already has a `deprioritized` note, replace that one rather than stacking a second. Write the file back; no re-sort, since deferral no longer affects ordering.

Print:
```
Deferred #N — {title}. Recorded as: {reason}. /issueBatch pick will weigh this, not obey it — clear the note when the reason no longer holds.
```
