# Pre-Release Test Checklist

Manual smoke test of all barn workflows against the dev environment. Run the phases **in order** — later phases depend on data created in earlier ones. Every UI route in `ARCHITECTURE.md` is covered at least once (see [Route coverage](#route-coverage) at the bottom).

Paths in the phase files are relative — prepend your app origin (local `npm run dev` or Vercel preview URL).

To run this checklist, invoke `/runChecklist` — it derives every `(e2e: …)` line from one `scripts/run-checklist-suite.sh` run, walks the rest with you one checkbox at a time, and records the result in `specs/checklist-run-{YYYY-MM-DD}.md` rather than in this file.

> **Convention:** each checkbox verifies one independent assertion, so a partial failure can be marked cleanly. Split any checkbox that bundles multiple clauses — with one exception:
>
> - **Setup/data-creation steps** that assert nothing are fine to leave bundled with the assertion they set up for.

> **Phases are partitioned by the role doing the *asserting*, not the role the data is about.** A manager reading a page *about* riders is a Phase 4 line; a rider reading their own page is a Phase 6 line. That distinction is load-bearing — read it the other way and all 141 Finances lines look like Phase 6 material.
>
> - A precondition may be planted by any role, including a mid-phase `change-user.sh` detour to a manager. Only the eye doing the looking has to match the phase.
> - When such a line is later automated, the manager-side precondition becomes a **fixture/seed call in the asserting role's own barn**, so one test is always one role — a Playwright project binds one `storageState`.
> - A misplaced line is not merely untidy: it can never be tagged honestly. A Phase 4 line asserting trainer-visible UI can only ever be covered by a `@trainer` test, so its `(e2e: …)` tag would be a lie.
> - If a check ever genuinely needs two live roles acting in sequence and cannot be reduced to seed-then-assert, give it its own phase and tag it `(manual)`. No such check exists today.

> **Automation tags:** in an audited section, every checkbox carries exactly one of — including a standalone setup step, which a spec automates alongside the assertions it sets up
>
> - `(e2e: <test name>)` — covered by that Playwright test in `e2e/`; run via `scripts/run-checklist-suite.sh`. **Machine-checked** (#1386): `scripts/check-e2e-tags.sh`, wired into `ci.sh`, fails the PR if the named test doesn't exist in `e2e/*.spec.ts`, carries no `@project` tag, or the tag itself doesn't parse — each one silently launders an unverified checkbox into a green run. The tag is the test's title with its trailing `@project` suffixes dropped
> - `(e2e-candidate)` — automatable, spec not written yet
> - `(manual)` — not automatable; always hand-verified
>
> Sections with no tags on their checkboxes have not been audited yet.
>
> **A line a PR adds is born automated or justified-manual** — `(e2e: <test name>)` with the covering spec written in that same PR, or `(manual)` with the reason stated on the line. Leaving an added line untagged is the same violation as tagging it `(e2e-candidate)`; both are barred for *added* lines only, and both stay correct for the pre-existing untagged lines an audit is converting — the "not audited yet" note above is about those, not licence to add more. The stated-reason requirement likewise binds added lines, not the older `(manual)` ones. Legitimate `(manual)` grounds, in full: a **human judgment call** — does this flow read well, cross-device look-and-feel, any visual check — or an external dependency a spec cannot drive. "Would take a while to automate" is not one; neither is needing a separate real person or prod configuration, which belongs in `POST_RELEASE_TEST_CHECKLIST.md` rather than tagged `(manual)` here.

> **Hedges:** a checklist note asserting a capability *doesn't exist yet* — "until #N lands", "#N-blocked", "not yet assignable via UI" — goes stale the moment #N merges, silently suppressing coverage of a feature that now works. **The PR closing #N removes every hedge on #N from this file and `POST_RELEASE_TEST_CHECKLIST.md` in that same PR**, and replaces each one with the check the hedge was standing in for. Grep both files for the issue number before opening the PR. This is a convention, not a CI check — both checklists legitimately cite closed issues as history ("since #864", "#969 — a manager can no longer…"), and no grep separates those from a hedge reliably.

## Prerequisites

- [ ] `.env.local` at repo root with `DEV_EMAIL`, `DEV_NAME` (must be "First Last" — a single word breaks the name prompt in Phase 1), `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (optionally `DEV_BARN` — `seed-account.sh` in Phase 1 defaults it to `dev-barn`; `change-user.sh` in Phases 5–7 takes the barn slug as a required argument, e.g. `bash scripts/change-user.sh dev-barn`)
- [ ] App running (dev server or Vercel preview) and reachable in a browser
- [ ] Email provider enabled in the Supabase dashboard (required by the e2e auth logins `reset-db.sh` creates in Phase 1, which `seed-test-barn.sh` in Phase 7 then verifies exist)

Every step in the phases below that uploads a file names one from `scripts/data/` (#1135 — a tracked directory, nothing to place by hand). The images are deliberately non-square and bracketed by `|------- word -------|` edge markers, so a square-crop regression visibly eats the bars instead of needing a proportion judgment, and the word tells you at a glance which file is displayed. See `docs/scripts.md`'s Test assets section for the full manifest.

## Phases

Run them in order. Each file carries its own asserting role — the partitioning rule is the Convention above.

- [Phase 1 — Setup](checklists/pre-release/phase-1-setup.md) — role-agnostic setup — an unauthenticated visitor, then the shared demo user, then the developer's own account pre-membership and as its manager.
- [Phase 2 — Manager seeding](checklists/pre-release/phase-2-manager-seeding.md) — manager only. Data other phases depend on is created here.
- [Phase 3 — Manager lesson entry](checklists/pre-release/phase-3-manager-lesson-entry.md) — manager only.
- [Phase 4 — Manager verification](checklists/pre-release/phase-4-manager-verification.md) — manager, or role-agnostic. A line whose asserting eye is a trainer or rider belongs in Phase 5 or 6 — see the phase-partitioning Convention at the top.
- [Phase 5 — Trainer](checklists/pre-release/phase-5-trainer.md) — trainer only. A manager may plant a precondition mid-phase, but never inside a checkbox — a manager mutation gets its own tagged `Setup —` checkbox above the assertions it serves, so every asserting checkbox here is a single trainer-eye assertion.
- [Phase 6 — Rider](checklists/pre-release/phase-6-rider.md) — rider only. A manager may plant a precondition mid-phase, but never inside a checkbox — a manager mutation gets its own tagged `Setup —` checkbox above the assertions it serves, so every asserting checkbox here is a single rider-eye assertion.
- [Phase 7 — Multi-barn](checklists/pre-release/phase-7-multi-barn.md) — manager, across two barns. Cross-barn isolation, not cross-role.

## Route coverage

| Route | Covered in |
|---|---|
| `/` | Phase 7 |
| `/login` | Phase 7 |
| `/terms` | Phase 1 |
| `/privacy` | Phase 1 |
| `/demo` | Phase 1 |
| `/barns` | Phase 7 |
| `/barn/[slug]` (dashboard) | Phases 4, 6 |
| `/barn/[slug]/login` | Phases 1, 2, 7 |
| `/barn/[slug]/register` | Phase 7 |
| `/barn/[slug]/lessons` | Phases 4, 5, 6 |
| `/barn/[slug]/lessons/new` | Phases 3, 5 |
| `/barn/[slug]/lessons/[id]` | Phases 4, 5, 6 |
| `/barn/[slug]/lessons/[id]/edit` | Phases 4, 5 |
| `/barn/[slug]/expenses` | Phases 4, 5, 6 |
| `/barn/[slug]/horses` | Phases 2, 4 |
| `/barn/[slug]/horses/[id]` | Phases 2, 4, 5 |
| `/barn/[slug]/agreements` | Phase 2 |
| `/barn/[slug]/agreements/new` | Phase 2 |
| `/barn/[slug]/agreements/[id]/edit` | Phase 2 |
| `/barn/[slug]/members` | Phases 2, 4, 5, 6 |
| `/barn/[slug]/members/[membership_id]` | Phases 4, 5 |
| `/barn/[slug]/finances` | Phases 4, 5, 6 |
| `/barn/[slug]/finances/outstanding` | Phases 4, 5, 6 |
| `/barn/[slug]/finances/horses/[id]` | Phase 4 |
| `/barn/[slug]/finances/riders/[id]` | Phase 4 |
| `/barn/[slug]/finances/trainers/[id]` | Phase 4 |
| `/barn/[slug]/finances/expenses/[recipient]` | Phase 4 |
| `/barn/[slug]/settings` | Phases 2, 4, 7 |
| `/barn/[slug]/settings/tiers/new` | Phase 2 |
| `/barn/[slug]/settings/tiers/[id]` | Phase 4 |
| `/barn/[slug]/settings/events/new` | Phase 4 |
| `/barn/[slug]/settings/events/[id]` | Phase 4 |
| `/barn/[slug]/settings/events/[id]/delete` | Phase 4 |
| `/barn/[slug]/guide` | Phase 4 |
| `/profile` | Phase 4 |
| `/profile/complete` | Phases 1, 2 |
