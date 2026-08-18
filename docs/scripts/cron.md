# Scripts — nightly cron jobs

The per-script detail behind `scripts/CLAUDE.md`'s one-liner index (moved there from that file by #1354, so it loads only when followed). The conventions themselves — the `.sh`/`.ts`/`.test.ts` responsibility split, the `.test.sh` policy, the shell-hazards rule — stay in `scripts/CLAUDE.md`.

## `run-cron`

Files: `.sh`

`run-cron.sh <script-name>` — shared wrapper for the 4 nightly cron scripts below, invoking `npx tsx scripts/<script-name>.ts`; no env validation (owned by `runCronJob`, see `dev-data.md`'s `script-utils`)

## `generate-outstanding-notifications`

Files: `.ts`, `.test.ts`

Nightly cron, GHA-only, invoked via `run-cron.sh generate-outstanding-notifications`; `run(supabase)` returns `{ summary, hadErrors }`, wrapped by `runCronJob` at the bottom guard

## `generate-agreement-charges`

Files: `.ts`, `.test.ts`

Nightly cron, GHA-only, same shape as `generate-outstanding-notifications`; `.test.ts` covers only the pure `formatChargeGenerationSummary` formatter — the cross-barn `agreements` query and `generateChargeForMonth` calls are verified manually, not unit tested

## `generate-recurring-lessons`

Files: `.ts`, `.test.ts`

Nightly cron, GHA-only, same shape as the other two; `.test.ts` covers the pure helpers (`isDueForGeneration`, `computeNextLessonAt`, `hasMissingRider`, `hasUnavailableHorse`, and the notification/summary formatters) — the cross-barn `lesson_series` query, per-series `generateNextLessonForSeries`/`stopLessonSeries` calls, and notification aggregation are verified manually, not unit tested

## `prune-old-notifications`

Files: `.ts`, `.test.ts`

Nightly cron, GHA-only, same shape as the other three; deletes `notifications` rows where `read_at IS NOT NULL AND read_at < now() - interval '30 days'` via a single raw `supabase.from('notifications').delete()` call (no per-item loop, so `hadErrors` is always `false`); `.test.ts` covers only the pure `formatPruneSummary` formatter — the delete query itself is verified manually, not unit tested
