import { defineConfig, devices } from '@playwright/test';
import { BROWSER_TIMEZONE } from './e2e/support/timezone';

export default defineConfig({
  testDir: './e2e',
  // *.spec.ts only. e2e/support holds vitest *.test.ts files for the pure fixture helpers,
  // and Playwright's default testMatch would otherwise try to run them as browser tests.
  testMatch: '**/*.spec.ts',
  globalSetup: './e2e/global-setup.ts',
  // fullyParallel must stay false. Each job seeds its own barn (see e2e/support/test.ts), so
  // isolation is per (spec file × project) — the unit Playwright dispatches, and the reason
  // the barn slug carries the project name. The tests inside one job share that barn and must
  // run serially, or a mutating test would race a reading one against the same data.
  fullyParallel: false,
  // retries must stay 0. A retry re-runs a mutating test against the state its first attempt
  // already changed, so the second attempt asserts against a barn that no longer matches the
  // fixture — a false pass or a misleading failure either way.
  retries: 0,
  // **Set from #1606's measurement.** History first, because this number moved three times on
  // rationales that no longer hold.
  //
  // Until #1601 every worker pointed at that worktree's own `next dev` server, which compiled
  // routes on demand, so worker count was really "concurrent load on a single largely-serial
  // process". Playwright's default (cores/2 — 8 on a 16-core box) saturated it: navigation-heavy
  // checks ran 5x slower and tripped fixed timeouts, failing only under multi-spec load (#1238).
  // #1295 then took 4 -> 2 to buy **timeout headroom, and only that**: two full runs at 4 an hour
  // apart failed 5 and 11 tests with exactly one in common, nearly all ~30s timeouts that went
  // green when re-run in isolation. That near-disjointness was the evidence it was suite-level
  // capacity rather than N flaky assertions, and with `retries: 0` above nothing absorbed it.
  //
  // **#1601 removed the thing both of those were about.** `run-checklist-suite.sh` now builds the
  // branch and serves it with `next start`, so nothing compiles inside a test's budget and there is
  // no largely-serial pipeline for workers to contend on. Measured, one full run at 2 against the
  // production server: **1038 passed, 0 failed, 16.8 min** (the dev-server baseline was 25.5 min
  // for 1034 tests — 34% slower), with peak RSS by class **next-server 437 MB**, playwright-node
  // 1585 MB, Chromium 1020 MB, **2416 MB peak concurrent for the whole run**. The server that used
  // to peak at 10.18 GB is now the smallest real class in the run, and the run entire is 4.2x
  // smaller than that old server alone.
  //
  // **#1601 re-tested 4 against that and rejected it, calling it a measured ceiling. #1606
  // overturned that by fixing what the ceiling actually was — one assertion.** The dev-server
  // contention #1295 rejected 4 for is genuinely gone, so the value was worth re-earning: at 2 the
  // workers were only ~83% saturated (28.0 min of summed test time across 2 workers = 14.0 min of
  // execution against 16.8 min wall), which says wall time tracks worker count. Run at 4 it does,
  // dramatically — **8.8 min, nearly half of 16.8** — and memory never came close to mattering
  // (3.8 GB peak concurrent against ~19 GB free; Chromium doubled as expected, the server grew only
  // 437 -> 607 MB). #1601's run at 4 was **not green: 1 failed, 4 did not run**, and that single
  // failure was read as the ceiling.
  //
  // It was one assertion, and it named itself. `checklist-phase4-finances-outstanding.spec.ts`'s
  // `readTabExpenseTotals` switches tabs by clicking a `Pill` — a soft nav (framework fact 11) —
  // and waits on the one header that differs between tabs, exactly as that fact prescribes. At 4
  // workers the soft nav didn't land inside **expect's fixed 5000 ms**: 14 polls, still reading the
  // previous tab's `"Rider ▲"` where `"Trainer"` was expected. That budget is fact 1's *third*
  // tier — the one `test.slow()` cannot raise — so no per-test slowness declaration reaches it, and
  // an explicit matcher timeout is the one lever fact 1 sanctions. #1606 gave it one
  // (`SETTLE_AFTER_SOFT_NAV`, 15 s, following that file's own `SETTLE_AFTER_WRITE` precedent).
  //
  // **That assertion was a bug independent of worker count, which is why fixing it was the right
  // move rather than capping the number.** It had been seen before: the same helper, same
  // assertion, same budget timed out at `workers: 2` on the old `next dev` path on 2026-08-04,
  // noticed in passing during #1309's work (an unrelated month-bucketing issue) and written off
  // there as a pre-existing timing flake. #1606's issue body carries that provenance in full. Two
  // independent sightings, two weeks and two server architectures apart, on one thin assertion — a
  // fixed budget too tight for the work behind it, not a machine at capacity.
  //
  // **And this was the second fix on it, which is the part worth knowing.** #1244 already made this
  // wait retrying (`toContainText` on the one header that differs between tabs, replacing five
  // `goto`s) and that was recorded as fixing it. It didn't, because a retrying wait was never the
  // missing piece — the missing piece was budget, and a retrying wait inside a 5 s ceiling still
  // gives up at 5 s. Anyone tempted to fix a third occurrence by changing *what* is waited on
  // should read that as the evidence it is the ceiling, not the locator.
  //
  // **The raise was then confirmed on n=2, deliberately.** #1601 rejected 4 on a single run; taking
  // it on a single run in the other direction would be the same mistake. So #1606 ran the full
  // suite at 4 twice — once with the fix applied, once as a pure confirming run with no diff after
  // it. The first: **1038 passed, 0 failed, 10.0 min**. That 1038 is the same count #1601 got at 2,
  // which is the check that matters — a raise that silenced tests would show up here as a *lower*
  // pass count, not as a failure. Both runs' figures are in #1606's PR body.
  //
  // On the wall-clock, expect a spread rather than a number: #1601 measured 8.8 min at this setting
  // and #1606 measured 10.0 on a box with a busy sibling worktree. Both are honest; the durable
  // claim is ~6-7 min saved against `workers: 2`, not any particular figure. Anyone re-measuring
  // should record what else was running.
  //
  // Note the blind spot #1601's run carried, which #1606 recorded rather than fixed: the failing
  // test sits **second** of 6 in a `describe.serial` block, so the **4** tests after it never ran
  // (fact 15) — that count is what identifies it, since 1 failed + 4 not-run is only consistent
  // with the failure landing at test 2. (#1606's own issue body mis-stated this as 4th-of-6 with 2
  // hidden; the arithmetic above is what settles it, and #1601 had it right first time.) The block
  // can't be de-serialised — it's a mutation sequence whose module-level baseline is written by
  // test 2 and read by test 4. The sharp consequence: **test 4 calls this same helper**, so that
  // second call site was itself inside the hidden set and has never been exercised at 4 workers.
  // The fix covers it anyway, being in the helper rather than at a call site.
  //
  // So the constraint on this number is not memory, not compile contention, and not the assertion
  // above. If a future raise is wanted, expect the same shape of work: find the assertion inside a
  // fixed 5 s budget that the new worker count exhausts, and give it a measured explicit timeout —
  // don't re-run and hope, and don't widen budgets pre-emptively at sites never observed to need
  // one (#1606 declined to widen the other ~14 candidates for exactly that reason: a widened budget
  // spends the budget's ability to report "this got slow").
  //
  // Two things the measurement did *not* overturn. #1295's "workers is not a memory lever" still
  // holds, sharpened in both directions: the lever was never workers, it was the dev server — and
  // memory is not what stops you raising this either. And `scripts/e2e-slot.sh`'s one slot is
  // unchanged (#1598) — #1601 deliberately did not retune it in the same issue that re-priced it;
  // see that script's entry in docs/scripts.md.
  //
  // Fixed rather than a percentage, unchanged from #1238's reasoning: a fraction of core count
  // misreads the bottleneck ('25%' on a 64-core box is 16 workers).
  workers: 4,
  use: {
    baseURL: process.env.E2E_BASE_URL,
    // The browser context's zone, pinned for the same reason vitest.config.mts pins TZ — see
    // the comment there. The Node *runner* process is deliberately left on the developer's own
    // zone: the fixture helpers are UTC-framed (monthAnchor, #1151) or barn-framed
    // (daysFromNow, #1221) by design, so nothing they compute reads the runner's clock. A spec
    // that computes an expected date runner-side is the exception, and names BROWSER_TIMEZONE
    // explicitly rather than inheriting — see checklist-timezone.spec.ts.
    timezoneId: BROWSER_TIMEZONE,
  },
  projects: [
    { name: 'manager', grep: /@manager/, use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/manager.json' } },
    { name: 'trainer', grep: /@trainer/, use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/trainer.json' } },
    { name: 'rider',   grep: /@rider/,   use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/rider.json'   } },
    { name: 'mobile',  grep: /@mobile/,  use: { ...devices['Pixel 5'],        storageState: 'e2e/.auth/manager.json' } },
  ],
});
