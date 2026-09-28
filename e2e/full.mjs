import { chromium } from 'playwright'

const SCRATCH = process.env.SHOT_DIR ?? '/tmp'
const URL = 'http://localhost:5199'
const fails = []
const check = (name, cond) => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`)
  if (!cond) fails.push(name)
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(URL)
await page.waitForTimeout(500)

// fresh state: delete any existing book via UI later; import if empty
if (await page.locator('.library-empty').isVisible().catch(() => false)) {
  const chooser = page.waitForEvent('filechooser')
  await page.keyboard.press('o')
  await (await chooser).setFiles(`${process.env.SAMPLE}`)
}
await page.waitForSelector('.book-card', { timeout: 15000 })

// open book
await page.keyboard.press('Enter')
await page.waitForSelector('.page canvas', { timeout: 15000 })
await page.waitForTimeout(600)

// --- TOC ---
await page.keyboard.press('c')
await page.waitForSelector('.sidebar', { timeout: 3000 })
await page.waitForTimeout(400)
check('TOC lists chapters', (await page.locator('.sidebar-item').count()) >= 5)
await page.screenshot({ path: `${SCRATCH}/f-01-toc.png` })
// navigate TOC with j/enter
await page.keyboard.press('j')
await page.keyboard.press('j')
await page.keyboard.press('Enter')
await page.waitForTimeout(700)
const status1 = await page.locator('.reader-status span').first().textContent()
check('TOC jump moved pages', status1 !== '1 / 26')
await page.keyboard.press('Escape')
check('Esc closes sidebar', !(await page.locator('.sidebar').isVisible()))

// --- thumbnails ---
await page.keyboard.press('b')
await page.waitForTimeout(600)
check('thumbnails render', (await page.locator('.thumb').count()) === 26)
await page.screenshot({ path: `${SCRATCH}/f-02-thumbs.png` })
await page.keyboard.press('b')

// --- search ---
await page.keyboard.press('/')
await page.waitForSelector('.search-overlay input', { timeout: 2000 })
await page.keyboard.type('Navigating Large')
await page.waitForTimeout(1200)
check('search finds matches', (await page.locator('.search-result').count()) >= 1)
await page.screenshot({ path: `${SCRATCH}/f-03-search.png` })
await page.keyboard.press('Enter')
const flashed = await page.waitForSelector('.textLayer span.is-flash', { timeout: 4000 }).then(() => true).catch(() => false)
check('search jump flashed the match', flashed)
await page.waitForTimeout(600)

// --- highlight: select a word via dblclick on text layer ---
const span = page.locator('.page .textLayer span', { hasText: 'searchable' }).first()
await span.dblclick()
await page.waitForTimeout(300)
check('selection popover appears', await page.locator('.selection-popover').isVisible())
await page.keyboard.press('2')
await page.waitForTimeout(400)
check('highlight created', (await page.locator('.highlight.hl-green').count()) >= 1)
await page.screenshot({ path: `${SCRATCH}/f-04-highlight.png` })

// --- bookmark ---
await page.keyboard.press('m')
await page.waitForTimeout(300)
check('bookmark toast', (await page.locator('.toast').textContent())?.includes('Bookmarked'))

// --- annotations panel ---
await page.keyboard.press('a')
await page.waitForTimeout(400)
check('annotations panel lists both', (await page.locator('.sidebar-item.annotation').count()) >= 2)
await page.screenshot({ path: `${SCRATCH}/f-05-annotations.png` })
await page.keyboard.press('Escape')

// --- goto ---
await page.keyboard.press(':')
await page.waitForSelector('.goto input', { timeout: 2000 })
await page.keyboard.type('20')
await page.keyboard.press('Enter')
const onPage20 = await page.waitForFunction(
  () => document.querySelector('.reader-status span')?.textContent?.trim().startsWith('20'),
  undefined, { timeout: 5000 },
).then(() => true).catch(() => false)
check('goto page 20', onPage20)

// --- palette ---
await page.keyboard.press('Meta+k')
await page.waitForSelector('.palette input', { timeout: 2000 })
await page.screenshot({ path: `${SCRATCH}/f-06-palette.png` })
await page.keyboard.type('fit page')
await page.waitForTimeout(300)
await page.keyboard.press('Enter')
await page.waitForTimeout(600)
check('palette closed after run', !(await page.locator('.palette').isVisible()))
await page.screenshot({ path: `${SCRATCH}/f-07-fitpage.png` })

// --- help ---
await page.keyboard.press('Shift+?')
await page.waitForTimeout(300)
check('help overlay shows groups', (await page.locator('.help-columns section').count()) >= 4)
await page.screenshot({ path: `${SCRATCH}/f-08-help.png` })
await page.keyboard.press('Escape')

// --- n cycles search matches ---
await page.keyboard.press('n')
await page.waitForTimeout(400)
check('n cycles matches', (await page.locator('.toast').last().textContent())?.includes('Match'))

// --- persistence of highlight after reload ---
// wait until scrolling settles and the save debounce has fired
await page.waitForFunction(() => new Promise((res) => {
  const el = document.getElementById('reader-scroll')
  const a = el.scrollTop
  setTimeout(() => res(el.scrollTop === a), 300)
}), undefined, { timeout: 8000 })
await page.waitForTimeout(800)
const pageBeforeReload = (await page.locator('.reader-status span').first().textContent())?.trim()
await page.reload()
await page.waitForSelector('.book-card', { timeout: 8000 })
await page.keyboard.press('Enter')
await page.waitForSelector('.page canvas', { timeout: 10000 })
await page.waitForTimeout(800)
check('reopens at same page', (await page.locator('.reader-status span').first().textContent())?.trim() === pageBeforeReload)
await page.keyboard.press('a')
await page.waitForTimeout(400)
check('annotations persist', (await page.locator('.sidebar-item.annotation').count()) >= 2)
await page.keyboard.press('Escape')

// --- delete flow in library ---
await page.keyboard.press('Escape')
await page.waitForSelector('.book-card', { timeout: 4000 })
await page.keyboard.press('x')
await page.waitForTimeout(200)
check('delete confirm shown', (await page.locator('.book-meta .danger').count()) === 1)
await page.keyboard.press('x')
await page.waitForTimeout(600)
check('book deleted', await page.locator('.library-empty').isVisible())
await page.screenshot({ path: `${SCRATCH}/f-09-empty.png` })

console.log('console errors:', errors.length ? errors : 'none')
console.log(fails.length ? `FAILURES: ${fails.join('; ')}` : 'ALL CHECKS PASSED')
await browser.close()
process.exit(fails.length ? 1 : 0)
