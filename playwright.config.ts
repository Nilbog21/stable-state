import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: process.env.E2E_BASE_URL,
    extraHTTPHeaders: process.env.VERCEL_AUTOMATION_BYPASS_SECRET
      ? { 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET }
      : {},
  },
  projects: [
    { name: 'manager', grep: /@manager/, use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/manager.json' } },
    { name: 'trainer', grep: /@trainer/, use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/trainer.json' } },
    { name: 'rider',   grep: /@rider/,   use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/rider.json'   } },
    { name: 'mobile',  grep: /@manager/, use: { ...devices['Pixel 5'],        storageState: 'e2e/.auth/manager.json' } },
  ],
});
