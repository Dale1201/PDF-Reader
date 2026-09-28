import { chromium } from 'playwright'

const URL = 'http://localhost:5199'
const fails = []
const check = (name, cond) => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`)
  if (!cond) fails.push(name)
}
const soft = (p) => p.then(() => true).catch(() => false)

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: URL })
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

await page.goto(URL)
await page.waitForTimeout(500)
const chooser = page.waitForEvent('filechooser')
await page.keyboard.press('o')
await (await chooser).setFiles(process.env.SAMPLE)
await page.waitForSelector('.book-card', { timeout: 15000 })
await page.keyboard.press('Enter')
await page.waitForSelector('.page canvas', { timeout: 15000 })
await page.waitForTimeout(500)

// 0. a whitespace-only selection (double-click between words) must not become a highlight
await page.evaluate(() => {
  const span = Array.from(document.querySelectorAll('.page[data-page="1"] .textLayer span')).find((s) => s.textContent.includes(' '))
  const node = span.firstChild
  const i = node.textContent.indexOf(' ')
  const range = document.createRange()
  range.setStart(node, i)
  range.setEnd(node, i + 1)
  window.getSelection().removeAllRanges()
  window.getSelection().addRange(range)
  span.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
})
await page.waitForTimeout(250)
check('whitespace selection shows no popover', (await page.locator('.selection-popover').count()) === 0)
await page.keyboard.press('1')
await page.waitForTimeout(250)
check('whitespace selection is not highlightable', (await page.locator('.highlight').count()) === 0)
await page.evaluate(() => window.getSelection().removeAllRanges())

// 1. select text, e -> editor, type, cmd+enter -> highlight with note + margin badge
await page.locator('.page[data-page="1"] .textLayer span', { hasText: 'Reading' }).first().dblclick()
await page.waitForTimeout(250)
await page.keyboard.press('e')
check('e on a selection opens a focused note editor', await soft(page.waitForSelector('.selection-popover textarea:focus', { timeout: 2000 })))
await page.keyboard.type('first note')
await page.keyboard.press('Meta+Enter')
await page.waitForTimeout(300)
check('note saved creates a highlight', (await page.locator('.highlight').count()) >= 1)
check('highlight with note shows a margin badge', (await page.locator('.note-badge').count()) === 1)
check('editor closed after save', (await page.locator('.selection-popover textarea').count()) === 0)

// 2. clicking the badge shows the note
await page.locator('.note-badge').first().click()
await page.waitForTimeout(300)
check('badge click shows the note in the popover', (await page.locator('.selection-popover .popover-note').innerText().catch(() => '')).includes('first note'))

// 3. e edits existing note; clicking away saves
await page.keyboard.press('e')
await page.waitForSelector('.selection-popover textarea:focus', { timeout: 2000 })
check('editor is prefilled with the existing note', (await page.locator('.selection-popover textarea').inputValue()) === 'first note')
await page.keyboard.press('Meta+a')
await page.keyboard.type('edited note\nsecond line')
await page.mouse.click(20, 400)
await page.waitForTimeout(400)
check('clicking away closes the popover', (await page.locator('.selection-popover').count()) === 0)

// 4. annotations panel shows note; e edits; Esc cancels without closing the panel
await page.keyboard.press('a')
await page.waitForSelector('.sidebar')
const panelText = await page.locator('.sidebar').innerText()
check('panel shows the edited note', panelText.includes('edited note') && panelText.includes('second line'))
await page.keyboard.press('e')
check('e in panel opens an inline editor', await soft(page.waitForSelector('.sidebar textarea:focus', { timeout: 2000 })))
await page.keyboard.type(' DISCARD')
await page.keyboard.press('Escape')
await page.waitForTimeout(300)
check('Esc cancels the edit', !(await page.locator('.sidebar').innerText()).includes('DISCARD'))
check('Esc in the editor does not close the panel', await page.locator('.sidebar').isVisible())
await page.keyboard.press('Escape')
await page.waitForTimeout(200)

// 5. Shift+M adds a page note via a bookmark
await page.keyboard.press('Shift+M')
check('Shift+M opens a page-note editor in the panel', await soft(page.waitForSelector('.sidebar textarea:focus', { timeout: 2000 })))
await page.keyboard.type('page note')
await page.keyboard.press('Meta+Enter')
await page.waitForTimeout(300)
check('page note listed in panel', (await page.locator('.sidebar').innerText()).includes('page note'))
check('bookmarked page shows a ribbon', (await page.locator('.page[data-page="1"] .bookmark-ribbon').count()) === 1)
await page.keyboard.press('Escape')

// 6. persistence across reload
await page.waitForTimeout(700)
await page.reload()
await page.waitForSelector('.book-card', { timeout: 8000 })
await page.keyboard.press('Enter')
await page.waitForSelector('.page canvas', { timeout: 10000 })
await page.waitForTimeout(600)
await page.keyboard.press('a')
await page.waitForSelector('.sidebar')
const persisted = await page.locator('.sidebar').innerText()
check('notes persist across reload', persisted.includes('edited note') && persisted.includes('page note'))
await page.keyboard.press('Escape')

// 7. export as markdown
await page.keyboard.press('Meta+k')
await page.waitForSelector('.palette input')
await page.keyboard.type('markdown')
await page.waitForTimeout(250)
await page.keyboard.press('Enter')
await page.waitForTimeout(400)
const clip = await page.evaluate(() => navigator.clipboard.readText())
check('markdown export has quote and notes', clip.startsWith('# ') && clip.includes('> ') && clip.includes('edited note') && clip.includes('page note'))

// 8. clearing a note removes the badge but keeps the highlight
await page.locator('.note-badge').first().click()
await page.waitForTimeout(300)
await page.keyboard.press('e')
await page.waitForSelector('.selection-popover textarea:focus', { timeout: 2000 })
await page.keyboard.press('Meta+a')
await page.keyboard.press('Backspace')
await page.keyboard.press('Meta+Enter')
await page.waitForTimeout(300)
check('clearing a note removes the badge', (await page.locator('.note-badge').count()) === 0)
check('clearing a note keeps the highlight', (await page.locator('.highlight').count()) >= 1)

// 9. toasts do not linger
await page.waitForTimeout(4000)
check('toasts auto-dismiss', (await page.locator('.toast').count()) === 0)

await page.screenshot({ path: `${process.env.SHOT_DIR ?? '/tmp'}/notes-final.png` })
console.log('console errors:', errors.length ? errors : 'none')
check('no console errors', errors.length === 0)
console.log(fails.length ? `FAILURES: ${fails.join('; ')}` : 'ALL NOTES CHECKS PASSED')
await browser.close()
process.exit(fails.length ? 1 : 0)
