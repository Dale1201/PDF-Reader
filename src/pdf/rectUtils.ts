import type { Highlight, NormRect } from '../types'

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

export function clientRectsToNormRects(
  rects: Iterable<DOMRect>,
  pageRect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
): NormRect[] {
  const out: NormRect[] = []
  for (const r of rects) {
    if (r.width <= 0 || r.height <= 0) continue
    const x = clamp01((r.left - pageRect.left) / pageRect.width)
    const y = clamp01((r.top - pageRect.top) / pageRect.height)
    const x2 = clamp01((r.left + r.width - pageRect.left) / pageRect.width)
    const y2 = clamp01((r.top + r.height - pageRect.top) / pageRect.height)
    if (x2 - x <= 0 || y2 - y <= 0) continue
    out.push({ x, y, w: x2 - x, h: y2 - y })
  }
  return mergeAdjacentRects(out)
}

export function mergeAdjacentRects(rects: NormRect[]): NormRect[] {
  const sorted = [...rects].sort((a, b) => a.y - b.y || a.x - b.x)
  const merged: NormRect[] = []
  for (const r of sorted) {
    const last = merged[merged.length - 1]
    const sameLine = last && Math.abs(last.y - r.y) < Math.min(last.h, r.h) * 0.5
    const touching = sameLine && r.x <= last.x + last.w + 0.01
    if (sameLine && touching) {
      const right = Math.max(last.x + last.w, r.x + r.w)
      const bottom = Math.max(last.y + last.h, r.y + r.h)
      last.x = Math.min(last.x, r.x)
      last.y = Math.min(last.y, r.y)
      last.w = right - last.x
      last.h = bottom - last.y
    } else {
      merged.push({ ...r })
    }
  }
  return merged
}

export function findHighlightAt(
  highlights: Highlight[],
  page: number,
  x: number,
  y: number,
): Highlight | undefined {
  let best: Highlight | undefined
  for (const h of highlights) {
    if (h.page !== page) continue
    const hit = h.rects.some((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)
    if (hit && (!best || h.createdAt >= best.createdAt)) best = h
  }
  return best
}
