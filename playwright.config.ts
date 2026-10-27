import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '*.spec.ts',
  testIgnore: '**/evidence/**',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  reporter: [['list'], ['json', { outputFile: 'test-results/browser-results.json' }]],
  // Starts the app for the tests, or reuses one already running on port 4318.
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:4318',
    reuseExistingServer: true,
    timeout: 60_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:4318',
    viewport: { width: 1440, height: 1050 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: [/webkit\.spec\.ts/, /\/evidence\//],
      use: { browserName: 'chromium' },
    },
    {
      name: 'webkit',
      testMatch: /(webkit|reset|facing)\.spec\.ts/,
      use: { browserName: 'webkit' },
    },
  ],
});
