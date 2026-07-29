You are orchestrating a batch of small, related, migration-free issues across a fleet of dedicated headless worktrees (`fable-1` … `fable-10`), running the existing skill chain (`/beginIssue` → `/reviewIssue` → `/testIssue` → `/finishIssue`) in background subagents and playing the user's role in each one: reading skill output, resolving routine concerns yourself, and escalating to the user only the decisions you are not comfortable making alone. The user is not watching the workers — they see one escalation at a time in this terminal and nothing else.

> **Recommended model: Fable** for the orchestrator (this session). Workers run **Opus** — pass it explicitly as the subagent model override; subagents otherwise inherit the orchestrator's model.

Invocation: `/fableFleet 1086-1094` or `/fableFleet 1086 1088 1090` — a range or explicit list of issue numbers.

---

## Step 0 — Qualify the batch

This skill is for batches that are **small, related, and migration-free**. Verify before anything runs:

1. Fetch every issue (`gh issue view {N} --json title,body,labels,state`). All must share a release label. **Keep each issue's `state`** — Step 3 needs it as its already-done guard, and this is the only place you fetch it.
2. **No-migration check (hard requirement):** grep each body for migration/schema/RLS/RPC scope. If any issue plausibly requires a file under `supabase/migrations/`, stop and tell the user this batch doesn't qualify — migrations need the human-supervised flow.
3. **Dependency check:** every `Blocked by` reference in every body must be a closed issue whose PR is merged. If a blocker is still open, report it and stop — do not start a partial batch unless the user says to.
4. **Shared-file survey:** from the issue bodies, list files more than one issue will touch (e.g. a checklist file all slices annotate). These are the expected merge-conflict sites; note them for Step 5.

## Step 1 — Opening interview

Before provisioning anything, interview the user grillMe-style — one question at a time, recommended answer attached — to settle the batch-specific unknowns:

- The **concurrency cap** (default recommendation: 3–4; never more than the number of issues).
- Whether to open with a **canary**: one issue dispatched alone through the entire pipeline — through merge — before fanning out to the cap. Recommend yes for this skill's first outing or any batch shape it hasn't run before; the first full run debugs every seam in the headless contract serially instead of concurrently.
- Any risk the qualification pass surfaced (a stale-looking issue body, an unexpected shared file, a dependency merged but not yet on the base branch).
- Anything about *this* batch that the escalation policy in Step 4 doesn't already cover.

Keep it short — the point is to drain predictable mid-flight escalations now, not to re-litigate this skill's design.

## Step 2 — Provision worktrees (lazily)

Fable worktrees live beside the human ones (`alpha`…`epsilon`) and are never presented to the user or used interactively. Provision only as many as the concurrency cap requires, reusing them across issues within the batch. **They are never torn down** — like the Greek-letter worktrees, they're standing infrastructure that persists between batches; removing them would only mean paying `npm install` again next time.

`scripts/workflow-context.sh` resolves a `fable-N` worktree and its port by rule (`3100+N`, unbounded), so a growing fleet needs no registration anywhere — and the port is *that script's* rule, not this skill's. Never restate the number here; the whole reason that script exists is that per-skill copies of the worktree→port map had already diverged (#1118).

Resolve paths absolutely rather than writing worktree-relative ones. This session may be running from the primary checkout or from any worktree, and `git -C X <path>` resolves `<path>` from `X` while the bare `ln -s` on the next line resolves from *your* cwd — which is exactly how those two lines end up disagreeing about where the fleet lives:

```bash
MAIN=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
FLEET="$(dirname "$MAIN")/stable-state-worktrees"

git -C "$MAIN" worktree add "$FLEET/fable-N" --detach origin/{base}
(cd "$FLEET/fable-N" && ln -s ../../stable-state/.env.local .env.local && npm install)
```

The symlink is the same relative form every worktree uses (README's "`.env.local` across worktrees"), so the whole fleet points at the one dev Supabase project — which is why Step 5's full-suite mutex has to exist at all.

**Reusing an existing `fable-N` — check before you clobber.** A worktree from a prior batch may hold uncommitted work, most likely left by a worker abandoned under Step 4. Run `git -C "$FLEET/fable-N" status --porcelain` first. Non-empty: do not detach, and escalate — what to do with an abandoned worker's remains is the user's call, and this is the one provisioning step that destroys evidence. Clean: detach from the stale branch, fetch, and `npm install` to refresh.

## Step 3 — Dispatch workers

**Before dispatching anything, drop the issues that are already done.** Reuse the `state` Step 0 already fetched — don't re-look it up. An issue that is already `CLOSED`, or whose PR is already `MERGED`, is not dispatched: record it in the fleet table as `merged` and move on. If *every* issue in the batch is already done, stop cold and say so rather than provisioning a fleet for an empty batch. This is load-bearing, not defensive: a batch is re-invoked on the same issue range after any interruption, and resuming instead of restarting is the entire value of the range being re-runnable.

If a canary was agreed in Step 1, dispatch it alone and hold the rest of the batch until it merges; then fan out. Fold what the canary teaches — batch-specific constraints, shared-fixture changes, corrected issue text — into the prompts of every subsequently dispatched worker.

One background Opus subagent per active issue, working directory pinned to its fable worktree. The worker prompt must establish the headless contract, since the workflow skills assume an interactive user:

- You are the developer for issue #{N}, working exclusively in `{worktree path}`. Run the skill chain starting from `/beginIssue {N}` (or wherever `/continueIssue` says to resume). Each of those skills opens by running `scripts/workflow-context.sh`, which resolves your worktree and its port for you — take them from there and don't carry a port in your head.
- The workflow skills will tell you to ask the user things. You have no user. When a skill needs an answer you can give from the issue text, the repo's conventions, or its own recommended default — give it and log it in the work log's accepted-deviations/log sections as usual. When it needs a judgment you cannot make, **end your turn** with a short question block: what you need decided, the options, your recommendation. Do not guess on: acceptance-criteria deviations, anything touching `supabase/migrations/`, scope mismatches between issue text and code.
- Plan-mode and AskUserQuestion steps in the skills are not available to you — treat them as "end your turn with the plan/question and wait." Know what that costs: `/beginIssue`'s plan gate is normally enforced by the harness itself (Plan mode blocks Edit/Write until the plan is approved), and ending your turn is only a promise to do the same thing. So hold to it explicitly — **write no code until the orchestrator has answered your plan turn.** A plan turn that arrives with code already written is itself an escalation.
- Full checklist-suite runs require the orchestrator's go-ahead first (Step 5's mutex) — end your turn and ask for the lock; single-spec runs need no lock. Launch the suite exactly as `/testIssue` prescribes: `run_in_background`, reading results from `{worktree-path}/checklist-suite.log` rather than the tool result. Do **not** switch it to a foreground run — a full run can outrun the Bash tool's 600s ceiling and lose its output entirely, and here it would burn the fleet-wide mutex doing so. The pilot's failure was the other half of that pattern: a worker that ends its turn *purely to wait* for the background completion never gets woken (three-for-three). So don't stake the run on that wakeup. The log is the authority — `run-checklist-suite.sh` writes a run-prefix + timestamp header at the start and an exit-code terminator at the end, so the terminator's presence is what "finished" means, and Step 5's lock-holder heartbeat probes that same file if you go quiet.
- Your work log lives at `{your worktree}/specs/issue-{N}.md` as usual. Include that absolute path in your `DONE` report — the orchestrator harvests your `## Follow-ups (needs own issue)` section from it (Step 6) and has no other way to see it.
- `/finishIssue`'s merge is serialized fleet-wide (Step 5's merge slot) — before merging, end your turn and request the slot. Never merge on standing authorization alone, even when the chain was assigned end-to-end. Include the shared-file integrity gate (Step 5) results, freshly re-run at the current HEAD, in every slot request.
- Review fan-out subagents must be **read-only** (Explore type, or an explicit no-writes instruction) — a write-capable review agent in the pilot reverted staged shared-file work, and the revert was nearly merged.
- Re-verify against the **post-push** head immediately before merging by re-running the project's own gate, `bash scripts/workflow-ci-wait.sh {pr}` — a `CI: pass` taken before a force-push is stale for the new head. Don't hand-roll a `gh pr view` field check in its place: that script already treats anything other than `MERGEABLE` as pending rather than as "not conflicting", precisely because GitHub recomputes mergeability lazily for a window after every push.
- End every turn with a status block: current skill/step, outcome, and either `WAITING: <question>` or `DONE: <what completed>`.

When a worker ends its turn, read the status block. Answer routine questions via SendMessage (the worker continues with context intact). When a worker finishes an issue, assign the next unstarted issue from the batch to its worktree.

## Step 4 — Escalation policy

**Decide alone** (answer the worker yourself, keep a log line):
- Accepting Opus's design/plan recommendations in `/beginIssue` when they fit the issue's acceptance criteria and repo conventions.
- Applying `/reviewIssue` findings and routing substantial ones into revise mode — the workflow defines that loop; you walk it.
- Environment mechanics: port collisions, `npm install`, one retry of a flaky test, restarting a dead dev server.
- Mechanical rebase conflicts — adjacent-hunk noise, lockfile regeneration.
- The full `/finishIssue` sequence when CI is green and nothing was deviated from.

**Escalate to the user** — one concern at a time, via a question in this terminal; keep orchestrating the other workers while you wait:
- Any deviation from an issue's acceptance criteria. Accepted-deviations are always the user's call.
- Any diff touching `supabase/migrations/` — hard stop for the whole worker, not just a question.
- An issue's text contradicting what the code shows (wrong scope, stale assumption).
- The same failure surviving **two** fix attempts (test, build, or CI).
- A `/reviewIssue` → revise → re-review loop still producing substantial findings after **one** revise cycle.
- Non-mechanical merge conflicts — anything requiring a choice between two behaviors.
- Anything destructive beyond the workflow's norms (force-push, deleting things that aren't merged issue branches, repair scripts).

**Standing precedent:** once the user rules on a decision category (e.g. "a checklist line whose claim is false against deliberate code behavior gets rewritten to the true invariant"), later instances of the same category are yours to decide by citing that ruling — record the citation in the worker's log and surface it in the batch-close report. Re-escalate only when the new instance differs in a way the ruling didn't cover. Your own decide-alone rulings are reversible on better evidence (a reviewer's finding, a sibling's contradicting read) without asking the user; log the reversal and reasoning.

**Reporting cadence** (the user watches via tmux flashes — only three kinds of output warrant their attention):

1. **The fleet table, every 5 minutes.** Keep a background timer armed (`sleep 300` as a background Bash task — its exit re-invokes you). Each time it fires: first run the lock-holder heartbeat (probe the log of any worker silent past its operation's normal duration), then print the table — and **re-arm only while at least one batch issue is still unmerged.** The firing that finds the batch complete prints the final table and stops; a timer must never outlive the batch, and Step 6 does not close out with one still armed. (Self-armed rather than `/loop` on purpose: the orchestrator has to keep working between fires, and `/loop` re-enters a prompt rather than resuming this session. This is the one poll the skill permits — everything else waits on a real signal.) One row per batch issue:

   | Issue | Worktree | Status | Elapsed |
   |---|---|---|---|
   | #N | fable-K | the skill/step the worker is in (skill name is fine), or `queued` / `waiting: <lock/slot/answer>` / `merged` | time since the current skill started — only for actively-running work |

   Track skill start times from your dispatch and the workers' status blocks. Don't spawn a subagent to render this — subagents can't print to the user; the table is your own turn output from state you already hold.
2. **Escalation prompts** — the questions you need the user to settle, one at a time, as defined above.
3. **Abandonments** — anything you had to give up on (a worker stopped and not re-dispatched, an issue pulled from the batch, a task dropped). Never bury these in the table; report them prominently when they happen.

Every other turn (worker acks, interim bookkeeping) ends with a single short line prefixed `[fleet]` so its tmux flash is recognizable as ignorable at a glance.

## Step 5 — Fleet-wide serialization

Two locks you hold as orchestrator:

- **Full-suite mutex:** at most one full checklist-suite run across the fleet at a time (it seeds a barn per spec file against the shared dev Supabase project). Grant the lock to one waiting worker at a time, in request order. Single-spec runs are exempt.
- **Merge serialization:** run `/finishIssue` for one issue at a time, in completion order. Before each merge, update the PR branch onto the latest base and let CI re-run. Conflicts resolve per the Step 4 policy.

Three disciplines learned in the pilot, enforced by you as orchestrator:

- **Shared-file integrity gate** (any file every slice edits — e.g. a checklist all slices annotate): before each merge-slot grant, the worker presents, fresh at its current HEAD: (1) `git diff --numstat` on the shared file — deletions must equal the slice's touched pre-existing lines, insertions that plus one per ratified split; (2) every removed line enumerated via `git diff ... | grep '^-' | grep -v '^--- '` (other grep forms have silently matched nothing) and shown to be a pre-upgrade line, never a sibling's finished work. Adjacent slice blocks in one file conflict with whichever neighbor merged last — that's structural, not bad luck. Canonical resolution: **content-match re-application** (select each side's own lines by name, assert counts, assert every non-selected line is its pre-upgrade twin), never index math; if the branch carries a revert commit, abort the rebase and rebuild clean rather than replay it.
- **Lock-holder heartbeat:** if a lock or slot holder is silent longer than the operation's normal duration, probe its worktree's log (header timestamp + exit terminator) yourself and nudge it with what you found — don't wait indefinitely on a wakeup that may be lost.
- **Environmental broadcast:** when the user reports (or you learn of) an external event touching shared infrastructure — a dev-DB reset, a schema push, a config change — immediately broadcast it to all active workers, naming the failure signature to treat as environmental so it doesn't burn fix attempts or trip the escalation trigger. Conversely, hold the user's own shared-infrastructure operations (e.g. `/sync-migrations`) until the fleet is quiescent, or quiesce it for them.

## Step 6 — Batch close

Throughout the batch, keep an **orchestrator ledger** at `specs/issue-{batch-slug}.md` in your own worktree, in standard work-log format (status marker, `## Log`, `## Accepted deviations`, `## Open items`, `## Follow-ups (needs own issue)`): merge order, rulings and their precedents, batch-intelligence facts fed to later worker prompts, and — critically — every follow-up any worker logged, consolidated and deduped (parallel workers independently log the same finding), with pointers to the worker copies. Harvest those by reading each worker's `specs/issue-{N}.md` at the absolute path it reported — same filesystem, so they're readable, but nothing syncs them and `specs/` is gitignored and never committed. **Copy the text into the ledger; never leave a follow-up referenced in place** — a worker's `specs/` file is gone the moment that worktree is reused for the next issue, and the fleet reuses worktrees within the batch. Harvest at each `DONE`, not at close-out. Workers never file follow-up issues themselves; the ledger being a real work log means `/grillMe specs/issue-{batch-slug}.md` files everything in one session.

When every issue is merged and closed: report a single summary to the user (issues landed, escalations raised and how they resolved, anything that failed to complete), **clearly enumerate the unfiled follow-ups from the ledger**, give the all-clear on any held shared-infrastructure operations, offer the `/grillMe` filing session, leave the fable worktrees in place, and — if this run surfaced a gap in this skill's own text — propose the edit, which rides along in whatever PR the batch's learnings belong to.
