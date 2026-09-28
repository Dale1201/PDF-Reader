import { chromium } from 'playwright'

const SCRATCH = '/private/tmp/claude-501/-Users-d-beniga-Documents-Repos-PDF-Reader/a906a1b4-ceb2-4e25-b533-2421ec1c695d/scratchpad'
const URL = 'http://localhost:5199'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(URL)
await page.waitForSelector('.library-empty', { timeout: 5000 })
await page.screenshot({ path: `${SCRATCH}/shot-01-empty.png` })

// import via 'o' -> file chooser
const chooser = page.waitForEvent('filechooser')
await page.keyboard.press('o')
await (await chooser).setFiles(`${SCRATCH}/sample-book.pdf`)
await page.waitForSelector('.book-card', { timeout: 15000 })
await page.screenshot({ path: `${SCRATCH}/shot-02-library.png` })

// open with Enter
await page.keyboard.press('Enter')
await page.waitForSelector('.page canvas', { timeout: 15000 })
await page.waitForTimeout(800)
await page.screenshot({ path: `${SCRATCH}/shot-03-reader.png` })

// navigate: space x3, check page indicator changes
const status = () => page.locator('.reader-status span').first().textContent()
console.log('page before:', await status())
for (let i = 0; i < 3; i++) { await page.keyboard.press('Space'); await page.waitForTimeout(350) }
console.log('page after 3x space:', await status())

// gg back to top
await page.keyboard.press('g'); await page.keyboard.press('g')
await page.waitForTimeout(400)
console.log('after gg:', await status())

// G to end
await page.keyboard.down('Shift'); await page.keyboard.press('G'); await page.keyboard.up('Shift')
await page.waitForTimeout(500)
console.log('after G:', await status())

// zoom + fit-page
await page.keyboard.press('p')
await page.waitForTimeout(600)
await page.screenshot({ path: `${SCRATCH}/shot-04-fitpage.png` })
await page.keyboard.press('w')
await page.waitForTimeout(400)

// theme cycle
await page.keyboard.press('t')
await page.waitForTimeout(300)
await page.screenshot({ path: `${SCRATCH}/shot-05-theme.png` })
console.log('theme:', await page.evaluate(() => document.documentElement.dataset.theme))
await page.keyboard.press('t')
await page.waitForTimeout(200)

// back to library, reopen -> position restored
await page.keyboard.press('Escape')
await page.waitForSelector('.book-card', { timeout: 5000 })
await page.keyboard.press('Enter')
await page.waitForSelector('.page canvas', { timeout: 10000 })
await page.waitForTimeout(600)
console.log('restored page:', await status())

// reload -> library persists
await page.reload()
await page.waitForSelector('.book-card', { timeout: 8000 })
console.log('persisted after reload: yes')

console.log('console errors:', errors.length ? errors : 'none')
await browser.close()
