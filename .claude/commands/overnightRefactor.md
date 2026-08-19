You are running an unattended overnight loop of structure-only refactors: Fable plans one task in a fresh context, Opus implements it in a fresh context, Opus reviews it in a fresh context, and you gate any iteration touching `e2e/**` on the checklist suite. One nightly branch, one draft PR, one commit per kept iteration.

> **Recommended model: Sonnet.** This session only orchestrates — it dispatches subagents, parses their verdict lines, and runs scripted git; the Fable and Opus subagents below do the actual work, and the loop runs for hours. Set with `/model` before invoking.

Every `Agent` call in this skill: no `isolation` param (subagents must share this worktree's git state, not an isolated copy) and `run_in_background: false` (each step blocks the next).

---

## Step 0 — Preflight

1. `bash scripts/workflow-context.sh` — record `worktree_path` and `port`. Step 1d's suite run needs both, and this skill states no port of its own: `scripts/workflow-context.sh` owns the worktree→port map, which #1118 consolidated there precisely so no skill would carry its own copy to drift.
2. `git status --porcelain` in this worktree. If not empty, stop and tell the user to commit or stash their in-progress work first — this worktree is about to be repurposed for the night.
3. Determine the release base:
   ```
   git fetch --all -p
   git branch -r --list 'origin/release/release-*' | sed 's|.*origin/release/||' | sort -t- -k2 -n | tail -1
   ```
   Record as `{release}` (e.g. `release-3`).
4. Compute tonight's date: `date +%F` → `{date}`.
5. **Terminal-state check, then create the nightly branch and run the baseline check.** Step 3's
   `git fetch --all -p` already refreshed the remote refs; reuse them rather than looking anything up
   again:
   ```
   git rev-parse --verify --quiet origin/overnight/refactor-{date}
   ```
   A hit means tonight's branch is already pushed — an earlier invocation got past step 7, so kept
   iterations and their ledger prose may already exist. **Stop cold**: say the branch and its PR are
   already live and that resuming a partly-run night is the user's call, and do not proceed. The
   `checkout -B` below resets the branch to the release base, and step 8 overwrites
   `specs/overnight-{date}.md`'s header — and since `specs/` is gitignored, the per-iteration Task and
   Navigability-payoff prose that `/overnightRefactorWrapup` Step 3 turns into issue bodies exists
   nowhere else once it's gone.
   ```
   git checkout -B overnight/refactor-{date} origin/release/{release}
   bash scripts/ci.sh
   ```
   If `ci.sh` fails here, the tree is already red before any refactor work starts — stop, report the failure, and do not proceed. Don't fix it yourself; that's the user's call.
6. Compute the wall-clock stop time and hold it for the whole loop: if local time is already past 06:00, the cutoff is tomorrow 06:00; otherwise today 06:00.
   ```
   cutoff_epoch=$(date -d '06:00' +%s)
   [ "$(date +%s)" -ge "$cutoff_epoch" ] && cutoff_epoch=$(date -d 'tomorrow 06:00' +%s)
   ```
7. Push the branch and open the draft PR:
   ```
   git push -u origin overnight/refactor-{date}
   gh pr create --draft --base release/{release} --head overnight/refactor-{date} \
     --title "Overnight refactor — {date}" \
     --body "Unattended overnight refactor loop (\`/overnightRefactor\`). Structure-only: file splits/merges, renames, dead-code removal, doc accuracy fixes. No migrations, dependency changes, RLS/RPC changes, or behavior changes. Per-iteration plan/review rationale is in \`specs/overnight-{date}.md\` (gitignored — read it locally in this worktree, not in the diff)."
   ```
   Record the PR number as `{pr}`.
8. Create the ledger file `specs/overnight-{date}.md`:
   ```markdown
   # Overnight Refactor — {date}

   Base: release/{release} · Branch: overnight/refactor-{date} · PR: #{pr}
   ```
9. Print exactly one confirmation line, then go autonomous — no further questions:
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
- `checklists/**` and `PRE_RELEASE_TEST_CHECKLIST.md` — CLAUDE.md's born-automated-or-justified-manual
  rule governs every line in these, and it is enforced only by `/reviewIssue`, which is not in this
  loop. "Doc accuracy fixes" would otherwise admit restructuring a phase file at 3am with nothing
  checking the tags
- `scripts/run-checklist-suite.sh` — Step 1d runs this script and reads the night's e2e verdict out
  of the `started`/`exited {code}` markers it prints. A structure-only pass over its `echo` lines
  would not fail anything, and would silently corrupt every later e2e verdict this same night
- anything requiring a product judgment call

`e2e/**` is in scope for **internal, behaviour-preserving motion** — extracting shared vocabulary
into `e2e/support/`, splitting spec monoliths. Selector strings **may** change; assertions and test
titles **may not**. Titles stay frozen regardless of anything else: checklist `(e2e:)` tags name
them and `ci.sh`'s `check-e2e-tags.sh` enforces that.

Step 1d runs the specs `select-specs.sh` picks for any iteration touching `e2e/**`, so the motion is
no longer unverified. The restriction on assertions survives that gate for a different reason: **a
green suite cannot distinguish a weakened assertion from a preserved one.** A relaxed assertion
passes exactly as well as the one it replaced, so the run says nothing about it.

Which is also why a selector may only be rewritten where a **positive** assertion exercises it.
Rewriting one whose only use is an absence assertion or a `[]`-accepting read is an automatic
reject: per spec-maintenance rules 3 and 4 and framework facts 16 and 18 a green run there proves
nothing — the same blindness `e2e/support/must-affect.ts`'s module comment documents on the fixture
side.

Know the throughput cost before you plan the task: anything touching `e2e/support/**` matches
`select-specs.sh`'s `ALWAYS_FULL` list, so an extraction there always buys a full ~14-minute suite
run at 1d. Only intra-file work — splitting a spec monolith — stays scoped and cheap.

Read `e2e/CLAUDE.md` before planning any e2e task — ordered specs and the framework facts constrain
what can move. The plan's Verification list must include a mechanical equivalence check
(reconstruct the original from the moved pieces and diff to empty). A *src* change that would force
an e2e spec update remains out of scope, not a task with an extra step.

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
   - `checklists/**` and `PRE_RELEASE_TEST_CHECKLIST.md` (the born-automated-or-justified-manual rule
     on those lines is enforced only by `/reviewIssue`, which is not in this loop)
   - `scripts/run-checklist-suite.sh` (Step 1d parses this script's own log markers for the e2e
     verdict — a rewritten `echo` there breaks the gate silently, and nothing else that night notices)
   - `e2e/**` changes that are anything but behaviour-preserving motion. A changed **assertion** or
     **test title** is an automatic reject. A changed **selector string** is allowed only where a
     *positive* assertion exercises it — rewriting one whose only use is an absence assertion or a
     `[]`-accepting read is an automatic reject too. Step 1d runs the suite against this diff, but a
     green suite cannot distinguish a weakened assertion from a preserved one, which is what these
     two rules cover and the run does not
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
- If `VERDICT: APPROVE`, go to **1d**.

### 1d — E2E gate

**You run this yourself, as the orchestrator — never a subagent.** The verdict is a mechanical exit
code, and `/fableFleet` Step 5 records that a subagent ending its turn to wait on a background run
never gets woken (three for three in the pilot).

Take the iteration's diff once and reuse it: `git diff --name-only {last_good_sha}..HEAD`.

**Skip conditions**, checked in this order — on either, append `**E2E gate:** skipped — {reason}`
under the Iteration {N} section and go straight to **Step 2b**:

1. The diff touches no `e2e/` path **and not `playwright.config.ts`**. `tsc` plus vitest at 100%
   branch coverage already net a src refactor, and `select-specs.sh` returns `mode=full` for most
   of them (`src/lib/**`, `src/components/**` and `src/app/actions/**` are all in `ALWAYS_FULL`) —
   running the suite on every iteration would cost ~14 minutes each and roughly halve the night's
   throughput to re-verify what is already verified. `playwright.config.ts` is the one
   `ALWAYS_FULL` entry that lives outside `e2e/`, so an `e2e/`-prefix test alone would skip the
   gate on a diff the selector would have called `mode=full`.
2. `$(date +%s) + 900 -ge $cutoff_epoch` — a full run wouldn't finish before the wall clock. The
   wrapup's full-suite gate still sees this commit in the morning.

Otherwise, ask the selector what to run and act on the `mode=` line:

```
git diff --name-only {last_good_sha}..HEAD | bash scripts/select-specs.sh
```

- **`mode=none`** — nothing to run; log it as a skip and go to Step 2b.
- **`mode=scoped`** — one `--spec` per reported spec.
- **`mode=full`** — no `--spec` flags.

Launch this with the Bash tool's `run_in_background`, as one command, substituting
`{worktree_path}` from Step 0's preflight:

```bash
cd {worktree_path} && bash scripts/run-checklist-suite.sh {--spec flags}
```

**That is the whole command.** Until #1601 this step also started a `next dev` on `{port}`, waited
for it, pointed the suite at it with `--base-url`, passed `--no-recycle` so the suite wouldn't spend
90s booting a replacement this loop was about to shoot, and `fuser -k`'d the port afterwards. The
suite now builds the branch and serves it from its own server on a port it picks itself, and stops
it on every exit path — so all of that is gone, and none of it should be reintroduced. Do **not**
pass `--base-url`: it now means *skip the build and drive that origin instead*, which would hand
this loop back the hot-reloaded dev server the deleted block existed to avoid.

The properties that block was protecting still hold, and now hold by construction rather than by
five lines of shell getting them right. Each iteration is served by a server built from that
iteration's own commit, so a verdict can never be about the previous one — which was the failure
mode behind the old "kill by port, never by `$!`" rule, where an orphaned survivor answered the
readiness `curl` instantly and greened the wrong commit. And nothing hot-reloads through a night of
file moves, which was its own flake source: a flaky failure at 3am reads as a real regression and
burns half the circuit breaker.

Read the verdict from `{worktree_path}/checklist-suite.log`, not from the tool result — a full run
outruns the Bash tool's 600s foreground ceiling. Two things to check, both per `/testIssue` Step 4:
the `=== run-checklist-suite.sh — barn prefix … — started {date} ===` header belongs to *this* run,
and the log ends with the `=== run-checklist-suite.sh exited {code} … ===` terminator, which the
script's `EXIT` trap writes on every path including the early bails that kill it before Playwright
writes a line. Since #1621 "ends with" is a guarantee rather than the common case, so reading the
tail is a valid completion check; the two limits are stated in `/testIssue` Step 4 — a SIGKILLed run
has no terminator at all, and a `WARNING: the log writer did not drain …` line above it means the
verdict is good but the log's tail is missing. `exited 0` is the whole verdict on a green run; read the per-test lines only on a red
one.

**On red:** re-run the failing spec(s) alone once, same command with `--spec` narrowed to them. One
flake allowance, because the wrapup already names timezone- and time-of-day-dependent specs as the
usual suspects and 3am is when they fire. Still red → **Step 2a (failure path)** with reason
"e2e gate failed: {spec}", counting toward the 2-failure circuit breaker.

**On green**, append `**E2E gate:** {mode} — passed` under the Iteration {N} section and go to
**Step 2b**. Every iteration records an E2E gate line, skips included.

---

## Step 2a — Failure path

Triggered by a failed implementation, a reviewer reject, or a red e2e gate.

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
