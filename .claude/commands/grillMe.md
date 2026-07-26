---
name: grill-me
description: Interview the user relentlessly about a plan or design until reaching shared understanding, resolving each branch of the decision tree. Use when user wants to stress-test a plan, get grilled on their design, or mentions "grill me".
---

> **Recommended model: Opus** (Fable for a genuinely hard architecture call). The quality of the interrogation *is* the deliverable; there is no later step that catches a shallow one. Set with `/model` before invoking.

**Special mode — filing follow-ups from a work log:** if invoked with a `specs/issue-*.md` path as an argument (e.g. `/grillMe specs/issue-42.md`), skip everything below down through the choice-of-session-type question and go straight to the interview:

- Skip **Branch setup** entirely — this mode never touches project files besides the spec file itself (which is gitignored scratch, not tracked by git), so there's no branch to protect.
- Skip asking me to describe my initial thoughts — read the file's `## Follow-ups (needs own issue)` section instead. Each entry is the seed for one issue; the entry's own text (what/how found/why deferred) is the context, no re-investigation needed.
- Skip the "how would you like to use this session?" choice — it's implicitly **1. Create GitHub issues**.
- Interview me on each Follow-up entry with the same rigor as any other grilling, then produce the prioritized issue list per choice 1 below.
- **After creating the issues:** edit the spec file — remove each resolved Follow-up entry (the created issue is now the durable record). If the section is now empty, delete the spec file (`## Open items` must already be empty too, since `/finishIssue` only leaves this file behind when Follow-ups was the sole remaining reason to keep it). Otherwise leave the file with whatever entries remain unresolved.

---

**Branch setup (git repos only):** If the current directory is a git repository, first check whether it's the primary checkout or a linked worktree: run `git rev-parse --git-dir`. If the result does *not* contain `/worktrees/` (i.e. it's the primary checkout, not a linked worktree), warn me that running grillMe's throwaway-branch flow here risks colliding with any other session using this same directory, and ask whether to continue anyway or stop so I can switch to a worktree first. Proceed only if I say to continue.

Then run `git fetch --all`, list `origin/main` plus any `origin/release/*` branches, present the numbered list, and ask me to select one. When I respond with a number, create and check out a temporary throwaway branch off that branch (e.g. `grillme/temp-$(date +%s)`) so the session works cleanly across worktrees — if the base branch is already checked out in another worktree, still create the throwaway branch from it using `git checkout -b <temp-branch> origin/<base>`). Do this before anything else.

Start by asking me to describe my initial thoughts on the plan or feature.

After I respond, before any grilling begins, present me with this exact choice:

> How would you like to use this session?
> 1. Create GitHub issues for this work
> 2. Directly modify files for this project (no issues)
> 3. Other — I'll tell you

Then conduct the interview: ask questions one at a time, relentlessly, walking down each branch of the design tree and resolving dependencies between decisions. For each question, provide your recommended answer. If a question can be answered by exploring the codebase, explore the codebase instead. Continue until we reach a shared understanding.

When the interview is complete, proceed based on the choice made earlier:

**If I chose 1:**
Produce a prioritized list of GitHub issues that capture the work to be done. For each issue include:
- A concise title
- A short description of the work and why it's needed
- Acceptance criteria as a checklist

Ask me to review the issues and provide any feedback or clarifications before proceeding. Wait for explicit confirmation (e.g. "looks good", "proceed", "lgtm") or incorporate any changes requested. Then ask which release these issues should be slated for. If I specify a plain number (e.g. "3"), treat it as the label `release-3`, not a version string. Confirm the label before proceeding.

Then fetch all open issues with that release label and the full label list with descriptions:
```bash
gh issue list --state open --label {release-label} --json number,title,labels,body --limit 100
gh label list --json name,description
```

Evaluate the dependency tree: identify which existing issues must land before the new ones. Use the label descriptions to understand ordering signals — `rearchitecture` and `data-migration` issues impose structural ordering even when not listed as explicit dependencies; `high-priority` is a manual override that always lands first. Report the blocking dependencies and recommended sequencing before proceeding.

When presenting the new issues for creation, suggest appropriate labels for each one based on their nature and the label descriptions. Ask the user to confirm or adjust before proceeding. Then ask if I'd like you to create these issues with `gh issue create`.

**After creating the issues**, check whether `specs/batch_{release-label}.md` already exists. If it doesn't, skip silently — the batch file gets built whenever `/issueBatch create` is next run manually. If it does exist, append each new issue to the appropriate section (Ready or Blocked, using the same dependency-phrasing rules `/issueBatch create` uses) with `unblocks: 0` and a `(newly added by grillMe — run /issueBatch create to rescore)` note in place of a real score, rather than recomputing the whole graph.

**If I chose 2:**
Implement the changes directly in the codebase. Follow the project's TDD workflow: write failing tests first, then implement. Follow the canonical file-touch sequence from ARCHITECTURE.md.

**If I chose 3:**
Wait for me to describe what I want and proceed accordingly.

**Cleanup (git repos only):** When the session is done — issues created, direct implementation finished/handed off, or I say I'm done — clean up the throwaway branch:
- Check whether it has any commits ahead of its base (`git rev-list <base>..HEAD --count`).
- If zero (e.g. option 1, where work happened via `gh issue create` and no files changed), switch back to the original branch and delete the throwaway branch with `git branch -D <temp-branch>` — no confirmation needed, nothing is lost.
- If nonzero (e.g. option 2, direct implementation), ask before deleting — offer to keep it, rename it to a real feature branch, or open a PR from it, rather than discarding committed work.

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

