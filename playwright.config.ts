import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';

// The cloud dev container ships a fixed Chromium; local machines use Playwright's own.
const LINUX_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const launchOptions = fs.existsSync(LINUX_CHROME) ? { executablePath: LINUX_CHROME } : {};

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4319',
    trace: 'off',
    screenshot: 'off',
    launchOptions,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run preview -- --port 4319 --strictPort',
    url: 'http://localhost:4319',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
