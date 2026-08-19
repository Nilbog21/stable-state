# Workflow Skills

Moved verbatim out of the root `CLAUDE.md` by #1468 — the rule triggers on editing a file in this
directory, which is exactly where a nested `CLAUDE.md` loads from.

The workflow skills in `.claude/commands/` are repo files and follow the repo's rules (see `ARCHITECTURE.md`'s Workflow skills section for what they are and how they chain).

- A skill edit **prompted by in-flight work** rides along in that work's PR. The convention change and the skill text encoding it belong in one reviewable diff — splitting them is how the skills drifted out of sync in the first place.
- A **standalone** skill change gets its own issue and PR, like any other repo file.
- Any skill step that performs a **state-changing operation** (git rebase, merge, CI wait, agent fan-out) must check for terminal/already-done state at the point where the relevant status is first fetched, and stop cold if the work is already complete. A check whose result nothing branches on — "confirm the PR isn't already reviewed", followed by unconditional execution — is not a guard, and it's how `/reviewIssue` and `/finishIssue` both ended up re-running completed steps while announcing they were already done. Reuse a signal the step already fetches for another purpose rather than adding a dedicated lookup. `/reviewIssue` Step 4 and `/finishIssue` Step 1 are the reference implementations.
