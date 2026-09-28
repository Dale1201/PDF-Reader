import type { PageSize } from '../pdf/pdfService'
import type { BookState } from '../types'

export interface PageLayout {
  width: number
  height: number
  top: number
}

export const PAGE_GAP = 16
export const GUTTER_X = 112
export const PAD_TOP = 64
export const PAD_BOTTOM = 48
const FIT_WIDTH_MAX = 1600
const FIT_PAGE_MARGIN_Y = 48

export function computeLayouts(
  sizes: PageSize[],
  mode: BookState['zoomMode'],
  zoom: number,
  containerWidth: number,
  containerHeight: number,
): { layouts: PageLayout[]; totalHeight: number } {
  const layouts: PageLayout[] = []
  let top = PAD_TOP
  for (const s of sizes) {
    let width: number
    if (mode === 'fit-width') {
      width = Math.min(containerWidth - GUTTER_X, FIT_WIDTH_MAX)
    } else if (mode === 'fit-page') {
      const scale = Math.min(
        (containerWidth - GUTTER_X) / s.width,
        (containerHeight - FIT_PAGE_MARGIN_Y) / s.height,
      )
      width = s.width * scale
    } else {
      width = s.width * zoom
    }
    width = Math.max(Math.round(width), 100)
    const height = Math.round((width / s.width) * s.height)
    layouts.push({ width, height, top })
    top += height + PAGE_GAP
  }
  return { layouts, totalHeight: top - PAGE_GAP + PAD_BOTTOM }
}

export function visibleRange(
  layouts: PageLayout[],
  scrollTop: number,
  viewportHeight: number,
  bufferPages: number,
): [number, number] {
  if (layouts.length === 0) return [0, -1]
  let first = layouts.findIndex((l) => l.top + l.height >= scrollTop)
  if (first === -1) first = layouts.length - 1
  let last = first
  while (last + 1 < layouts.length && layouts[last + 1].top < scrollTop + viewportHeight) last++
  first = Math.max(0, first - bufferPages)
  last = Math.min(layouts.length - 1, last + bufferPages)
  return [first, last]
}
