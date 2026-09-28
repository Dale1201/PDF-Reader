export interface SearchMatch {
  page: number
  index: number
  before: string
  term: string
  after: string
}

const CONTEXT_CHARS = 40
const MAX_MATCHES = 1000

export function findMatches(pageTexts: string[], query: string): SearchMatch[] {
  const q = query.trim()
  if (!q) return []
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(escaped, 'gi')
  const matches: SearchMatch[] = []
  for (let p = 0; p < pageTexts.length; p++) {
    const text = pageTexts[p]
    for (const m of text.matchAll(re)) {
      matches.push({
        page: p + 1,
        index: m.index,
        before: text.slice(Math.max(0, m.index - CONTEXT_CHARS), m.index),
        term: m[0],
        after: text.slice(m.index + m[0].length, m.index + m[0].length + CONTEXT_CHARS),
      })
      if (matches.length >= MAX_MATCHES) return matches
    }
  }
  return matches
}
