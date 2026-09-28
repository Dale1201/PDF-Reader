import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, test } from 'vitest'
import type { BookMeta, Bookmark, Highlight } from './types'
import * as db from './db'

const meta = (id: string): BookMeta => ({
  id,
  title: `Book ${id}`,
  pages: 100,
  addedAt: 1,
  lastReadAt: 1,
  sizeBytes: 3,
})

const highlight = (id: string, bookId: string): Highlight => ({
  id,
  bookId,
  page: 5,
  color: 'yellow',
  text: 'some text',
  rects: [{ x: 0.1, y: 0.2, w: 0.5, h: 0.02 }],
  createdAt: 1,
})

const bookmark = (id: string, bookId: string): Bookmark => ({
  id,
  bookId,
  page: 9,
  label: 'Chapter 2',
  createdAt: 1,
})

beforeEach(async () => {
  await db.resetForTests()
})

describe('books', () => {
  test('saves and lists books with bytes round-trip', async () => {
    const bytes = new Uint8Array([1, 2, 3]).buffer
    await db.saveBook(meta('a'), bytes)
    const books = await db.listBooks()
    expect(books.map((b) => b.id)).toEqual(['a'])
    const stored = await db.getBookBytes('a')
    expect(Array.from(new Uint8Array(stored!))).toEqual([1, 2, 3])
  })

  test('updates book meta partially', async () => {
    await db.saveBook(meta('a'), new ArrayBuffer(0))
    await db.updateBookMeta('a', { lastReadAt: 99 })
    const [b] = await db.listBooks()
    expect(b.lastReadAt).toBe(99)
    expect(b.title).toBe('Book a')
  })

  test('delete cascades bytes, state, highlights, bookmarks', async () => {
    await db.saveBook(meta('a'), new ArrayBuffer(1))
    await db.saveBookState({ bookId: 'a', page: 3, pageFraction: 0.5, zoomMode: 'fit-width', zoom: 1 })
    await db.saveHighlight(highlight('h1', 'a'))
    await db.saveBookmark(bookmark('m1', 'a'))
    await db.deleteBook('a')
    expect(await db.listBooks()).toEqual([])
    expect(await db.getBookBytes('a')).toBeUndefined()
    expect(await db.getBookState('a')).toBeUndefined()
    expect(await db.listHighlights('a')).toEqual([])
    expect(await db.listBookmarks('a')).toEqual([])
  })
})

describe('book state', () => {
  test('round-trips state', async () => {
    await db.saveBookState({ bookId: 'a', page: 7, pageFraction: 0.25, zoomMode: 'custom', zoom: 1.4 })
    expect(await db.getBookState('a')).toMatchObject({ page: 7, pageFraction: 0.25, zoom: 1.4 })
  })
})

describe('annotations', () => {
  test('highlights CRUD scoped by book', async () => {
    await db.saveHighlight(highlight('h1', 'a'))
    await db.saveHighlight(highlight('h2', 'b'))
    expect((await db.listHighlights('a')).map((h) => h.id)).toEqual(['h1'])
    await db.deleteHighlight('h1')
    expect(await db.listHighlights('a')).toEqual([])
    expect((await db.listHighlights('b')).map((h) => h.id)).toEqual(['h2'])
  })

  test('bookmarks CRUD scoped by book', async () => {
    await db.saveBookmark(bookmark('m1', 'a'))
    await db.saveBookmark(bookmark('m2', 'b'))
    expect((await db.listBookmarks('a')).map((m) => m.id)).toEqual(['m1'])
    await db.deleteBookmark('m1')
    expect(await db.listBookmarks('a')).toEqual([])
  })
})

describe('settings', () => {
  test('returns defaults then persists', async () => {
    expect(await db.getSettings()).toEqual({ theme: 'dark', pageFilter: 'dark' })
    await db.saveSettings({ theme: 'sepia', pageFilter: 'sepia' })
    expect(await db.getSettings()).toEqual({ theme: 'sepia', pageFilter: 'sepia' })
  })
})
