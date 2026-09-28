import { chromium } from 'playwright'

const URL = 'http://localhost:5199'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
page.on('console', (m) => console.log('[console]', m.type(), m.text().slice(0, 300)))
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 500)))

await page.goto(URL)
await page.waitForTimeout(400)
if (await page.locator('.library-empty').isVisible().catch(() => false)) {
  const chooser = page.waitForEvent('filechooser')
  await page.keyboard.press('o')
  await (await chooser).setFiles(process.env.SAMPLE)
}
await page.waitForSelector('.book-card', { timeout: 15000 })
await page.keyboard.press('Enter')
await page.waitForSelector('.page canvas', { timeout: 15000 })
await page.waitForTimeout(500)

// 1) search diagnostics
await page.keyboard.press('/')
await page.waitForSelector('.search-overlay input')
await page.keyboard.type('grep-target')
await page.waitForTimeout(2500)
console.log('search count text:', await page.locator('.search-count').textContent())
console.log('results:', await page.locator('.search-result').count())
await page.keyboard.press('Escape')
await page.waitForTimeout(200)

// 2) highlight diagnostics
const span = page.locator('.page .textLayer span', { hasText: 'searchable' }).first()
console.log('span count w/ searchable:', await page.locator('.page .textLayer span', { hasText: 'searchable' }).count())
await span.dblclick()
await page.waitForTimeout(300)
console.log('popover visible:', await page.locator('.selection-popover').isVisible())
console.log('selection text:', await page.evaluate(() => window.getSelection()?.toString()))
await page.keyboard.press('2')
await page.waitForTimeout(500)
console.log('highlights in dom:', await page.locator('.highlight').count())

// 3) bookmark
await page.keyboard.press('m')
await page.waitForTimeout(500)
console.log('toasts:', await page.locator('.toast').count(), await page.locator('.toast').allTextContents())

await browser.close()
