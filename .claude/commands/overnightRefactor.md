You are running an unattended overnight loop of structure-only refactors: Fable plans one task in a fresh context, Opus implements it in a fresh context, Opus reviews it in a fresh context. One nightly branch, one draft PR, one commit per kept iteration.

> **Recommended model: Sonnet.** This session only orchestrates — it dispatches subagents, parses their verdict lines, and runs scripted git; the Fable and Opus subagents below do the actual work, and the loop runs for hours. Set with `/model` before invoking.

Every `Agent` call in this skill: no `isolation` param (subagents must share this worktree's git state, not an isolated copy) and `run_in_background: false` (each step blocks the next).

---

## Step 0 — Preflight

1. `git status --porcelain` in this worktree. If not empty, stop and tell the user to commit or stash their in-progress work first — this worktree is about to be repurposed for the night.
2. Determine the release base:
   ```
   git fetch --all -p
   git branch -r --list 'origin/release/release-*' | sed 's|.*origin/release/||' | sort -t- -k2 -n | tail -1
   ```
   Record as `{release}` (e.g. `release-3`).
3. Compute tonight's date: `date +%F` → `{date}`.
4. Create the nightly branch and run the baseline check:
   ```
   git checkout -B overnight/refactor-{date} origin/release/{release}
   bash scripts/ci.sh
   ```
   If `ci.sh` fails here, the tree is already red before any refactor work starts — stop, report the failure, and do not proceed. Don't fix it yourself; that's the user's call.
5. Compute the wall-clock stop time and hold it for the whole loop: if local time is already past 06:00, the cutoff is tomorrow 06:00; otherwise today 06:00.
   ```
   cutoff_epoch=$(date -d '06:00' +%s)
   [ "$(date +%s)" -ge "$cutoff_epoch" ] && cutoff_epoch=$(date -d 'tomorrow 06:00' +%s)
   ```
6. Push the branch and open the draft PR:
   ```
   git push -u origin overnight/refactor-{date}
   gh pr create --draft --base release/{release} --head overnight/refactor-{date} \
     --title "Overnight refactor — {date}" \
     --body "Unattended overnight refactor loop (\`/overnightRefactor\`). Structure-only: file splits/merges, renames, dead-code removal, doc accuracy fixes. No migrations, dependency changes, RLS/RPC changes, or behavior changes. Per-iteration plan/review rationale is in \`specs/overnight-{date}.md\` (gitignored — read it locally in this worktree, not in the diff)."
   ```
   Record the PR number as `{pr}`.
7. Create the ledger file `specs/overnight-{date}.md`:
   ```markdown
   # Overnight Refactor — {date}

   Base: release/{release} · Branch: overnight/refactor-{date} · PR: #{pr}
   ```
8. Print exactly one confirmation line, then go autonomous — no further questions:
   ```
   Nightly branch overnight/refactor-{date} created, draft PR #{pr} open, baseline green — starting the loop.
   ```

Initialize `iteration = 1` and `consecutive_failures = 0`.

---

## Step 1 — The iteration loop

Repeat from here until a stop condition fires.

**Before starting iteration N:** if `$(date +%s) -ge $cutoff_epoch`, go to **Step 3 (Stop: wall clock)**.

Capture the last-good SHA before doing anything else this iteration: `last_good_sha=$(git rev-parse HEAD)`.

### 1a — Plan (Fable, fresh context)

Launch one `Agent` call, `model: "fable"`:

```
You are the planner for iteration {N} of an unattended overnight refactor loop. You will never see the
result of your plan — write it precisely enough that a different model can execute it with no
judgment calls.

Read `specs/overnight-{date}.md` (tonight's ledger so far) and skim any other `specs/overnight-*.md`
files present in `specs/`. A past iteration logged as failed or rejected means: don't retry that same
task, a human needs to look at it. A past iteration logged as kept means: that task is done, move on.

Read `ARCHITECTURE.md` and `CLAUDE.md` at the repo root — this repo has no CONTEXT.md/ADRs, these
stand in as the domain docs. `ARCHITECTURE.md` is an index: the per-item detail lives in
`docs/architecture/schema.md`, `dal.md`, `routes.md`, and `rpc.md`. Read whichever of those cover the
area you're planning, and treat updating them as part of the task — a DAL module split that doesn't
update `docs/architecture/dal.md` leaves the docs stale. Read `~/.claude/skills/codebase-design/SKILL.md` for the vocabulary you
must use in your task statement: module, interface, depth, seam, adapter, leverage, locality, the
deletion test. Don't substitute "component," "service," "API," or "boundary."

Then explore the codebase yourself with Read/Grep (no nested subagents available to you) asking the
same questions `~/.claude/skills/improve-codebase-architecture/SKILL.md`'s Explore step asks:
- Where does understanding one concept require bouncing between many small modules?
- Where are modules shallow — interface nearly as complex as the implementation?
- Where has a pure function been extracted for testability but the real bugs hide in how it's called
  (no locality)?
- Where do tightly-coupled modules leak across their seams?
- What's untested or hard to test through its current interface?
Apply the deletion test to anything you suspect is shallow.

Only these kinds of changes are in scope: file splits/merges, moving code between modules, renames,
extracting/consolidating helpers, dead-code deletion, test refactors, JSDoc/module headers,
ARCHITECTURE.md/CLAUDE.md accuracy fixes.

These are hard-forbidden, no exceptions:
- anything touching supabase/migrations/
- package.json or any lockfile (no dependency changes)
- RLS policies or RPC signatures
- UI copy/markup/behavior changes — anything that changes what a user sees or what the DB stores
- `.claude/commands/**` — these are repo-tracked workflow skills, and CLAUDE.md requires a standalone
  skill change to get its own issue and PR
- anything requiring a product judgment call

`e2e/**` is in scope for **internal, verbatim motion only** — extracting shared vocabulary into
`e2e/support/`, splitting spec monoliths — under extra rules, because `scripts/ci.sh` doesn't run
the suite and nothing in this loop can: moved code must be byte-identical, and no assertion, selector
string, or test title may change (titles are load-bearing — checklist `(e2e:)` tags name them;
`ci.sh`'s lint gates catch title renames and orphaned `covers:` globs, but a rewritten selector
string is invisible until the wrapup's full-suite gate, which is the night's actual e2e
verification). Read `e2e/CLAUDE.md` before planning any e2e task — ordered specs and the framework
facts constrain what can move. The plan's Verification list must include a mechanical equivalence
check (reconstruct the original from the moved pieces and diff to empty). A *src* change that would
force an e2e spec update remains out of scope, not a task with an extra step.

Size ceiling: ~15 files touched. A worthwhile task larger than that gets planned as a self-contained
first slice, with the remainder noted as a candidate for a future night.

If you find a worthwhile task, append this section to `specs/overnight-{date}.md` (create the
"## Iteration {N}" heading, then a "**Plan:**" subsection):
- Task statement (one paragraph, codebase-design vocabulary)
- Exact file list — every file to create/move/edit/delete
- Navigability payoff — one sentence on why Claude navigates this codebase better afterward
- Mechanical steps — ordered, specific enough that the implementer makes no design decisions
- Verification — the standard checks (`bash scripts/ci.sh`, `npm run build`) plus any task-specific one
No code snippets — describe motion, don't write the code here.

If nothing within the guardrails is worth a session, that is a legitimate, first-class outcome. Append
"## Iteration {N}" with "**Plan:** NO-TASK — {one-line reason}" instead.

End your response with exactly one of these two lines (nothing after it):
VERDICT: PLAN
or
VERDICT: NO-TASK
```

- If the Agent call itself errors (not a normal returned message) rather than returning one of the two VERDICT lines, go to **Step 4 (Stop: usage limit / API error)**.
- If the response ends `VERDICT: NO-TASK`, go to **Step 3 (Stop: NO-TASK)**.
- Otherwise continue to 1b.

### 1b — Implement (Opus, fresh context)

Launch one `Agent` call, `model: "opus"`:

```
You are the implementer for iteration {N} of an unattended overnight refactor loop. Read
`specs/overnight-{date}.md`, find the "## Iteration {N}" section's "**Plan:**" subsection, and execute
its mechanical steps exactly — no scope beyond the listed file list.

The plan was written by a different model to remove every judgment call from your job, and the reviewer
auto-rejects divergence from it. So: if a step looks suboptimal but is executable, execute it as
written and append a one-line "**Implementer note:** {concern}" under the Iteration {N} section — do
not improve on the plan. If a step is genuinely unexecutable (a named file doesn't exist, two steps
contradict each other), do not improvise a fix — append "**Implementation:** FAILED — plan
unexecutable: {reason}" and end your response with STATUS: FAILED.

Run `bash scripts/ci.sh` and `npm run build`. Both must pass. If either fails, fix it and re-run. You
get at most 2 fix attempts total. If still failing after that, discard all your changes
(`git checkout -- .` and `git clean -fd`, scoped to this repo) so the working tree is clean, append
"**Implementation:** FAILED — {concrete reason}" under the Iteration {N} section, and end your response
with:
STATUS: FAILED

If verification passes, commit everything as one local commit — do not push:
git commit -m "[overnight] {imperative summary}"
Append "**Implementation:** committed {sha}, files: {list}" under the Iteration {N} section, and end
your response with:
STATUS: COMMITTED
SHA: {sha}
```

- If the Agent call itself errors, go to **Step 4**.
- If `STATUS: FAILED`, go to **Step 2a (failure path)** with reason "verification failed after 2 fix attempts".
- Otherwise continue to 1c.

### 1c — Review (Opus, fresh context)

Launch one `Agent` call, `model: "opus"`:

```
You are the reviewer for iteration {N} of an unattended overnight refactor loop. You have reject
authority — use it.

Diff the current commit against origin/release/{release} (`git diff origin/release/{release}...HEAD`).
Compare it against three things, in order:

1. The plan in `specs/overnight-{date}.md`'s "## Iteration {N}" section. Did it do what was planned, no
   more, no less? Fundamental divergence is an automatic reject.
2. This forbidden list — a violation is an automatic reject, not a fix:
   - anything touching supabase/migrations/
   - package.json or any lockfile
   - RLS policies or RPC signatures
   - UI copy/markup/behavior changes — anything that changes what a user sees or what the DB stores
   - `.claude/commands/**` (repo-tracked workflow skills — CLAUDE.md requires their own issue and PR)
   - `e2e/**` changes that are anything but verbatim motion — any changed assertion, selector
     string, or test title is an automatic reject (`scripts/ci.sh` doesn't run the suite; the
     wrapup's full-suite gate is the only net, so the diff must be pure relocation)
   - anything requiring a product judgment call
3. Correctness and this repo's conventions (CLAUDE.md). Small findings here are not reject-worthy —
   fix them directly, then re-run `bash scripts/ci.sh` and `npm run build`, and amend the commit
   (`git commit --amend`).

Doc coherence is part of correctness: if the diff moves something `ARCHITECTURE.md`, `CLAUDE.md`, or
one of the four `docs/architecture/` sub-docs (`schema.md`, `dal.md`, `routes.md`, `rpc.md`)
references, verify those references were updated. `ARCHITECTURE.md` is only an index — a moved DAL
function, route, or RPC almost always needs its sub-doc updated too, and that's the reference most
likely to have been missed. If they weren't updated, fix it yourself (in scope, not a reject).

Append "**Review:** {APPROVE|REJECT} — {one-line summary}" under the Iteration {N} section in
`specs/overnight-{date}.md`. End your response with exactly one of:
VERDICT: APPROVE
FINAL_SHA: {sha}
or
VERDICT: REJECT
REASON: {one-line reason}
```

- If the Agent call itself errors, go to **Step 4**.
- If `VERDICT: REJECT`, go to **Step 2a (failure path)** with the given reason.
- If `VERDICT: APPROVE`, go to **Step 2b (success path)**.

---

## Step 2a — Failure path

Triggered by a failed implementation or a reviewer reject.

```
git branch overnight/failed-{date}-iter{N} HEAD
git reset --hard {last_good_sha}
```
(if the implementer never committed, `HEAD` still equals `{last_good_sha}` — the branch command is a harmless no-op pointer, the reset is a no-op too.)

Append `**Outcome:** failed — {reason}` under the Iteration {N} section in the ledger.

`consecutive_failures += 1`. If `consecutive_failures >= 2`, go to **Step 3 (Stop: circuit breaker)**.

Otherwise: `iteration += 1`, go back to **Step 1**.

## Step 2b — Success path

```
git push origin overnight/refactor-{date}
```

Append `**Outcome:** kept — {FINAL_SHA}` under the Iteration {N} section in the ledger.

`consecutive_failures = 0`, `iteration += 1`, go back to **Step 1**.

---

## Step 3 — Stop (wall clock / NO-TASK / circuit breaker)

Append this to the ledger:
```markdown
---
## Summary
- {count of kept iterations} kept, {count of failed iterations} failed
- Stop reason: {"wall clock 06:00" | "NO-TASK at iteration N" | "circuit breaker — 2 consecutive failed iterations"}
- PR: #{pr}
```
Print the summary to the user. Done — do not start another iteration.

## Step 4 — Stop (usage limit / API error)

Append to the ledger the same Summary block as Step 3, with stop reason `"usage limit or API error after iteration {N}"`. Print it to the user. Do not retry, do not wait and resume — end the loop here.

---

That's the end of `/overnightRefactor`. Morning handoff: the user reviews the PR diff (`gh pr view --json url -q .url`) and the ledger at `specs/overnight-{date}.md` in this worktree, then marks the PR ready and merges through the normal flow.
