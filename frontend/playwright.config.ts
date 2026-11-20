import { defineConfig, devices } from '@playwright/test';

import { APP_URL, AUTH_FILE, MOCK_PORT, MOCK_URL } from './e2e/support/env';

// `E2E_REUSE_SERVERS=1` keeps servers you started yourself (same ports, same env) between runs.
const REUSE_SERVERS = process.env.E2E_REUSE_SERVERS === '1';

/*
 * End-to-end tests: the real app in a real browser, against the TypeScript mock API.
 *
 *   npm run test:e2e                          # everything
 *   npm run test:e2e -- --project=forms       # the form flows only
 *   npm run test:e2e -- --project=visual      # every route at three widths, light and dark
 *
 * Both servers are started here: a fresh mock on its own port (not the 8787 a developer's mock
 * usually holds) and `next dev` on 3100 pointed at it. The mock keeps its data in memory, so the
 * tests run one at a time and each one resets it first (`e2e/support/mock.ts`).
 */
export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  // One in-memory mock serves every test, so they run one after another.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  // The first visit to each route compiles it in `next dev`, which can take a while.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: APP_URL,
    timezoneId: 'Africa/Kampala',
    locale: 'en-GB',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts$/ },
    {
      name: 'forms',
      testMatch: /\.spec\.ts$/,
      testIgnore: /visual\.spec\.ts$/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: AUTH_FILE },
    },
    {
      name: 'visual',
      testMatch: /visual\.spec\.ts$/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: AUTH_FILE },
    },
  ],
  webServer: [
    {
      command: 'npm run mock-api',
      // The mock answers 401 without a token; Playwright counts that as "up".
      url: `${MOCK_URL}/health`,
      env: { MOCK_PORT: String(MOCK_PORT), MOCK_DELAY: '50' },
      reuseExistingServer: REUSE_SERVERS,
      timeout: 30_000,
    },
    {
      command: 'npx next dev -p 3100',
      url: `${APP_URL}/sign-in`,
      env: {
        // Its own build folder, so it runs alongside a developer's `next dev` (next.config.ts).
        NEXT_DIST_DIR: '.next-e2e',
        BACKEND_URL: MOCK_URL,
        NEXT_PUBLIC_API_BASE_URL: '/api/v1',
        // No map key: the map pages show their notice, so runs never depend on Google.
        NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: '',
      },
      reuseExistingServer: REUSE_SERVERS,
      timeout: 180_000,
    },
  ],
});
