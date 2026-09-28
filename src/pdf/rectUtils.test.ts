import { describe, expect, test } from 'vitest'
import { clientRectsToNormRects, findHighlightAt, mergeAdjacentRects } from './rectUtils'

const pageRect = { left: 100, top: 200, width: 800, height: 1000 } as DOMRect

describe('clientRectsToNormRects', () => {
  test('normalizes rects relative to page box', () => {
    const rects = [{ left: 180, top: 300, width: 400, height: 20 } as DOMRect]
    const [r] = clientRectsToNormRects(rects, pageRect)
    expect(r.x).toBeCloseTo(0.1)
    expect(r.y).toBeCloseTo(0.1)
    expect(r.w).toBeCloseTo(0.5)
    expect(r.h).toBeCloseTo(0.02)
  })

  test('clamps rects that overflow the page to [0,1]', () => {
    const rects = [{ left: 0, top: 300, width: 2000, height: 20 } as DOMRect]
    const [r] = clientRectsToNormRects(rects, pageRect)
    expect(r.x).toBe(0)
    expect(r.y).toBeCloseTo(0.1)
    expect(r.x + r.w).toBeLessThanOrEqual(1)
  })

  test('drops zero-size rects', () => {
    const rects = [{ left: 180, top: 300, width: 0, height: 20 } as DOMRect]
    expect(clientRectsToNormRects(rects, pageRect)).toEqual([])
  })
})

describe('mergeAdjacentRects', () => {
  test('merges overlapping fragments on the same line', () => {
    const merged = mergeAdjacentRects([
      { x: 0.1, y: 0.5, w: 0.2, h: 0.02 },
      { x: 0.28, y: 0.502, w: 0.2, h: 0.02 },
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0].x).toBeCloseTo(0.1)
    expect(merged[0].x + merged[0].w).toBeCloseTo(0.48)
  })

  test('keeps rects on different lines separate', () => {
    const merged = mergeAdjacentRects([
      { x: 0.1, y: 0.5, w: 0.2, h: 0.02 },
      { x: 0.1, y: 0.55, w: 0.2, h: 0.02 },
    ])
    expect(merged).toHaveLength(2)
  })
})

describe('findHighlightAt', () => {
  const hl = (id: string, page: number, rects: { x: number; y: number; w: number; h: number }[]) => ({
    id, bookId: 'b', page, color: 'yellow' as const, text: '', rects, createdAt: 0,
  })
  const highlights = [
    hl('a', 1, [{ x: 0.1, y: 0.1, w: 0.3, h: 0.02 }]),
    hl('b', 1, [{ x: 0.1, y: 0.5, w: 0.3, h: 0.02 }, { x: 0.1, y: 0.52, w: 0.2, h: 0.02 }]),
    hl('c', 2, [{ x: 0.1, y: 0.1, w: 0.3, h: 0.02 }]),
  ]

  test('returns the highlight whose rect contains the point on that page', () => {
    expect(findHighlightAt(highlights, 1, 0.2, 0.11)?.id).toBe('a')
    expect(findHighlightAt(highlights, 1, 0.15, 0.53)?.id).toBe('b')
  })

  test('respects the page', () => {
    expect(findHighlightAt(highlights, 2, 0.2, 0.11)?.id).toBe('c')
  })

  test('returns undefined when nothing is under the point', () => {
    expect(findHighlightAt(highlights, 1, 0.9, 0.9)).toBeUndefined()
  })

  test('prefers the most recently created highlight when overlapping', () => {
    const overlap = [...highlights, { ...hl('d', 1, [{ x: 0.15, y: 0.1, w: 0.1, h: 0.02 }]), createdAt: 5 }]
    expect(findHighlightAt(overlap, 1, 0.2, 0.11)?.id).toBe('d')
  })
})
