import { expect, test } from '@playwright/test'
import { APP } from './app-url.ts'

test.use({ launchOptions: { args: ['--disable-3d-apis'] } })

test('without WebGL the app explains what to do instead of a blank page', async ({ page }) => {
  await page.goto(APP)
  await expect(page.getByRole('alert')).toContainText('Este equipo no puede mostrar 3D')
})
