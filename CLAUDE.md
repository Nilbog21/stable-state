@ARCHITECTURE.md
@AGENTS.md

> This file and `ARCHITECTURE.md` are auto-loaded into every session — never `Read` either explicitly; you already have them.

## Testing Conventions

### Test-First Rules
Guideposts, not a gate.
- Write tests first, confirm they FAIL, then implement the minimum that passes
- AAA (Arrange-Act-Assert); one assertion per test when possible
- Test names describe behavior: "should_return_empty_when_no_items"
- **A test-only PR** — one characterizing shipped behaviour, or reworking existing tests — has no red state to produce, so it skips the failing-tests commit (precedent: `bd4e8a3a`, `c771a7da`). Instead run a **mutation pass** and report the kill count in the PR body: each new or changed assertion must fail when the behaviour it claims is broken. Mutate an *ordered* spec one mutant per run, or re-establish its ordered state in `beforeAll` — a whole-file batch measures the Playwright worker restart, and its survivors are false reassurance (`docs/e2e-framework-facts.md` fact 15)

### Schema/RLS/RPC verification
How a migration is verified, and why an applied one is never edited: `supabase/CLAUDE.md`.

### E2E spec maintenance
- Before writing or debugging a spec, read `e2e/CLAUDE.md` — the measured framework facts (timeout tiers, silent-auth request contexts, hydration races) and the spec-maintenance rules (shared-login restore protocol, membership-orphan teardown, settled reads), each of which cost a batch at least one round. Both are indexed there and stated in full in `docs/e2e-framework-facts.md` and `docs/e2e-spec-maintenance.md`
- A PR that changes UI (removes/renames/restructures a page, component, or user-facing flow) must update any `e2e/` spec covering that UI in the same PR — not as a follow-up. If unsure whether a spec covers the changed UI, grep `e2e/` for the route/selector/text being touched before merging

## Architecture Docs

Whenever a migration or role change is committed, update the detail file **and** its index entry:
- schema → `docs/architecture/schema.md`; RPC → `docs/architecture/rpc/`; route → `docs/architecture/routes/`; DAL (`src/lib/db/`) → `docs/architecture/dal/`; a new/changed RLS helper's rationale → `docs/architecture/rls.md`
- the RPC, route and DAL directories each carry their own index (`docs/architecture/{rpc,routes,dal}.md`); update it, and the matching one-line entry in `ARCHITECTURE.md`, when something is **added or removed**. A new/changed RLS helper always gets its `ARCHITECTURE.md` line
- a new role or a change to the permissions matrix goes straight to `ARCHITECTURE.md`'s Role system section

## Barn Data Backup

A schema change can silently drop a table or column from `src/lib/db/backup.ts`'s hand-mapped export sheets: `supabase/CLAUDE.md`.

## Privacy Policy

`PRIVACY_POLICY.md` (repo root, served at `/privacy`) must stay in sync with what the app actually does. Review it whenever a change adds personal or financial data ("What we collect"), a third-party integration — analytics, email, storage, hosting, CI/backup tooling ("Third parties"), or an automated data export/backup flow ("Data retention").

## User Guides

When making UI-impacting changes, update the relevant role guide(s): `USER_GUIDE_MANAGER.md`, `USER_GUIDE_TRAINER.md`, and/or `USER_GUIDE_RIDER.md`.

## Pre-Release Checklist

When a PR adds or modifies a UI route, workflow, or user-facing feature, add or adjust a step in the relevant phase file under `checklists/pre-release/` (#1358 split the phases out of `PRE_RELEASE_TEST_CHECKLIST.md`, which remains the index). The binding conventions are stated in full in that index's header blockquotes: phases are **partitioned by the role doing the asserting**, a line a PR adds is **born automated or justified-manual** (`(e2e: <test name>)` with its spec in the same PR, or `(manual)` with the reason on the line), and **the PR closing #N removes every hedge on #N**.

## Post-Release Checklist

`POST_RELEASE_TEST_CHECKLIST.md` (repo root) holds the checks that can only be run against prod (invocation timing: [`RELEASE_CEREMONY.md`](RELEASE_CEREMONY.md)). It is the exception, not the default — a check goes there instead of `PRE_RELEASE_TEST_CHECKLIST.md` only if it clears one of the five bars listed in that file's header. A PR adding or modifying a feature that clears one of those bars updates the relevant POST section in the same PR.

## Working Directory

`specs/` is a personal, gitignored working directory. Ignore its contents.

## UI Conventions

- **Mobile-first.** Mobile is the primary platform; every interaction must work on touch and small screens. Hover-only patterns — native `title` tooltips, CSS `:hover`-only reveals — are not acceptable.
- **View switchers** are pill-style segmented controls (`<Pill>`), the standard SaaS pattern — never tabs, dropdowns, or radio buttons.
- **Time display** is always 12-hour AM/PM in the UI (e.g. "12:00 AM", "1:00 PM"); internal storage and form values stay 24-hour.
- **Shared components:** new UI must use the primitives in `src/components/ui/` — the catalog, per-variant rules and placement conventions are in `src/components/ui/CLAUDE.md`.

## Release Workflow

- Features branch off `release/release-N`; feature PRs target the release branch
- Release merges to `main` via **merge commit only** — never squash or rebase; the release branch is deleted after merge, so squashing would destroy history

Everything from the pre-release checklist audit through cutting the next release branch is an ordered runbook: [`RELEASE_CEREMONY.md`](RELEASE_CEREMONY.md). Follow it there — don't restate its steps here.

## Patch Workflow

Patches land on `main` without waiting for the next release: branched off `main` HEAD (same `{issue-number}-{slug}` naming as features), labelled `patch-N` for the release series being patched, targeting `main` directly.

Close-out — tagging, `CHANGELOG.md`, picking the patch up on the next release branch, and when to run the post-release checklist — is [`RELEASE_CEREMONY.md`](RELEASE_CEREMONY.md)'s Patches section.

## Workflow Skills

Editing rules for the skills in `.claude/commands/`, and the guard every state-changing step owes: `.claude/commands/CLAUDE.md`.
