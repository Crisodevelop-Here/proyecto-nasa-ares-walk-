import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

// Automatic accessibility audit (axe-core, WCAG 2.1 A/AA) of the globe and the regional view.
const scan = (page: import('@playwright/test').Page) => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()

test('globe and regional view have no WCAG A/AA violations', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Ir a una misión')).toBeVisible()
  await page.waitForTimeout(1500)
  const globe = await scan(page)
  expect(globe.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([])

  await page
    .getByRole('button', { name: /Curiosity/ })
    .first()
    .click()
  await expect(page.getByRole('tablist')).toBeVisible()
  await page.waitForTimeout(1500)
  const region = await scan(page)
  expect(region.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([])
})
