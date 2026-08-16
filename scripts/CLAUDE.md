# Scripts

## Pattern

Scripts are written in TypeScript and run via `npx tsx`:

```bash
npx tsx scripts/my-script.ts
```

Each script's shell wrapper (`.sh`) validates required env vars from `.env.local`, then invokes tsx. The 4 nightly cron scripts (below) are the exception — they have no `.env.local`/interactive flow, so they share one wrapper, `run-cron.sh <script-name>`, and push env validation into the TS layer instead (see `runCronJob`).

## Shell hazards

### `pipefail` + an early-exit consumer

Under `set -o pipefail`, `cmd | grep -q pattern` is a race. `grep -q` exits the moment it matches, closing the read end; `cmd` then dies on `SIGPIPE` (141), and `pipefail` propagates *that* as the pipeline's status. So a pipeline that matched — the success case — can report failure. Flip the polarity (`if ! …`, or a gate whose pass branch is the non-zero one) and the same race reports **success for a check that never completed**, which is a wrong verdict that looks self-verified. `head` and `grep -m N` are the same shape: they stop reading early.

Whether it fires depends on whether the producer is still writing when the consumer exits — output larger than the ~64KB pipe buffer, or a slow producer, makes it likely; a bash-builtin `echo` of a short string makes it near-impossible. That timing dependence is the point: it works in testing and fails in CI.

Restructure instead — capture into a variable first (`out="$(cmd)"; grep -q … <<<"$out"`), or let the consumer drain (`grep -c`, `tail`, `sort`). If the pipeline really is safe, annotate the line with `# pipefail-safe: <the polarity argument>` — the reason has to be on the line, not implied.

`scripts/check-pipefail-race.sh` (wired into `ci.sh`) enforces this across `scripts/*.sh`, so a new instance fails CI rather than waiting to be noticed. It skips `*.test.sh`, which embed hazardous pipelines as fixture *text* that no scanner can tell from a real one.

The 2026-08-04 sweep (#1285) came back clean; the four look-alike non-instances it cleared are recorded in [`docs/scripts.md`](../docs/scripts.md)'s sweep history.

## Test assets

`scripts/data/` is a normal, tracked directory (#1135) — one shared fixture set (photos, sized PDFs) that `seed-barn.ts`, `seed-test-barn.ts`, the e2e suite, and a human walking `checklists/pre-release/` all draw from. Add new fixtures here rather than force-adding them elsewhere; every checklist step that uploads a file names its specific asset, so keep the two in sync. `scripts/data.test.ts` asserts the manifest in CI. The per-file manifest, the reasons the PDFs are structurally valid and the images are word-marked, and the regeneration recipes are in [`docs/scripts.md`](../docs/scripts.md).

## DB layer usage

Scripts use db layer functions from `src/lib/db/` wherever an equivalent function exists. A service-role Supabase client is created in the script and injected into db layer calls via the optional `client` parameter added in issue #252:

```ts
const supabase = createServiceClient(SUPABASE_URL!, SERVICE_ROLE_KEY!)

await createHorse(barnId, name, undefined, supabase)
```

`createServiceClient` (from `./script-utils`) sets the standard `auth` options and avoids repeating the same three-liner across scripts.

Raw `supabase.from(...)` calls are used only when no db layer equivalent exists (e.g. barn insert, active membership insert, teardown deletes, `auth.admin.*` calls), or when the equivalent is RPC-backed with an auth check that blocks service-role callers (`auth.uid()` is null under a service-role client) — e.g. `createManagedMember` → `create_managed_member`'s `auth_is_barn_manager` check; see `seed-account.ts`. Do not "fix" such scripts by switching them to the DAL function — they will fail at runtime, and earlier than the auth check: the class's known members (`create_managed_member`, `create_or_update_notification`, `collect_lesson_payment`) all carry no `service_role` `EXECUTE` grant (`authenticated` only), so the call dies at the ACL with `permission denied` before the in-body check can even raise `not_authorized`.

## Responsibility split

Each script is split into three files with distinct responsibilities:

- **`.sh`** — reads `.env.local`, validates required env vars, CLI arg parsing, prompting for missing args, defaulting to `DEV_*` env vars, invoking `npx tsx`
- **`.ts`** — pure business logic; reads `process.env` for credentials and values the shell wrapper has already validated; no CLI arg parsing or prompting; no `readline` (exception: interactive numbered-list selection when bash cannot do it cleanly — see `change-user.ts`); pure functions accept business-logic inputs as function arguments
- **`.test.ts`** — vitest tests for pure functions exported from `.ts`

The 4 nightly cron scripts don't follow the `.sh`-validates/`.ts`-trusts split above — they're GHA-only with no interactive `.env.local` flow, and their setup ceremony (env validation, service-role client construction, exit-code convention) was byte-for-byte identical, so it's collapsed into `run-cron.sh <script-name>` (shell) and `runCronJob(name, fn)` from `script-utils.ts` (TS), leaving each script's own `run(supabase)` to hold only its per-item loop body and return `{ summary, hadErrors }`.

Shell-only scripts with no extractable pure logic (e.g. `ci.sh`, `check-coverage.sh`) need no `.ts` counterpart.

`.test.ts` files are automated via vitest (`ci.sh` → `npm run test:coverage`). **Do not add a `.test.sh` file** for a shell wrapper's own branching/arg-parsing logic, even when it's non-trivial (`change-user.sh`'s `--allow-prod`/slug parsing, `teardown-test-barn.sh`'s `--all` flag) — #667 removed six of these (`change-user`, `ci`, `reset-db`, `run-smoke-tests`, `seed-test-barn`, `teardown-test-barn`) because a `.test.sh` nobody wires into `ci.sh` is never actually run by anyone and just rots; #986 recreated two of them before this line was tightened to say so explicitly. The only `.test.sh` files that survive are ones actually invoked by `ci.sh` (`check-coverage.test.sh`, `check-doc-size.test.sh`, `select-specs.test.sh`, `check-pipefail-race.test.sh`, `check-e2e-tags.test.sh`, `check-function-grants.test.sh`, `check-ceremony-tags.test.sh`, `workflow-context.test.sh`) — if a `.test.sh` isn't wired in, delete it rather than leave it "for manual use." The last is not an exception: `base_for_labels()` is pure logic, not arg parsing (#1542).

`reset-db`/`seed-barn` is the canonical example of the full pattern, split across two files (#502): `reset-db.ts` holds the `.sh`-validated bootstrapping, `seed-barn.ts` holds the pure logic and its `.test.ts`.

### Script index

One line each; full contracts, flags, quirks, and history: [`docs/scripts.md`](../docs/scripts.md).

- `reset-db` — wipe the dev project and reseed `dev-barn` via `seedBarn()`; recreates the three e2e logins after teardown
- `seed-barn` — shared seeding module: `seedBarn()` plus fixture constants and pure date/variation helpers
- `change-user` — swap your membership onto another member/role within a named barn
- `seed-account` — create a managed-manager stub and print the invite path (also the prod bootstrap)
- `e2e-auth-users` — `create|verify|delete` the three per-*project* checklist-suite logins
- `seed-test-barn` — seed a throwaway walkthrough barn from `e2e/support/fixtures.ts`'s builders
- `teardown-test-barn` — delete test barns; refuses `is_test_barn=false` rows (`--all`, `--prefix`)
- `script-utils` — shared TS utilities: `createServiceClient`, `assertDevProject`, teardown helpers, `runCronJob`
- `setup-demo-user` — one-time bootstrap of the shared demo auth user (deliberately no dev-project gate)
- `run-cron` — shared shell wrapper for the 4 nightly cron scripts
- `generate-outstanding-notifications`, `generate-agreement-charges`, `generate-recurring-lessons`, `prune-old-notifications` — the 4 nightly GHA cron jobs (`run(supabase)` → `{ summary, hadErrors }`)
- `run-checklist-suite` — run the Playwright suite: per-run barn prefix, teardown `EXIT` trap, full output mirrored to `checklist-suite.log`
- `workflow-ci-wait` — blocking CI gate for `/reviewIssue`/`/finishIssue`; exactly one exit-coded verdict line
- `workflow-context` — worktree/port/branch/base detection for the five workflow skills; never fails, empty fields instead
- `select-specs` — PR diff → e2e blast radius via each spec's `// covers:` globs; `--lint` wired into `ci.sh`
- `assert-dev-project` — dev-project guard `/sync-migrations` runs before `npx supabase db push`
- `ci` — the CI entry point
- `check-coverage` — the 100% branch-coverage gate
- `check-doc-size` — doc size budgets (pairwise anchor+sub-doc caps on `ARCHITECTURE.md`+`docs/architecture/` and `e2e/CLAUDE.md`+`docs/e2e-framework-facts.md`/`docs/e2e-spec-maintenance.md`, per-file caps on the auto-loaded set)
- `check-pipefail-race` — CI gate for the `pipefail` + early-exit-consumer race (see Shell hazards above)
- `check-function-grants` — CI gate: every non-trigger migration function is revoked from `PUBLIC` after its last create/drop
- `check-ceremony-tags` — CI gate: every `RELEASE_CEREMONY.md` checkbox carries exactly one `(auto)`/`(prompt)`/`(manual)` tag — what `/releaseCeremony` reads to decide what it may run unattended
- `check-e2e-tags` — CI gate: every checklist `(e2e:)` tag names a test that exists, carries a project tag, and runs as an identity its phase asserts as; and no `e2e/**/*.ts` file cites a checklist item by line number rather than by quoted fragment (#1410)
- `verify-migration-equivalence` — replay two migration sets into throwaway DBs and diff the schema incl. ACLs; the squash check `Verify Migrations` CI can't do (`--self-check`, needs a local Postgres)
- `repair-migration-history`, `replace-all-migrations` — migration-history repair tooling (prod-targeting by design)
