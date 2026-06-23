import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  passWithNoTests: true,
  use: { baseURL: process.env.E2E_BASE_URL },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
