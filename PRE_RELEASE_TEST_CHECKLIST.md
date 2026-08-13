# Pre-Release Test Checklist

Manual smoke test of all barn workflows against the dev environment. Run the phases **in order** — later phases depend on data created in earlier ones. Every UI route in `ARCHITECTURE.md` is covered at least once (see [Route coverage](#route-coverage) at the bottom).

Paths in the phase files are relative — prepend your app origin (local `npm run dev` or Vercel preview URL).

To run this checklist, invoke `/runChecklist` — it derives every `(e2e: …)` line from one `scripts/run-checklist-suite.sh` run, walks the rest with you one checkbox at a time, and records the result in `specs/checklist-run-{YYYY-MM-DD}.md` rather than in this file.

> **Convention:** each checkbox verifies one independent assertion, so a partial failure can be marked cleanly. Split any checkbox that bundles multiple clauses — with two exceptions:
>
> - **Setup/data-creation steps** that assert nothing are fine to leave bundled with the assertion they set up for.
> - A **whole-area visual judgement** — the `Visual sweep` blocks at the end of Phases 2–6 (#1414) — where the "one assertion" is the single verdict *does this area read cleanly*, applied to a feature area rather than a clause. The pages listed on such a line scope the walk; they are not separate assertions to mark off, and splitting per page roughly doubles the count for a judgement a human forms in one pass anyway. This exception is for that shared-rubric case only: an area's line still fails as a whole, so a reviewer records which page let it down in the run file's notes.

> **Phases are partitioned by the role doing the *asserting*, not the role the data is about.** A manager reading a page *about* riders is a Phase 4 line; a rider reading their own page is a Phase 6 line. That distinction is load-bearing — read it the other way and all 141 Finances lines look like Phase 6 material.
>
> - A precondition may be planted by any role, including a mid-phase `change-user.sh` detour to a manager. Only the eye doing the looking has to match the phase.
> - When such a line is later automated, the manager-side precondition becomes a **fixture/seed call in the asserting role's own barn**, so one test is always one role — a Playwright project binds one `storageState`.
> - A misplaced line is not merely untidy: it can never be tagged honestly. A Phase 4 line asserting trainer-visible UI can only ever be covered by a `@trainer` test, so its `(e2e: …)` tag would be a lie.
> - If a check ever genuinely needs two live roles acting in sequence and cannot be reduced to seed-then-assert, give it its own phase and tag it `(manual)`. No such check exists today.

> **Automation tags:** in an audited section, every checkbox carries exactly one of — including a standalone setup step, which a spec automates alongside the assertions it sets up
>
> - `(e2e: <test name>)` — covered by that Playwright test in `e2e/`; run via `scripts/run-checklist-suite.sh`. **Machine-checked** (#1386, #1392): `scripts/check-e2e-tags.sh`, wired into `ci.sh`, fails the PR if the named test doesn't exist in `e2e/*.spec.ts`, carries no `@project` tag, runs only as an identity this phase is never walked by, or the tag itself doesn't parse — each one silently launders an unverified checkbox into a green run. The third is the phase-partitioning rule above enforced rather than asserted: the phase file's `<!-- Asserting role: … -->` comment declares the identity, and each project's `storageState` in `playwright.config.ts` says which identity it runs as. The tag is the test's title with its trailing `@project` suffixes dropped
> - `(e2e-candidate)` — automatable, spec not written yet
> - `(manual)` — not automatable; always hand-verified
>
> Sections with no tags on their checkboxes have not been audited yet.
>
> **A line a PR adds is born automated or justified-manual** — `(e2e: <test name>)` with the covering spec written in that same PR, or `(manual)` with the reason stated on the line. Leaving an added line untagged is the same violation as tagging it `(e2e-candidate)`; both are barred for *added* lines only, and both stay correct for the pre-existing untagged lines an audit is converting — the "not audited yet" note above is about those, not licence to add more. The stated-reason requirement likewise binds added lines, not the older `(manual)` ones. **It may be satisfied per subsection rather than per line** where every checkbox in that subsection shares one verdict and one rubric — the reason then goes once in the subsection's header blockquote, and the lines carry a bare `(manual)`. The **Visual sweep** blocks at the end of Phases 2–6 are the case this exists for (#1414): thirty-odd lines each repeating the same visual-judgement clause is noise, not a reason. Per-line remains the rule everywhere else, including a one- or two-line block, which shares no rubric with anything. Legitimate `(manual)` grounds, in full: a **human judgment call** — does this flow read well, cross-device look-and-feel, any visual check — or an external dependency a spec cannot drive. "Would take a while to automate" is not one; neither is needing a separate real person or prod configuration, which belongs in `POST_RELEASE_TEST_CHECKLIST.md` rather than tagged `(manual)` here.

> **Hedges:** a checklist note asserting a capability *doesn't exist yet* — "until #N lands", "#N-blocked", "not yet assignable via UI" — goes stale the moment #N merges, silently suppressing coverage of a feature that now works. **The PR closing #N removes every hedge on #N from this file and `POST_RELEASE_TEST_CHECKLIST.md` in that same PR**, and replaces each one with the check the hedge was standing in for. Grep both files for the issue number before opening the PR. This is a convention, not a CI check — both checklists legitimately cite closed issues as history ("since #864", "#969 — a manager can no longer…"), and no grep separates those from a hedge reliably.

## Prerequisites

- [ ] `.env.local` at repo root with `DEV_EMAIL`, `DEV_NAME` (must be "First Last" — a single word breaks the name prompt in Phase 1), `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (optionally `DEV_BARN` — `seed-account.sh` in Phase 1 defaults it to `dev-barn`; `change-user.sh` in Phases 5–7 takes the barn slug as a required argument, e.g. `bash scripts/change-user.sh dev-barn`)
- [ ] `CRON_SECRET` in `.env.local` (any value — `openssl rand -hex 32`; prod's lives in Vercel), and **the app under test running with that same value** — restart the dev server if you added it after booting. Only Phase 1's *authorized* reap check needs it; the two `401` checks pass with it unset, since an unset secret denies everyone. `scripts/run-checklist-suite.sh` refuses to start without it rather than silently skipping the reap. Note it checks that the variable is *present locally*, not that it matches the origin `--base-url` names: against a deployment, the reap authenticates against that deployment's Vercel value
- [ ] The shared demo user exists in the target Supabase project — `bash scripts/setup-demo-user.sh`, with both the `DEMO_USER_EMAIL` and `DEMO_USER_PASSWORD` lines it prints pasted into `.env.local` (`/demo` 404s without the email and bails without the password). Re-run it after **any** `scripts/reset-db.sh`: that script deletes every auth user, the demo one included, and Phase 1's `/demo` checks then fail with a `?error=demo_unavailable` redirect rather than anything that names the cause
- [ ] App running (dev server or Vercel preview) and reachable in a browser
- [ ] Email provider enabled in the Supabase dashboard (required by the e2e auth logins `reset-db.sh` creates in Phase 1, which `seed-test-barn.sh` in Phase 7 then verifies exist)

Every step in the phases below that uploads a file names one from `scripts/data/` (#1135 — a tracked directory, nothing to place by hand). The images are deliberately non-square and bracketed by `|------- word -------|` edge markers, so a square-crop regression visibly eats the bars instead of needing a proportion judgment, and the word tells you at a glance which file is displayed. See `docs/scripts.md`'s Test assets section for the full manifest.

## Phases

Run them in order. Each file carries its own asserting role — the partitioning rule is the Convention above.

- [Phase 1 — Setup](checklists/pre-release/phase-1-setup.md) — role-agnostic setup — an unauthenticated visitor, then the shared demo user, then the developer's own account pre-membership and as its manager.
- [Phase 2 — Manager seeding](checklists/pre-release/phase-2-manager-seeding.md) — manager only.
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
| `/auth/callback` | Phase 1 — no check of its own, and none is warranted: it is the OAuth redirect every sign-in traverses, so Phase 1's sign-ins *are* its exercise. A check that it "works" is the sign-in that just worked. |
| `/terms` | Phase 1 |
| `/privacy` | Phase 1 |
| `/about` | Phase 4 |
| `/changelog` | Phase 4 |
| `/demo` | Phase 1 |
| `/api/cron/reset-demo` | Phase 1 |
| `/barns` | Phase 7 |
| `/barn/[slug]` (dashboard) | Phases 4, 6, 7 |
| `/barn/[slug]/login` | Phases 1, 2, 7 |
| `/barn/[slug]/register` | Phase 7 |
| `/barn/[slug]/lessons` | Phases 4, 5, 6, 7 |
| `/barn/[slug]/lessons/new` | Phases 3, 5 |
| `/barn/[slug]/lessons/[id]` | Phases 4, 5, 6, 7 |
| `/barn/[slug]/lessons/[id]/edit` | Phases 4, 5 |
| `/barn/[slug]/lessons/[id]/delete` | Phase 4 |
| `/barn/[slug]/lessons/[id]/cancel` | Phases 4, 5, 6 |
| `/barn/[slug]/lessons/[id]/cancel-rider/[riderId]` | Phases 4, 5, 6 |
| `/barn/[slug]/expenses` | Phases 4, 5, 6 |
| `/barn/[slug]/expenses/new` | Phase 4 |
| `/barn/[slug]/expenses/[id]` | Phases 4, 5 |
| `/barn/[slug]/expenses/[id]/delete` | Phase 4 |
| `/barn/[slug]/horses` | Phases 2, 4, 7 |
| `/barn/[slug]/horses/[id]` | Phases 2, 4, 5, 7 |
| `/barn/[slug]/agreements` | Phase 2 |
| `/barn/[slug]/agreements/new` | Phase 2 |
| `/barn/[slug]/agreements/[id]` | Phase 4 |
| `/barn/[slug]/agreements/[id]/edit` | Phase 2 |
| `/barn/[slug]/members` | Phases 2, 4, 5, 6, 7 |
| `/barn/[slug]/members/[membership_id]` | Phases 4, 5, 7 |
| `/barn/[slug]/documents/new` | Phases 4, 6 |
| `/barn/[slug]/finances` | Phases 4, 5, 6, 7 |
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
| `/barn/[slug]/guide` | Phases 4, 5, 6 |
| `/profile` | Phase 4 |
| `/profile/complete` | Phases 1, 2 |
| `/calendar.ics` | Phases 4, 5, 6 — fetched directly at the tokenized URL copied from the Profile page's Calendar Feed section |
