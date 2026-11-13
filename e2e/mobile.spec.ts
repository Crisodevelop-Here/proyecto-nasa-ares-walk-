import { expect, test } from '@playwright/test'
import { APP } from './app-url.ts'

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

test('phone: mission shortcuts, foldable panel and no horizontal overflow', async ({ page }) => {
  await page.goto(APP)
  await page
    .getByRole('button', { name: /Curiosity/ })
    .first()
    .tap()
  await expect(page.getByRole('tablist')).toBeVisible()

  // Fold the panel to see the map, then open it again.
  await page.getByRole('button', { name: 'Ocultar el panel' }).tap()
  await expect(page.getByRole('tablist')).toBeHidden()
  await page.getByRole('button', { name: 'Mostrar el panel' }).tap()
  await expect(page.getByRole('tablist')).toBeVisible()

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})
