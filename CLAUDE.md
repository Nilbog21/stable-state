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

### Schema/RLS/RPC verification
- Migrations have no DAL-layer TDD tests of their own — they're verified by the `Verify Migrations` CI workflow (`.github/workflows/verify-migrations.yml`), which replays every migration from scratch against an ephemeral local Supabase/Postgres instance on any PR touching `supabase/migrations/**`
- Don't install Docker locally or push to `stable-state-dev` just to check a migration applies cleanly (syntax, ordering, FK/RLS/RPC errors) — let the CI gate catch that. It replays from a clean instance, so it can't catch drift between a migration's assumptions and `stable-state-dev`/prod's actual accumulated schema state (e.g. a renamed constraint) — that class of bug still needs manual dev-DB verification or a repair script (see `scripts/repair-migration-history.sh`)

## Architecture Docs

Update the architecture docs whenever a migration or role change is committed:
- Schema change (new/changed table, column, constraint) → `docs/architecture/schema.md`, plus its one-line index entry in `ARCHITECTURE.md`'s DB schema section if a table was added/removed
- RPC change (new/changed function, grants, `SECURITY DEFINER`/`INVOKER`) → `docs/architecture/rpc.md`, plus its index entry in `ARCHITECTURE.md`'s Supabase RPC section if a function was added/removed
- Route change (new/changed page, role gating) → `docs/architecture/routes.md`, plus its index entry in `ARCHITECTURE.md`'s Routes section if a route was added/removed
- DAL change (new/changed function in `src/lib/db/`) → `docs/architecture/dal.md`, plus its index entry in `ARCHITECTURE.md`'s Data access layer section if a module was added/removed
- Role change (new role, permissions matrix, RLS convention) → stays in `ARCHITECTURE.md`'s Role system / RLS conventions sections

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

- `<Card href? className?>` (`Card.tsx`) — browseable item collections (horses, upcoming lessons, members). With `href` it renders as a full-card link with `bg-white`/hover states baked in; without `href` it renders a plain bordered `div` with no background or padding of its own — pass `className` for either variant's padding/spacing needs.
- `<Button variant? size? loading? href?>` (`Button.tsx`) — all interactive actions. Variants: `primary` (default), `danger` for destructive actions, `ghost` for secondary actions, `warning` for amber attention-badge links (e.g. dashboard Reminders cards, including `DocumentRemindersSection`'s single-line `name — record type — date` entries). `size`: `md` (default) for standalone form/page actions, `sm` for compact table/row actions (Approve/Reject/Remove/Delete/Activate/Deactivate). `loading` disables the button and shows a spinner. With `href` it renders as a styled `Link` instead of a `<button>`. Joined-corner segmented toggles and icon-only/bare-text controls are poor structural fits — leave those as raw Tailwind with a comment explaining why (see `LessonForm.tsx`'s Normal/Group switch or `NotificationBell.tsx`).
- `<Th>` / `<Td tone?>` / `<TableActions>` (`Table.tsx`) — all data tables. Use `tone="secondary"` on `<Td>` for secondary text cells. `<TableActions>` is a right-aligned `<Td>` for row action buttons.
- `<Pill href active>` (`Pill.tsx`) — tab-pill view switchers (see "View switchers" above). Always renders as a `Link`; `active` selects the filled vs. outlined style.

Placement rules:
- "Add" / "Create" buttons go top-right of the section header, next to the section title — never at the bottom of a section.
- Row actions always go in the rightmost table column (use `<TableActions>`), never in the first column or mixed with data columns.

## Release Workflow

- Features branch off `release/release-N`
- Feature PRs target the release branch
- Release merges to `main` via **merge commit only** — never squash or rebase; the release branch is deleted after merge, so squashing would destroy history
- After integration-bug fixes land and before the release ceremony (tag + branch cleanup + cut next release branch): **migration refactor** — squash whatever migrations the release branch has accumulated since the last squash into a clean consolidated set (mirrors #657/#658), so they merge to `main` already clean instead of carrying iterative "add → fix → fix again" history forward indefinitely
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
