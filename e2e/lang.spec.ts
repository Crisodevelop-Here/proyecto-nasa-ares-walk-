import { expect, test } from '@playwright/test'

test('switches the whole interface to English and remembers it', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Ir a una misión')).toBeVisible()

  await page.getByRole('button', { name: 'English' }).click()
  await expect(page.getByText('Go to a mission')).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')

  await page
    .getByRole('button', { name: /Curiosity/ })
    .first()
    .click()
  await expect(page.getByRole('tab', { name: 'Missions' })).toBeVisible()
  await expect(page.getByText(/Regional view/i)).toBeVisible()
  await expect(page.getByText('Gale crater · Mount Sharp').first()).toBeVisible()
  await page.getByRole('tab', { name: 'Safety', exact: true }).click()
  await expect(page.getByText('Space weather: solar storm')).toBeVisible()
  await page.keyboard.press('3')
  await expect(page.getByText(/where can you go/i)).toBeVisible()

  // The choice survives a reload; switch back to Spanish.
  await page.reload()
  await expect(page.getByText('Go to a mission')).toBeVisible()
  await page.getByRole('button', { name: 'Español' }).click()
  await expect(page.getByText('Ir a una misión')).toBeVisible()
})
