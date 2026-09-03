import { defineConfig } from '@playwright/test'

/**
 * Behavioral regression suite: drives the playground demos against real
 * models in headless Chromium and asserts the facts each demo reports.
 *
 * pnpm e2e            light suite (no >80MB downloads)
 * pnpm e2e:heavy      everything, including kokoro and clip
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5299',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // fake media devices so mic paths have an input without permission prompts
    launchOptions: {
      args: [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        '--autoplay-policy=no-user-gesture-required',
      ],
    },
  },
  webServer: {
    command: 'pnpm --filter playground exec vite --port 5299 --strictPort',
    url: 'http://localhost:5299',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
