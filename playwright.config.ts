import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// The cloud dev container ships a fixed Chromium; local machines use Playwright's own.
const LINUX_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const launchOptions = fs.existsSync(LINUX_CHROME) ? { executablePath: LINUX_CHROME } : {};

// Each run gets a fresh data directory, so tests never see another run's reviews.
const dataDir = process.env.E2E_DATA_DIR ?? mkdtempSync(join(tmpdir(), 'panelist-e2e-'));
const port = Number(process.env.E2E_PORT ?? 4319);
export const E2E_PASSWORD = 'e2e-password';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'off',
    screenshot: 'off',
    launchOptions,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['iPhone 13'], browserName: 'chromium' }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    command: `uv run --directory ${resolve(here, 'server')} uvicorn panelist.app:app --port ${port}`,
    url: `http://localhost:${port}/healthz`,
    reuseExistingServer: false,
    timeout: 90_000,
    env: {
      APP_PASSWORD: E2E_PASSWORD,
      PANELIST_INSECURE_COOKIES: '1',
      DATA_DIR: dataDir,
      STATIC_DIR: resolve(here, 'dist'),
    },
  },
});
