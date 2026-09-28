import { memo, useEffect, useRef, useState } from 'react'
import {
  isRenderCancel,
  renderPageToCanvas,
  renderTextLayer,
  type PdfDoc,
} from '../pdf/pdfService'
import type { PageLayout } from '../reader/layout'
import type { Bookmark, Highlight } from '../types'

interface Props {
  doc: PdfDoc
  pageNum: number
  layout: PageLayout
  highlights: Highlight[]
  bookmark?: Bookmark
  flashRect: { page: number; term: string } | null
  onNoteBadge: (h: Highlight, anchor: DOMRect) => void
}

export default memo(function PageView(props: Props) {
  const { doc, pageNum, layout, highlights, bookmark, flashRect, onNoteBadge } = props
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const jobRef = useRef<Promise<void>>(Promise.resolve())
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    const canvas = canvasRef.current
    const textEl = textRef.current
    if (!canvas || !textEl) return
    let cancelCanvas: (() => void) | undefined
    let cancelText: (() => void) | undefined
    let disposed = false
    const prev = jobRef.current
    // serialize renders per canvas: pdf.js forbids overlapping render() calls on one canvas
    jobRef.current = (async () => {
      await prev.catch(() => {})
      try {
        const page = await doc.getPage(pageNum)
        if (disposed) return
        const canvasTask = renderPageToCanvas(page, canvas, layout.width)
        cancelCanvas = canvasTask.cancel
        const textTask = renderTextLayer(page, textEl, layout.width)
        cancelText = textTask.cancel
        await Promise.all([canvasTask.promise, textTask.promise])
        if (!disposed) setFailed(false)
      } catch (err) {
        if (!disposed && !isRenderCancel(err)) setFailed(true)
      }
    })()
    return () => {
      disposed = true
      cancelCanvas?.()
      cancelText?.()
    }
  }, [doc, pageNum, layout.width, retry])

  // flash the search match by locating its text in the layer
  useEffect(() => {
    if (!flashRect || flashRect.page !== pageNum) return
    const textEl = textRef.current
    if (!textEl) return
    const timer = setTimeout(() => {
      const needle = flashRect.term.toLowerCase()
      const span = Array.from(textEl.querySelectorAll('span')).find((s) =>
        s.textContent?.toLowerCase().includes(needle),
      )
      span?.classList.add('is-flash')
      setTimeout(() => span?.classList.remove('is-flash'), 1600)
    }, 150)
    return () => clearTimeout(timer)
  }, [flashRect, pageNum])

  return (
    <div
      className="page"
      data-page={pageNum}
      style={{ top: layout.top, width: layout.width, height: layout.height }}
    >
      <canvas ref={canvasRef} />
      <div className="highlight-layer" aria-hidden="true">
        {highlights.map((h) =>
          h.rects.map((r, i) => (
            <div
              key={`${h.id}-${i}`}
              className={`highlight hl-${h.color}`}
              style={{
                left: `${r.x * 100}%`,
                top: `${r.y * 100}%`,
                width: `${r.w * 100}%`,
                height: `${r.h * 100}%`,
              }}
            />
          )),
        )}
      </div>
      <div className="textLayer" ref={textRef} />
      {highlights.map((h) =>
        h.note && h.rects[0] ? (
          <button
            key={`note-${h.id}`}
            className={`note-badge badge-${h.color}`}
            style={{ top: `${h.rects[0].y * 100}%` }}
            title={h.note}
            aria-label="Show note"
            onMouseUp={(e) => {
              e.stopPropagation()
              onNoteBadge(h, e.currentTarget.getBoundingClientRect())
            }}
          >
            <NoteGlyph />
          </button>
        ) : null,
      )}
      {bookmark && (
        <div
          className={`bookmark-ribbon${bookmark.note ? ' has-note' : ''}`}
          title={bookmark.note ?? 'Bookmarked'}
          aria-label="Bookmarked page"
        />
      )}
      {failed && (
        <div className="page-error">
          <span>Page {pageNum} failed to render</span>
          <button className="ghost-button" onClick={() => setRetry((r) => r + 1)}>
            Retry
          </button>
        </div>
      )}
    </div>
  )
})

function NoteGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M3 2.5h10a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H7l-3 2.5V11.5H3a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}
