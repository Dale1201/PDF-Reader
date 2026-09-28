import { memo, useEffect, useRef, useState } from 'react'
import { isRenderCancel, renderPageToCanvas, type PdfDoc } from '../pdf/pdfService'

interface Props {
  doc: PdfDoc
  currentPage: number
  selected: number
  onJump: (page: number) => void
}

export default function ThumbsPanel({ doc, currentPage, selected, onJump }: Props) {
  return (
    <div className="thumbs">
      {doc.pageSizes.map((s, i) => (
        <Thumb
          key={i}
          doc={doc}
          pageNum={i + 1}
          aspect={s.height / s.width}
          index={i}
          active={currentPage === i + 1}
          selected={selected === i}
          onJump={onJump}
        />
      ))}
    </div>
  )
}

const Thumb = memo(function Thumb(props: {
  doc: PdfDoc
  pageNum: number
  aspect: number
  index: number
  active: boolean
  selected: boolean
  onJump: (page: number) => void
}) {
  const { doc, pageNum, aspect, index, active, selected, onJump } = props
  const ref = useRef<HTMLButtonElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [visible, setVisible] = useState(false)
  const rendered = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => entries[0].isIntersecting && setVisible(true),
      { rootMargin: '200px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (!visible || rendered.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    rendered.current = true
    let cancel: (() => void) | undefined
    void (async () => {
      try {
        const page = await doc.getPage(pageNum)
        const task = renderPageToCanvas(page, canvas, 104)
        cancel = task.cancel
        await task.promise
      } catch (err) {
        if (!isRenderCancel(err)) rendered.current = false
      }
    })()
    return () => cancel?.()
  }, [visible, doc, pageNum])

  return (
    <button
      ref={ref}
      data-i={index}
      className={`thumb${active ? ' is-active' : ''}${selected ? ' is-selected' : ''}`}
      onClick={() => onJump(pageNum)}
    >
      <div className="thumb-canvas" style={{ height: Math.round(104 * aspect) }}>
        <canvas ref={canvasRef} />
      </div>
      <span className="thumb-num">{pageNum}</span>
    </button>
  )
})
