import { defineConfig, devices } from '@playwright/test'

// End-to-end tests: a real browser against the real web app and API. Playwright starts both
// servers itself (webServer), on their own ports, so a running dev setup on 3000/8000 is not
// touched and doesn't get in the way.
const API_URL = 'http://127.0.0.1:8010'
const WEB_URL = 'http://127.0.0.1:3010'

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts', // not *.spec.ts / *.test.ts: those are Vitest's
  workers: 1, // one shared API and database
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  timeout: 60_000,
  use: {
    baseURL: WEB_URL,
    // The app's default language and the API's time zone, whatever the machine running the tests.
    locale: 'sr-RS',
    timezoneId: 'Europe/Belgrade',
    // On a failure: a trace (every step, DOM snapshot and request) for `npx playwright show-trace`.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: `node e2e/api-server.mjs 8010 ${WEB_URL}`,
      url: `${API_URL}/api/schema/`,
      reuseExistingServer: false, // always a fresh database
      timeout: 120_000,
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 3010',
      url: WEB_URL,
      env: { VITE_API_URL: API_URL },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
})
