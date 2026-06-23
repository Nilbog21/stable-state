import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  use: { baseURL: process.env.E2E_BASE_URL },
  projects: [
    { name: 'manager', use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/manager.json' } },
    { name: 'trainer', use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/trainer.json' } },
    { name: 'rider',   use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/rider.json'   } },
  ],
});
