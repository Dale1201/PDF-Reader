import { useEffect, useMemo, useRef, useState } from 'react'
import type { PdfDoc, OutlineItem } from '../pdf/pdfService'
import { registry } from '../keys'
import { useStore } from '../store'
import type { Bookmark, Highlight } from '../types'
import NoteEditor from './NoteEditor'
import ThumbsPanel from './ThumbsPanel'

interface Props {
  doc: PdfDoc
  currentPage: number
  highlights: Highlight[]
  bookmarks: Bookmark[]
  onJump: (page: number) => void
  onDeleteHighlight: (id: string) => void
  onDeleteBookmark: (id: string) => void
  onSaveHighlightNote: (id: string, text: string) => void
  onSaveBookmarkNote: (id: string, text: string) => void
}

const TITLES = { toc: 'Contents', thumbs: 'Pages', annotations: 'Annotations' } as const

export default function Sidebar(props: Props) {
  const { doc, currentPage, highlights, bookmarks, onJump, onDeleteHighlight, onDeleteBookmark } = props
  const { onSaveHighlightNote, onSaveBookmarkNote } = props
  const sidebar = useStore((s) => s.sidebar)
  const noteEditRequest = useStore((s) => s.noteEditRequest)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [outline, setOutline] = useState<OutlineItem[] | null>(null)
  const [selected, setSelected] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (sidebar === 'toc' && outline === null) void doc.getOutline().then(setOutline)
  }, [sidebar, outline, doc])

  useEffect(() => {
    setSelected(0)
    setEditingId(null)
  }, [sidebar])

  const annotations = useMemo(
    () =>
      [
        ...bookmarks.map((b) => ({ kind: 'bookmark' as const, id: b.id, page: b.page, label: b.label, note: b.note })),
        ...highlights.map((h) => ({ kind: h.color, id: h.id, page: h.page, label: h.text, note: h.note })),
      ].sort((a, b) => a.page - b.page || (a.kind === 'bookmark' ? -1 : b.kind === 'bookmark' ? 1 : 0)),
    [highlights, bookmarks],
  )

  // another component (e.g. "Add note to this page") asked to edit a specific annotation's note
  useEffect(() => {
    if (!noteEditRequest || sidebar !== 'annotations') return
    const index = annotations.findIndex((a) => a.id === noteEditRequest)
    if (index === -1) return
    setSelected(index)
    setEditingId(noteEditRequest)
    useStore.getState().requestNoteEdit(null)
  }, [noteEditRequest, sidebar, annotations])

  const saveNote = (id: string, text: string) => {
    if (annotations.find((a) => a.id === id)?.kind === 'bookmark') onSaveBookmarkNote(id, text)
    else onSaveHighlightNote(id, text)
  }

  const items: { id: string; page: number | null }[] = useMemo(() => {
    if (sidebar === 'toc') return (outline ?? []).map((o, i) => ({ id: String(i), page: o.page }))
    if (sidebar === 'annotations') return annotations.map((a) => ({ id: a.id, page: a.page }))
    if (sidebar === 'thumbs') return doc.pageSizes.map((_, i) => ({ id: String(i), page: i + 1 }))
    return []
  }, [sidebar, outline, annotations, doc])

  const latest = useRef({ sidebar, items, selected, annotations, onJump, onDeleteBookmark, onDeleteHighlight })
  latest.current = { sidebar, items, selected, annotations, onJump, onDeleteBookmark, onDeleteHighlight }

  // 'sidebar' context is only active while a panel is open, and shadows reader keys
  useEffect(() => {
    const move = (d: number) => () =>
      setSelected((i) => Math.min(Math.max(i + d, 0), Math.max(latest.current.items.length - 1, 0)))
    const offs = [
      registry.register({ id: 'sb-down', keys: ['j', 'arrowdown'], label: 'Move selection in panel down', context: 'sidebar', group: 'Panels', run: move(1) }),
      registry.register({ id: 'sb-up', keys: ['k', 'arrowup'], label: 'Move selection in panel up', context: 'sidebar', group: 'Panels', run: move(-1) }),
      registry.register({
        id: 'sb-open', keys: ['enter'], label: 'Jump to selected item', context: 'sidebar', group: 'Panels',
        run: () => {
          const { items, selected, onJump } = latest.current
          const page = items[selected]?.page
          if (page) onJump(page)
        },
      }),
      registry.register({
        id: 'sb-note', keys: ['e'], label: 'Edit note on selected annotation', context: 'sidebar', group: 'Panels',
        run: () => {
          const { sidebar, items, selected } = latest.current
          const it = items[selected]
          if (sidebar === 'annotations' && it) setEditingId(it.id)
        },
      }),
      registry.register({
        id: 'sb-delete', keys: ['x'], label: 'Delete selected annotation', context: 'sidebar', group: 'Panels',
        run: () => {
          const { sidebar, items, selected, annotations, onDeleteBookmark, onDeleteHighlight } = latest.current
          const it = items[selected]
          if (sidebar !== 'annotations' || !it) return
          if (annotations.find((a) => a.id === it.id)?.kind === 'bookmark') onDeleteBookmark(it.id)
          else onDeleteHighlight(it.id)
          setSelected((i) => Math.max(0, Math.min(i, items.length - 2)))
        },
      }),
    ]
    return () => offs.forEach((off) => off())
  }, [])

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-i="${selected}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  if (!sidebar) return null

  // current TOC entry: last item at or before the current page
  let activeToc = -1
  if (sidebar === 'toc' && outline) {
    outline.forEach((o, i) => {
      if (o.page !== null && o.page <= currentPage) activeToc = i
    })
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span>{TITLES[sidebar]}</span>
        <kbd>esc</kbd>
      </div>
      <div className="sidebar-list" ref={listRef}>
        {sidebar === 'toc' &&
          (outline === null ? (
            <div className="sidebar-empty">Loading…</div>
          ) : outline.length === 0 ? (
            <div className="sidebar-empty">This book has no table of contents</div>
          ) : (
            outline.map((o, i) => (
              <button
                key={i}
                data-i={i}
                className={`sidebar-item${i === selected ? ' is-selected' : ''}${i === activeToc ? ' is-active' : ''}`}
                style={{ paddingLeft: 14 + o.level * 14 }}
                onClick={() => o.page && onJump(o.page)}
              >
                <span className="item-label">{o.title}</span>
                {o.page && <span className="item-page">{o.page}</span>}
              </button>
            ))
          ))}
        {sidebar === 'thumbs' && (
          <ThumbsPanel doc={doc} currentPage={currentPage} selected={selected} onJump={onJump} />
        )}
        {sidebar === 'annotations' &&
          (annotations.length === 0 ? (
            <div className="sidebar-empty">
              Select text and press <kbd>1</kbd>-<kbd>4</kbd> to highlight or <kbd>e</kbd> to add a note.
              Press <kbd>m</kbd> to bookmark a page, or <kbd>⇧M</kbd> to write a page note.
            </div>
          ) : (
            annotations.map((a, i) => (
              <div key={a.id} data-i={i} className={`annotation-row${i === selected ? ' is-selected' : ''}`}>
                <button
                  className="sidebar-item annotation"
                  onClick={() => {
                    setSelected(i)
                    onJump(a.page)
                  }}
                >
                  <span className={`ann-chip ${a.kind === 'bookmark' ? 'chip-bookmark' : `dot-${a.kind}`}`}>
                    {a.kind === 'bookmark' ? '⚑' : ''}
                  </span>
                  <span className="item-label">{a.label}</span>
                  <span className="item-page">{a.page}</span>
                </button>
                {editingId === a.id ? (
                  <div className="ann-note-editor">
                    <NoteEditor
                      initial={a.note ?? ''}
                      placeholder={a.kind === 'bookmark' ? 'Write a page note…' : 'Write a note…'}
                      onSave={(text) => {
                        saveNote(a.id, text)
                        setEditingId(null)
                      }}
                      onCancel={() => setEditingId(null)}
                    />
                  </div>
                ) : (
                  a.note && (
                    <button
                      className="ann-note"
                      title="Edit note (e)"
                      onClick={() => {
                        setSelected(i)
                        setEditingId(a.id)
                      }}
                    >
                      {a.note}
                    </button>
                  )
                )}
              </div>
            ))
          ))}
      </div>
    </aside>
  )
}
