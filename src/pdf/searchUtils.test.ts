import { describe, expect, test } from 'vitest'
import { findMatches } from './searchUtils'

describe('findMatches', () => {
  test('finds case-insensitive matches with page numbers', () => {
    const matches = findMatches(['Alpha beta', 'gamma ALPHA delta'], 'alpha')
    expect(matches).toHaveLength(2)
    expect(matches[0]).toMatchObject({ page: 1, index: 0, term: 'Alpha' })
    expect(matches[1]).toMatchObject({ page: 2, index: 6, term: 'ALPHA' })
  })

  test('treats regex special characters literally', () => {
    const matches = findMatches(['I love C++ dearly'], 'C++')
    expect(matches).toHaveLength(1)
    expect(matches[0].term).toBe('C++')
  })

  test('provides surrounding context clipped to the page', () => {
    const text = 'x'.repeat(50) + 'needle' + 'y'.repeat(50)
    const [m] = findMatches([text], 'needle')
    expect(m.before.length).toBeLessThanOrEqual(40)
    expect(m.before.endsWith('x')).toBe(true)
    expect(m.after.startsWith('y')).toBe(true)
    expect(m.after.length).toBeLessThanOrEqual(40)
  })

  test('empty or whitespace query returns nothing', () => {
    expect(findMatches(['abc'], '')).toEqual([])
    expect(findMatches(['abc'], '  ')).toEqual([])
  })

  test('caps runaway match counts', () => {
    const matches = findMatches(['a'.repeat(5000)], 'a')
    expect(matches.length).toBeLessThanOrEqual(1000)
  })
})
