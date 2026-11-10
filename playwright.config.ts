import { defineConfig, devices } from '@playwright/test';

const FRONTEND_URL = process.env.E2E_BASE_URL ?? 'http://localhost:5173';

/**
 * E2E runs against the real stack. Postgres and LocalStack must already be up
 * (`docker compose up -d postgres localstack`); the NestJS API and the Vite dev server are
 * started here, or reused when already running.
 */
export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: FRONTEND_URL,
    trace: 'on-first-retry',
  },
  // Desktop Chrome only for now; add mobile/other browsers here when the UI is responsive-tested.
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npm run start:dev --prefix backend',
      // Any 2xx-3xx or 400-403 counts as "up"; this endpoint answers 401 without a token.
      url: 'http://localhost:3000/api/auth/me',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'npm run dev --prefix frontend',
      url: FRONTEND_URL,
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
