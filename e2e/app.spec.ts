import { expect, test } from '@playwright/test'

test('globe → Gale crater → tabs, layers and back', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'ARES·WALK' })).toBeVisible()
  await expect(page.getByText('Ir a una misión')).toBeVisible()

  // Jump to Curiosity's landing site.
  await page
    .getByRole('button', { name: /Curiosity/ })
    .first()
    .click()
  await expect(page.getByText(/Cráter Gale/).first()).toBeVisible()
  await expect(page.getByText(/VISTA REGIONAL/i)).toBeVisible()

  // Side panel tabs.
  for (const tab of ['Objetivos', 'Ruta', 'Seguridad', 'Misiones']) {
    await page.getByRole('button', { name: tab, exact: true }).click()
  }
  await page.getByRole('button', { name: 'Objetivos', exact: true }).click()
  await expect(page.getByText(/tipos de datos integrados/i)).toBeVisible()

  // Layer shortcut: 3 = slope legend.
  await page.keyboard.press('3')
  await expect(page.getByText(/por dónde se puede ir/i)).toBeVisible()

  // Esc goes back to the globe.
  await page.keyboard.press('Escape')
  await expect(page.getByText('Ir a una misión')).toBeVisible()

  expect(errors).toEqual([])
})
