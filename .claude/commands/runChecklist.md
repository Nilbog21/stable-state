You are driving one pass of `PRE_RELEASE_TEST_CHECKLIST.md` with the user: walking every checkbox that needs a human eye with them one at a time while a single suite run derives the `(e2e: <name>)` ones in the background, recording the answers in a gitignored run file as you go. Step 0's Ordering paragraph says which checks have to sit either side of that run, and why.

> **Recommended model: Sonnet (1M context).** A multi-hour prompting-and-bookkeeping session — the judgment calls are the user's, not yours. Set with `/model` before invoking.

**This skill never edits `PRE_RELEASE_TEST_CHECKLIST.md` or `checklists/pre-release/*.md`.** Those are the reusable template; the run file in `specs/` is the record of one run. Ticking a box in the template would make the next release's run start half-checked. It also never runs `gh issue create` — Step 4 hands failures to `/grillMe`, which stays the only path from a finding to a filed issue.

---

## Step 0 — Context, run file, dev server

```
git fetch origin
bash scripts/workflow-context.sh
```

Record `worktree`, `worktree_path`, `port` and `release_base`. If `worktree` came back empty, ask which worktree to use and re-run the script from there. All commands below run from `{worktree_path}` with absolute paths.

**The `fetch` runs first, and that order is the whole point.** `workflow-context.sh` derives `release_base` from local remote-tracking refs alone and never fetches — deliberately, since #1231 added that derivation for `worktree_state`, where a stale answer costs nothing. Reading it *after* a fetch instead of before is what makes it safe to promote to the release gate below: on a worktree that has never fetched the newly-cut `release/release-N+1`, an unfetched derivation names the previous release, and HEAD sitting on that old tip then reports 0 ahead and 0 behind — a confirmed-correct green against a branch nobody is shipping, which is #1560's own failure mode reproduced inside its fix. `/beginIssue` and `/issueBatch` fetch before the identical derivation for the same reason. Any re-run of the script in this session needs the fetch ahead of it too.

**Verify which branch you are about to test, before anything else** (#1560). This step comes first — ahead of the run file, whose header records what it establishes, and far ahead of the suite, which takes hours to report a verdict that is worthless if it was measured against the wrong tree. Wrapup 3 is the gate on the entire release, and a worktree that still has a merged feature branch or a week-old `release/release-N` checked out will produce a full green that says nothing about the code being shipped.

`release_base` is the target — the current release branch. **Not `base`**, which answers a different question: it derives from the issue number in the branch name, so on `release/release-N` itself it comes back empty, and on a leftover `patch-N` branch it says `main`. Both are the stale-worktree case this check exists to catch.

Two read-only commands — the fetch they depend on has already run above:

```
git -C {worktree_path} rev-list --left-right --count origin/{release_base}...HEAD
git -C {worktree_path} status --porcelain
```

`rev-list --left-right --count` prints two numbers in the order the refs were given, so with `origin/{release_base}` on the left it is **behind first, ahead second** — `5	0` means five commits on the release branch that HEAD doesn't have. Reversing the refs silently reverses the reading, and "0 behind" is the answer that lets the run proceed, so keep them in this order. Report and phrase them behind-first throughout, matching the raw output.

The `fetch` is unconditional and stays that way — it reads, it changes no branch and no file, and without it both `release_base` and the behind count are stale numbers that report green on a release branch that moved yesterday. What the already-correct case below skips is the *state-changing* half, the checkout and the pull.

Report the current branch, both counts, and whether the tree is clean, then branch on what you found:

- **Dirty tree** — refuse to start the run, printing `git status --short`'s paths. Whether to stash, commit or revert is the user's call; this skill never touches their tree. A run against uncommitted edits is testing something that exists on no branch at all, which is worse than testing the wrong branch because nothing afterwards can reconstruct what was measured.
- **On `{release_base}`, 0 behind and 0 ahead** — say so, with the HEAD SHA, and go straight to the run file. No checkout, no pull, no question. Re-invoking on an already-correct branch is a no-op that announces itself.
- **Anything else** — report it, then **offer** the correction that actually fits what you found, proceeding only on confirmation. Which correction that is depends on the counts, because one command does not cover all three shapes:

  - **Behind only, or on a different branch** — `checkout` + `pull --ff-only` is the fix:

    > HEAD is `{branch}` — {n} behind, {m} ahead of `{release_base}`. Check out `{release_base}` and pull? (yes/no)

    On `yes`: `git -C {worktree_path} checkout {release_base} && git -C {worktree_path} pull --ff-only origin {release_base}`.

  - **Ahead only** (already on `{release_base}`, 0 behind, commits `origin` doesn't have) — **do not offer `checkout` + `pull`**: checkout is a no-op, `pull --ff-only` reports already-up-to-date, and the extra commits survive, so the offer would report a correction that didn't happen. There is no read-only fix here and this skill never rewrites the user's history. Report the unpushed commits (`git -C {worktree_path} log --oneline origin/{release_base}..HEAD`) and say the run will describe local code that isn't on the release yet, then let them push, reset or accept it before you continue.
  - **Diverged** (both counts nonzero) — same refusal, and for a harder reason: `pull --ff-only` errors out rather than fast-forwarding. Report both counts and hand it back; reconciling a diverged release branch is the user's call, not a prompt this skill can safely answer for them.

  On `no` to any of these: say plainly that the run's verdict will describe `{branch}` and not the release, and continue. Ahead-only counts as a real finding even though it has no offered fix — a local commit sitting unpushed on the release branch is the same false green pointed the other way.

  **One exception, and it is the guard `.claude/commands/CLAUDE.md` asks for:** if today's run file already exists and its `last-completed-section` marker names Phase 7's last section, the run is finished and the case below stops cold without prompting. Read the marker before offering anything here — a finished run has no sections left to measure, so there is no branch left to correct, and a checkout prompt in front of a stop-cold case contradicts that rule's "no prompting". Report the branch facts either way; withhold only the offer.

Record the branch and the HEAD SHA (`git -C {worktree_path} rev-parse --short HEAD`) — the run file header below carries them.

**Run file:** `specs/checklist-run-$(date +%F).md`. `specs/` is gitignored scratch, so the record never enters git. Settle it *before* starting a server or the suite — a run that's already finished has nothing left to serve or re-run.

If it does not exist, create it:

```markdown
# Pre-release checklist run — {YYYY-MM-DD}

<!-- last-completed-section:  -->

Server: http://localhost:{port} · worktree {worktree}
Branch: {branch} @ {sha}
```

**If it already exists**, read its `last-completed-section` marker and branch on it:

- **The marker names Phase 7's last section** — this run is already complete. Reprint the file's Step 4 summary and **stop cold**: no server, no suite, no prompting. Re-walking a finished run is how a day's answers get overwritten with a second set.
- **Otherwise** — offer to resume, never silently restart:

  > A run file for today already exists, last completed section **{marker}**. Type `resume` to pick up at the next section, or `restart` to start over (the existing file is overwritten):

  On `resume`, branch on the file's `Suite:` line: a **verdict** means the suite is already collected, so skip Step 0.5 and Step 3.5's collection; `Suite: RUNNING` means the background run died with the session that launched it, so relaunch it at Step 0.5; no line at all means it never launched. Step 0.4's before-suite checks are re-prompted only if the file carries no `## Before-suite checks` block — branch on the record itself, not on the `Suite:` line as a proxy for it: once the suite has launched those checks are behind it and cannot be redone, which is exactly why Step 0.4 writes them down before launching. Then begin Step 1 at the section after the marker. On `restart`, overwrite the file with a fresh header. An empty marker means no section has been flushed yet — resume starts at the first section either way.

  Either way, the branch check above has already run — it runs on every invocation, resume included — so compare its answer against the file's `Branch:` line and, if they differ, say so and update the line. A resume normally *should* differ: Wrapup 3 works each finding to merge as the run goes, so the release branch moves under a multi-day run. A header still naming the SHA from before those fixes misattributes every section walked after them.

**Ordering.** Dev server up → the `before-suite` checks, completed before anything else starts → the suite launched in the background → the rest of the manual walk, concurrent with it → the `after-suite` checks once the suite has landed.

The reason, and it is not the one that looks obvious: the suite's barns are prefix-isolated, so *barn* collisions with `dev-barn` are not what the ordering is about. What conflicts is process-level. A `before-suite` step wipes or reseeds the whole dev project, taking the suite's own fixtures with it; an `after-suite` step restarts the app with a different env (today's are the two `/demo` lines), and until #1601 that also killed a suite driving the same origin. Since the suite serves itself, only the first half of that still bites the suite — but an `after-suite` step still takes *your* server away mid-walk, which is why it stays last. Everything else is safe to walk while the suite runs, and serialising a multi-hour walk behind a ~1000-test suite wastes the hours the suite is up. The dev server comes up first because the reset prompt is unusable without it — completing the reset means logging in through the app.

**Which lines those are is a property of the lines, never a list here.** Grep for them:

```
grep -rn '(manual, before-suite' checklists/pre-release/
grep -rn '(manual, after-suite' checklists/pre-release/
```

The markings and their convention are defined in `PRE_RELEASE_TEST_CHECKLIST.md`'s Automation tags blockquote (#1561). A hardcoded line-number list here is exactly the drift the marking exists to prevent.

**Dev server.** The manual checks target the shared dev barn `dev-barn` in a browser, so a server has to be up. Bring one up exactly as `/testIssue` Step 3 prescribes — that step owns the sequence (reuse whatever answers `curl -sf http://localhost:{port}`, otherwise background `npm run dev -- -p {port}`, wait in one blocking `timeout 60` call rather than polling, and print the log's tail and stop if it never comes up). Use `/tmp/devserver-{port}.log`, the one dev-server log path (#1569) — a port has exactly one server, so the older per-skill paths meant whichever skill didn't start it was tailing a file nobody wrote. **This server is yours alone.** Until #1601 the suite drove this same server and recycled it on finishing — a ~30s mid-walk window where nothing answered the port, plus a `/testIssue` session in the same worktree losing its server and its traffic-check log in flight. The suite now builds and serves its own, so none of that happens: the walk gets an uninterrupted server for its whole length, and there is no gap to warn the user about, no re-try-before-recording rule, and nothing to suppress. What remains true is that the suite and the walk still share one **Supabase project**, which is what the before-suite/after-suite ordering below is actually about.

---

## Step 0.4 — The `before-suite` checks, as a blocking prerequisite

Prompt each line the `before-suite` grep found, in file order, with Step 2's vocabulary and reply rules. Nothing else starts until they are all answered — that is what the marking means.

On a **fail** or **skip**, stop and ask whether to continue the run at all rather than pressing on: today's one such step is the database reset every later phase's data assumes, so a run that skips it is walking a checklist against unknown state.

No demo-user step is needed after the reset any more (#1607): `reset-db.sh` still deletes every auth user, the demo one included, but it now re-runs `scripts/setup-demo-user.sh` itself, and that script reuses the `DEMO_USER_PASSWORD` already in `.env.local` rather than minting a new one. So `/demo` survives a reset with nothing to paste. If a `/demo` spec does fail on a `?error=demo_unavailable` redirect, that pairing is the thing to check first — an empty `DEMO_USER_EMAIL`/`DEMO_USER_PASSWORD` in `.env.local`, or a password there that no longer matches the user.

**Write these answers into the run file as they're given**, under a `## Before-suite checks` block of their own, before Step 0.5 launches anything. Don't cache them the way Step 2 caches a section's: Step 0.5's `Suite: RUNNING` line makes them unrepeatable the moment it lands, and the section they'd otherwise flush with is Phase 1's opening run, which doesn't flush until 45 checkboxes later. A session that dies in between would take the database-reset verdict every later phase assumes with it, and the resume branch above would not know to ask again.

---

## Step 0.5 — Launch the suite in the background

The `(e2e: <name>)` tag string *is* the Playwright test name, so the mapping in Step 3.5 is exact — no heuristics beyond reading failed test names out of the log.

The command is the whole suite — no `--spec` flags, since every phase's `(e2e:)` lines are in scope:

```
cd {worktree_path} && bash scripts/run-checklist-suite.sh
```

**Launch it exactly as `/testIssue` Step 4 prescribes** — that step owns this protocol and is the only place it's written down: background launch, the `cd {worktree_path} &&` prefix, results read from `checklist-suite.log` rather than the tool result, the freshness header and the exit terminator both checked before the log is trusted. Not waiting for it is the same rule there as here since #1602 — launch, then go straight to Step 1. What differs is only who collects the verdict: **Step 3.5** does, against the `(e2e:)` tags, where `/testIssue` hands its full run to `/finishIssue`'s merge gate.

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
44 checks · 39 covered by the suite · 4 either side of it · 1 needs your eye
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

They come last because each one takes the server under test away: today that is the two `/demo` lines, which need the app restarted with `DEMO_USER_PASSWORD` unset. Warn the user that `dev-barn` is unbrowsable until the env is restored and the dev server is back, so nothing else can be re-checked in between — and that anything they want another look at should be looked at before these start.

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
