import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { APP } from './app-url.ts'

// NASA's raw-image feeds refuse automated browsers, so the test serves a fixed feed and a local image
// instead of calling NASA. It checks the gallery and the photo viewer, not NASA's servers.
const JPG = readFileSync(new URL('../public/terrain/ortho.jpg', import.meta.url))
const feed = {
  images: Array.from({ length: 4 }, (_, i) => ({
    imageid: `TEST_${i}`,
    sol: 2031,
    date_taken_utc: '2026-11-06T12:16:25.848',
    sample_type: 'Full',
    camera: { instrument: i % 2 ? 'NAVCAM_LEFT' : 'MCZ_LEFT' },
    image_files: { small: `https://mars.nasa.gov/test/${i}_320.jpg`, large: `https://mars.nasa.gov/test/${i}_1200.jpg` },
    link: `https://mars.nasa.gov/mars2020/multimedia/raw-images/TEST_${i}`,
    credit: 'NASA/JPL-Caltech',
  })),
}

test('latest Perseverance photos: gallery and viewer', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.route('https://mars.nasa.gov/rss/api/**', (r) => r.fulfill({ json: feed, headers: { 'access-control-allow-origin': '*' } }))
  await page.route('https://mars.nasa.gov/test/**', (r) => r.fulfill({ body: JPG, contentType: 'image/jpeg' }))
  await page.goto(APP)

  await page
    .getByRole('button', { name: /Perseverance/ })
    .first()
    .click()
  await expect(page.getByText('Fotos más recientes desde Marte')).toBeVisible()
  const thumbs = page.getByRole('button', { name: /sol 2031/ })
  await expect(thumbs).toHaveCount(4)

  // Open the second photo, step forward with the arrow key, close with Esc.
  await thumbs.nth(1).click()
  const viewer = page.getByRole('dialog', { name: /Foto de Perseverance/ })
  await expect(viewer).toBeVisible()
  await expect(viewer.getByText('2 / 4')).toBeVisible()
  await expect(viewer.getByText('Cámara para conducir')).toBeVisible()
  await page.keyboard.press('ArrowRight')
  await expect(viewer.getByText('3 / 4')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(viewer).toBeHidden()
  // Esc closed only the viewer: the place is still open.
  await expect(page.getByText('Fotos más recientes desde Marte')).toBeVisible()

  expect(errors).toEqual([])
})
