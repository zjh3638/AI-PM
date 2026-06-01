import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  timeout: 30000,
  expect: { timeout: 10000 },

  use: {
    baseURL: 'http://localhost:3090',
    trace: 'on-first-retry',
  },

  projects: [
    // Auth setup — logs in via API and saves storage state
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],

  webServer: [
    {
      command: 'cd ../server && source .venv/bin/activate && uvicorn app.main:app --host 0.0.0.0 --port 8090',
      port: 8090,
      reuseExistingServer: true,
    },
    {
      command: 'npx vite --port 3090',
      port: 3090,
      reuseExistingServer: true,
    },
  ],
});
