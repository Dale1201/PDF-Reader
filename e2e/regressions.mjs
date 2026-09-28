import { chromium } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const URL = 'http://localhost:5199'
const fails = []
const check = (name, cond) => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`)
  if (!cond) fails.push(name)
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

await page.goto(URL)
await page.waitForTimeout(500)

// clean slate: delete existing books via UI
while (await page.locator('.book-card').count()) {
  await page.keyboard.press('x')
  await page.waitForTimeout(150)
  await page.keyboard.press('x')
  await page.waitForTimeout(400)
}

// R6: corrupt file with .pdf extension -> error toast, no book added
const garbage = path.join(os.tmpdir(), 'garbage.pdf')
fs.writeFileSync(garbage, 'this is not a pdf at all')
let chooser = page.waitForEvent('filechooser')
await page.keyboard.press('o')
await (await chooser).setFiles(garbage)
await page.waitForTimeout(1500)
check('corrupt pdf shows error toast', (await page.locator('.toast-error').count()) >= 1)
check('corrupt pdf not added to library', (await page.locator('.book-card').count()) === 0)

// R3: dropping a non-PDF file -> error toast
await page.evaluate(() => {
  const dt = new DataTransfer()
  dt.items.add(new File(['hello'], 'notes.txt', { type: 'text/plain' }))
  window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }))
})
await page.waitForTimeout(600)
check('non-pdf drop shows error toast naming the file', (await page.locator('.toast-error').allTextContents()).some((t) => t.includes('notes.txt')))

// import the real sample
chooser = page.waitForEvent('filechooser')
await page.keyboard.press('o')
await (await chooser).setFiles(process.env.SAMPLE)
await page.waitForSelector('.book-card', { timeout: 15000 })

// R7: first open starts at the very top (page top below chrome)
await page.keyboard.press('Enter')
await page.waitForSelector('.page canvas', { timeout: 15000 })
await page.waitForTimeout(500)
const scrollTop0 = await page.evaluate(() => document.getElementById('reader-scroll').scrollTop)
check('first open starts at scrollTop 0', scrollTop0 === 0)

// R11/R12: text layer geometry matches the rendered glyphs, and selections paint nothing in the margin
await page.keyboard.press(':')
await page.waitForSelector('.goto input')
await page.keyboard.type('3')
await page.keyboard.press('Enter')
await page.waitForTimeout(1200)
const geo = await page.evaluate(() => {
  const pageEl = document.querySelector('.page[data-page="3"]')
  const spans = Array.from(pageEl.querySelectorAll('.textLayer span')).filter((s) => s.textContent.trim().length > 20)
  const pageBox = pageEl.getBoundingClientRect()
  const canvas = pageEl.querySelector('canvas')
  const ctx = canvas.getContext('2d')
  const k = canvas.width / canvas.getBoundingClientRect().width
  const mismatch = Math.max(...spans.slice(0, 6).map((s) => {
    const r = s.getBoundingClientRect()
    const y0 = Math.round((r.top - pageBox.top + r.height * 0.15) * k)
    const h = Math.max(1, Math.round(r.height * 0.85 * k))
    const img = ctx.getImageData(0, y0, canvas.width, h).data
    let inkRight = 0
    for (let x = 0; x < canvas.width; x++)
      for (let y = 0; y < h; y++) {
        const i = (y * canvas.width + x) * 4
        if (img[i] < 128 && img[i + 3] > 0) inkRight = Math.max(inkRight, x)
      }
    return Math.abs(r.right - pageBox.left - inkRight / k)
  }))
  const textLeft = Math.min(...spans.map((s) => s.getBoundingClientRect().left))
  return {
    mismatch: Math.round(mismatch),
    margin: { x: Math.round(pageBox.left) + 1, y: Math.round(spans[0].getBoundingClientRect().top), width: Math.round(textLeft - pageBox.left) - 10, height: 300 },
  }
})
check(`text spans align with rendered glyphs (off by ${geo.mismatch}px)`, geo.mismatch <= 6)
const marginBefore = await page.screenshot({ clip: geo.margin })
await page.evaluate(() => {
  const spans = Array.from(document.querySelectorAll('.page[data-page="3"] .textLayer span')).filter((s) => s.textContent.trim().length > 20)
  const range = document.createRange()
  range.setStart(spans[0].firstChild, 0)
  range.setEnd(spans[12].firstChild, spans[12].textContent.length)
  window.getSelection().removeAllRanges()
  window.getSelection().addRange(range)
})
await page.waitForTimeout(200)
const marginAfter = await page.screenshot({ clip: geo.margin })
check('selection paints nothing in the left margin', marginBefore.equals(marginAfter))
await page.evaluate(() => window.getSelection().removeAllRanges())
await page.keyboard.press('g')
await page.keyboard.press('g')
await page.waitForTimeout(600)

// R8: clicking an existing highlight opens its popover with Remove
const makeHighlight = async () => {
  await page.locator('.page[data-page="1"] .textLayer span', { hasText: 'Reading' }).first().dblclick()
  await page.waitForTimeout(250)
  await page.keyboard.press('1')
  await page.waitForTimeout(300)
}
const clickHighlight = async () => {
  const box = await page.locator('.highlight').first().boundingBox()
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await page.waitForTimeout(300)
}
await makeHighlight()
check('highlight created on page 1', (await page.locator('.highlight').count()) >= 1)
await clickHighlight()
check('clicking a highlight shows Remove', await page.locator('.selection-popover .popover-action.danger').isVisible())
await page.locator('.selection-popover .popover-action.danger').click()
await page.waitForTimeout(300)
check('Remove button deletes the highlight', (await page.locator('.highlight').count()) === 0)
await makeHighlight()
await clickHighlight()
await page.keyboard.press('x')
await page.waitForTimeout(300)
check('x deletes the clicked highlight', (await page.locator('.highlight').count()) === 0)

// R9: help overlay documents panel and library navigation keys
await page.keyboard.press('Shift+?')
await page.waitForSelector('.help')
const readerHelp = await page.locator('.help').innerText()
await page.keyboard.press('Escape')
check('reader help lists panel delete (x)', /Delete selected annotation/.test(readerHelp))
check('reader help lists panel navigation', /Move selection in panel/.test(readerHelp))
check('reader help lists highlight removal', /Remove clicked highlight/.test(readerHelp))

// R1: fit-page Space x3 -> three distinct page advances
await page.keyboard.press('p')
await page.waitForTimeout(500)
const status = async () =>
  parseInt((await page.locator('.reader-status span').first().textContent()).trim(), 10)
const seen = [await status()]
for (let i = 0; i < 3; i++) {
  await page.keyboard.press('Space')
  await page.waitForTimeout(650)
  seen.push(await status())
}
check(`space advances every press (${seen.join(' -> ')})`, seen[1] === seen[0] + 1 && seen[2] === seen[1] + 1 && seen[3] === seen[2] + 1)

// R1b: ] jumps forward each press, [ goes back exactly one
const a = await status()
await page.keyboard.press(']')
await page.waitForTimeout(650)
const b = await status()
await page.keyboard.press(']')
await page.waitForTimeout(650)
const c = await status()
await page.keyboard.press('[')
await page.waitForTimeout(650)
const d = await status()
check(`] ] [ walks pages (${a} -> ${b} -> ${c} -> ${d})`, b === a + 1 && c === b + 1 && d === c - 1)

// R4: hammer zoom, no page render error state
await page.keyboard.press('w')
await page.waitForTimeout(300)
for (let i = 0; i < 5; i++) await page.keyboard.press('+')
await page.waitForTimeout(1200)
check('no render-error placeholders after zoom hammer', (await page.locator('.page-error').count()) === 0)
check('no console errors after zoom hammer', errors.length === 0)

// R5: at wide zoom the left edge of the page is reachable
const leftReachable = await page.evaluate(() => {
  const el = document.getElementById('reader-scroll')
  el.scrollLeft = 0
  const rect = document.querySelector('.page').getBoundingClientRect()
  return rect.left >= 0
})
check('left edge reachable at wide zoom', leftReachable)

// R10: a layout change (panel close, window resize) during a jump must not cancel the jump
await page.keyboard.press('w')
await page.keyboard.press('g')
await page.keyboard.press('g')
await page.waitForTimeout(500)
await page.keyboard.press(':')
await page.waitForSelector('.goto input')
await page.keyboard.type('20')
await page.keyboard.press('Enter')
await page.waitForTimeout(40)
await page.setViewportSize({ width: 1180, height: 800 })
await page.waitForTimeout(1500)
check(`jump survives mid-scroll resize (landed on ${await status()})`, (await status()) === 20)
await page.setViewportSize({ width: 1280, height: 800 })
await page.waitForTimeout(400)

// R2: closing the book while it is still opening must not clobber position
await page.keyboard.press('0')
await page.waitForTimeout(300)
await page.keyboard.press(':')
await page.waitForSelector('.goto input')
await page.keyboard.type('15')
await page.keyboard.press('Enter')
await page.waitForFunction(() => document.querySelector('.reader-status span')?.textContent?.trim().startsWith('15'), undefined, { timeout: 5000 })
await page.waitForTimeout(900)
await page.keyboard.press('Escape') // back to library (flushes 15)
await page.waitForSelector('.book-card')
await page.keyboard.press('Enter') // start opening
await page.keyboard.press('Escape') // bail out immediately, before load settles
await page.waitForTimeout(800)
await page.keyboard.press('Enter') // open again
await page.waitForSelector('.page canvas', { timeout: 10000 })
await page.waitForTimeout(700)
check('position survives an aborted open', (await status()) === 15)

console.log('console errors:', errors.length ? errors : 'none')
console.log(fails.length ? `FAILURES: ${fails.join('; ')}` : 'ALL REGRESSION CHECKS PASSED')
await browser.close()
process.exit(fails.length ? 1 : 0)
