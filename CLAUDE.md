@ARCHITECTURE.md
@AGENTS.md

> This file and `ARCHITECTURE.md` are auto-loaded into every session — never `Read` either explicitly; you already have them.

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
- Never edit an applied migration's SQL — every database change gets a new migration file. **Header comments are the sole exception:** they're inert, `Verify Migrations` replays the file identically, and the Supabase CLI tracks migrations by version rather than content hash. This is what lets `/sync-migrations` step 5 rewrite stale filename references after a rename
- Don't install Docker locally or push to `stable-state-dev` just to check a migration applies cleanly (syntax, ordering, FK/RLS/RPC errors) — let the CI gate catch that. It replays from a clean instance, so it can't catch drift between a migration's assumptions and `stable-state-dev`/prod's actual accumulated schema state (e.g. a renamed constraint) — that class of bug still needs manual dev-DB verification or a repair script (see `scripts/repair-migration-history.sh`)

### E2E spec maintenance
- Before writing or debugging a spec, read `e2e/CLAUDE.md` — the measured framework facts (timeout tiers, silent-auth request contexts, hydration races) and the spec-maintenance rules (shared-login restore protocol, membership-orphan teardown, settled reads), each of which cost the #1187–#1252 batch at least one round
- A PR that changes UI (removes/renames/restructures a page, component, or user-facing flow) must update any `e2e/` spec covering that UI in the same PR — not as a follow-up. If unsure whether a spec covers the changed UI, grep `e2e/` for the route/selector/text being touched before merging

## Architecture Docs

Update the architecture docs whenever a migration or role change is committed:
- Schema change (new/changed table, column, constraint) → `docs/architecture/schema.md`, plus its one-line index entry in `ARCHITECTURE.md`'s DB schema section if a table was added/removed
- RPC change (new/changed function, grants, `SECURITY DEFINER`/`INVOKER`) → the function's domain file in `docs/architecture/rpc/`, plus its index entry in `docs/architecture/rpc.md` and in `ARCHITECTURE.md`'s Supabase RPC section if a function was added/removed
- Route change (new/changed page, role gating) → the route's group file in `docs/architecture/routes/`, plus its index entry in `docs/architecture/routes.md` and in `ARCHITECTURE.md`'s Routes section if a route was added/removed
- DAL change (new/changed function in `src/lib/db/`) → the module's file in `docs/architecture/dal/`, plus its index entry in `docs/architecture/dal.md` and in `ARCHITECTURE.md`'s Data access layer section if a module was added/removed
- Role change (new role, permissions matrix, RLS convention) → stays in `ARCHITECTURE.md`'s Role system / RLS conventions sections

## Barn Data Backup

`src/lib/db/backup.ts` (the "Download Data" spreadsheet export in Manage Barn → Data Backup) hand-maps a fixed set of tables into its own sheets — it does not introspect the schema, so a schema change to any of these tables can silently drop a new column/table from the export instead of erroring. Whenever a migration changes one of the following, also update `backup.ts`'s corresponding sheet: `horses`; `lessons`/`lesson_horses`/`lesson_riders`/`lesson_tiers`/`lesson_series`; `agreements`/`agreement_charges`; `appointments`/`appointment_horses`/`appointment_costs`; `transactions`; `barn_memberships`/`profiles`; `horse_documents`/`staff_documents`/`rider_documents`.

## Privacy Policy

`PRIVACY_POLICY.md` (repo root, served at `/privacy`) must stay in sync with what the app actually does. Check it whenever a change touches:
- A new/changed table or column that captures personal or financial data → review "What we collect"
- A new third-party integration (analytics, email, storage, hosting, CI/backup tooling) → review "Third parties"
- A new automated data export/backup flow → review "Data retention"

## User Guides

When making UI-impacting changes, update the relevant role guide(s): `USER_GUIDE_MANAGER.md`, `USER_GUIDE_TRAINER.md`, and/or `USER_GUIDE_RIDER.md`.

## Pre-Release Checklist

When a PR adds or modifies a UI route, workflow, or user-facing feature, add or adjust a step in the relevant phase file under `checklists/pre-release/` (#1358 split the phases out of `PRE_RELEASE_TEST_CHECKLIST.md`, which remains the index holding the conventions). The binding conventions live in the index's header blockquotes: **phases are partitioned by the role doing the asserting** (not the role the data is about), **a line a PR adds is born automated or justified-manual** — `(e2e: <test name>)` with the covering spec written in that same PR, or `(manual)` with the reason stated on the line — and **the PR closing #N removes every hedge on #N** from `checklists/pre-release/` and `POST_RELEASE_TEST_CHECKLIST.md`, replacing each with the check it stood in for.

## Post-Release Checklist

`POST_RELEASE_TEST_CHECKLIST.md` (repo root) holds the checks that can only be run against prod (invocation timing: [`RELEASE_CEREMONY.md`](RELEASE_CEREMONY.md)). It is the exception, not the default — a check goes there instead of `PRE_RELEASE_TEST_CHECKLIST.md` only if it clears one of the five bars listed in that file's header (cross-identity, prod-only auth/OAuth, money-moving RPCs, demo/cron/prod-config, prior-incident class). A PR adding or modifying a feature that clears one of those bars updates the relevant POST section in the same PR.

## Working Directory

`specs/` is a personal, gitignored working directory. Ignore its contents.

## UI Conventions

- **Mobile-first.** Mobile is the primary platform; every interaction must work on touch and small screens. Hover-only patterns — native `title` tooltips, CSS `:hover`-only reveals — are not acceptable.
- **View switchers** are pill-style segmented controls (`<Pill>`), the standard SaaS pattern — never tabs, dropdowns, or radio buttons.
- **Time display** is always 12-hour AM/PM in the UI (e.g. "12:00 AM", "1:00 PM"); internal storage and form values stay 24-hour.
- **Shared components:** new UI must use the primitives in `src/components/ui/` — do not hand-roll raw Tailwind for cards, buttons, badges, or table cells. The component catalog, per-variant rules, and placement conventions ("Add"/"Create" buttons top-right of the section header; row actions in the rightmost column via `<TableActions>`) are in `src/components/ui/CLAUDE.md`.

## Release Workflow

- Features branch off `release/release-N`
- Feature PRs target the release branch
- Release merges to `main` via **merge commit only** — never squash or rebase; the release branch is deleted after merge, so squashing would destroy history

Everything from the pre-release checklist audit through cutting the next release branch is an ordered runbook: [`RELEASE_CEREMONY.md`](RELEASE_CEREMONY.md). Follow it there — don't restate its steps here.

## Patch Workflow

Patches land on `main` without waiting for the next release.

- Patches branch off `main` HEAD (same branch naming as features: `{issue-number}-{slug}`)
- PRs use the `patch-N` label (N = the release series being patched, e.g. `patch-2` for v2.0.0)
- PRs target `main` directly

Close-out — tagging, `CHANGELOG.md`, picking the patch up on the next release branch, and when to run the post-release checklist — is [`RELEASE_CEREMONY.md`](RELEASE_CEREMONY.md)'s Patches section.

## Workflow Skills

The workflow skills in `.claude/commands/` are repo files and follow the repo's rules (see `ARCHITECTURE.md`'s Workflow skills section for what they are and how they chain).

- A skill edit **prompted by in-flight work** rides along in that work's PR. The convention change and the skill text encoding it belong in one reviewable diff — splitting them is how the skills drifted out of sync in the first place.
- A **standalone** skill change gets its own issue and PR, like any other repo file.
- Any skill step that performs a **state-changing operation** (git rebase, merge, CI wait, agent fan-out) must check for terminal/already-done state at the point where the relevant status is first fetched, and stop cold if the work is already complete. A check whose result nothing branches on — "confirm the PR isn't already reviewed", followed by unconditional execution — is not a guard, and it's how `/reviewIssue` and `/finishIssue` both ended up re-running completed steps while announcing they were already done. Reuse a signal the step already fetches for another purpose rather than adding a dedicated lookup. `/reviewIssue` Step 4 and `/finishIssue` Step 1 are the reference implementations.
