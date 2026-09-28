import { chromium } from 'playwright'

const URL = 'http://localhost:5199'
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

// lines of page 3, grouped by vertical position
const lines = await page.evaluate(() => {
  const spans = Array.from(document.querySelectorAll('.page[data-page="3"] .textLayer span')).filter((s) => s.textContent.trim())
  const rows = []
  for (const s of spans) {
    const r = s.getBoundingClientRect()
    const row = rows.find((x) => Math.abs(x.top - r.top) < 2)
    if (row) { row.left = Math.min(row.left, r.left); row.right = Math.max(row.right, r.right); row.bottom = Math.max(row.bottom, r.bottom) }
    else rows.push({ top: r.top, bottom: r.bottom, left: r.left, right: r.right })
  }
  return rows.sort((a, b) => a.top - b.top)
})
// first paragraph break: a line gap clearly larger than the normal leading
const gaps = lines.slice(1).map((l, i) => l.top - lines[i].bottom)
const gi = gaps.findIndex((g) => g > Math.min(...gaps) * 3)
const a = lines[gi - 1], gapTop = lines[gi].bottom, gapBottom = lines[gi + 1].top
const selLen = () => page.evaluate(() => document.getSelection().toString().length)
const pageLen = await page.evaluate(() => document.querySelector('.page[data-page="3"] .textLayer').textContent.length)

const clearSelection = async () => {
  await page.evaluate(() => document.getSelection().removeAllRanges())
  await page.mouse.click(8, 400)
  await page.waitForTimeout(100)
}
const dragFromLine = async (x, y, from = a) => {
  await page.mouse.move(from.left + 40, (from.top + from.bottom) / 2)
  await page.mouse.down()
  await page.mouse.move((from.left + from.right) / 2, (from.top + from.bottom) / 2, { steps: 5 })
  await page.mouse.move(x, y, { steps: 10 })
  const len = await selLen()
  await page.mouse.up()
  await page.waitForTimeout(100)
  return len
}
const lastLine = lines[gi]
const probes = [
  ['gap between paragraphs', (lastLine.left + lastLine.right) / 2, (gapTop + gapBottom) / 2, false],
  ['right of a short last line', lastLine.right + 60, (lastLine.top + lastLine.bottom) / 2, false],
  ['gap while the previous popover is open', (lastLine.left + lastLine.right) / 2, (gapTop + gapBottom) / 2, true],
  ['the previous popover itself', 0, 0, 'cross'],
]
let bad = 0
for (const [name, x, y, keepPopover] of probes) {
  if (keepPopover) {
    await clearSelection()
    await dragFromLine(lastLine.left + 200, (lastLine.top + lastLine.bottom) / 2)
    if (!(await page.locator('.selection-popover').isVisible())) throw new Error('setup: popover did not open')
  } else {
    await clearSelection()
    if (await page.locator('.selection-popover').count()) throw new Error('setup: popover still open')
  }
  // start away from any existing selection, or Chrome drags the selected text instead
  let target = [x, y]
  if (keepPopover === 'cross') {
    const box = await page.locator('.selection-popover').boundingBox()
    target = [box.x + box.width / 2, box.y + box.height / 2]
  }
  const len = await dragFromLine(...target, keepPopover ? lines[gi - 2] : a)
  const ok = len > 0 && len < 300
  if (!ok) bad++
  console.log(`${ok ? 'PASS' : 'FAIL'} drag into ${name}: selected ${len} chars (page has ${pageLen})`)
}
await browser.close()
process.exit(bad ? 1 : 0)
