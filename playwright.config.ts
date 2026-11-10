import { defineConfig, devices } from '@playwright/test';

// Dedicated ports and event bus/queue: e2e never talks to (or steals events from) a dev stack or
// the Docker containers that may be running on the default ports.
const API_PORT = Number(process.env.E2E_API_PORT ?? 3100);
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 5273);
const API_URL = `http://localhost:${API_PORT}`;
const FRONTEND_URL = `http://localhost:${WEB_PORT}`;

/**
 * E2E runs against the real stack. Postgres and LocalStack must already be up
 * (`docker compose up -d postgres localstack`); the NestJS API and the Vite dev server are started
 * here from the current source, never reused, so a stale server cannot hide a regression.
 */
export default defineConfig({
  testDir: './e2e/tests',
  // Removes requests left by earlier runs so random date ranges never collide with them.
  globalSetup: './e2e/global-setup.ts',
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
      command: 'npm run start --prefix backend',
      // Any 2xx-3xx or 400-403 counts as "up"; this endpoint answers 401 without a token.
      url: `${API_URL}/api/auth/me`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        PORT: String(API_PORT),
        EVENT_BUS_NAME: 'e2e-event-bus',
        EVENT_QUEUE_NAME: 'e2e-event-queue',
        EVENT_RULE_NAME: 'e2e-forward-all',
        // The expiry job is covered by unit tests; keep it from touching shared dev data here.
        VACATION_EXPIRY_INTERVAL_SECONDS: '0',
        // Fast outbox relay so event specs do not wait for the default poll interval.
        OUTBOX_POLL_INTERVAL_MS: '200',
        // The dev-only event log endpoint is off by default; one spec checks the raw bus envelope.
        ENABLE_TEST_ENDPOINTS: 'true',
      },
    },
    {
      command: 'npm run dev --prefix frontend -- --port ' + WEB_PORT + ' --strictPort',
      url: FRONTEND_URL,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { API_PROXY_TARGET: API_URL },
    },
  ],
});
