import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 100_000,
  expect: { timeout: 20_000 },
  retries: 0,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'e2e-results/browser-results.json' }]],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'python -m uvicorn physiograph.live_api:app --host 127.0.0.1 --port 8000',
      cwd: '..',
      url: 'http://127.0.0.1:8000/api/live/health',
      env: {
        PHYSIOGRAPH_INFERENCE_BACKEND: 'numpy',
        PHYSIOGRAPH_AUTO_DEMO: '1',
        PHYSIOGRAPH_AUTO_DEMO_SPEED: '12',
        PHYSIOGRAPH_CORS_ORIGINS: 'http://127.0.0.1:5173',
      },
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 5173',
      url: 'http://127.0.0.1:5173/',
      env: { VITE_PHYSIOGRAPH_API_BASE: 'http://127.0.0.1:8000' },
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
});
