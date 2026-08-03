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
  // Every worker points at one `next dev` server that compiles routes on demand, so worker
  // count is really "concurrent load on a single largely-serial process". Playwright's default
  // (cores/2 — 8 on a 16-core box) saturated it: navigation-heavy checks ran 5x slower and
  // tripped fixed timeouts, failing only under multi-spec load (#1238). Fixed rather than a
  // percentage on purpose — a fraction of core count misreads the bottleneck ('25%' on a
  // 64-core box is 16 workers, which saturates the one server just the same).
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
