import { beforeEach, describe, expect, test } from 'vitest'
import { resolvePosition, resolveScroll, useStore } from './store'

beforeEach(() => {
  useStore.setState(useStore.getInitialState(), true)
})

describe('overlays and sidebars', () => {
  test('opening one overlay closes another', () => {
    useStore.getState().setOverlay('search')
    useStore.getState().setOverlay('palette')
    expect(useStore.getState().overlay).toBe('palette')
    useStore.getState().setOverlay(null)
    expect(useStore.getState().overlay).toBeNull()
  })

  test('toggleSidebar switches and closes on repeat', () => {
    const s = useStore.getState()
    s.toggleSidebar('toc')
    expect(useStore.getState().sidebar).toBe('toc')
    useStore.getState().toggleSidebar('annotations')
    expect(useStore.getState().sidebar).toBe('annotations')
    useStore.getState().toggleSidebar('annotations')
    expect(useStore.getState().sidebar).toBeNull()
  })
})

describe('theme cycle', () => {
  test('light -> dark -> sepia -> light', () => {
    useStore.setState({ theme: 'light' })
    useStore.getState().cycleTheme()
    expect(useStore.getState().theme).toBe('dark')
    useStore.getState().cycleTheme()
    expect(useStore.getState().theme).toBe('sepia')
    useStore.getState().cycleTheme()
    expect(useStore.getState().theme).toBe('light')
  })
})

describe('toasts', () => {
  test('toast adds and expires are removable', () => {
    useStore.getState().toast('hello')
    const [t] = useStore.getState().toasts
    expect(t.message).toBe('hello')
    useStore.getState().dismissToast(t.id)
    expect(useStore.getState().toasts).toEqual([])
  })
})

describe('scroll position mapping', () => {
  // pages at offsets 0, 500, 1300 with heights 500, 800, 400 (offsets include gaps)
  const offsets = [0, 500, 1300]
  const heights = [500, 800, 400]

  test('resolveScroll maps page + fraction to pixel offset', () => {
    expect(resolveScroll(2, 0.5, offsets, heights)).toBe(900)
    expect(resolveScroll(1, 0, offsets, heights)).toBe(0)
  })

  test('resolvePosition inverts resolveScroll', () => {
    const { page, fraction } = resolvePosition(900, offsets, heights)
    expect(page).toBe(2)
    expect(fraction).toBeCloseTo(0.5)
  })

  test('round-trip across uneven pages', () => {
    for (const [page, fraction] of [
      [1, 0.2],
      [2, 0.9],
      [3, 0.1],
    ] as const) {
      const scroll = resolveScroll(page, fraction, offsets, heights)
      const pos = resolvePosition(scroll, offsets, heights)
      expect(pos.page).toBe(page)
      expect(pos.fraction).toBeCloseTo(fraction)
    }
  })

  test('clamps out-of-range pages and scroll', () => {
    expect(resolveScroll(99, 0, offsets, heights)).toBe(1300)
    expect(resolvePosition(-50, offsets, heights)).toEqual({ page: 1, fraction: 0 })
    expect(resolvePosition(99999, offsets, heights).page).toBe(3)
  })
})
