import * as pdfjs from 'pdfjs-dist'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import { guardTextLayer } from './selectionGuard'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

export interface OutlineItem {
  title: string
  page: number | null
  level: number
}

export interface PageSize {
  width: number
  height: number
}

export class PdfDoc {
  private pageTextCache = new Map<number, string>()

  constructor(
    readonly proxy: PDFDocumentProxy,
    readonly pageSizes: PageSize[],
  ) {}

  get numPages(): number {
    return this.proxy.numPages
  }

  getPage(n: number): Promise<PDFPageProxy> {
    return this.proxy.getPage(n)
  }

  async getPageText(n: number): Promise<string> {
    const cached = this.pageTextCache.get(n)
    if (cached !== undefined) return cached
    const page = await this.getPage(n)
    const content = await page.getTextContent()
    const text = content.items
      .map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : '') : ''))
      .join(' ')
      .replace(/[ \t]+/g, ' ')
    this.pageTextCache.set(n, text)
    return text
  }

  async getAllPageTexts(onProgress?: (done: number, total: number) => void): Promise<string[]> {
    const texts: string[] = []
    for (let i = 1; i <= this.numPages; i++) {
      texts.push(await this.getPageText(i))
      onProgress?.(i, this.numPages)
    }
    return texts
  }

  async getOutline(): Promise<OutlineItem[]> {
    const raw = await this.proxy.getOutline()
    if (!raw) return []
    const items: OutlineItem[] = []
    const walk = async (nodes: typeof raw, level: number) => {
      for (const node of nodes) {
        items.push({ title: node.title, page: await this.resolveDest(node.dest), level })
        if (node.items?.length && level < 5) await walk(node.items, level + 1)
      }
    }
    await walk(raw, 0)
    return items
  }

  private async resolveDest(dest: string | unknown[] | null): Promise<number | null> {
    try {
      const explicit = typeof dest === 'string' ? await this.proxy.getDestination(dest) : dest
      const ref = explicit?.[0]
      if (ref == null) return null
      const index = await this.proxy.getPageIndex(ref as Parameters<PDFDocumentProxy['getPageIndex']>[0])
      return index + 1
    } catch {
      return null
    }
  }

  destroy(): void {
    void this.proxy.loadingTask.destroy()
  }
}

export async function loadDocument(bytes: ArrayBuffer): Promise<PdfDoc> {
  // pdf.js transfers the buffer to the worker; copy so IndexedDB bytes stay usable
  const proxy = await pdfjs.getDocument({ data: bytes.slice(0) }).promise
  const sizes: PageSize[] = []
  for (let i = 1; i <= proxy.numPages; i++) {
    const page = await proxy.getPage(i)
    const vp = page.getViewport({ scale: 1 })
    sizes.push({ width: vp.width, height: vp.height })
  }
  return new PdfDoc(proxy, sizes)
}

export function renderPageToCanvas(
  page: PDFPageProxy,
  canvas: HTMLCanvasElement,
  cssWidth: number,
): { promise: Promise<void>; cancel: () => void } {
  const dpr = Math.min(window.devicePixelRatio || 1, 3)
  const scale = cssWidth / page.getViewport({ scale: 1 }).width
  const viewport = page.getViewport({ scale: scale * dpr })
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)
  canvas.style.width = `${cssWidth}px`
  canvas.style.height = `${Math.floor(viewport.height / dpr)}px`
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no 2d context')
  const task = page.render({ canvas, canvasContext: ctx, viewport })
  return { promise: task.promise, cancel: () => task.cancel() }
}

export function isRenderCancel(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === 'RenderingCancelledException' || err.name === 'AbortException')
  )
}

export function renderTextLayer(
  page: PDFPageProxy,
  container: HTMLElement,
  cssWidth: number,
): { promise: Promise<void>; cancel: () => void } {
  const scale = cssWidth / page.getViewport({ scale: 1 }).width
  const viewport = page.getViewport({ scale })
  container.replaceChildren()
  container.style.setProperty('--total-scale-factor', String(scale))
  const layer = new pdfjs.TextLayer({
    textContentSource: page.streamTextContent(),
    container,
    viewport,
  })
  let unguard: (() => void) | undefined
  const promise = layer.render().then(() => {
    unguard = guardTextLayer(container)
  })
  return {
    promise,
    cancel: () => {
      layer.cancel()
      unguard?.()
    },
  }
}

export async function renderCoverDataUrl(doc: PdfDoc): Promise<string | undefined> {
  try {
    const page = await doc.getPage(1)
    const canvas = document.createElement('canvas')
    const scale = 360 / page.getViewport({ scale: 1 }).width
    const viewport = page.getViewport({ scale })
    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined
    await page.render({ canvas, canvasContext: ctx, viewport }).promise
    return canvas.toDataURL('image/jpeg', 0.82)
  } catch {
    return undefined
  }
}

export async function extractTitle(proxy: PDFDocumentProxy): Promise<string | undefined> {
  try {
    const { info } = await proxy.getMetadata()
    const title = (info as { Title?: string }).Title?.trim()
    return title || undefined
  } catch {
    return undefined
  }
}
