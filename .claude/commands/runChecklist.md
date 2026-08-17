You are driving one pass of `PRE_RELEASE_TEST_CHECKLIST.md` with the user: walking every checkbox that needs a human eye with them one at a time while a single suite run derives the `(e2e: <name>)` ones in the background, recording the answers in a gitignored run file as you go. Step 0's Ordering paragraph says which checks have to sit either side of that run, and why.

> **Recommended model: Sonnet (1M context).** A multi-hour prompting-and-bookkeeping session — the judgment calls are the user's, not yours. Set with `/model` before invoking.

**This skill never edits `PRE_RELEASE_TEST_CHECKLIST.md` or `checklists/pre-release/*.md`.** Those are the reusable template; the run file in `specs/` is the record of one run. Ticking a box in the template would make the next release's run start half-checked. It also never runs `gh issue create` — Step 4 hands failures to `/grillMe`, which stays the only path from a finding to a filed issue.

---

## Step 0 — Context, run file, dev server

```
bash scripts/workflow-context.sh
```

Record `worktree`, `worktree_path` and `port`. If `worktree` came back empty, ask which worktree to use and re-run the script from there. All commands below run from `{worktree_path}` with absolute paths.

**Run file:** `specs/checklist-run-$(date +%F).md`. `specs/` is gitignored scratch, so the record never enters git. Settle it *before* starting a server or the suite — a run that's already finished has nothing left to serve or re-run.

If it does not exist, create it:

```markdown
# Pre-release checklist run — {YYYY-MM-DD}

<!-- last-completed-section:  -->

Server: http://localhost:{port} · worktree {worktree}
```

**If it already exists**, read its `last-completed-section` marker and branch on it:

- **The marker names Phase 7's last section** — this run is already complete. Reprint the file's Step 4 summary and **stop cold**: no server, no suite, no prompting. Re-walking a finished run is how a day's answers get overwritten with a second set.
- **Otherwise** — offer to resume, never silently restart:

  > A run file for today already exists, last completed section **{marker}**. Type `resume` to pick up at the next section, or `restart` to start over (the existing file is overwritten):

  On `resume`, branch on the file's `Suite:` line: a **verdict** means the suite is already collected, so skip Step 0.5 and Step 3.5's collection; `Suite: RUNNING` means the background run died with the session that launched it, so relaunch it at Step 0.5; no line at all means it never launched. Step 0.4's before-suite checks are re-prompted only if the file carries no `## Before-suite checks` block — branch on the record itself, not on the `Suite:` line as a proxy for it: once the suite has launched those checks are behind it and cannot be redone, which is exactly why Step 0.4 writes them down before launching. Then begin Step 1 at the section after the marker. On `restart`, overwrite the file with a fresh header. An empty marker means no section has been flushed yet — resume starts at the first section either way.

**Ordering.** Dev server up → the `before-suite` checks, completed before anything else starts → the suite launched in the background → the rest of the manual walk, concurrent with it → the `after-suite` checks once the suite has landed.

The reason, and it is not the one that looks obvious: the suite's barns are prefix-isolated, so *barn* collisions with `dev-barn` are not what the ordering is about. What conflicts is process-level. A `before-suite` step wipes or reseeds the whole dev project, taking the suite's own fixtures with it; an `after-suite` step restarts or replaces the server under test, killing a suite driving that origin. Everything else is safe to walk while the suite runs, and serialising a multi-hour walk behind a ~1000-test suite wastes the hours the suite is up. The dev server comes up first because the reset prompt is unusable without it — completing the reset means logging in through the app.

**Which lines those are is a property of the lines, never a list here.** Grep for them:

```
grep -rn '(manual, before-suite' checklists/pre-release/
grep -rn '(manual, after-suite' checklists/pre-release/
```

The markings and their convention are defined in `PRE_RELEASE_TEST_CHECKLIST.md`'s Automation tags blockquote (#1561). A hardcoded line-number list here is exactly the drift the marking exists to prevent.

**Dev server.** The manual checks target the shared dev barn `dev-barn` in a browser, so a server has to be up. Bring one up exactly as `/testIssue` Step 3 prescribes — that step owns the sequence (reuse whatever answers `curl -sf http://localhost:{port}`, otherwise background `npm run dev -- -p {port}`, wait in one blocking `timeout 60` call rather than polling, and print the log's tail and stop if it never comes up). Use `/tmp/devserver-{port}.log`, the one dev-server log path (#1569) — a port has exactly one server, so the older per-skill paths meant whichever skill didn't start it was tailing a file nobody wrote. That single server is also the thing the suite recycles when it finishes: `run-checklist-suite.sh` kills and relaunches it (a ~30s gap, log truncated) to give back the ~8.5 GB the run fattened it by. Since #1561 the walk is concurrent, so that gap now lands **mid-walk** — a ~30s window where nothing answers the port. Say so when you announce the launch, and if a check fails oddly during the walk, re-try it before recording a failure — if it fails again, `tail -3 {worktree_path}/checklist-suite.log` says whether the suite has just finished, which is the moment the recycle fires. Don't wait for the run file's `Suite:` line to tell you: it reads `RUNNING` for the whole walk, since Step 3.5 is the only step that replaces it. Not worth suppressing with `--no-recycle`: the walk runs for hours on that server afterwards, which is the whole reason #1569 reclaims the memory. It also means a `/testIssue` session live in this same worktree loses its server and its traffic-check log mid-flight. #1382 gave this skill a separate log path to keep those two from clobbering each other; that's now a process-level collision the paths can't prevent, so don't run both against one worktree at once.

---

## Step 0.4 — The `before-suite` checks, as a blocking prerequisite

Prompt each line the `before-suite` grep found, in file order, with Step 2's vocabulary and reply rules. Nothing else starts until they are all answered — that is what the marking means.

On a **fail** or **skip**, stop and ask whether to continue the run at all rather than pressing on: today's one such step is the database reset every later phase's data assumes, so a run that skips it is walking a checklist against unknown state.

After the reset passes, re-run the demo-user setup before launching anything:

```
cd {worktree_path} && bash scripts/setup-demo-user.sh
```

and paste its two lines into `.env.local`. `reset-db.sh` deletes every auth user, the demo one included (the Prerequisites line says so); skip this and every `/demo` spec in the suite fails on a `?error=demo_unavailable` redirect, which names nothing about the cause.

**Write these answers into the run file as they're given**, under a `## Before-suite checks` block of their own, before Step 0.5 launches anything. Don't cache them the way Step 2 caches a section's: Step 0.5's `Suite: RUNNING` line makes them unrepeatable the moment it lands, and the section they'd otherwise flush with is Phase 1's opening run, which doesn't flush until 45 checkboxes later. A session that dies in between would take the database-reset verdict every later phase assumes with it, and the resume branch above would not know to ask again.

---

## Step 0.5 — Launch the suite in the background

The `(e2e: <name>)` tag string *is* the Playwright test name, so the mapping in Step 3.5 is exact — no heuristics beyond reading failed test names out of the log.

The command is the whole suite — no `--spec` flags, since every phase's `(e2e:)` lines are in scope:

```
cd {worktree_path} && bash scripts/run-checklist-suite.sh --base-url http://localhost:{port}
```

**Launch it exactly as `/testIssue` Step 4 prescribes** — that step owns this protocol and is the only place it's written down: background launch, the `cd {worktree_path} &&` prefix, results read from `checklist-suite.log` rather than the tool result, the freshness header and the exit terminator both checked before the log is trusted. The difference here is that you do **not** wait for it: launch, then go straight to Step 1. Step 3.5 collects it.

One thing that step doesn't cover, because it never runs the suite this way: never pass `--interactive` or `--hold-open`. Both want a human watching a run nobody is watching — the walk has your attention instead.

Write `Suite: RUNNING (launched {HH:MM})` into the run file under the header, and tell the user the run has started and roughly how long it takes. That line is what a resume branches on, and Step 3.5 replaces it with the verdict.

---

## Step 1 — Announce the section

Work the phases in order — the Prerequisites in `PRE_RELEASE_TEST_CHECKLIST.md` first, then `checklists/pre-release/phase-1-setup.md` through `phase-7-multi-barn.md`. Later phases depend on data earlier ones create.

**A section is the prose sub-group within a phase, not the phase.** A section starts at a non-indented, non-checkbox, non-heading, non-blockquote line ending in a colon that has at least one checkbox under it before the next such line — Phase 2's `Lesson tiers (…):`, `Horses (…):`, `Agreements (…):`, `Managed rider stubs (…):`:

```
grep -nE '^[^-#>| ].*:$' checklists/pre-release/phase-{n}-*.md
```

That grep lists **candidates** — it matches the colon line but can't express the "has checkboxes under it" half of the rule, and a lead-in doesn't have to be followed *immediately* by one (Phase 2's `Managed rider stubs (…):` has a blockquote in between). So check each hit for a checkbox before the next hit and drop the ones with none, or an empty section gets announced; today that drops exactly `Cleanup (optional):` at the end of Phase 7, which introduces a teardown command and nothing else.

The rest give a flush point every 5–15 checks rather than every 40, so an interrupted session loses little. **Checkboxes before a phase's first lead-in are one section — the phase's opening run**, which today is Phases 1, 3 and 7 (Phases 1 and 3 carry no lead-in until #1414's `Visual sweep`/`Doc review` blocks at the end) plus the Prerequisites. Those flush once at the end, and an interrupt inside one loses its answered checks; that is the accepted cost of not inventing an arbitrary sub-grouping the file doesn't have.

Count the section's checkboxes before starting it — total, how many the suite already covered, and how many sit either side of it:

```
sed -n '{start},{end}p' {file} | grep -c '^- \[ \]'
sed -n '{start},{end}p' {file} | grep -c '^- \[ \] (e2e: '
sed -n '{start},{end}p' {file} | grep -cE '^- \[ \] \(manual, (before|after)-suite'
```

**`needs your eye` is total minus both of the other two** — the marked lines are answered in Step 0.4 or deferred to Step 3.5, never prompted here, so counting them in would promise the user a section several times longer than the one they get. Name them separately rather than silently dropping them, or the totals stop adding up:

```
Phase 4 — Finances (/barn/dev-barn/finances)
141 checks · 140 covered by the suite · 1 needs your eye
```

```
Phase 1 — opening run (/barn/dev-barn)
45 checks · 39 covered by the suite · 5 either side of it · 1 needs your eye
```

If `needs your eye` is zero, say so and go to the next section without prompting — there is nothing to write, since the suite's result lands once in Step 3.5 rather than per section.

---

## Step 2 — Prompt one checkbox at a time

A checkbox needs a human eye if it is **not** tagged `(e2e: …)` — that covers `(manual)`, `(e2e-candidate)`, and the untagged lines in the un-audited phases.

Two exclusions, both by marking: a `before-suite` line was answered in Step 0.4 and is not asked again, and an `after-suite` line is deferred to Step 3.5. Neither is prompted here, neither belongs in this section's flush below — each records into its own block, Step 0.4's and Step 3.5's — and Step 1's count already subtracted both.

Prompt as **plain text, never `AskUserQuestion`** — same reason `/testIssue` Step 4 gives for its own prompts: the selection UI doesn't let the user click the URL. One check per turn, in file order, with the section's route expanded against the local server:

```
Phase 2 — Horses (2 of 17)
http://localhost:{port}/barn/dev-barn/horses

Open Daisy's detail page → set status pill to **Unavailable**, enter reason "Thrown shoe" → Save

p/c = pass · f = fail · s = skip · anything else = note
```

Reply vocabulary — match on the trimmed reply, case-insensitive:

- **`p` or `c`** — verified, passes. Record and move on without comment.
- **`f`** — failed. Ask **"One line on what went wrong:"** and record the answer with it.
- **`s`** — skipped. Ask **"Why skipped?"** (blocked, not applicable, needs prod) and record the reason.
- **`q`, `quit`, or `stop`** — flush what's been answered so far, note in the run file where the section was cut off, and end the session.
- **anything else** — record it verbatim as a note against this check, then ask explicitly: **"Noted. Does that check pass or fail? (p/f)"**

That last rule is the point of the vocabulary. "passed, but the spacing looks off" must not silently become a failure, and "looks basically fine I guess" must not silently become a pass. **Never infer a verdict from prose** — always ask.

**Cache results in memory; flush to the run file once per section**, not per check. One edit per 5–15 answers instead of one per answer.

When the section is done, append it to the run file:

```markdown
## Phase 4 — Manage Barn

- [x] (manual) Nothing in the nav bar relies on hover to be reachable
- [ ] FAIL Barn timezone dropdown resets on save — reverts to UTC after every save
- [ ] SKIP Delete barn — reason: not safe against the shared dev DB
- [x] Default board fee saves — note: the "$" prefix overlaps the value at 390px
```

**No e2e rollup in a section.** The suite is still running while these are written, so its verdict isn't knowable here; it lands once, in Step 3.5's `## e2e suite` block. Never copy out passing test lines in either place.

Then update the `last-completed-section` marker to this section's heading text, verbatim. That heading is what a resume matches on.

---

## Step 3 — Next section

Repeat Steps 1–2 for each remaining section, in file order, through the end of Phase 7.

---

## Step 3.5 — Collect the suite, then the `after-suite` checks

**Collect first.** If the run file's `Suite:` line already carries a verdict, this half is done — skip to the checks below. Otherwise read `{worktree_path}/checklist-suite.log` per `/testIssue` Step 4's protocol, waiting on the exit terminator if the walk finished first. Then map the verdict:

- **`exited 0`** — every `(e2e:)` checkbox in every phase passed. That is the whole verdict; do not read the per-test `✓` lines, which say the same thing at ~10× the token cost.
- **Non-zero, Playwright ran** — collect the failing test names:
  ```
  grep '✘' {worktree_path}/checklist-suite.log | awk -F'›' '{print $NF}' | awk '{print $1}' | sort -u
  ```
  Each is the exact string inside some `(e2e: <name>)` tag. Those checkboxes failed; every other `(e2e:)` checkbox passed. `grep -rn '(e2e: <name>)' checklists/pre-release/` gives each one its phase.
- **Terminator present but Playwright never ran** (early bail) — there is **no** e2e result. Report what the log's last lines say, record `Suite: DID NOT RUN — {reason}`, and ask whether to finish the run without it or stop and fix the harness first. Never treat this as green.

Replace the `Suite: RUNNING` line with the verdict, and append one block at the end of the run file:

```markdown
## e2e suite

exited 1 — 729/731 passed, 2 failed:
- (e2e: the_default_tier_pill_moves) The default pill moves to the newly-defaulted tier — Phase 4
- (e2e: editing_a_tier_price_warns) Editing a tier's price shows the amber warning — Phase 4
```

A clean run is a one-line block: `exited 0 — all 731 e2e-tagged checks passed.`

**Then the `after-suite` checks.** Prompt each line the `after-suite` grep found, in file order, same vocabulary, recording them into an `## After-suite checks` block appended at the end of the run file — the same shape Step 2 uses for a section. Their own phase sections flushed hours ago and their markers moved on, so there is nothing left for them to join; without a block of their own they'd be answered and then dropped, and Step 4 would total them as if they'd never been asked.

They come last because each one takes the server under test away: today that is the two `/demo` lines, which need the app restarted with `DEMO_USER_PASSWORD` unset, and the error-boundary line, which needs `npm run build && npm start` in its place. Warn the user that `dev-barn` is unbrowsable until the env is restored and the dev server is back, so nothing else can be re-checked in between — and that anything they want another look at should be looked at before these start.

---

## Step 4 — Summarize and hand off

Print the totals — manual passed / failed / skipped, plus the e2e failures — and list every failure and skip in one block, each with its detail line. The manual totals cover the `## Before-suite checks` and `## After-suite checks` blocks as well as the phase sections; those five checks are the run's riskiest and a total that quietly omits them reads as a clean sweep.

Then write those same failures into the run file under a `## Follow-ups (needs own issue)` heading, one `- ` entry each, carrying the check's text and its detail line:

```markdown
## Follow-ups (needs own issue)

- Barn timezone dropdown resets on save — Phase 4, Manage Barn. Reverts to UTC after every save.
- (e2e: the_default_tier_pill_moves) The default pill doesn't move to the newly-defaulted tier — Phase 4, failed in the suite.
```

That heading is what `/grillMe`'s work-log mode reads, and it's the whole reason the hand-off below files anything: a run file without it falls through to grillMe's generic "describe your initial thoughts" interview and the failures never reach an issue.

Then hand off, and stop:

```
Run `/grillMe specs/checklist-run-{YYYY-MM-DD}.md` in a fresh session to turn
these failures into issues.
```

Do not file anything yourself. `/grillMe` is the only path from a finding to a filed issue, and it interrogates each one before writing it up — which is exactly what a one-line "spacing looks off" note needs before it becomes an issue.
