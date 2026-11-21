import { defineConfig, devices } from '@playwright/test';

const all = !!process.env.CI;
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  retries: all ? 1 : 0,
  reporter: all ? 'github' : 'list',
  use: { baseURL: 'http://127.0.0.1:4173', locale: 'ar', timezoneId: 'Asia/Gaza', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run build && npx vite preview --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !all,
    timeout: 120_000,
    env: { VITE_API_URL: 'https://api.mawred.test', VITE_FIREBASE_API_KEY: 'test-key', VITE_FIREBASE_AUTH_DOMAIN: 'mawred.test', VITE_FIREBASE_PROJECT_ID: 'mawred-test' },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    ...(all ? [{ name: 'firefox', use: { ...devices['Desktop Firefox'] } }, { name: 'webkit', use: { ...devices['iPhone 14'] } }] : []),
  ],
});
