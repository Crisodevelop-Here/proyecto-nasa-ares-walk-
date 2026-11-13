/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Unit tests live next to the code; the browser end-to-end tests in e2e/ run with Playwright.
  test: { include: ['src/**/*.test.ts'] },
})
