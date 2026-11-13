import { defineConfig } from '@playwright/test'

// End-to-end tests: open the real app in Chrome and click through it like a user.
export default defineConfig({
  testDir: 'e2e',
  // CI machines are slower and share CPUs: one retry, one worker.
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  // Software WebGL is slow; the full walkthrough needs room.
  timeout: 150_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: 'http://localhost:5173',
    channel: process.env.CI ? undefined : 'chrome',
    viewport: { width: 1400, height: 860 },
    // Software WebGL so the 3D view also renders in headless runs and CI.
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  webServer: { command: 'npm run dev', url: 'http://localhost:5173', reuseExistingServer: true, timeout: 60_000 },
})
