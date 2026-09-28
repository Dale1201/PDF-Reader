import { describe, expect, test } from 'vitest'
import { fuzzyScore } from './fuzzy'

describe('fuzzyScore', () => {
  test('null for non-subsequence', () => {
    expect(fuzzyScore('xyz', 'Fit width')).toBeNull()
  })

  test('matches subsequence case-insensitively', () => {
    expect(fuzzyScore('fw', 'Fit width')).not.toBeNull()
  })

  test('prefers word-start and consecutive matches', () => {
    const wordStarts = fuzzyScore('fw', 'Fit width')!
    const scattered = fuzzyScore('fw', 'few words after')!
    expect(wordStarts).toBeGreaterThan(scattered)
    expect(fuzzyScore('fit', 'Fit width')!).toBeGreaterThan(fuzzyScore('ftw', 'Fit width')!)
  })

  test('empty query matches everything with zero score', () => {
    expect(fuzzyScore('', 'anything')).toBe(0)
  })
})
