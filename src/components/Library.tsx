import { useCallback, useEffect, useRef, useState } from 'react'
import * as db from '../db'
import { importFiles, isPdfFile, pickPdfFiles } from '../importBook'
import { registry } from '../keys'
import { useStore } from '../store'
import type { BookMeta } from '../types'

export default function Library() {
  const books = useStore((s) => s.books)
  const setBooks = useStore((s) => s.setBooks)
  const openBook = useStore((s) => s.openBook)
  const toast = useStore((s) => s.toast)
  const [selected, setSelected] = useState(0)
  const [progress, setProgress] = useState<Record<string, number>>({})
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const gridRef = useRef<HTMLDivElement>(null)
  const deleteTimer = useRef<number>(undefined)

  const sorted = [...books].sort((a, b) => b.lastReadAt - a.lastReadAt)

  const refresh = useCallback(async () => {
    const list = await db.listBooks()
    setBooks(list)
    const entries = await Promise.all(
      list.map(async (b) => [b.id, (await db.getBookState(b.id))?.page ?? 1] as const),
    )
    setProgress(Object.fromEntries(entries.map(([id, page]) => [id, page])))
  }, [setBooks])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const doImport = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return
      const pdfs = files.filter(isPdfFile)
      if (pdfs.length > 0)
        toast(pdfs.length === 1 ? `Importing ${pdfs[0].name}` : `Importing ${pdfs.length} files`)
      const { added, errors } = await importFiles(files)
      for (const e of errors) toast(e, 'error')
      if (added.length > 0) await refresh()
    },
    [refresh, toast],
  )

  const columns = () => {
    const el = gridRef.current
    if (!el) return 1
    return getComputedStyle(el).gridTemplateColumns.split(' ').length
  }

  useEffect(() => {
    const move = (delta: number) => () =>
      setSelected((i) => Math.min(Math.max(i + delta, 0), Math.max(sorted.length - 1, 0)))
    const offs = [
      registry.register({ id: 'lib-open-file', keys: ['o'], label: 'Open PDF…', context: 'library', group: 'Library', run: () => pickPdfFiles((f) => void doImport(f)) }),
      registry.register({ id: 'lib-left', keys: ['h', 'arrowleft'], label: 'Select previous book', context: 'library', group: 'Library', palette: false, run: move(-1) }),
      registry.register({ id: 'lib-right', keys: ['l', 'arrowright'], label: 'Select next book', context: 'library', group: 'Library', palette: false, run: move(1) }),
      registry.register({ id: 'lib-up', keys: ['k', 'arrowup'], label: 'Select book above', context: 'library', group: 'Library', palette: false, run: () => move(-columns())() }),
      registry.register({ id: 'lib-down', keys: ['j', 'arrowdown'], label: 'Select book below', context: 'library', group: 'Library', palette: false, run: () => move(columns())() }),
      registry.register({
        id: 'lib-enter', keys: ['enter'], label: 'Open selected book', context: 'library', group: 'Library', palette: false,
        run: () => { const b = sorted[selected]; if (b) openBook(b.id) },
      }),
      registry.register({
        id: 'lib-delete', keys: ['x'], label: 'Delete selected book', context: 'library', group: 'Library',
        run: () => {
          const b = sorted[selected]
          if (!b) return
          if (pendingDelete === b.id) {
            clearTimeout(deleteTimer.current)
            setPendingDelete(null)
            void db.deleteBook(b.id).then(() => {
              toast(`Deleted "${b.title}"`)
              setSelected((i) => Math.max(0, Math.min(i, sorted.length - 2)))
              void refresh()
            })
          } else {
            setPendingDelete(b.id)
            clearTimeout(deleteTimer.current)
            deleteTimer.current = window.setTimeout(() => setPendingDelete(null), 2000)
          }
        },
      }),
    ]
    return () => offs.forEach((off) => off())
  }, [sorted, selected, pendingDelete, doImport, openBook, refresh, toast])

  useEffect(() => {
    gridRef.current?.querySelector<HTMLElement>(`[data-index="${selected}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  useEffect(() => {
    let depth = 0
    const enter = (e: DragEvent) => { e.preventDefault(); depth++; setDragging(true) }
    const over = (e: DragEvent) => e.preventDefault()
    const leave = () => { if (--depth <= 0) { depth = 0; setDragging(false) } }
    const drop = (e: DragEvent) => {
      e.preventDefault()
      depth = 0
      setDragging(false)
      void doImport(Array.from(e.dataTransfer?.files ?? []))
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [doImport])

  return (
    <div className="library">
      <header className="library-header">
        <h1>Library</h1>
        <button className="ghost-button" onClick={() => pickPdfFiles((f) => void doImport(f))}>
          Open PDF <kbd>o</kbd>
        </button>
      </header>
      {sorted.length === 0 ? (
        <div className="library-empty">
          <div className="library-empty-art" aria-hidden="true">⌘</div>
          <p>No books yet</p>
          <p className="hint">
            Press <kbd>o</kbd> to open a PDF, or drop files anywhere
          </p>
        </div>
      ) : (
        <div className="book-grid" ref={gridRef} role="listbox" aria-label="Books">
          {sorted.map((b, i) => (
            <BookCard
              key={b.id}
              book={b}
              index={i}
              selected={i === selected}
              pendingDelete={pendingDelete === b.id}
              progressPct={Math.round((((progress[b.id] ?? 1) - 1) / Math.max(b.pages - 1, 1)) * 100)}
              onOpen={() => openBook(b.id)}
              onSelect={() => setSelected(i)}
            />
          ))}
        </div>
      )}
      {dragging && (
        <div className="drop-overlay">
          <div className="drop-overlay-box">Drop PDFs to add them</div>
        </div>
      )}
    </div>
  )
}

function BookCard(props: {
  book: BookMeta
  index: number
  selected: boolean
  pendingDelete: boolean
  progressPct: number
  onOpen: () => void
  onSelect: () => void
}) {
  const { book, index, selected, pendingDelete, progressPct, onOpen, onSelect } = props
  return (
    <div
      className={`book-card${selected ? ' is-selected' : ''}`}
      data-index={index}
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      onDoubleClick={onOpen}
    >
      <div className="book-cover">
        {book.coverDataUrl ? (
          <img src={book.coverDataUrl} alt="" draggable={false} />
        ) : (
          <div className="book-cover-fallback">{book.title.slice(0, 1)}</div>
        )}
        {progressPct > 0 && (
          <div className="book-progress" aria-hidden="true">
            <div style={{ width: `${progressPct}%` }} />
          </div>
        )}
      </div>
      <div className="book-title" title={book.title}>{book.title}</div>
      <div className="book-meta">
        {pendingDelete ? (
          <span className="danger">Press x again to delete</span>
        ) : (
          <>
            {book.pages} pages{progressPct > 0 && ` · ${progressPct}%`}
          </>
        )}
      </div>
    </div>
  )
}
