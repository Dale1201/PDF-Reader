import type { Bookmark, Highlight } from './types'

export function applyNote<T extends { note?: string }>(item: T, text: string): T {
  const note = text.trim()
  const { note: _old, ...rest } = item
  return (note ? { ...rest, note } : rest) as T
}

export function annotationsToMarkdown(
  title: string,
  highlights: Highlight[],
  bookmarks: Bookmark[],
): string {
  const lines = [`# ${title}`, '']
  if (highlights.length === 0 && bookmarks.length === 0) {
    return [...lines, 'No highlights or bookmarks yet.', ''].join('\n')
  }
  const pages = [...new Set([...highlights, ...bookmarks].map((a) => a.page))].sort((a, b) => a - b)
  for (const page of pages) {
    lines.push(`## Page ${page}`, '')
    for (const b of bookmarks.filter((x) => x.page === page)) {
      lines.push(`Bookmark: ${b.label}`, '')
      if (b.note) lines.push(b.note, '')
    }
    const hs = highlights.filter((x) => x.page === page).sort((a, b) => a.createdAt - b.createdAt)
    for (const h of hs) {
      lines.push(...h.text.trim().split('\n').map((l) => `> ${l}`), '')
      if (h.note) lines.push(h.note, '')
    }
  }
  return lines.join('\n')
}

export function excerpt(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max - 1)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.]+$/, '')}…`
}
