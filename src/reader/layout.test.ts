import { describe, expect, test } from 'vitest'
import { computeLayouts, visibleRange } from './layout'

const sizes = [
  { width: 600, height: 800 },
  { width: 600, height: 800 },
  { width: 400, height: 1000 },
]

describe('computeLayouts', () => {
  test('fit-width scales pages to container width minus gutters', () => {
    const { layouts } = computeLayouts(sizes, 'fit-width', 1, 1000, 700)
    expect(layouts[0].width).toBe(1000 - 112)
    expect(layouts[0].height).toBe(Math.round((888 / 600) * 800))
  })

  test('fit-page fits the whole page in the viewport', () => {
    const { layouts } = computeLayouts(sizes, 'fit-page', 1, 1000, 700)
    expect(layouts[0].height).toBeLessThanOrEqual(700)
    expect(layouts[0].width).toBeLessThanOrEqual(888)
  })

  test('custom zoom multiplies natural size', () => {
    const { layouts } = computeLayouts(sizes, 'custom', 1.5, 1000, 700)
    expect(layouts[0].width).toBe(900)
  })

  test('stacks pages with gaps and reports total height', () => {
    const { layouts, totalHeight } = computeLayouts(sizes, 'custom', 1, 1000, 700)
    expect(layouts[1].top).toBeGreaterThan(layouts[0].top + layouts[0].height)
    expect(totalHeight).toBeGreaterThanOrEqual(layouts[2].top + layouts[2].height)
  })
})

describe('visibleRange', () => {
  const { layouts } = computeLayouts(sizes, 'custom', 1, 1000, 700)

  test('returns pages intersecting viewport plus buffer', () => {
    const [first, last] = visibleRange(layouts, 0, 700, 0)
    expect(first).toBe(0)
    expect(last).toBeGreaterThanOrEqual(0)
    const [f2, l2] = visibleRange(layouts, 0, 700, 2)
    expect(f2).toBe(0)
    expect(l2).toBeGreaterThanOrEqual(Math.min(2, l2))
    expect(l2).toBeLessThanOrEqual(2)
  })

  test('clamps at document end', () => {
    const [first, last] = visibleRange(layouts, 999999, 700, 2)
    expect(last).toBe(2)
    expect(first).toBeLessThanOrEqual(2)
  })
})
