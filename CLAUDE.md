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

## Working Directory

`specs/` is a personal, gitignored working directory. Ignore its contents.

## UI Conventions

### Mobile-first
Mobile is the primary platform. All interactions must work on touch and small screens. Hover-only patterns are not acceptable — native `title` tooltips, CSS `:hover`-only reveals, and similar desktop-only affordances must not be used.

### View switchers
Use pill-style segmented controls (tab pills) for switching between data views. This is the standard SaaS pattern (Stripe, Linear, GitHub). Do not use tabs, dropdowns, or radio buttons for view-switching.

## Release Workflow

- Features branch off `release/release-N`
- Feature PRs target the release branch
- Release merges to `main` via **merge commit only** — never squash or rebase; the release branch is deleted after merge, so squashing would destroy history
- `vN.0.0` tag is created at the merge commit on `main`
- Release branch is deleted after the tag is confirmed
- `release/release-(N+1)` is cut from the new `main` HEAD immediately after merge
