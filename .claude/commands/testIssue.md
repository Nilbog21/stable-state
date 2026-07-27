You are testing a pull request that has already passed `/reviewIssue`'s automated review — syncing migrations if needed, starting the local dev server, and walking through acceptance-criteria verification before the PR is marked ready to merge. Substantial problems found along the way get deferred instead of fixed on the spot — see Step 4. Both kinds of substantial finding go into the same per-issue work log, `specs/issue-{N}.md` (created by `/beginIssue` on first touch, cleaned up by `/finishIssue`): in-scope fixes go to its `## Open items` section, and findings whose root cause is a separate, pre-existing problem unrelated to this PR go to its `## Follow-ups (needs own issue)` section instead — both survive this issue's own `/finishIssue` cleanup until they're actually resolved or filed.

> **Recommended model: Opus (1M context).** Long QA walkthroughs, and every finding needs a defer-vs-fix-now judgment call. Set with `/model` before invoking.

---

## Step 0 — Worktree and issue/PR detection

**Kill lingering loops:** a `/loop` or `ScheduleWakeup` from earlier work in the session can still be pending when `/testIssue` starts. (Both are Claude Code harness features for scheduling repeat work, not project tooling — nothing in this repo depends on them.) Before anything else, call `ScheduleWakeup` with `stop: true` to cancel it. This is a no-op if none is pending — don't announce it either way, just do it. (`/reviewIssue` is not a source of these: it runs its review agents in the foreground and forbids wrapping that wait in a wakeup poll.)

**Detect worktree:**

This project is developed across parallel git worktrees — see README.md's "Development worktrees" section for what they are, where they live, how their `.env.local` is arranged, and the port each one uses.

Check `pwd`. If the path contains `stable-state-worktrees/alpha`, `stable-state-worktrees/beta`, `stable-state-worktrees/gamma`, `stable-state-worktrees/delta`, or `stable-state-worktrees/epsilon`, record that as the active worktree.

If not inside a worktree, ask: "Which worktree do you want to use — **alpha**, **beta**, **gamma**, **delta**, or **epsilon**?" and wait for the answer. The worktree path is `../stable-state-worktrees/{alpha|beta|gamma|delta|epsilon}` resolved from `git rev-parse --show-toplevel`.

All subsequent commands must run inside this worktree using absolute paths.

**Detect issue number from branch:**
Run:
```
git -C {worktree-path} rev-parse --abbrev-ref HEAD
```

If the branch name matches the format `{N}-{slug}` (leading digits followed by a hyphen), extract `N` as the issue number. If it doesn't, ask: "I couldn't detect an issue number from the branch name. What issue number is this work for?" Wait for the answer.

**Fetch PR context:**
```
gh pr view --json number,url,headRefName,baseRefName
```
Record `{pr}` (PR number), `{PR URL}`, and `{base}` (`baseRefName`) — `{base}` is used later by Step 4's staleness check and mechanical e2e check.

**Kick off Step 4's analysis now, in parallel:** fetch `gh issue view {N} --json body` and `gh pr diff`, and derive the ordered acceptance-criteria verification-item list exactly as described in Step 4 below. Do this work alongside Steps 1–3 — it doesn't depend on the preview being live. Hold the result silently; nothing from this gets printed until Step 4 is reached. When Step 4 is reached, use this pre-derived list rather than re-fetching or re-deriving it.

---

## Step 1 — Migration check

Check whether the PR diff includes any files under `supabase/migrations/`:
```
gh pr diff --name-only | grep '^supabase/migrations/'
```
If it does, set HAS_MIGRATIONS=true.

**If HAS_MIGRATIONS=true:**

Tell the user:
```
This PR has migrations. Run `/sync-migrations` now — it will rename the pending
migration files to the current timestamp and push them to remote.

Type 'synced' when `/sync-migrations` has completed:
```

Wait for the user to type `synced`.

Then commit the renamed migration files:
```
git -C {worktree-path} status --porcelain supabase/migrations/
```
Stage all modified/renamed migration files and commit:
```
git -C {worktree-path} add supabase/migrations/
git -C {worktree-path} commit -m "[#{N}] Rename migrations to push timestamp"
git -C {worktree-path} push
```

**If HAS_MIGRATIONS=false:** print:
```
No migrations touched, so the /sync-migrations step is skipped.
```

---

## Step 2 — Reset dev DB (optional)

Print, as an FYI — do not wait for a response, this doesn't gate the next step:
```
Optional: if you want a clean dev DB with fresh seed data before testing, run
`bash scripts/reset-db.sh` in another terminal.
```

Continue immediately to Step 3.

---

## Step 3 — Start (or reuse) the local dev server

PR previews are no longer auto-deployed on Vercel for issue/patch branches, so testing happens against a local dev server instead. Each worktree has a fixed port (canonical list: README.md's "Development worktrees" section):

- alpha → 3001
- beta → 3002
- gamma → 3003
- delta → 3004
- epsilon → 3005

Check whether a server is already responding on the active worktree's port:
```
curl -sf http://localhost:{port} -o /dev/null
```

**If it responds:** reuse it as-is.

**If not:** start one in the background from the worktree:
```
cd {worktree-path} && npm run dev -- -p {port} > /tmp/testissue-{worktree}.log 2>&1 &
```
Poll `curl -sf http://localhost:{port} -o /dev/null` every 2 seconds, up to 30 times (1-minute timeout). If it never responds, print the tail of `/tmp/testissue-{worktree}.log` and **stop**.

(Nice-to-have, not built: the browser tab title reflecting the worktree, e.g. "test-alpha" — `next dev` has no flag for this since it's the page's own `<title>` metadata, not a server option. Would need a small conditional in the root layout keyed off an env var if ever wanted.)

Print:
```
PR: {PR URL}
Local server ready: http://localhost:{port}
```

Set `specs/issue-{N}.md`'s status marker to `testing` — this is the signal `/finishIssue` later trusts to know verification actually started.

This is the point where Step 0's parallel acceptance-criteria analysis becomes visible — proceed directly to Step 4 using its result.

---

## Step 4 — Acceptance-criteria verification

Use the verification-item list already derived back in Step 0. (If for any reason it wasn't prepared — e.g. this step is being resumed standalone — fetch `gh issue view {N} --json body` and `gh pr diff` now and derive it before continuing.)

Derivation rule: from the issue body's acceptance-criteria checklist, identify the items that specifically require **visual or manual verification** — things a human needs to eyeball in the running preview (UI rendering, interactive states, computed values shown on screen) — and skip items that are purely backend/logic and already covered by the automated test suite. Additionally, scan the PR diff for user-facing changes not explicitly called out in the acceptance criteria (new components, changed copy, new UI states, altered layouts) and add those as extra verification items. Combine both into a single ordered list.

If an item recommends running the local checklist e2e suite (`npm run test:checklist:auto` / `scripts/run-checklist-suite.sh`), print the worktree-specific command instead of the bare npm alias: `bash scripts/run-checklist-suite.sh --base-url http://localhost:{port}`, using the port from Step 3's table. The npm alias defaults to `localhost:3000`, so it silently fails to reach the server on any worktree but the one assigned to port 3000.

**Stale-branch check before running the checklist suite:** whenever the checklist suite command above is about to be printed, first run `git -C {worktree-path} fetch origin {base} && git -C {worktree-path} rev-list HEAD..origin/{base} --count`. If the count is nonzero, print a warning before the command: "This branch is {N} commits behind `origin/{base}` — checklist-suite failures may be stale fixes from `{base}` reappearing as noise, not new regressions. Consider `git -C {worktree-path} merge origin/{base}` before trusting the results (a merge, not a rebase, so no force-push is needed)." This is advisory only — print the checklist-suite command either way and let the user decide whether to catch up first.

**Mechanical e2e regression check:** independent of whatever the issue's own ACs call for, check `gh pr diff --name-only` for any changed file under `e2e/`. If there are any, run the checklist suite once as a regression check, scoped to just those files: `bash scripts/run-checklist-suite.sh --base-url http://localhost:{port} --spec {file}`, repeating `--spec` per changed spec file. Drop the `--spec` flags to run the whole suite instead when the change is broad enough to warrant it (a shared fixture, `global-setup.ts`, or `playwright.config.ts`, none of which a per-file filter would cover). Apply the same stale-branch check above before running it. If it passes, just note in the printed summary that it ran clean — no user prompt needed. If it fails, treat each failure like a reported problem in the loop below: classify minor/substantial and in-scope/out-of-scope using the same rules, using the failure output as the finding description instead of a user's freeform report.

**Check for carried-over deferred items:** read `specs/issue-{N}.md`'s `## Open items` section (see the format in "Deferring a substantial fix" below) and prepend its entries to the verification-item list, each phrased as a re-check of the original finding (e.g. "Re-check: {problem description}"). This is what makes the section rolling — a prior round's unresolved concerns get re-verified this round before any new ones are found.

**Do not print this list up front.**

For each item, one at a time:

1. Print a short, specific prompt describing exactly what to check and where. When the check involves visiting a page, include the full URL (`http://localhost:{port}{path}`, using the port recorded in Step 3), not just the page name — e.g. "Visit http://localhost:{port}/barn/{slug}/settings/tiers — edit a tier's price and confirm the amber warning appears when the price changes and disappears when it matches the original." Print this as plain text, never via `AskUserQuestion` — its selection UI doesn't let the user click the URL, and these prompts always need a live browser check, not a choice among fixed options.
2. Wait for the user's freeform response.
3. **If the user confirms it's correct:** if this item came from the carried-over deferred list, remove its entry from `specs/issue-{N}.md` (it's resolved). Move to the next item. Treat a bare `c` or `y` (case-insensitive) as confirmation, same as an explicit "yes"/"confirmed"/"looks good".
4. **If the user reports a problem:** first check they were actually looking at this worktree's server, *then* classify it.

   **Traffic check (do this first, before any diagnosis):** `tail -20 /tmp/testissue-{worktree}.log` and look for a request line matching the path you just asked them to visit. Next.js dev logs every request (`GET /barn/{slug}/... 200 in 123ms`). No matching hit means they're on a different port — several worktrees are typically running dev servers at once, and landing on the wrong `localhost:{port}` is a recurring cause of "it's not working". Say so plainly and re-print the correct URL rather than starting to debug the code. Don't wait for two or three confusing rounds to try this. (If the server was reused rather than started here, the log may be missing or stale — say the check was inconclusive and fall through to normal diagnosis.)

   **Classify minor vs. substantial** and state the classification with a one-line reason (e.g. "Minor — single existing assertion needs updating." / "Substantial — this needs new test coverage for a state transition that doesn't exist yet."). The user can override in the moment ("actually just fix it" / "actually defer that") — treat that as final.

   - **Minor** (a self-contained tweak: copy, style, an off-by-one, updating one existing test's assertion): fix inline as before.
     - Run coverage: `cd {worktree-path} && bash scripts/check-coverage.sh`. If it fails, write tests to cover the gaps and re-run until it passes.
     - Commit and push:
       ```
       git -C {worktree-path} add {changed-files}
       git -C {worktree-path} commit -m "[#{N}] {short description}"
       git -C {worktree-path} push
       ```
     - The dev server hot-reloads on save — wait a few seconds for the recompile, then refresh.
     - Re-present the same item (not the next one) for re-verification.
   - **Substantial** (needs new test cases for new logic/behavior, touches DB schema/RPC, spans multiple files or introduces a new abstraction, or is better described as a design gap than a bug): **do not modify code.** Also decide **in-scope vs. out-of-scope**, and state which with a one-line reason:
     - **In-scope**: the fix belongs to resolving issue #{N} itself.
     - **Out-of-scope**: the root cause is a separate, pre-existing problem unrelated to this PR's own changes (e.g. a bug in code this PR doesn't touch, surfaced incidentally by the new test/feature). Check the PR diff's file list if it's not obvious — if the failing behavior lives entirely outside the files the diff touches, it's out-of-scope.

     The user can override either classification in the moment — treat that as final. See "Deferring a substantial fix" below, then move on to the next item (do not re-present this one this round).

**Deferring a substantial fix:**

- **In-scope:** append an entry (in memory) to this round's deferred list: `{problem description} — found verifying: "{AC item text}". Why deferred: {one-line reason}`. Goes into `specs/issue-{N}.md`'s `## Open items` per the format below.
- **Out-of-scope:** append instead to `specs/issue-{N}.md`'s `## Follow-ups (needs own issue)` section: `- {date} {time} — {2-4 sentence paragraph: what's wrong, how it was found (reference the specific AC item), why it's out of scope for #{N}, and a fix direction if apparent}.` This section is never read by Step 5's readiness check and never blocks `gh pr ready` — same purpose as `specs/issue-{N}.md`'s "open a new issue" path in Step 5, but for findings that were never in scope for #{N} to begin with, so they can't wait for that path. It gets turned into a real issue later via `/grillMe specs/issue-{N}.md` (either run any time, or `/finishIssue` will prompt for it if entries remain when the issue is otherwise done).

Before moving on, check whether any *remaining* items in this round's list can't actually be tested because they depend on the thing you just deferred, in-scope or out-of-scope (not "skip it, get to it later" — literally can't verify without the fix). If so, mark each as blocked rather than presenting an unverifiable check to the user: `{AC item text} — blocked by: {the deferred item above}`. Skip straight past blocked items with no prompt. Blocked entries always go in `## Open items` regardless of where their blocker was deferred to — they're about verifying #{N}'s own acceptance criteria even when the root cause lives elsewhere.

**Once the whole list is exhausted** (every item confirmed, deferred, or blocked), update `specs/issue-{N}.md`'s `## Open items` section: keep any entries from a prior round you didn't just resolve, update or remove ones you did, append newly-found in-scope/blocked entries in this format:
```markdown
<!-- since_sha: {current HEAD sha} -->

- [ ] {problem description} — found verifying: "{AC item text}". Why deferred: {reason}
- [ ] {AC item text} — blocked by: {reference to the item above it depends on}
```
Always refresh the `since_sha` comment to the current HEAD when writing, and append a `- {date} {time} — /testIssue: {M} item(s) deferred this round.` line to `## Log` (skip the Log line if nothing was deferred this round — that's covered by Step 5's own completion line instead).

Once every item has been confirmed, deferred, or blocked, ask: "Anything else to verify, or are you done?" If the user raises something new **that's still in scope of this issue's acceptance criteria** (a bug in the feature actually under test), handle it like a reported problem (classify, then fix inline or defer per the rules above). Repeat until the user says done.

**Out-of-scope findings — never create GitHub issues from this skill.** If what the user raises is out of scope (a different page, a pre-existing bug unrelated to this PR, a scope-creep ask), do not fix it unprompted and do not run `gh issue create` for it. Say so explicitly and ask how they want to handle it — fix now in this PR (treat as in-scope from here on), or note it in `## Follow-ups (needs own issue)` per the out-of-scope format above and move on. Wait for their answer before taking any action.

---

## Step 5 — Finalize

Check whether `specs/issue-{N}.md`'s `## Open items` section has any unresolved (`- [ ]`) entries.

**First, separate deferred concerns from operational reminders.** Not every `- [ ]` entry is a gap in the work. An entry can also be a *deliberate post-merge action* — something an AC explicitly requires be left undone in this PR (e.g. "remove the originals from `~/.claude/commands/` after merge, because worktrees on older branches still need them"). Such an entry is the AC's *satisfaction*, not a blocker, and is normally marked as such inline. Treat it as non-gating: it does not count toward the unresolved tally below, does not trigger the three-way prompt, and does not hold the PR in draft. Leave it in the file verbatim — do not resolve it, and do not move it to `## Follow-ups`, which is for findings needing their own issue.

You do not need to read `finishIssue.md` to confirm such an entry survives to be acted on — it does, in two places. `/finishIssue`'s Step 0.5 lists unresolved `## Open items` in a confirmation prompt *before* merging, and its Step 6.5/Step 7 capture any surviving entries verbatim and reprint them after the merge under a `STILL TO DO BY HAND` heading, because Step 6.5 deletes the work log itself. The post-merge reprint is the one that matters: Step 0.5's prompt can be many minutes and a full CI wait behind the final output, so a reminder seen only there is effectively lost. Phrase the entry so it stands alone when reprinted with no surrounding context — include the literal command, not a reference to one.

**If the only entries are non-gating reminders of that kind, treat the section as empty** for the purposes of the branch below — mark the PR ready, and note in the `## Log` line which entry was left standing and why.

**If it has none:** mark the PR ready and finish as before:
```
gh pr ready
```
Append `- {date} {time} — /testIssue: all AC verified, marked ready.` to `## Log` and set the status marker to `ready`. Print exactly:
```
Ready for you to run /finishIssue
```

**If unresolved entries remain:** print a summary of the gaps (each deferred/blocked entry, one line each), then ask:

> "There are {count} deferred concern(s) from this testing round: {list}. How do you want to handle them — fix now, save to issue-{N}.md for a later /grillMe session, or start a fresh session later?"

Wait for the answer, then:

- **Fix now:** for each deferred entry (skip blocked-only entries individually — they'll get re-verified once their blocker is fixed), run a proper TDD loop right in this session:
  1. Write a failing test covering the gap. Confirm it's red: `cd {worktree-path} && npx vitest run {test-file}`. Commit: `git -C {worktree-path} add {test-files} && git -C {worktree-path} commit -m "[#{N}] Add failing tests: {short description}"`.
  2. Implement the fix. Confirm the test is green (same `npx vitest run` command). Commit: `git -C {worktree-path} add {changed-files} && git -C {worktree-path} commit -m "[#{N}] {short description}"`.
  3. Run coverage: `bash scripts/check-coverage.sh`. If it fails, write tests to cover the gaps and re-run until it passes.
  4. Run lint: `npm run lint`. Fix any issues and re-run until clean.
  5. Push: `git -C {worktree-path} push`.
  6. Remove the entry from `## Open items`.

  Once every deferred entry is fixed, re-present any blocked entries for a quick confirm (same single-item flow as Step 4) now that their blocker is resolved — remove them from `## Open items` once confirmed. Once that section is empty, proceed with `gh pr ready`, the `## Log`/status update, and the "Ready for you to run /finishIssue" message above.

- **Save to issue-{N}.md for a later /grillMe session:** for each remaining entry, move it to `## Follow-ups (needs own issue)` using the same format as Step 4's out-of-scope path: `- {date} {time} — {2-4 sentence paragraph: what's wrong, how it was found (reference the specific AC item), and a fix direction if apparent}.` Remove the corresponding entries from `## Open items`. This skill never runs `gh issue create` directly — turning these into real issues is `/grillMe`'s job (run any time, or `/finishIssue` will prompt for it if entries remain when the issue is otherwise done). Then run `gh pr ready`, the `## Log`/status update, and print the "Ready for you to run /finishIssue" message above, plus the count of entries saved to Follow-ups.

- **Start a fresh session later:** leave `## Open items` as-is — it already has everything needed (the `since_sha` marker lets `/reviewIssue` scope its next pass to just the fix commits). Do **not** run `gh pr ready`. Append `- {date} {time} — /testIssue: {count} concern(s) deferred, PR staying in draft — resume via /beginIssue {N}.` to `## Log` (status marker stays `testing`, not `ready`). Print:
  ```
  PR #{pr} stays in draft. Start a separate session and run /beginIssue {N} to resolve the deferred concerns in specs/issue-{N}.md via proper TDD, then re-run /reviewIssue and /testIssue.
  ```
  Stop — do not run any further steps.

`specs/issue-{N}.md` itself is never deleted by this skill — that's `/finishIssue`'s job, once the whole issue (not just this testing round) is done.
