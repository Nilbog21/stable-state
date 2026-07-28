Maintain a single mutable candidate-issue file for the current release — `specs/batch_{release-label}.md` — so the process skill suite (`/beginIssue`, `/finishIssue`, `/grillMe`) can read "what's ready to work on" without repeatedly polling `gh`. Subcommands: `create`, `pick`, `rollingPick`, `prune`, `defer`.

> **Recommended model: Opus.** Scoring and ordering work across a whole release — bad prioritization stays invisible until it is expensive. Set with `/model` before invoking.

## Step 0 — Parse subcommand and determine release

Read the first word of `$ARGUMENTS`. If it isn't `create`, `pick`, `rollingPick`, `prune`, or `defer`, stop and print:
```
Usage: /issueBatch create | pick | rollingPick | prune | defer <N>
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

## `create`

Full rebuild — fetches everything and overwrites `{batch-file}`.

Ensure the `in-progress` label exists (used later by `/beginIssue` Step 4, not by this command directly):
```bash
gh label list --json name | jq -r '.[].name' | grep -q '^in-progress$' || gh label create 'in-progress' --color '#0075ca' --description 'Actively being worked on'
```

Fetch candidates and label context:
```bash
gh issue list --state open --label {release-label} --json number,title,labels,body,assignees --limit 100
gh label list --json name,description
```

**Classify every fetched issue:**
- **In Progress** — has the `in-progress` label, or has any assignee.
- **Blocked** — (and not already In Progress) has a label whose name starts with `blocked`/`needs-`, or equals `depends-on`, OR its body mentions `depends on #N` / `blocked by #N` / `prerequisite: #N` / `requires #N` where `#N` is itself open.
- **Ready** — everything else.

**Build the dependency graph** across all fetched issues (not just Ready ones) from the same four body phrasings: an edge `N → M` means M depends on (is blocked by) N.

**Score every issue** with `unblocks` = the number of other fetched issues transitively reachable by following dependency edges forward from it (i.e. how much downstream work clearing it would open up). This is the "deepest dependency tree" signal `pick` uses — same rationale as `rearchitecture`/`data-migration` issues anchoring groups in the old worktree-batching scheme, just expressed as a per-issue score instead of a group-ordering rule.

**Carry forward deferred status**: before overwriting, if `{batch-file}` already exists, note which issue numbers are currently marked `[deferred]` in its Ready section — a full refresh shouldn't undo a manual deprioritization.

**Write `{batch-file}`**, overwriting any existing content:
```
# Batch — {release-label}
_last full refresh: {timestamp} (issueBatch create)_

## Ready
- #N — Title [labels] — unblocks: {K}
  deps: none
- #N — Title [labels] — unblocks: {K} [deferred]
  deps: none

## Blocked
- #N — Title [labels] — unblocks: {K}
  deps: #M, #P

## In Progress
- #N — Title [labels] (assignee: {login})
```
Sort each section by `unblocks` descending, except within Ready: non-deferred entries first (unblocks descending), then deferred entries last (unblocks descending among themselves) — re-apply the `[deferred]` tag to any issue noted above that's still Ready. Omit a section entirely if it has zero entries.

Print:
```
Batch refreshed — {release-label}: {ready} ready, {blocked} blocked, {in-progress} in progress. Written to {batch-file}.
```

---

## `pick`

If `{batch-file}` doesn't exist, stop and tell the user to run `/issueBatch create` first — don't build it implicitly.

Read `{batch-file}`. Select from the **Ready** section only — never Blocked or In Progress. Entries tagged `[deferred]` are excluded from rules 1–5 entirely; only reach into them (least-recently-deferred first, i.e. bottom of the deferred group) if the non-deferred Ready entries run out before 3 picks are filled.

Fill 3 picks by evaluating these rules in order. Each rule contributes at most one pick — its best candidate not already chosen by an earlier rule. If a rule finds no candidate, skip it and move to the next. Stop once 3 picks are filled; anything still open falls to rule 5 (backfill).

1. **Priority:** the highest-`unblocks` non-deferred Ready entry carrying `high-priority` — if one exists (ties broken by highest `unblocks`).
2. **Deepest chain root:** recompute `unblocks` live by walking every `deps:` line in the batch file (Ready + Blocked sections) to rebuild the forward dependency graph, then counting each non-deferred Ready entry's transitively reachable issues. This exists because the stored `unblocks` value goes stale between full refreshes — e.g. a Blocked entry added by `grillMe` since the last `create` raises a Ready ancestor's true reach without the file being rescored, and rule 1 alone would miss it. Candidate is the non-deferred Ready entry with the highest live-computed count, not already chosen — skip this rule if the live-computed max is 0.
3. **Architecture:** the highest-`unblocks` non-deferred Ready entry not already chosen, carrying `rearchitecture` or `data-migration` — if one exists.
4. **Quick win:** a non-deferred Ready entry not already chosen, carrying `quick-win` — if one exists.
5. **Backfill:** fill any remaining picks using your own judgment from the remaining non-deferred Ready entries in descending `unblocks` order — this is the batch's natural ordering, so defer to it unless something in a specific issue's title/labels clearly argues for a different pick.

**Double-check before presenting** — for each chosen issue, run `gh issue view {N} --json state,assignees,labels` and confirm it's still open, not assigned to anyone else, and hasn't picked up a blocking or `in-progress` label since the last refresh. If a chosen issue fails this check, drop it and backfill the next-highest-`unblocks` Ready entry not yet tried (cap at 6 total `gh issue view` calls); if the Ready list is exhausted first, present fewer than 3 rather than looping forever.

Display:
```
## Suggested next — {release-label}
1. #N — Title — {reason: high-priority / deepest chain root (live unblocks K) / architecture / quick win / next-best}
2. #N — Title — {reason}
3. #N — Title — {reason}
```

**Migration collision note:** if more than one of the presented picks would touch `supabase/migrations/`, say so in one line beneath the list. All worktrees share a single dev Supabase project, so two migration-bearing issues can't actually be worked in parallel — their pushes collide on ordering — and the user should know that before choosing two of them at once. This is advisory; don't drop or reorder picks over it.

Ask: "Which issue do you want to work on?" If this was invoked standalone, tell the user to run `/beginIssue {N}` with their choice. If it was invoked from within `/beginIssue`'s own flow, take the answer and continue directly into that skill's Worktree Setup step.

`pick` itself is purely ephemeral — it never reads or writes the `## Active Picks` section below. That state belongs exclusively to `rollingPick`.

### Follow-up: quick claim (same session)

If, later in the same session, the user says something like "i picked up #N" / "picked up N" / "grabbing N" / "starting on N" — don't touch `{batch-file}` at all: no edit, no `gh` verification, no re-read. Just drop that issue from the picks list you last displayed and print what's left:
```
Remaining picks — {release-label}:
- #N — Title — {reason}
- #N — Title — {reason}
```
The batch file itself is only updated by `prune`/`rollingPick`'s verified sync once the issue actually shows an assignee or `in-progress` label upstream — a quick claim is just the user telling you, not a confirmed state change.

---

## `rollingPick`

A single check-and-replace pass over a persisted 3-issue "Active Picks" list — designed to be re-run on an interval via `/loop` (a Claude Code harness feature for scheduling repeat work, not project tooling — e.g. `/loop 5m /issueBatch rollingPick`) rather than driving its own scheduling. Each pass is cheap: it only checks the 3 active picks (plus, when refilling, candidate replacements) via targeted `gh issue view` calls — it does not run a full `prune` sweep.

If `{batch-file}` doesn't exist, stop and tell the user to run `/issueBatch create` first.

**Seeding (no `## Active Picks` section yet):** Run `pick`'s full rule logic (rules 1–5 and the double-check step) against the batch file's current Ready section to choose 3 issues. Write a new section:
```
## Active Picks
_last rolling check: {timestamp}_
- #N — Title [labels] — unblocks: {K} — {reason}
- #N — Title [labels] — unblocks: {K} — {reason}
- #N — Title [labels] — unblocks: {K} — {reason}
```
`{reason}` is the same rationale `pick` displays (high-priority / deepest chain root (live) / architecture / quick win / next-best). If fewer than 3 Ready entries are available, seed with fewer. Print the same `## Suggested next` display `pick` uses, then note: "Tracking as Active Picks — re-run under /loop (e.g. `/loop 5m /issueBatch rollingPick`) to keep this list current."

**Checking (`## Active Picks` section exists):** For each of its entries, first check the batch file's own Ready section for a `[deferred]` tag (no `gh` call needed — this is local file state), then run `gh issue view {N} --json state,assignees,labels`. Classify using the same predicates `prune` uses:
- **Now tagged `[deferred]` in Ready** (e.g. someone ran `/issueBatch defer` on it) → remove from Active Picks. The Ready entry itself is untouched — it stays in Ready, just deprioritized; no section move.
- **Closed** → remove from Active Picks. Also apply `prune`'s own closed-issue handling to the rest of the batch file (drop from its section; clear it from any `deps:` line, promoting to Ready where that empties the list).
- **Gained an assignee or the `in-progress` label** → this is a pick "getting picked up." Remove from Active Picks; move its entry from Ready to In Progress in the batch file.
- **Gained a blocking label or body reference not already reflected** → remove from Active Picks; move its entry from Ready to Blocked, recording the new dependency.
- **None of the above** → leave it in Active Picks untouched (sticky — an unassigned, unblocked, non-deferred pick is never bumped just because a different issue would now score higher).

**Refilling vacated slots:** For each slot vacated above, choose a replacement from the batch file's current Ready section using `pick`'s full priority order (rule 1 high-priority → rule 2 deepest chain root (live) → rule 3 architecture → rule 4 quick-win → rule 5 backfill by `unblocks`), skipping any issue already in Active Picks (including slots not vacated this pass) and respecting the `[deferred]` exclusion/fallback rule exactly as `pick` does. Double-check each candidate via `gh issue view` before finalizing (same as `pick`'s own double-check step) — if a candidate fails, try the next-best candidate. If the Ready section (plus deferred fallback) is exhausted before a slot can be filled, leave that slot empty rather than looping forever.

**Write back:** Rewrite `## Active Picks` with the (possibly unchanged) 3 entries and an updated `_last rolling check: {timestamp}_` line, alongside whatever single-entry Ready/Blocked/In Progress patches were made above.

**Output:**
- If nothing changed (all 3 active picks still valid), print nothing.
- If anything changed, print:
```
Active picks updated — {release-label}:
  − #N (Title) — {deferred / closed / assigned to {login} / now blocked by #M}
  + #P — Title — {reason}

Current:
- #N2 — Title [labels] — unblocks: {K} — {reason}
- #P — Title [labels] — unblocks: {K} — {reason}
- #N3 — Title [labels] — unblocks: {K} — {reason}
```
listing one `−`/`+` pair per slot that changed (a slot that couldn't be refilled shows only the `−` line and is omitted from `Current`). `Current` reproduces each surviving/replacement pick's full entry line — title, labels, unblocks, reason — copied straight from the just-rewritten `## Active Picks` section, not just its issue number.

Report the changes plainly and stop there. **Never append a "run `/issueBatch create` to rescore" nudge**, even when entries carry stale `unblocks: 0` values or a `(newly added by grillMe — run /issueBatch create to rescore)` annotation. This runs on a loop, so the nag repeats every pass, and late in a release — when the Ready pool is small and thinning — a rescore wouldn't change the picks anyway. Recommend `create` only if asked, or if the batch is clearly early/mid-release with a large Ready pool where rescoring would genuinely move something.

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
- **Lost a blocking label/reference (distinct from that blocker closing, e.g. label removed by hand)** → move to Ready.
- **Gained the `in-progress` label or an assignee** → move to In Progress.
- **No change** → leave as-is.

An entry's `[deferred]` tag is dropped whenever it leaves Ready (moved to Blocked or In Progress) — deferral only governs Ready-section priority. A deferred entry that stays in Ready keeps its tag untouched.

Rewrite `{batch-file}` in place: same section format and sort as `create` (Ready: non-deferred by `unblocks` descending, then deferred by `unblocks` descending; Blocked/In Progress: `unblocks` descending), and update (or add) the `_last pruned: {timestamp}_` line beneath the refresh line.

Print a one-line summary:
```
Pruned {release-label} batch — removed {X} closed, {Y} reassigned; unblocked {Z}; moved {W} to in progress.
```

---

## `defer`

De-prioritizes a single Ready issue to the back of the batch, so `pick` skips it until it's manually promoted.

If `{batch-file}` doesn't exist, stop and tell the user to run `/issueBatch create` first.

Parse the issue number from the rest of `$ARGUMENTS` (the word after `defer`). If missing or not a number, stop and print:
```
Usage: /issueBatch defer <N>
```

Find `#N` in the **Ready** section of `{batch-file}`.
- Not found there at all (missing from the file, or present in Blocked/In Progress) → print `#N is not a Ready entry in this batch — nothing to defer.` and stop.
- Already tagged `[deferred]` → print `#N is already deferred.` and stop.
- Otherwise, append ` [deferred]` to its entry line, then re-sort the Ready section per the `create` rule (non-deferred by `unblocks` descending, deferred by `unblocks` descending, newly-deferred entry lands at the very bottom of the deferred group). Write the file back.

Print:
```
Deferred #N — {title}. It'll be skipped by /issueBatch pick until you remove the [deferred] tag by hand.
```
