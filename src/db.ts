import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { BookMeta, BookState, Bookmark, Highlight, Settings } from './types'

interface ReaderDB extends DBSchema {
  books: { key: string; value: BookMeta }
  bookBytes: { key: string; value: { bookId: string; bytes: ArrayBuffer } }
  bookState: { key: string; value: BookState }
  highlights: { key: string; value: Highlight; indexes: { byBook: string } }
  bookmarks: { key: string; value: Bookmark; indexes: { byBook: string } }
  settings: { key: string; value: Settings }
}

const DB_NAME = 'pdf-reader'

let dbPromise: Promise<IDBPDatabase<ReaderDB>> | null = null

function getDb(): Promise<IDBPDatabase<ReaderDB>> {
  dbPromise ??= openDB<ReaderDB>(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore('books', { keyPath: 'id' })
      db.createObjectStore('bookBytes', { keyPath: 'bookId' })
      db.createObjectStore('bookState', { keyPath: 'bookId' })
      db.createObjectStore('highlights', { keyPath: 'id' }).createIndex('byBook', 'bookId')
      db.createObjectStore('bookmarks', { keyPath: 'id' }).createIndex('byBook', 'bookId')
      db.createObjectStore('settings')
    },
  })
  return dbPromise
}

export async function saveBook(meta: BookMeta, bytes: ArrayBuffer): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(['books', 'bookBytes'], 'readwrite')
  await Promise.all([
    tx.objectStore('books').put(meta),
    tx.objectStore('bookBytes').put({ bookId: meta.id, bytes }),
    tx.done,
  ])
}

export async function listBooks(): Promise<BookMeta[]> {
  return (await getDb()).getAll('books')
}

export async function getBookBytes(id: string): Promise<ArrayBuffer | undefined> {
  return (await (await getDb()).get('bookBytes', id))?.bytes
}

export async function updateBookMeta(id: string, patch: Partial<BookMeta>): Promise<void> {
  const db = await getDb()
  const existing = await db.get('books', id)
  if (!existing) return
  await db.put('books', { ...existing, ...patch, id })
}

export async function deleteBook(id: string): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(['books', 'bookBytes', 'bookState', 'highlights', 'bookmarks'], 'readwrite')
  const highlights = await tx.objectStore('highlights').index('byBook').getAllKeys(id)
  const bookmarks = await tx.objectStore('bookmarks').index('byBook').getAllKeys(id)
  await Promise.all([
    tx.objectStore('books').delete(id),
    tx.objectStore('bookBytes').delete(id),
    tx.objectStore('bookState').delete(id),
    ...highlights.map((k) => tx.objectStore('highlights').delete(k)),
    ...bookmarks.map((k) => tx.objectStore('bookmarks').delete(k)),
    tx.done,
  ])
}

export async function getBookState(bookId: string): Promise<BookState | undefined> {
  return (await getDb()).get('bookState', bookId)
}

export async function saveBookState(state: BookState): Promise<void> {
  await (await getDb()).put('bookState', state)
}

export async function listHighlights(bookId: string): Promise<Highlight[]> {
  return (await getDb()).getAllFromIndex('highlights', 'byBook', bookId)
}

export async function saveHighlight(h: Highlight): Promise<void> {
  await (await getDb()).put('highlights', h)
}

export async function deleteHighlight(id: string): Promise<void> {
  await (await getDb()).delete('highlights', id)
}

export async function listBookmarks(bookId: string): Promise<Bookmark[]> {
  return (await getDb()).getAllFromIndex('bookmarks', 'byBook', bookId)
}

export async function saveBookmark(m: Bookmark): Promise<void> {
  await (await getDb()).put('bookmarks', m)
}

export async function deleteBookmark(id: string): Promise<void> {
  await (await getDb()).delete('bookmarks', id)
}

const DEFAULT_SETTINGS: Settings = { theme: 'dark', pageFilter: 'dark' }

export async function getSettings(): Promise<Settings> {
  return (await (await getDb()).get('settings', 'app')) ?? { ...DEFAULT_SETTINGS }
}

export async function saveSettings(s: Settings): Promise<void> {
  await (await getDb()).put('settings', s, 'app')
}

export async function resetForTests(): Promise<void> {
  const db = await getDb()
  const names = Array.from(db.objectStoreNames)
  const tx = db.transaction(names, 'readwrite')
  for (const name of names) void tx.objectStore(name).clear()
  await tx.done
}
