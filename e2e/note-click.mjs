import { chromium } from 'playwright'

const URL = 'http://localhost:5199'
const fails = []
const check = (name, cond) => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`)
  if (!cond) fails.push(name)
}
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
await page.goto(URL)
await page.waitForTimeout(500)
while (await page.locator('.book-card').count()) {
  await page.keyboard.press('x')
  await page.waitForTimeout(150)
  await page.keyboard.press('x')
  await page.waitForTimeout(400)
}
const chooser = page.waitForEvent('filechooser')
await page.keyboard.press('o')
await (await chooser).setFiles(process.env.SAMPLE)
await page.waitForSelector('.book-card', { timeout: 15000 })
await page.keyboard.press('Enter')
await page.waitForSelector('.page canvas', { timeout: 15000 })
await page.keyboard.press(':')
await page.waitForSelector('.goto input')
await page.keyboard.type('3')
await page.keyboard.press('Enter')
await page.waitForTimeout(1500)

const span = page.locator('.page[data-page="3"] .textLayer span').filter({ hasText: /.{40}/ })
const dragSelect = async (i) => {
  const box = await span.nth(i).boundingBox()
  await page.mouse.move(box.x + 80, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2, { steps: 8 })
  await page.mouse.up()
  await page.waitForSelector('.selection-popover')
  return box
}
const clickNote = () => page.locator('.selection-popover .popover-action', { hasText: /note/i }).click()

// 1. fresh selection -> click Note
await dragSelect(0)
await clickNote()
await page.waitForTimeout(300)
check('Note on a fresh selection opens the editor', await page.locator('.selection-popover textarea').isVisible())
await page.keyboard.press('Escape')
await page.waitForTimeout(200)
if (await page.locator('.selection-popover').count()) await page.keyboard.press('Escape')
await page.waitForTimeout(200)

// 2. existing highlight -> click it -> click Note
const box = await dragSelect(2)
await page.keyboard.press('1')
await page.waitForTimeout(300)
await page.mouse.click(box.x + box.width * 0.4, box.y + box.height / 2)
await page.waitForSelector('.selection-popover')
await clickNote()
await page.waitForTimeout(300)
check('Note on a clicked highlight opens the editor', await page.locator('.selection-popover textarea').isVisible())
if (await page.locator('.selection-popover textarea').isVisible()) {
  await page.keyboard.type('clicked note')
  await page.keyboard.press('Meta+Enter')
  await page.waitForTimeout(300)
  check('note saved from clicked highlight shows a badge', (await page.locator('.note-badge').count()) >= 1)
}

await browser.close()
process.exit(fails.length ? 1 : 0)
