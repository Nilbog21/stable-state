# Scripts

## Pattern

Scripts are written in TypeScript and run via `npx tsx`:

```bash
npx tsx scripts/my-script.ts
```

Each script's shell wrapper (`.sh`) validates required env vars from `.env.local`, then invokes tsx. The 4 nightly cron scripts (below) are the exception — they have no `.env.local`/interactive flow, so they share one wrapper, `run-cron.sh <script-name>`, and push env validation into the TS layer instead (see `runCronJob`).

## DB layer usage

Scripts use db layer functions from `src/lib/db/` wherever an equivalent function exists. A service-role Supabase client is created in the script and injected into db layer calls via the optional `client` parameter added in issue #252:

```ts
const supabase = createServiceClient(SUPABASE_URL!, SERVICE_ROLE_KEY!)

await createHorse(barnId, name, supabase)
```

`createServiceClient` (from `./script-utils`) sets the standard `auth` options and avoids repeating the same three-liner across scripts.

Raw `supabase.from(...)` calls are used only when no db layer equivalent exists (e.g. barn insert, active membership insert, teardown deletes, `auth.admin.*` calls), or when the equivalent is RPC-backed with an auth check that blocks service-role callers (`auth.uid()` is null under a service-role client) — e.g. `createManagedMember` → `create_managed_member`'s `auth_is_barn_manager` check; see `seed-account.ts`. Do not "fix" such scripts by switching them to the DAL function — they will fail at runtime with `not_authorized`.

## Responsibility split

Each script is split into three files with distinct responsibilities:

- **`.sh`** — reads `.env.local`, validates required env vars, CLI arg parsing, prompting for missing args, defaulting to `DEV_*` env vars, invoking `npx tsx`
- **`.ts`** — pure business logic; reads `process.env` for credentials and values the shell wrapper has already validated; no CLI arg parsing or prompting; no `readline` (exception: interactive numbered-list selection when bash cannot do it cleanly — see `change-user.ts`); pure functions accept business-logic inputs as function arguments
- **`.test.ts`** — vitest tests for pure functions exported from `.ts`

The 4 nightly cron scripts don't follow the `.sh`-validates/`.ts`-trusts split above — they're GHA-only with no interactive `.env.local` flow, and their setup ceremony (env validation, service-role client construction, exit-code convention) was byte-for-byte identical, so it's collapsed into `run-cron.sh <script-name>` (shell) and `runCronJob(name, fn)` from `script-utils.ts` (TS), leaving each script's own `run(supabase)` to hold only its per-item loop body and return `{ summary, hadErrors }`.

Add a **`.test.sh`** only when the shell script has non-trivial branching logic (e.g. `change-user.sh`). Shell-only scripts with no extractable pure logic (e.g. `ci.sh`, `check-coverage.sh`) need no `.ts` counterpart.

`.test.ts` files are automated via vitest (`ci.sh` → `npm run test:coverage`). `.sh` wrapper scripts are not automated — `.test.sh` files, where they exist, are run manually by hand and don't need to be wired into `ci.sh`.

`reset-db` is the canonical example of the full pattern.

### Audit — release-2

| Script | `.sh` | `.ts` | `.test.ts` | `.test.sh` | Notes |
|---|---|---|---|---|---|
| `reset-db` | ✓ | ✓ | ✓ | — | Canonical model |
| `change-user` | ✓ | ✓ | ✓ | — | `.ts` uses `readline` for numbered-list selection; bash can't do this cleanly |
| `seed-account` | ✓ | ✓ | ✓ | — | Creates a managed-manager stub (direct service-role inserts) and prints the invite path; `.test.ts` covers `buildInvitePath`; `--allow-prod` flag bypasses the `assertDevProject` dev-project check for the documented one-time production bootstrap use (README's "Production bootstrap" step 2) |
| `seed-test-barn` | ✓ | ✓ | ✓ | — | Positional arg: barn slug; teardown-first for idempotency; email/password auth users; always reads `.env.local` (the CI-only `--skip-env-local-check` bypass was removed in #1007 along with the Vercel-based e2e workflow that was its only caller) |
| `teardown-test-barn` | ✓ | ✓ | ✓ | — | Exports `teardown(slug, supabase)` reused by `seed-test-barn.ts`; exports `TEST_ROLES` for test coverage |
| `script-utils` | — | ✓ | ✓ | — | Shared utilities (`mustSucceed`, `createServiceClient`, `runCronJob`, `teardownBarnData`, `teardownAllData`, `findAuthUserIdsByEmails`, `assertDevProject`); import from here to reduce duplication across seed/teardown/cron scripts. `assertDevProject(supabaseUrl)` is called at the top of `reset-db`, `seed-test-barn`, `teardown-test-barn`, `seed-account`, and `change-user`'s `run()` (before `createServiceClient`/`createClient`) — it fail-closes unless `DEV_SUPABASE_URL` is set in `.env.local` and matches exactly, so these destructive scripts can never run against a misconfigured (e.g. prod-pointed) `.env.local`. Intentionally not added to the nightly cron scripts or `repair-migration-history.sh`, which target prod by design |
| `setup-demo-user` | ✓ | ✓ | ✓ | — | One-time-per-environment bootstrap: creates (or resets the password of, if it already exists) the shared demo auth user `demo@stable-state.app` plus a fully complete `profiles` row, and prints `DEMO_USER_EMAIL`/`DEMO_USER_PASSWORD` lines for `.env` copy-paste; idempotent via `findAuthUserIdsByEmails`; deliberately has no `DEV_SUPABASE_URL`/`assertDevProject` gate since (unlike the other seed scripts) it's designed to run against prod as well as local |
| `run-cron` | ✓ | — | — | — | `run-cron.sh <script-name>` — shared wrapper for the 4 nightly cron scripts below, invoking `npx tsx scripts/<script-name>.ts`; no env validation (owned by `runCronJob`, see above) |
| `generate-outstanding-notifications` | — | ✓ | ✓ | — | Nightly cron, GHA-only, invoked via `run-cron.sh generate-outstanding-notifications`; `run(supabase)` returns `{ summary, hadErrors }`, wrapped by `runCronJob` at the bottom guard |
| `generate-agreement-charges` | — | ✓ | ✓ | — | Nightly cron, GHA-only, same shape as `generate-outstanding-notifications`; `.test.ts` covers only the pure `formatChargeGenerationSummary` formatter — the cross-barn `agreements` query and `generateChargeForMonth` calls are verified manually, not unit tested |
| `generate-recurring-lessons` | — | ✓ | ✓ | — | Nightly cron, GHA-only, same shape as the other two; `.test.ts` covers the pure helpers (`isDueForGeneration`, `computeNextLessonAt`, `hasMissingRider`, `hasUnavailableHorse`, and the notification/summary formatters) — the cross-barn `lesson_series` query, per-series `generateNextLessonForSeries`/`stopLessonSeries` calls, and notification aggregation are verified manually, not unit tested |
| `prune-old-notifications` | — | ✓ | ✓ | — | Nightly cron, GHA-only, same shape as the other three; deletes `notifications` rows where `read_at IS NOT NULL AND read_at < now() - interval '30 days'` via a single raw `supabase.from('notifications').delete()` call (no per-item loop, so `hadErrors` is always `false`); `.test.ts` covers only the pure `formatPruneSummary` formatter — the delete query itself is verified manually, not unit tested |
| `ci` | ✓ | — | — | — | Shell-only |
| `check-coverage` | ✓ | — | — | ✓ | Shell-only |

## Testing

Pure function tests live in a vitest test file alongside the script (e.g. `reset-db.test.ts`). Shell wrapper behavior (env validation, tsx invocation) is tested in the corresponding `.test.sh` file.
