---
name: grill-me
description: Interview the user relentlessly about a plan or design until reaching shared understanding, resolving each branch of the decision tree. Use when user wants to stress-test a plan, get grilled on their design, or mentions "grill me".
---

> **Recommended model: Opus** (Fable for a genuinely hard architecture call). The quality of the interrogation *is* the deliverable; there is no later step that catches a shallow one. Set with `/model` before invoking.

Below the frontmatter, this skill is written in the first person: "me"/"I"/"my" means the developer who invoked it, and "you" means Claude.

**This skill always runs as its own session.** Never invoke it via the `Skill` tool from inside `/beginIssue`, `/reviewIssue`, `/testIssue`, or `/finishIssue` — not even when I've just agreed that something found mid-session should become an issue. Consent to file an issue is not consent to nest the session; those skills log the finding to `specs/issue-{N}.md`'s `## Follow-ups` and tell me to run `/grillMe` myself afterwards. `/continueIssue` is the one exception: its whole job is a single dispatch hop taken *after* the previous skill has closed, so when its decision tree lands on the grillMe branch it should invoke this skill, not hand the command back to me.

**Special mode — filing follow-ups from a work log:** if invoked with a `specs/issue-*.md` or `specs/checklist-run-*.md` path as an argument (e.g. `/grillMe specs/issue-42.md`, `/grillMe specs/checklist-run-2026-08-06.md` from a `/runChecklist` pass), skip everything below down through the choice-of-session-type question and go straight to the interview:

- Skip **Branch setup** entirely — this mode never touches project files besides the spec file itself (which is gitignored scratch, not tracked by git), so there's no branch to protect.
- Skip asking me to describe my initial thoughts — read the file's `## Follow-ups (needs own issue)` section instead. Each entry is the seed for one issue; the entry's own text (what/how found/why deferred) is the context, no re-investigation needed.
- Skip the "what should this session produce?" question — it's implicitly **GitHub issues**.
- **Re-verify each entry against current HEAD before writing it up.** A finding captured on an older branch can already be fixed — check `git log`/the current state of the files it names for any merge since that touched them, and re-read those files rather than trusting the original reproduction. A stale entry filed verbatim sends someone to fix a bug that no longer exists in the form described, and hides whatever the real remaining problem is.
- Interview me on each Follow-up entry with the same rigor as any other grilling, then produce the prioritized issue list per the GitHub-issues path below.
- **After creating the issues:** edit the spec file — remove each resolved Follow-up entry (the created issue is now the durable record). If the section is now empty and the file is an `issue-*.md` work log, delete it (`## Open items` must already be empty too, since `/finishIssue` only leaves this file behind when Follow-ups was the sole remaining reason to keep it). A `checklist-run-*.md` file is the record of a checklist pass, not a work log — leave it in place either way. Otherwise leave the file with whatever entries remain unresolved.

---

**Branch setup (git repos only):** If the current directory is a git repository, first check whether it's the primary checkout or a linked worktree: run `git rev-parse --git-dir`. If the result does *not* contain `/worktrees/` (i.e. it's the primary checkout, not a linked worktree), warn me that running grillMe's throwaway-branch flow here risks colliding with any other session using this same directory, and ask whether to continue anyway or stop so I can switch to a worktree first. Proceed only if I say to continue.

Then run `git fetch --all`, list `origin/main` plus any `origin/release/*` branches, present the numbered list, and ask me to select one. When I respond with a number, create and check out a temporary throwaway branch off that branch (e.g. `grillme/temp-$(date +%s)`) so the session works cleanly across worktrees — if the base branch is already checked out in another worktree, still create the throwaway branch from it using `git checkout -b <temp-branch> origin/<base>`). Do this before anything else.

Start by asking me to describe my initial thoughts on the plan or feature.

After I respond, before any grilling begins, ask me — as an open question, not a numbered menu — what I want out of this session, offering a few suggestions:

> What should this session produce? (e.g. GitHub issues for the work, direct changes to this project's files, a design doc — or something else entirely.)

Take my answer at face value, including answers that combine or fall outside the suggestions. If it's genuinely unclear which of the paths below applies, ask one follow-up rather than guessing.

Then conduct the interview: ask questions one at a time, relentlessly, walking down each branch of the design tree and resolving dependencies between decisions. For each question, provide your recommended answer. If a question can be answered by exploring the codebase, explore the codebase instead. Continue until we reach a shared understanding.

Four things about how to conduct that interview:

- **Don't stop once the meta-structure is settled.** Session mode, grouping strategy, and release label are the *start* of the interview, not the whole of it — even for a straightforward audit-style pass. Keep resolving the concrete content decisions too: which of two competing token/convention formulas to standardize on, which field-label style to canonicalize, whether TDD applies to a pure-markup change, whether this repo's mandated companion docs (`checklists/pre-release/phase-*.md`, `docs/architecture/*`, user guides) actually need updating for *this* change, and whether the new issues conflict on files with each other or with open in-flight work. Deciding any of those unilaterally and jumping straight to a drafted issue list is the failure mode.
- **Show, don't describe, for visual picks.** For anything genuinely visual — color, spacing, shape, dark-mode treatment, component variant — build a side-by-side rendered comparison (an HTML Artifact, forced to both light and dark) before asking me to choose. A text description or a bare `AskUserQuestion` option list isn't enough. Text is fine for structural decisions (grouping, labels, sequencing).
- **Ground mockups in real data.** When previewing a dashboard, table, or anything whose numbers must reconcile, pull actual rows from the dev DB (`mcp__supabase__execute_sql`, e.g. `Dev Barn`) instead of inventing plausible placeholders. Synthetic round numbers sum cleanly by construction and hide exactly the structural gaps a mockup exists to surface; messy real data — partial months, orphaned records, uncollected edge cases — is what catches them before any code is written.
- **Look for existing ground truth before agreeing to a structural fix.** When the proposal is "merge module A into module B so A can see B's state," spend one investigation pass looking for a field already in the schema that encodes the "original"/"rightful" state. That often turns a stateful cross-module coordination problem into a stateless single-file lookup — and it's worth checking even when the bigger refactor is my own idea.

When the interview is complete, proceed based on what I said I wanted:

**If I want GitHub issues:**
Produce a prioritized list of GitHub issues that capture the work to be done. For each issue include:
- A concise title
- A short description of the work and why it's needed
- Acceptance criteria as a checklist

Four scoping conventions apply while drafting that list:

- **One issue per user-facing capability**, each spanning the whole canonical file-touch sequence from `ARCHITECTURE.md` (schema → RLS → RPC → DAL → action → component → tests) as a single PR-sized vertical slice. Don't split one feature into a schema issue, an RLS issue, a DAL issue, a UI issue. A layer-only split is fine when that layer is genuinely reusable across several unrelated future capabilities — that's the exception, not the default.
- **"Role X shouldn't see Y" is never a UI-hiding issue.** Trace Y back to the RPC or table it comes from. If the `EXECUTE` grant is broad (`authenticated`) with no per-role check, or the RLS policy is permissive, a user bypasses client-side hiding with one devtools call. Scope the issue to add the DB-level check (raise `not_authorized`, or convert `SECURITY INVOKER` → `SECURITY DEFINER` with an explicit check, matching `create_managed_member`/`get_horse_projected_exhaustion`). UI hiding is still worth doing so the role doesn't hit a raw error — it just can't be the only line of defense.
- **Any issue that produces a migration gets this acceptance criterion:** "Update `reset-db.ts` to reflect the schema change (new required columns, renamed tables, new RPC signatures, or removed columns it references)." That script touches nearly every domain table and `create_lesson_with_participants`; a new NOT NULL column or changed RPC signature silently breaks it. Omit only when the migration clearly touches nothing the script writes to — default to including it.
- **Any feature that needs data variety to be visible gets a seed-data criterion:** "Update `reset-db.ts`/`reset-db.sh` to seed enough data for the feature to be manually testable." Ask "if I ran this against the current seed data, could I see it work?" — if no or maybe, add it. Common triggers: date-range filters, pagination, multi-month or multi-barn views, aggregations over time, anything showing history or comparisons.

Ask me to review the issues and provide any feedback or clarifications before proceeding. Wait for explicit confirmation (e.g. "looks good", "proceed", "lgtm") or incorporate any changes requested. Then ask which release these issues should be slated for. If I specify a plain number (e.g. "3"), treat it as the label `release-3`, not a version string. Confirm the label before proceeding.

Then fetch all open issues with that release label and the full label list with descriptions:
```bash
gh issue list --state open --label {release-label} --json number,title,labels,body --limit 100
gh label list --json name,description
```

Evaluate the dependency tree: identify which existing issues must land before the new ones. Use the label descriptions to understand ordering signals — `rearchitecture` and `data-migration` issues impose structural ordering even when not listed as explicit dependencies; `high-priority` is a manual override that always lands first. Report the blocking dependencies and recommended sequencing before proceeding.

When presenting the new issues for creation, suggest appropriate labels for each one based on their nature and the label descriptions. Ask me to confirm or adjust before proceeding. Then ask if I'd like you to create these issues with `gh issue create`.

**After creating the issues**, check whether `specs/batch_{release-label}.md` already exists. If it doesn't, skip silently — the batch file gets built whenever `/issueBatch create` is next run manually. If it does exist, append each new issue to the appropriate section (Ready or Blocked, using the same dependency-phrasing rules `/issueBatch create` uses) with `unblocks: 0` rather than recomputing the whole graph.

**Write down what the interview taught you.** This is the more valuable half, and it's the reason a grilling session leaves a durable mark on the batch file at all. `/issueBatch pick` reasons over this prose — it is the substrate, not decoration (see that skill's "The batch file format" section):

- A `note:` line under an entry, for anything issue-specific: which issues it must land before or after and what rework the wrong order causes, which files it collides on and in which region, what a reviewer will need to know that isn't in the body. Write the *why*, not just the ordering — "sequence before #1206, which writes specs asserting the current workbook" survives a change of circumstances in a way "do #1218 first" doesn't.
- An entry under `## Insights`, for anything release-wide that doesn't attach to one issue: which cluster is the long pole, which issue is its keystone, a constraint that shapes every pick this release.

Add these for issues the interview *touched*, not only for ones it created — if you worked out that two existing issues conflict, that finding belongs in the file too. Never overwrite an existing note you didn't author; append.

**In an issues-only session, never edit a tracked file.** If the interview surfaces a needed change to `CLAUDE.md`, `ARCHITECTURE.md`, source, or a migration, that change is itself an issue — capture it as one. Don't make the edit "just this once" as a convenience; every change to a version-controlled file goes through issue → branch → PR. (The `specs/issue-*.md` work log in the special mode above is gitignored scratch, not a tracked file — editing it is expected.)

**If I want direct file changes:**
Implement the changes directly in the codebase, following `CLAUDE.md`'s Test-First Rules — write failing tests first, unless the whole deliverable is tests, which substitutes a mutation pass for the red step. Follow the canonical file-touch sequence from ARCHITECTURE.md.

**Anything else:**
Produce whatever I asked for, following its own conventions. If I never named a concrete deliverable, ask now rather than defaulting to one.

**Cleanup (git repos only):** When the session is done — issues created, direct implementation finished/handed off, or I say I'm done — clean up the throwaway branch:
- Check whether it has any commits ahead of its base (`git rev-list <base>..HEAD --count`).
- If zero (e.g. an issues-only session, where work happened via `gh issue create` and no files changed), switch back to the original branch and delete the throwaway branch with `git branch -D <temp-branch>` — no confirmation needed, nothing is lost.
- If nonzero (e.g. direct implementation), ask before deleting — offer to keep it, rename it to a real feature branch, or open a PR from it, rather than discarding committed work.

---

<!--
Derived from the `grill-me` / `grilling` skills in https://github.com/mattpocock/skills
(the interview instructions: one question at a time, walk each branch of the design
tree, give a recommended answer, explore the codebase instead of asking). Everything
else here is original. Upstream license:

MIT License

Copyright (c) 2026 Matt Pocock

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
-->

