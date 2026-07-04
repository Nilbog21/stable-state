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

## Pre-Release Checklist

When a PR adds or modifies a UI route, workflow, or user-facing feature, update `PRE_RELEASE_TEST_CHECKLIST.md` — add or adjust a step in the relevant phase: Phase 1 (Setup), Phases 2–4 (Manager), Phase 5 (Trainer), Phase 6 (Rider), or Phase 7 (Multi-barn).

## Working Directory

`specs/` is a personal, gitignored working directory. Ignore its contents.

## UI Conventions

### Mobile-first
Mobile is the primary platform. All interactions must work on touch and small screens. Hover-only patterns are not acceptable — native `title` tooltips, CSS `:hover`-only reveals, and similar desktop-only affordances must not be used.

### View switchers
Use pill-style segmented controls (tab pills) for switching between data views. This is the standard SaaS pattern (Stripe, Linear, GitHub). Do not use tabs, dropdowns, or radio buttons for view-switching.

### Time display
Always display times in 12-hour AM/PM format (e.g. "12:00 AM", "1:00 PM"). Never display 24-hour/military time in the UI. Internal storage and form values remain in 24-hour format.

### Shared UI components
New UI must use the primitives in `src/components/ui/` — do not hand-roll raw Tailwind for cards, buttons, or table cells.

- `<Card href?>` (`Card.tsx`) — browseable item collections (horses, upcoming lessons, members). With `href` it renders as a full-card link with hover states.
- `<Button variant? loading? href?>` (`Button.tsx`) — all interactive actions. Variants: `primary` (default), `danger` for destructive actions, `ghost` for secondary actions. `loading` disables the button and shows a spinner. With `href` it renders as a styled `Link` instead of a `<button>`.
- `<Th>` / `<Td tone?>` / `<TableActions>` (`Table.tsx`) — all data tables. Use `tone="secondary"` on `<Td>` for secondary text cells. `<TableActions>` is a right-aligned `<Td>` for row action buttons.

Placement rules:
- "Add" / "Create" buttons go top-right of the section header, next to the section title — never at the bottom of a section.
- Row actions always go in the rightmost table column (use `<TableActions>`), never in the first column or mixed with data columns.

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
