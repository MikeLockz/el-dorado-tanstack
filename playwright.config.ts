import { defineConfig } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_UI_BASE ?? 'http://localhost:5173';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'pnpm run dev:test-stack',
    url: BASE_URL,
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
    env: {
      LOG_LEVEL: 'error',
    },
  },
});
