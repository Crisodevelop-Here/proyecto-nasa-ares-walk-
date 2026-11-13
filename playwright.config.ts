import { defineConfig } from '@playwright/test'

// End-to-end tests: open the real app in Chrome and click through it like a user.
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
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
