import { expect, test } from '@playwright/test'
import { APP } from './app-url.ts'

test('globe → Gale crater → tabs, layers and back', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto(APP)

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
    await page.getByRole('tab', { name: tab, exact: true }).click()
  }
  await page.getByRole('tab', { name: 'Objetivos', exact: true }).click()
  await expect(page.getByRole('tab', { name: 'Objetivos' })).toHaveAttribute('aria-selected', 'true')
  // Arrow keys move between tabs.
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'Ruta' })).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByText(/tipos de datos integrados/i)).toBeVisible()

  // Layer shortcut: 3 = slope legend.
  await page.keyboard.press('3')
  await expect(page.getByText(/por dónde se puede ir/i)).toBeVisible()
  // 4 = USGS geology legend.
  await page.keyboard.press('4')
  await expect(page.getByText(/de qué está hecho el suelo/i)).toBeVisible()
  // 5 = radiation legend.
  await page.keyboard.press('5')
  await expect(page.getByText(/dónde hay más protección/i)).toBeVisible()

  // Guided rover traverse: start it, switch cameras, leave it.
  await page.getByRole('button', { name: /Recorrer la ruta en rover/ }).click()
  for (const cam of ['Cabina', 'Dron', 'Seguir']) await page.getByRole('button', { name: cam, exact: true }).click({ force: true })
  // Astronaut silhouette instead of the rover.
  const astro = page.getByRole('button', { name: /Astronauta/ })
  await astro.click({ force: true })
  await expect(astro).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText(/A pie · ruta para el traje/i)).toBeVisible()
  await expect(page.getByText(/de caminata/i)).toBeVisible()
  await page.waitForTimeout(1500)
  await page.getByRole('button', { name: 'Salir', exact: true }).click({ force: true })
  await expect(page.getByRole('button', { name: /Recorrer la ruta en rover/ })).toBeVisible()

  // Esc goes back to the globe.
  await page.keyboard.press('Escape')
  await expect(page.getByText('Ir a una misión')).toBeVisible()

  expect(errors).toEqual([])
})
