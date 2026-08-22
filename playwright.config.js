import { defineConfig } from '@playwright/test';
import { execFileSync } from 'node:child_process';

const baseURL = 'http://127.0.0.1:4173';
const e2ePassword = process.env.E2E_APP_PASSWORD || 'tanach-browser-test-password';
const e2eSchema = process.env.E2E_SCHEMA;
const systemChromium = process.env.PLAYWRIGHT_CHROMIUM_PATH || (() => {
  try {
    return execFileSync('sh', ['-c', 'command -v chromium'], { encoding: 'utf8' }).trim();
  } catch {
    return undefined;
  }
})();
const launchOptions = systemChromium ? { executablePath: systemChromium } : {};

if (!/^tanach_reader_e2e_\d+$/.test(e2eSchema || '')) {
  throw new Error('Run the browser suite with npm run test:e2e so its isolated database schema is prepared.');
}

export default defineConfig({
  testDir: './tests',
  testMatch: ['**/*.e2e.test.js', '**/*.spec.js'],
  timeout: 90_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: 'line',
  use: {
    baseURL,
    locale: 'he-IL',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: `${baseURL}/api/auth/check`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      ...process.env,
      APP_PASSWORD: e2ePassword,
      SESSION_SECRET: 'tanach-browser-test-session-secret',
      PGOPTIONS: `-c search_path=${e2eSchema}`,
      VITE_PORT: '4173',
      API_PORT: '4174',
    },
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: {
        browserName: 'chromium',
        viewport: { width: 1440, height: 900 },
        launchOptions,
      },
    },
    {
      name: 'mobile-chromium',
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        launchOptions,
      },
    },
  ],
});