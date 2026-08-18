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
  // **Set from #1601's measurement.** History first, because this number moved twice on rationales
  // that no longer hold.
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
  // **4 was re-tested against that, and rejected — this is a measured ceiling, not a leftover.**
  // The dev-server contention #1295 rejected 4 for is genuinely gone, so the value was worth
  // re-earning: at 2 the workers were only ~83% saturated (28.0 min of summed test time across 2
  // workers = 14.0 min of execution against 16.8 min wall), which says wall time tracks worker
  // count. Run at 4 it does, dramatically — **8.8 min, nearly half of 16.8** — and memory never
  // came close to mattering (3.8 GB peak concurrent against ~19 GB free; Chromium doubled as
  // expected, the server grew only 437 -> 607 MB). But it was **not green: 1 failed, 4 did not
  // run**.
  //
  // The failure names its own cause, which is why it is a ceiling rather than a flake to re-roll.
  // `checklist-phase4-finances-outstanding.spec.ts`'s `readTabExpenseTotals` switches tabs by
  // clicking a `Pill` — a soft nav (framework fact 11) — and waits on the one header that differs
  // between tabs, exactly as that fact prescribes. At 4 workers the soft nav didn't land inside
  // **expect's fixed 5000 ms**: 14 polls, still reading the previous tab's `"Rider ▲"` where
  // `"Trainer"` was expected. That budget is fact 1's *third* tier — the one `test.slow()` cannot
  // raise — so no amount of per-test slowness declaration reaches it. And the test sits second in a
  // `describe.serial` block, so its failure silenced the 4 tests after it (fact 15): the blast
  // radius is wider than the failure count suggests.
  //
  // So the constraint on this number is no longer memory and no longer compile contention — it is
  // that a handful of assertions live inside a fixed 5 s budget that 4 workers can exhaust. Raising
  // this again means fixing those assertions first, not re-running and hoping. The prize is real
  // and measured (~8 min a run), so that is worth doing deliberately; it is filed rather than done
  // here because #1601's job was to measure this number, and tuning the specs that cap it is a
  // different change with its own verification.
  //
  // Two things the measurement did *not* overturn. #1295's "workers is not a memory lever" still
  // holds, sharpened in both directions: the lever was never workers, it was the dev server — and
  // memory is not what stops you raising this either. And `scripts/e2e-slot.sh`'s one slot is
  // unchanged (#1598) — #1601 deliberately did not retune it in the same issue that re-priced it;
  // see that script's entry in docs/scripts.md.
  //
  // Fixed rather than a percentage, unchanged from #1238's reasoning: a fraction of core count
  // misreads the bottleneck ('25%' on a 64-core box is 16 workers).
  workers: 2,
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
