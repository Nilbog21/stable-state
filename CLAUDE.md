@ARCHITECTURE.md
@AGENTS.md

## Testing Conventions

### TDD Workflow
- Always write failing tests BEFORE implementation
- Use AAA pattern: Arrange-Act-Assert
- One assertion per test when possible
- Test names describe behavior: "should_return_empty_when_no_items"

### Test-First Rules
- When I ask for a feature, write tests first
- Tests should FAIL initially (no implementation exists)
- Only after tests are written, implement minimal code to pass

## Architecture Docs

Update `ARCHITECTURE.md` whenever a migration or role change is committed.

## User Guides

When making UI-impacting changes, update the relevant role guide(s): `USER_GUIDE_MANAGER.md`, `USER_GUIDE_TRAINER.md`, and/or `USER_GUIDE_RIDER.md`.

## Working Directory

`specs/` is a personal, gitignored working directory. Ignore its contents.

## UI Conventions

### Mobile-first
Mobile is the primary platform. All interactions must work on touch and small screens. Hover-only patterns are not acceptable — native `title` tooltips, CSS `:hover`-only reveals, and similar desktop-only affordances must not be used.

### View switchers
Use pill-style segmented controls (tab pills) for switching between data views. This is the standard SaaS pattern (Stripe, Linear, GitHub). Do not use tabs, dropdowns, or radio buttons for view-switching.

### Time display
Always display times in 12-hour AM/PM format (e.g. "12:00 AM", "1:00 PM"). Never display 24-hour/military time in the UI. Internal storage and form values remain in 24-hour format.

## Release Workflow

- Features branch off `release/release-N`
- Feature PRs target the release branch
- Release merges to `main` via **merge commit only** — never squash or rebase; the release branch is deleted after merge, so squashing would destroy history
- `vN.0.0` tag is created at the merge commit on `main`
- Release branch is deleted after the tag is confirmed
- `release/release-(N+1)` is cut from the new `main` HEAD immediately after merge
- `patch-N` label is created (N = the just-released series) so patches can be tied to that release

## Patch Workflow

Patches land on `main` without waiting for the next release.

- Patches branch off `main` HEAD (same branch naming as features: `{issue-number}-{slug}`)
- PRs use the `patch-N` label (N = the release series being patched, e.g. `patch-2` for v2.0.0)
- PRs target `main` directly
- After merge, tag is auto-incremented: `vN.0.1`, `vN.0.2`, etc.
- `CHANGELOG.md` is updated at tag time (same as release ceremony)
- `release/release-(N+1)` is rebased onto the new `main` HEAD after merge so it picks up the patch
