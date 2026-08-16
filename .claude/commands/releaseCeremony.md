You are walking [`RELEASE_CEREMONY.md`](../../RELEASE_CEREMONY.md) with the user, in order, recording progress and every captured value in a gitignored run file so a ceremony spanning weeks can be resumed rather than re-derived.

> **Recommended model: Sonnet (1M context).** A long, intermittent bookkeeping session — the judgment calls are the user's, not yours. Set with `/model` before invoking.

**This skill never edits `RELEASE_CEREMONY.md`.** That file is the reusable runbook; `specs/release-ceremony-{N}.md` is the record of one run. Ticking a box in the runbook would make the next release start half-checked — the same rule `/runChecklist` follows for `PRE_RELEASE_TEST_CHECKLIST.md`, and for the same reason.

**It parks and hands off; it never dispatches.** Wrapup 3 hands off to `/runChecklist`, Closeout 9 to `/grillMe`. Both self-describe as their own sessions and `/grillMe` bars nesting outright, so those steps print the hand-off and stop rather than invoking anything.

**It never files a GitHub issue itself.** The `(prompt)` "an issue is filed" checkboxes compose the `gh issue create` for the user to approve; `/grillMe` remains the only path from a *finding* to a filed issue.

---

## Step 0 — Derive `N`, and refuse an untagged runbook

**Working directory.** Run `bash scripts/workflow-context.sh` and record `worktree_path`. All commands below run from there with absolute paths. `specs/` is a symlink to one shared `stable-state-specs` directory from every worktree, so the run file survives moving between them — there is nothing cross-worktree to handle, and nothing should be added for it.

**Derive the release number:**

```
git fetch --all -p
git branch -r --list 'origin/release/release-*' | sed 's|.*origin/release/release-||' | sort -n | tail -1
```

That is `N` — the release being shipped. If the skill was invoked with an argument (`/releaseCeremony 4`), that wins. **Confirm it with the user either way** before touching anything: every command below interpolates `N`, and the whole of Part 2 acts on prod.

If the branch list is empty, say so and stop — there is no release to ship.

**Refuse an untagged runbook:**

```
bash scripts/check-ceremony-tags.sh
```

If it exits non-zero, print its output verbatim and **stop cold**. Every decision this skill makes reads a tag; a checkbox with none has no defined behaviour, and guessing one is how an untagged line gets silently run unattended. The failure names the file and line — that line needs a tag in its own PR before the ceremony runs.

---

## Step 1 — Create or resume the run file

**Run file:** `specs/release-ceremony-{N}.md`. `specs/` is gitignored scratch, so the record never enters git.

If it does not exist, create it:

```markdown
# Release ceremony — release {N}

<!-- last-completed-step:  -->

## Values

- dev-project-ref:
- prod-project-ref:
- squash-merge-sha:
- release-merge-sha:
- prod-migration-list-before:
- wrapup-3-checklist-notes:
- closeout-2-reconciliation:

## Progress
```

Those seven values are the whole reason the file exists. Each is produced by one step and consumed by a much later one:

| Value | Produced | Consumed |
|---|---|---|
| `dev-project-ref` | Closeout 1 | Closeout 10, after a multi-hour POST run with a second human |
| `prod-project-ref` | Closeout 1 | Closeout 1–2 |
| `squash-merge-sha` | Wrapup 4 | Wrapup 7, possibly a week later |
| `release-merge-sha` | Closeout 3 | Closeout 6 |
| `prod-migration-list-before` | Closeout 1 | Closeout 2, to tell a successful push from a partial one |
| `wrapup-3-checklist-notes` | Wrapup 3 | Wrapup 6's documentation-review issue |
| `closeout-2-reconciliation` | Closeout 2 | Closeout 2 |

**If the file already exists**, read its `last-completed-step` marker and go to Step 2. Never silently restart: a marker reading `closeout-3` means prod has already been migrated and merged.

**Flush once per step**, not per checkbox — the run file is rewritten at each step boundary with that step's checkboxes and any values it captured. A step's entry looks like:

```markdown
### Wrapup 4 — Squash the release's migrations

- [x] (prompt) Gate: no open release-4 issue will touch supabase/migrations/** — confirmed, 3 open, none migration-shaped
- [x] (auto) Gate: no open PR against release/release-4 carries a migration file
- [x] (manual) Migrations frozen — announced
- [x] (prompt) Issue filed — #1567
- [x] (auto) Its PR merged — #1580
- [x] (auto) squash-merge-sha recorded — 4a91c3de
- [ ] (prompt) Dev DB reconciled — not yet run
```

Then update the marker to this step's slug (`wrapup-4`, `closeout-3`) and write the file.

---

## Step 2 — Resume: re-verify the breakable invariants

Completed steps are **trusted by default**. Re-walking a finished ceremony is how a prod push gets run twice.

The exception is the handful of `(auto)` checks describing a state that can silently go false after being ticked. Re-run exactly these, and **un-tick any that no longer holds, naming what changed**:

- **Wrapup 4's second gate** — no open PR against `release/release-N` carries a file under `supabase/migrations/`. #930 is the precedent: a migration PR merged mid-squash and cost a rebase plus a manual archive.
- **Wrapup 7** — `git diff --name-only <squash-merge-sha>..origin/release/release-N -- supabase/migrations/` still prints nothing.
- **Wrapup 8** — CI green *at the current tip*. Compare the run's `headSha` to `git rev-parse origin/release/release-N`; a bare `gh run list --branch` reports success for a run that passed three commits ago.
- **Wrapup 9** — the merge PR still reports `mergeable`, and is still **unmerged**.

Everything else is trusted, because it describes an event that cannot un-happen: a tag exists, a label exists, a PR is merged, an issue is filed.

Report the re-verification before resuming, e.g.:

```
Resuming release 4 at wrapup-8.
Re-checked 3 breakable invariants — 1 has gone false:
  Wrapup 7 un-ticked: 20260814003012_fix_lesson_tier_fk.sql landed after the squash (PR #1588).
```

Then resume at the un-ticked step, not at the marker.

---

## Step 3 — Walk the steps

Steps in file order, Part 1 then Part 2, never reordered — several exist only because doing them out of order has broken prod before.

Announce each step, then work its checkboxes in order by tag:

- **`(auto)`** — run the check, record the result, move on. No confirmation.
- **`(prompt)`** — compose the exact command with `N` and any run-file value already substituted, show it, and wait for the user's go-ahead. The likeliest failure on these is a mistyped value, which is exactly what substituting from the run file removes.
- **`(manual)`** — print what needs doing and wait for the user to report back. Never infer a verdict from prose: if the reply doesn't clearly say done or not done, ask.

**The `(auto)` verifications are also the already-done guards** `.claude/commands/CLAUDE.md` requires of a state-changing step. "The tag is visible on GitHub" is fetched anyway, so branching on it is what stops a re-invocation re-tagging — no dedicated lookup needed. The same holds for the `patch-N` label (Closeout 4 says outright to skip if it exists) and for Wrapup 9's PR.

**Closeout 3's merge is the one that needs its own fetch.** Step 2's re-checks fire on resume; Closeout 3 is reached by walking forward from Wrapup 9 through Closeout 1–2, which is hours of prod work in between. Before composing the `gh pr merge`, read the PR's state — the same `gh pr view <n> --json state,mergeable` the checkbox needs anyway — and if it is already `MERGED`, tick the box, record the existing merge SHA into `release-merge-sha`, and move on rather than prompting. A merge that happened out of band while you were pushing migrations is the ordinary case, not a fault.

**When a check fails, park.** Say what failed and what would fix it, flush the run file, and stop. Do not tick a checkbox the evidence doesn't support and do not improvise a repair — the steps that exist only because prod broke are precisely the ones where improvising is expensive.

### Part 2 working-directory guard

Before Closeout 1, assert the checkout:

```
git -C {worktree_path} rev-parse --abbrev-ref HEAD
```

Closeout 1–2 must run from `release/release-N`. **Refuse to proceed from `main`** — the consolidated migration files don't reach `main` until Closeout 3 merges them, so from `main` `supabase db push` finds nothing to push while every check in the step still reports success. From Closeout 3 onwards, `main` is correct.

### Closeout 2's reconciliation block

Ask once whether Wrapup 4's squash consolidated migrations **already applied on prod**, record the answer and its reason in `closeout-2-reconciliation`, and never re-infer it.

For a normal release squash the answer is skip — the release's migrations reach prod for the first time in this very step. Only #657's from-scratch baseline needed reconciling. Erring the other way is the disaster the runbook is emphatic about: `migration repair --status applied` writes bookkeeping and runs no SQL, so marking brand-new versions applied turns both the push and `Migrate` into no-ops and prod silently never gets the schema.

Record a skip explicitly (`skipped — release-4's migrations are new to prod`), not as an absence.

### Hand-offs

Three steps end in a fresh session. Print the hand-off, record the step as parked, and stop:

- **Wrapup 3** — `Run /runChecklist in a fresh session, then /grillMe on its run file to turn the findings into release-{N} issues. Come back with the follow-on checklist edits it surfaced — Wrapup 6 needs them.`
- **Closeout 5** — POST is run against prod, by hand, with the second person lined up in Wrapup 2. Nothing here can drive it.
- **Closeout 9** — `Run /grillMe in a fresh session on the POST findings. When it asks which release to slate them for, answer patch-{N} — its default steer is release-{N+1}, and POST findings target main.`

On return, record what the user reports (Wrapup 3's notes go into `wrapup-3-checklist-notes`) and continue.

---

## Step 4 — Finish

Once Closeout 10 is ticked, print a summary: the tag cut, the merge SHA it points at, the next release branch, the patch issues filed, and confirmation that the CLI is linked back to dev.

Set the marker to `complete`. On a later invocation, a `complete` marker means reprint that summary and **stop cold** — a finished ceremony has nothing left to run, and re-walking Part 2 acts on prod.
