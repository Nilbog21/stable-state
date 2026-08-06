You are driving one pass of `PRE_RELEASE_TEST_CHECKLIST.md` with the user: deriving every `(e2e: <name>)` checkbox from a single suite run, then walking the ~130 remaining checkboxes with them one at a time, recording the answers in a gitignored run file as you go.

> **Recommended model: Sonnet (1M context).** A multi-hour prompting-and-bookkeeping session — the judgment calls are the user's, not yours. Set with `/model` before invoking.

**This skill never edits `PRE_RELEASE_TEST_CHECKLIST.md` or `checklists/pre-release/*.md`.** Those are the reusable template; the run file in `specs/` is the record of one run. Ticking a box in the template would make the next release's run start half-checked. It also never runs `gh issue create` — Step 4 hands failures to `/grillMe`, which stays the only path from a finding to a filed issue.

---

## Step 0 — Context, dev server, run file

```
bash scripts/workflow-context.sh
```

Record `worktree_path` and `port`. If `worktree` came back empty, ask which worktree to use and re-run the script from there. All commands below run from `{worktree_path}` with absolute paths.

The manual checks target the shared dev barn `dev-barn` in a browser, so a server has to be up:

```
curl -sf http://localhost:{port} -o /dev/null
```

If it doesn't respond, start one and wait for it in one blocking call:

```
cd {worktree_path} && npm run dev -- -p {port} > /tmp/runchecklist-{worktree}.log 2>&1 &
timeout 60 bash -c 'until curl -sf http://localhost:{port} -o /dev/null; do sleep 2; done'
```

If that times out, print the tail of the log and stop.

**Run file:** `specs/checklist-run-$(date +%F).md`. `specs/` is gitignored scratch, so the record never enters git.

If it does not exist, create it:

```markdown
# Pre-release checklist run — {YYYY-MM-DD}

<!-- last-completed-section:  -->

Server: http://localhost:{port} · worktree {worktree}
```

**If it already exists**, read its `last-completed-section` marker and offer to resume — never silently restart:

> A run file for today already exists, last completed section **{marker}**. Type `resume` to pick up at the next section, or `restart` to start over (the existing file is overwritten):

On `resume`, skip Step 0.5 if the file already carries a `Suite:` line, and begin Step 1 at the section after the marker. On `restart`, overwrite the file with a fresh header. An empty marker means no section has been flushed yet — resume starts at the first section either way.

---

## Step 0.5 — Derive every `(e2e:)` checkbox from one suite run

The `(e2e: <name>)` tag string *is* the Playwright test name, so this mapping is exact — no heuristics beyond reading failed test names out of the log.

Launch with the Bash tool's **`run_in_background`**:

```
cd {worktree_path} && bash scripts/run-checklist-suite.sh --base-url http://localhost:{port}
```

Never pass `--interactive` or `--hold-open` — the suite's barns are prefix-isolated and torn down by its `EXIT` trap, so it does not disturb `dev-barn`, and a headed run wants a human watching it.

**Read the result from `{worktree_path}/checklist-suite.log`, not from the tool result** — a full run can outrun the Bash tool's 600s foreground ceiling, and since #1356 the background tool result no longer carries the per-test lines. The harness re-invokes you when the process exits; there is nothing to poll. Keep the `cd {worktree_path} &&` prefix: the script writes its log next to whatever repo root it starts in, and every worktree holds a copy.

Two checks before trusting the log, both from `/testIssue` Step 4:

- **Freshness** — the `=== run-checklist-suite.sh — barn prefix … — started {date} ===` header is written with `>` before anything else; confirm the timestamp is this run's.
- **Completion** — the run is done when the log ends with the `=== run-checklist-suite.sh exited {code} — full log: … ===` terminator, which the `EXIT` trap writes on every path. Don't infer completion from Playwright's summary; an early bail (bad flag, failed seed, unreadable `.env.local`) kills the script before Playwright writes a line, and the terminator is the only thing present there.

Then:

- **`exited 0`** — every `(e2e:)` checkbox in every phase passed. That is the whole verdict; do not read the per-test `✓` lines, which say the same thing at ~10× the token cost.
- **Non-zero, Playwright ran** — collect the failing test names:
  ```
  grep '✘' {worktree_path}/checklist-suite.log | awk -F'›' '{print $NF}' | awk '{print $1}' | sort -u
  ```
  Each is the exact string inside some `(e2e: <name>)` tag. Those checkboxes failed; every other `(e2e:)` checkbox passed.
- **Terminator present but Playwright never ran** (early bail) — there is **no** e2e result. Report what the log's last lines say, record `Suite: DID NOT RUN — {reason}` in the run file, and ask whether to continue with the manual walkthrough anyway or stop and fix the harness first. Never treat this as green.

Write the verdict line into the run file under the header, e.g. `Suite: exited 0 — all 731 e2e-tagged checks passed.`

---

## Step 1 — Announce the section

Work the phases in order — the Prerequisites in `PRE_RELEASE_TEST_CHECKLIST.md` first, then `checklists/pre-release/phase-1-setup.md` through `phase-7-multi-barn.md`. Later phases depend on data earlier ones create.

**A section is the prose sub-group within a phase, not the phase.** A section starts at a non-indented, non-checkbox, non-heading, non-blockquote line ending in a colon that is immediately followed by a checkbox — Phase 2's `Lesson tiers (…):`, `Horses (…):`, `Agreements (…):`, `Managed rider stubs (…):`:

```
grep -nE '^[^-#>| ].*:$' checklists/pre-release/phase-{n}-*.md
```

That gives a flush point every 5–15 checks rather than every 40, so an interrupted session loses little. **A phase with no such lead-in is one section — the whole phase**, which today is Phases 1, 3 and 7's opening run plus the Prerequisites. Those flush once at the end, and an interrupt inside one loses its answered checks; that is the accepted cost of not inventing an arbitrary sub-grouping the file doesn't have.

Count the section's checkboxes before starting it — total, and how many the suite already covered:

```
sed -n '{start},{end}p' {file} | grep -c '^- \[ \]'
sed -n '{start},{end}p' {file} | grep -c '^- \[ \] (e2e: '
```

Announce it:

```
Phase 4 — Finances (/barn/dev-barn/finances)
141 checks · 140 covered by the suite · 1 needs your eye
```

If the difference is zero, say so, write the section's e2e rollup straight to the run file, and go to the next section without prompting.

---

## Step 2 — Prompt one checkbox at a time

A checkbox needs a human eye if it is **not** tagged `(e2e: …)` — that covers `(manual)`, `(e2e-candidate)`, and the untagged lines in the un-audited phases.

Prompt as **plain text, never `AskUserQuestion`** — the selection UI doesn't let the user click the URL. One check per turn, in file order, with the section's route expanded against the local server:

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

_e2e: 87/89 passed — 2 failed:_
- [ ] FAIL (e2e: the_default_tier_pill_moves) The default pill moves to the newly-defaulted tier
- [ ] FAIL (e2e: editing_a_tier_price_warns) Editing a tier's price shows the amber warning

- [x] (manual) Nothing in the nav bar relies on hover to be reachable
- [ ] FAIL Barn timezone dropdown resets on save — reverts to UTC after every save
- [ ] SKIP Delete barn — reason: not safe against the shared dev DB
- [x] Default board fee saves — note: the "$" prefix overlaps the value at 390px
```

The e2e rollup is per-section counts plus named failures — never 731 copied-out passing lines. A section whose e2e checks all passed gets a bare `_e2e: 9/9 passed_`.

Then update the `last-completed-section` marker to this section's heading text, verbatim. That heading is what a resume matches on.

---

## Step 3 — Next section

Repeat Steps 1–2 for each remaining section, in file order, through the end of Phase 7.

---

## Step 4 — Summarize and hand off

Print the totals — manual passed / failed / skipped, plus the e2e failures — and list every failure and skip in one block, each with its detail line.

Then hand off, and stop:

```
Run `/grillMe specs/checklist-run-{YYYY-MM-DD}.md` in a fresh session to turn
these failures into issues.
```

Do not file anything yourself. `/grillMe` is the only path from a finding to a filed issue, and it interrogates each one before writing it up — which is exactly what a one-line "spacing looks off" note needs before it becomes an issue.
