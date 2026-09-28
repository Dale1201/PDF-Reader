import { describe, expect, test } from 'vitest'
import { annotationsToMarkdown, applyNote, excerpt } from './notes'
import type { Bookmark, Highlight } from './types'

const hl = (over: Partial<Highlight>): Highlight => ({
  id: 'h', bookId: 'b', page: 1, color: 'yellow', text: 'some text', rects: [], createdAt: 0, ...over,
})
const bm = (over: Partial<Bookmark>): Bookmark => ({
  id: 'm', bookId: 'b', page: 1, label: 'Page label', createdAt: 0, ...over,
})

describe('applyNote', () => {
  test('sets a trimmed note', () => {
    expect(applyNote(hl({}), '  remember this  \n').note).toBe('remember this')
  })

  test('keeps inner newlines', () => {
    expect(applyNote(hl({}), 'line one\nline two').note).toBe('line one\nline two')
  })

  test('blank text removes the note field entirely', () => {
    const cleared = applyNote(hl({ note: 'old' }), '   ')
    expect('note' in cleared).toBe(false)
  })

  test('does not mutate the input', () => {
    const original = hl({ note: 'old' })
    applyNote(original, 'new')
    expect(original.note).toBe('old')
  })
})

describe('annotationsToMarkdown', () => {
  test('groups by page in order with quotes, notes, and bookmarks', () => {
    const md = annotationsToMarkdown(
      'My Book',
      [hl({ id: '2', page: 9, text: 'later quote', note: 'my thought' }), hl({ id: '1', page: 3, text: 'first quote' })],
      [bm({ page: 9, label: 'Chapter 2', note: 'page-level note' })],
    )
    expect(md).toBe(
      [
        '# My Book',
        '',
        '## Page 3',
        '',
        '> first quote',
        '',
        '## Page 9',
        '',
        'Bookmark: Chapter 2',
        '',
        'page-level note',
        '',
        '> later quote',
        '',
        'my thought',
        '',
      ].join('\n'),
    )
  })

  test('quotes every line of multi-line highlight text', () => {
    const md = annotationsToMarkdown('B', [hl({ text: 'a\nb' })], [])
    expect(md).toContain('> a\n> b')
  })

  test('says so when there is nothing to export', () => {
    expect(annotationsToMarkdown('B', [], [])).toBe('# B\n\nNo highlights or bookmarks yet.\n')
  })
})

describe('excerpt', () => {
  test('returns short text unchanged, whitespace collapsed', () => {
    expect(excerpt('  Chapter   2\nIntro ', 60)).toBe('Chapter 2 Intro')
  })

  test('cuts at a word boundary and adds an ellipsis', () => {
    expect(excerpt('Reading code is a skill distinct from writing it. The best engineers', 60)).toBe(
      'Reading code is a skill distinct from writing it. The best…',
    )
  })

  test('hard-cuts a single overlong word', () => {
    expect(excerpt('x'.repeat(80), 10)).toBe(`${'x'.repeat(9)}…`)
  })
})
