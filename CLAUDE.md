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
- Never edit an applied migration's SQL — every database change gets a new migration file. **Header comments are the sole exception:** they're inert, `Verify Migrations` replays the file identically, and the Supabase CLI tracks migrations by version rather than content hash. This is what lets `/sync-migrations` step 5 rewrite stale filename references after a rename
- Don't install Docker locally or push to `stable-state-dev` just to check a migration applies cleanly (syntax, ordering, FK/RLS/RPC errors) — let the CI gate catch that. It replays from a clean instance, so it can't catch drift between a migration's assumptions and `stable-state-dev`/prod's actual accumulated schema state (e.g. a renamed constraint) — that class of bug still needs manual dev-DB verification or a repair script (see `scripts/repair-migration-history.sh`)

### E2E spec maintenance
- A PR that changes UI (removes/renames/restructures a page, component, or user-facing flow) must update any `e2e/` spec covering that UI in the same PR — not as a follow-up
- If unsure whether a spec covers the changed UI, grep `e2e/` for the route/selector/text being touched before merging
- **Never blind-write the three shared logins** (`manager@`/`trainer@`/`rider@e2e.test`). Their `profiles` rows are per Supabase *project*, not per barn, so `teardownBarnData` can never reach them and whatever a spec leaves there is inherited by every later slice and every later run — #1282 found `trainer@e2e.test` still pointing at a photo in a barn deleted a week earlier. Capture the old value, write, and restore it in an **unconditional** `afterAll` (no pass/fail gate, no early return except "the capture never happened"), then read the row back and throw on a mismatch — an unverified restore is one that can stop working silently. Restore the row *before* deleting any storage object: an un-restored row is a shared-state failure every later slice inherits, an orphaned object is only a leak, and deleting first converts the cheap failure into the expensive one. Reference implementation: `checklist-phase4-members-media.spec.ts`'s own-photo block. Nulling a field instead of restoring it is the same violation
- **A spec that deletes a membership orphans that profile.** `teardownBarnData` reaches profile rows *through* the barn's memberships, so severing the edge leaves the row behind permanently — one per run per Playwright project, even though the row is a perfectly ordinary stub. Hand it back with a `describe`-scoped `afterAll` (Playwright completes an inner suite's hooks before the file-scoped one `withBarn` registers) that deletes the profile **only if no membership still references it**, so a chain that failed before the removal leaves the row for `teardownBarnData` rather than tripping the FK. Reference implementation: `checklist-phase4-members-access.spec.ts`. Demoting a stub to `is_managed = false` needs no such hook — the sweep filters on `user_id IS NULL` (#1282), which a demotion can't change
- Never call `allInnerTexts()`/`allTextContents()` on a bare locator — they don't auto-retry, so a not-yet-rendered table yields `[]`, and an assertion that accepts an empty array then *passes on nothing* (#1243 found four such checks reading as covered while asserting nothing). Read through `settledInnerTexts`/`settledTextContents` in `e2e/support/read.ts`, whose wait doubles as the non-empty assertion. `evaluateAll` has the same hazard but keeps an inline `await locator.first().waitFor()` — wrapping a callback reads worse than the guard it replaces

## Architecture Docs

Update the architecture docs whenever a migration or role change is committed:
- Schema change (new/changed table, column, constraint) → `docs/architecture/schema.md`, plus its one-line index entry in `ARCHITECTURE.md`'s DB schema section if a table was added/removed
- RPC change (new/changed function, grants, `SECURITY DEFINER`/`INVOKER`) → `docs/architecture/rpc.md`, plus its index entry in `ARCHITECTURE.md`'s Supabase RPC section if a function was added/removed
- Route change (new/changed page, role gating) → `docs/architecture/routes.md`, plus its index entry in `ARCHITECTURE.md`'s Routes section if a route was added/removed
- DAL change (new/changed function in `src/lib/db/`) → `docs/architecture/dal.md`, plus its index entry in `ARCHITECTURE.md`'s Data access layer section if a module was added/removed
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

When a PR adds or modifies a UI route, workflow, or user-facing feature, update `PRE_RELEASE_TEST_CHECKLIST.md` — add or adjust a step in the relevant phase: Phase 1 (Setup), Phases 2–4 (Manager), Phase 5 (Trainer), Phase 6 (Rider), or Phase 7 (Multi-barn).

Pick the phase by **the role doing the asserting, not the role the data is about** — a manager reading a page about riders is Phase 4; a rider reading their own page is Phase 6. A precondition may be planted by any role. Getting this wrong makes the line permanently untaggable, since one e2e test binds one role. Full statement in that file's phase-partitioning Convention blockquote at the top, and a one-line role note sits under every phase header.

**A line a PR adds is born automated or justified-manual.** Tag it either `(e2e: <test name>)`, with the covering spec written in that same PR, or `(manual)` with the reason stated on the line itself. Leaving an added line untagged is the same violation as tagging it `(e2e-candidate)`, and neither is available for a line a PR *adds* — both defer automation indefinitely, which is how the manual pass grows monotonically with every feature. `(e2e-candidate)` remains correct for the *pre-existing* untagged lines an audit is converting (#1251 owns Phases 5–6): those verdicts are the case this rule preserves, not violations of it. That file's "sections with no tags on their checkboxes have not been audited yet" describes the same pre-existing lines — it is not licence to add more, in an audited phase or a brand-new one. The stated-reason requirement binds added lines the same way — the older `(manual)` lines carrying no reason are grandfathered.

Legitimate `(manual)` grounds, and the whole list: a **human judgment call** — does this flow read well, cross-device look-and-feel, any visual or aesthetic check — or an external dependency a spec cannot drive. "Would take a while to automate" is not one. Neither is needing a genuinely separate real person or prod configuration: that isn't a justified `(manual)` line here, it's a check that clears a `POST_RELEASE_TEST_CHECKLIST.md` bar and belongs in that file instead.

A checklist note that asserts a capability *doesn't exist yet* — "until #N lands", "#N-blocked", "not yet assignable via UI" — is a hedge, and it goes stale the moment #N merges, silently suppressing coverage of a feature that now works. **The PR closing #N removes every hedge on #N from `PRE_RELEASE_TEST_CHECKLIST.md` and `POST_RELEASE_TEST_CHECKLIST.md` in that same PR**, and replaces each one with the check the hedge was standing in for. Grep both files for the issue number before opening the PR. This is a convention, not a CI check — both checklists legitimately cite closed issues as history ("since #864", "#969 — a manager can no longer…"), and no grep separates those from a hedge reliably.

## Post-Release Checklist

`POST_RELEASE_TEST_CHECKLIST.md` (repo root) holds the checks that can only be run against prod — run once the release merge has deployed and before the `vN.0.0` tag is cut (see [`RELEASE_CEREMONY.md`](RELEASE_CEREMONY.md)). It is the exception, not the default — a check goes there instead of `PRE_RELEASE_TEST_CHECKLIST.md` only if it clears one of these bars:

- **Cross-identity flows** — needs a genuinely separate real person: invite/claim by someone else, cross-user notification delivery, or a self-write by a claimed member who isn't you (`change-user.sh` never links `profiles.user_id`, so locally your own account is the only self-write you can test). A *fresh or unauthenticated* session does **not** clear this bar; incognito covers that locally, so those stay in PRE
- **Auth/session behavior** only prod's real OAuth configuration exercises
- **Payment or money-moving RPCs**
- **Demo, cron, or prod-config behavior**
- **A class of prior production incident** worth re-checking every release

When a PR adds or modifies a feature clearing one of those bars, update the relevant section of `POST_RELEASE_TEST_CHECKLIST.md` in the same PR. The first bar is served by that file's "Cross-identity checks" section; the remaining four are served by its smoke-test section, landing in #1080.

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
  - `ghost`'s subtle border reads as non-interactive when it's the only button in view (e.g. a lone "Today"/"Back" action with nothing else nearby for contrast) — this has come up as a review finding more than once. Use `ghost` only when it sits next to a `primary` action it should visually defer to; a standalone action gets `primary` even if it's logically secondary.
- When matching an existing icon-only/bare-text raw-Tailwind control to a sibling one elsewhere in the app (e.g. date/month Prev-Next pagers), reuse that control's exact classes **and its exact glyph** rather than inventing new ones — divergent one-off styling for the same interaction pattern is a recurring review finding. The glyph is not cosmetic: `‹`/`›` render visibly smaller than `&lt;`/`&gt;` at the same font size, so copying the classes alone still produces a mismatched control. The canonical month pager is the one in `finances/page.tsx` — `&lt;`/`&gt;` in a `min-h-[44px] min-w-[44px]` circle.
- `<Th>` / `<Td tone?>` / `<TableActions>` (`Table.tsx`) — all data tables. Use `tone="secondary"` on `<Td>` for secondary text cells. `<TableActions>` is a right-aligned `<Td>` for row action buttons.
- `<Pill href active>` (`Pill.tsx`) — tab-pill view switchers (see "View switchers" above). Always renders as a `Link`; `active` selects the filled vs. outlined style.
- `<Badge tone>` (`Badge.tsx`) — all status badges. Tones: `amber` (attention/unpaid/inactive), `red` (cancelled), `green`, `gray` (neutral metadata: Recurring/Jumping/Group), `solid`. Never hand-roll a `rounded-full px-2 py-0.5` span — declaring badge colours per call site is what let a 2.15:1 `bg-amber-500`/`text-white` pair exist at seven sites (#1219). `Badge` takes no `className`: a per-call-site styling escape hatch reopens exactly that. Wrap it (`<div className="mt-1">`) for spacing instead. Every tone is asserted at ≥4.5:1 in both schemes by `Badge.test.tsx`, which reads Tailwind's real palette — a new tone below the floor fails that test.

Placement rules:
- "Add" / "Create" buttons go top-right of the section header, next to the section title — never at the bottom of a section.
- Row actions always go in the rightmost table column (use `<TableActions>`), never in the first column or mixed with data columns.

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
