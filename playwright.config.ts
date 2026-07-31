import { defineConfig, devices } from '@playwright/test';

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
  use: {
    baseURL: process.env.E2E_BASE_URL,
    // The browser context's zone, pinned for the same reason vitest.config.mts pins TZ — see
    // the comment there. The Node *runner* process is deliberately left on the developer's own
    // zone: the fixture helpers are UTC-framed (monthAnchor, #1151) or barn-framed
    // (daysFromNow, #1221) by design, so nothing they compute reads the runner's clock.
    timezoneId: 'Asia/Kolkata',
  },
  projects: [
    { name: 'manager', grep: /@manager/, use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/manager.json' } },
    { name: 'trainer', grep: /@trainer/, use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/trainer.json' } },
    { name: 'rider',   grep: /@rider/,   use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/rider.json'   } },
    { name: 'mobile',  grep: /@mobile/,  use: { ...devices['Pixel 5'],        storageState: 'e2e/.auth/manager.json' } },
  ],
});
