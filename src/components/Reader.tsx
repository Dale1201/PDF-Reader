import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as db from '../db'
import { registry } from '../keys'
import { loadDocument, type PdfDoc } from '../pdf/pdfService'
import { clientRectsToNormRects, findHighlightAt } from '../pdf/rectUtils'
import { annotationsToMarkdown, applyNote, excerpt } from '../notes'
import { computeLayouts, PAD_TOP, visibleRange, type PageLayout } from '../reader/layout'
import { resolvePosition, resolveScroll, useStore } from '../store'
import type { BookState, Bookmark, Highlight, HighlightColor, NormRect } from '../types'
import PageView from './PageView'
import SelectionPopover, { HIGHLIGHT_COLORS, type PopoverState } from './SelectionPopover'
import Sidebar from './Sidebar'
import SearchOverlay, { type SearchHit } from './SearchOverlay'
import GoToDialog from './GoToDialog'

const NO_HIGHLIGHTS: Highlight[] = []
const ZOOM_MIN = 0.25
const ZOOM_MAX = 5

interface Position {
  page: number
  fraction: number
}

// an in-flight jump, kept so a layout change mid-scroll lands on the target instead of reverting
interface NavTarget {
  page: number
  fraction: number
  offsetPx: number
}

const NAV_SETTLE_MS = 150

function navTop(t: NavTarget, offsets: number[], heights: number[]): number {
  return Math.max(0, resolveScroll(t.page, t.fraction, offsets, heights) - t.offsetPx)
}

interface CapturedSelection {
  page: number
  rects: NormRect[]
  text: string
  x: number
  y: number
}

export default function Reader({ bookId }: { bookId: string }) {
  const [doc, setDoc] = useState<PdfDoc | null>(null)
  const [zoomMode, setZoomMode] = useState<BookState['zoomMode']>('fit-width')
  const [zoom, setZoom] = useState(1)
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight })
  const [scrollTop, setScrollTop] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [chromeVisible, setChromeVisible] = useState(true)
  const [highlights, setHighlights] = useState<Highlight[]>([])
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [popover, setPopover] = useState<PopoverState | null>(null)
  const [flash, setFlash] = useState<{ page: number; term: string } | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const lastPos = useRef<Position>({ page: 1, fraction: 0 })
  const chromeTimer = useRef<number>(undefined)
  const saveTimer = useRef<number>(undefined)

  const meta = useStore((s) => s.books.find((b) => b.id === bookId))
  const pageFilter = useStore((s) => s.pageFilter)
  const closeBook = useStore((s) => s.closeBook)
  const toast = useStore((s) => s.toast)
  const overlay = useStore((s) => s.overlay)

  const { layouts, totalHeight } = useMemo(
    () =>
      doc
        ? computeLayouts(doc.pageSizes, zoomMode, zoom, size.w, size.h)
        : { layouts: [] as PageLayout[], totalHeight: 0 },
    [doc, zoomMode, zoom, size],
  )
  const offsets = useMemo(() => layouts.map((l) => l.top), [layouts])
  const heights = useMemo(() => layouts.map((l) => l.height), [layouts])
  const highlightsByPage = useMemo(() => {
    const map = new Map<number, Highlight[]>()
    for (const h of highlights) map.set(h.page, [...(map.get(h.page) ?? []), h])
    return map
  }, [highlights])
  const bookmarksByPage = useMemo(() => new Map(bookmarks.map((b) => [b.page, b])), [bookmarks])

  // load document + saved state + annotations
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const bytes = await db.getBookBytes(bookId)
        if (!bytes) throw new Error('Book data missing')
        const d = await loadDocument(bytes)
        const [state, hls, bms] = await Promise.all([
          db.getBookState(bookId),
          db.listHighlights(bookId),
          db.listBookmarks(bookId),
        ])
        if (cancelled) {
          d.destroy()
          return
        }
        if (state) {
          setZoomMode(state.zoomMode)
          setZoom(state.zoom)
          lastPos.current = { page: state.page, fraction: state.pageFraction }
        }
        setHighlights(hls)
        setBookmarks(bms)
        setDoc(d)
        loadedRef.current = true
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Could not open book', 'error')
        closeBook()
      }
    })()
    return () => {
      cancelled = true
    }
  }, [bookId, closeBook, toast])

  useEffect(() => () => doc?.destroy(), [doc])

  // observe container size
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [doc])

  // restore position whenever the layout geometry changes (open, zoom, resize)
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el || layouts.length === 0) return
    const atVeryStart = lastPos.current.page === 1 && lastPos.current.fraction === 0
    el.scrollTop = navRef.current
      ? navTop(navRef.current, offsets, heights)
      : atVeryStart
        ? 0
        : resolveScroll(lastPos.current.page, lastPos.current.fraction, offsets, heights)
    setScrollTop(el.scrollTop)
    setCurrentPage(resolvePosition(el.scrollTop + el.clientHeight / 3, offsets, heights).page)
  }, [layouts, offsets, heights])

  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el || offsets.length === 0) return
    setScrollTop(el.scrollTop)
    const pos = resolvePosition(el.scrollTop + el.clientHeight / 3, offsets, heights)
    setCurrentPage(pos.page)
    if (navRef.current) {
      clearTimeout(settleTimer.current)
      settleTimer.current = window.setTimeout(() => {
        navRef.current = null
        lastPos.current = resolvePosition(el.scrollTop, offsetsRef.current, heightsRef.current)
      }, NAV_SETTLE_MS)
    } else {
      lastPos.current = resolvePosition(el.scrollTop, offsets, heights)
    }
    const save = () => {
      pendingSince.current = null
      void db.saveBookState({
        bookId,
        page: lastPos.current.page,
        pageFraction: lastPos.current.fraction,
        zoomMode,
        zoom,
      })
      void db.updateBookMeta(bookId, { lastReadAt: Date.now() })
    }
    // debounce 500ms, but never let a continuous scroll defer the save past 1s
    pendingSince.current ??= Date.now()
    clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(save, Date.now() - pendingSince.current > 1000 ? 0 : 500)
  }, [bookId, offsets, heights, zoomMode, zoom])
  const pendingSince = useRef<number | null>(null)
  const navRef = useRef<NavTarget | null>(null)
  const settleTimer = useRef<number>(undefined)

  // chrome auto-hide
  const wakeChrome = useCallback(() => {
    setChromeVisible(true)
    clearTimeout(chromeTimer.current)
    chromeTimer.current = window.setTimeout(() => setChromeVisible(false), 1800)
  }, [])

  useEffect(() => {
    wakeChrome()
    window.addEventListener('mousemove', wakeChrome)
    return () => {
      window.removeEventListener('mousemove', wakeChrome)
      clearTimeout(chromeTimer.current)
    }
  }, [wakeChrome])

  const zoomModeRef = useRef(zoomMode)
  const zoomRef = useRef(zoom)
  zoomModeRef.current = zoomMode
  zoomRef.current = zoom
  const currentPageRef = useRef(currentPage)
  currentPageRef.current = currentPage
  const popoverRef = useRef(popover)
  popoverRef.current = popover
  const bookmarksRef = useRef(bookmarks)
  bookmarksRef.current = bookmarks

  const loadedRef = useRef(false)

  // flush state on unmount and on tab close/reload
  useEffect(() => {
    const flush = () => {
      // never overwrite a saved position with defaults from an open that failed or was aborted
      if (!loadedRef.current) return
      clearTimeout(saveTimer.current)
      void db.saveBookState({
        bookId,
        page: lastPos.current.page,
        pageFraction: lastPos.current.fraction,
        zoomMode: zoomModeRef.current,
        zoom: zoomRef.current,
      })
      void db.updateBookMeta(bookId, { lastReadAt: Date.now() })
    }
    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [bookId])

  // keyboard API via refs so shortcuts register once
  const offsetsRef = useRef(offsets)
  offsetsRef.current = offsets
  const heightsRef = useRef(heights)
  heightsRef.current = heights
  const layoutsRef = useRef(layouts)
  layoutsRef.current = layouts
  const docRef = useRef(doc)
  docRef.current = doc

  const api = useRef({
    scrollBy: (dy: number, smooth = false) =>
      scrollRef.current?.scrollBy({ top: dy, behavior: smooth ? 'smooth' : 'auto' }),
    pageStep: (dir: 1 | -1) => {
      const el = scrollRef.current
      if (!el) return
      if (zoomModeRef.current === 'fit-page') {
        api.current.goToPage(currentPageRef.current + dir)
      } else {
        el.scrollBy({ top: dir * el.clientHeight * 0.85, behavior: 'smooth' })
      }
    },
    navigate: (target: NavTarget, smooth: boolean) => {
      const el = scrollRef.current
      const o = offsetsRef.current
      const h = heightsRef.current
      if (!el || o.length === 0) return
      const t = { ...target, page: Math.min(Math.max(target.page, 1), o.length) }
      const top = navTop(t, o, h)
      navRef.current = t
      lastPos.current = resolvePosition(top, o, h)
      clearTimeout(settleTimer.current)
      settleTimer.current = window.setTimeout(() => {
        navRef.current = null
      }, NAV_SETTLE_MS * 4)
      el.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' })
    },
    goToPage: (page: number, smooth = true) =>
      api.current.navigate({ page, fraction: 0, offsetPx: 24 }, smooth),
    goToOffset: (page: number, fraction: number) =>
      api.current.navigate(
        { page, fraction, offsetPx: (scrollRef.current?.clientHeight ?? 0) * 0.35 },
        true,
      ),
    top: () => api.current.navigate({ page: 1, fraction: 0, offsetPx: PAD_TOP }, false),
    bottom: () =>
      api.current.navigate({ page: offsetsRef.current.length, fraction: 1, offsetPx: 0 }, false),
    effectiveZoom: () => {
      const l = layoutsRef.current[0]
      const s = docRef.current?.pageSizes[0]
      return l && s ? l.width / s.width : 1
    },
  })

  const setCustomZoom = useCallback((z: number) => {
    setZoomMode('custom')
    setZoom(Math.min(Math.max(z, ZOOM_MIN), ZOOM_MAX))
  }, [])

  // ----- selection + highlights -----
  const captureSelection = useCallback((): CapturedSelection | null => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !sel.toString().trim()) return null
    const range = sel.getRangeAt(0)
    const container = range.commonAncestorContainer
    const el = container instanceof Element ? container : container.parentElement
    const pageEl = el?.closest('.page')
    if (!pageEl) return null
    const rectList = Array.from(range.getClientRects())
    const rects = clientRectsToNormRects(rectList, pageEl.getBoundingClientRect())
    if (rects.length === 0) return null
    const anchor = rectList[rectList.length - 1]
    return {
      page: Number(pageEl.getAttribute('data-page')),
      rects,
      text: sel.toString(),
      x: Math.min(anchor.right, window.innerWidth - 240),
      y: Math.min(anchor.bottom + 10, window.innerHeight - 60),
    }
  }, [])

  const lastColorRef = useRef<HighlightColor>('yellow')

  const addHighlight = useCallback(
    async (color: HighlightColor, opts: { editNote?: boolean } = {}) => {
      lastColorRef.current = color
      const pop = popoverRef.current
      if (pop?.kind === 'existing') {
        const h = highlightsRef.current.find((x) => x.id === pop.highlightId)
        if (!h) return
        const updated = { ...h, color }
        await db.saveHighlight(updated)
        setHighlights((hs) => hs.map((x) => (x.id === h.id ? updated : x)))
        if (!pop.editing) setPopover(null)
        return
      }
      const cap = pop?.kind === 'create' ? pop : captureSelection()
      if (!cap) return
      const h: Highlight = {
        id: crypto.randomUUID(),
        bookId,
        page: cap.page,
        color,
        text: cap.text,
        rects: cap.rects,
        createdAt: Date.now(),
      }
      await db.saveHighlight(h)
      setHighlights((hs) => [...hs, h])
      window.getSelection()?.removeAllRanges()
      setPopover(
        opts.editNote ? { kind: 'existing', x: cap.x, y: cap.y, highlightId: h.id, editing: true } : null,
      )
    },
    [bookId, captureSelection],
  )

  const editNoteFromPopover = useCallback(() => {
    const pop = popoverRef.current
    if (pop?.kind === 'existing') setPopover({ ...pop, editing: true })
    else if (pop?.kind === 'create' || captureSelection())
      void addHighlight(lastColorRef.current, { editNote: true })
  }, [addHighlight, captureSelection])

  const saveHighlightNote = useCallback(async (id: string, text: string) => {
    const h = highlightsRef.current.find((x) => x.id === id)
    if (!h) return
    const updated = applyNote(h, text)
    if ((updated.note ?? '') === (h.note ?? '')) return
    await db.saveHighlight(updated)
    setHighlights((hs) => hs.map((x) => (x.id === id ? updated : x)))
  }, [])

  const saveBookmarkNote = useCallback(async (id: string, text: string) => {
    const b = bookmarksRef.current.find((x) => x.id === id)
    if (!b) return
    const updated = applyNote(b, text)
    if ((updated.note ?? '') === (b.note ?? '')) return
    await db.saveBookmark(updated)
    setBookmarks((bs) => bs.map((x) => (x.id === id ? updated : x)))
  }, [])

  const openNoteBadge = useCallback((h: Highlight, anchor: DOMRect) => {
    setPopover({ kind: 'existing', x: anchor.right, y: anchor.bottom + 8, highlightId: h.id, alignRight: true })
  }, [])

  const highlightsRef = useRef(highlights)
  highlightsRef.current = highlights

  const deleteHighlight = useCallback(async (id: string) => {
    await db.deleteHighlight(id)
    setHighlights((hs) => hs.filter((h) => h.id !== id))
    setPopover(null)
  }, [])

  const createBookmark = useCallback(
    async (page: number): Promise<Bookmark> => {
      const text = (await docRef.current?.getPageText(page)) ?? ''
      const label = excerpt(text, 60) || `Page ${page}`
      const bm: Bookmark = { id: crypto.randomUUID(), bookId, page, label, createdAt: Date.now() }
      await db.saveBookmark(bm)
      setBookmarks((bs) => [...bs, bm])
      return bm
    },
    [bookId],
  )

  const toggleBookmark = useCallback(async () => {
    const page = currentPageRef.current
    const existing = bookmarksRef.current.find((b) => b.page === page)
    if (existing) {
      await db.deleteBookmark(existing.id)
      setBookmarks((bs) => bs.filter((b) => b.id !== existing.id))
      toast(`Bookmark removed · page ${page}`)
      return
    }
    await createBookmark(page)
    toast(`Bookmarked page ${page}`)
  }, [createBookmark, toast])

  const addPageNote = useCallback(async () => {
    const page = currentPageRef.current
    const bm = bookmarksRef.current.find((b) => b.page === page) ?? (await createBookmark(page))
    const s = useStore.getState()
    if (s.sidebar !== 'annotations') s.toggleSidebar('annotations')
    s.requestNoteEdit(bm.id)
  }, [createBookmark])

  const copyMarkdown = useCallback(async () => {
    const title = useStore.getState().books.find((b) => b.id === bookId)?.title ?? 'Notes'
    const md = annotationsToMarkdown(title, highlightsRef.current, bookmarksRef.current)
    try {
      await navigator.clipboard.writeText(md)
      const n = highlightsRef.current.length + bookmarksRef.current.length
      toast(`Copied ${n} annotation${n === 1 ? '' : 's'} as Markdown`)
    } catch {
      toast('Could not access the clipboard', 'error')
    }
  }, [bookId, toast])

  // the text layer sits above highlights (so highlighted text stays selectable),
  // so clicks on a highlight are resolved by hit-testing the stored rects
  const onMouseUp = useCallback(
    (e: React.MouseEvent) => {
      const { clientX, clientY } = e
      // resolve the target now: a click handler may re-render the popover and detach it before the timeout
      const target = e.target as Element
      const pageEl = target.closest?.('.page')
      const inPopover = !!target.closest?.('.selection-popover')
      window.setTimeout(() => {
        const cap = captureSelection()
        if (cap) {
          setPopover({ kind: 'create', ...cap })
          return
        }
        if (!pageEl) {
          if (!inPopover) setPopover(null)
          return
        }
        const box = pageEl.getBoundingClientRect()
        const hit = findHighlightAt(
          highlightsRef.current,
          Number(pageEl.getAttribute('data-page')),
          (clientX - box.left) / box.width,
          (clientY - box.top) / box.height,
        )
        setPopover(
          hit
            ? {
                kind: 'existing',
                x: Math.min(clientX, window.innerWidth - 240),
                y: Math.min(clientY + 12, window.innerHeight - 60),
                highlightId: hit.id,
              }
            : null,
        )
      }, 0)
    },
    [captureSelection],
  )

  // a new press drops the old selection; a stale popover left under the drag would pull the selection into it
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (!(e.target as Element).closest?.('.selection-popover')) setPopover(null)
  }, [])

  // ----- search -----
  const searchRef = useRef<{ hits: SearchHit[]; index: number } | null>(null)

  const jumpToHit = useCallback((hit: SearchHit) => {
    api.current.goToOffset(hit.match.page, hit.fraction)
    setFlash({ page: hit.match.page, term: hit.match.term })
  }, [])

  const cycleMatch = useCallback(
    (dir: 1 | -1) => {
      const s = searchRef.current
      if (!s || s.hits.length === 0) return
      s.index = (s.index + dir + s.hits.length) % s.hits.length
      jumpToHit(s.hits[s.index])
      toast(`Match ${s.index + 1} of ${s.hits.length}`)
    },
    [jumpToHit, toast],
  )

  useEffect(() => {
    const a = api.current
    const offs = [
      registry.register({ id: 'r-down', keys: ['j', 'arrowdown'], label: 'Scroll down', context: 'reader', group: 'Navigate', run: () => a.scrollBy(90) }),
      registry.register({ id: 'r-up', keys: ['k', 'arrowup'], label: 'Scroll up', context: 'reader', group: 'Navigate', run: () => a.scrollBy(-90) }),
      registry.register({ id: 'r-next', keys: ['space', 'pagedown'], label: 'Next page', context: 'reader', group: 'Navigate', run: () => a.pageStep(1) }),
      registry.register({ id: 'r-prev', keys: ['shift+space', 'pageup'], label: 'Previous page', context: 'reader', group: 'Navigate', run: () => a.pageStep(-1) }),
      registry.register({ id: 'r-page-next', keys: [']'], label: 'Jump to next page top', context: 'reader', group: 'Navigate', run: () => a.goToPage(currentPageRef.current + 1) }),
      registry.register({ id: 'r-page-prev', keys: ['['], label: 'Jump to previous page top', context: 'reader', group: 'Navigate', run: () => a.goToPage(currentPageRef.current - 1) }),
      registry.register({ id: 'r-left', keys: ['h', 'arrowleft'], label: 'Scroll left', context: 'reader', group: 'Navigate', palette: false, run: () => scrollRef.current?.scrollBy({ left: -90 }) }),
      registry.register({ id: 'r-right', keys: ['l', 'arrowright'], label: 'Scroll right', context: 'reader', group: 'Navigate', palette: false, run: () => scrollRef.current?.scrollBy({ left: 90 }) }),
      registry.register({ id: 'r-top', keys: ['g g', 'home'], label: 'Go to beginning', context: 'reader', group: 'Navigate', run: () => a.top() }),
      registry.register({ id: 'r-bottom', keys: ['G', 'end'], label: 'Go to end', context: 'reader', group: 'Navigate', run: () => a.bottom() }),
      registry.register({ id: 'r-zoom-in', keys: ['+', '='], label: 'Zoom in', context: 'reader', group: 'View', run: () => setCustomZoom(a.effectiveZoom() * 1.1) }),
      registry.register({ id: 'r-zoom-out', keys: ['-'], label: 'Zoom out', context: 'reader', group: 'View', run: () => setCustomZoom(a.effectiveZoom() / 1.1) }),
      registry.register({ id: 'r-zoom-reset', keys: ['0'], label: 'Actual size', context: 'reader', group: 'View', run: () => setCustomZoom(1) }),
      registry.register({ id: 'r-fit-width', keys: ['w'], label: 'Fit width', context: 'reader', group: 'View', run: () => setZoomMode('fit-width') }),
      registry.register({ id: 'r-fit-page', keys: ['p'], label: 'Fit page', context: 'reader', group: 'View', run: () => setZoomMode('fit-page') }),
      registry.register({ id: 'r-toc', keys: ['c'], label: 'Table of contents', context: 'reader', group: 'Panels', run: () => useStore.getState().toggleSidebar('toc') }),
      registry.register({ id: 'r-thumbs', keys: ['b'], label: 'Page thumbnails', context: 'reader', group: 'Panels', run: () => useStore.getState().toggleSidebar('thumbs') }),
      registry.register({ id: 'r-annotations', keys: ['a'], label: 'Highlights and bookmarks', context: 'reader', group: 'Panels', run: () => useStore.getState().toggleSidebar('annotations') }),
      registry.register({ id: 'r-search', keys: ['/', 'mod+f'], label: 'Search in book', context: 'reader', group: 'Search', run: () => useStore.getState().setOverlay('search') }),
      registry.register({ id: 'r-goto', keys: [':', 'mod+g'], label: 'Go to page…', context: 'reader', group: 'Navigate', run: () => useStore.getState().setOverlay('goto') }),
      registry.register({ id: 'r-match-next', keys: ['n'], label: 'Next search match', context: 'reader', group: 'Search', run: () => cycleMatch(1) }),
      registry.register({ id: 'r-match-prev', keys: ['N'], label: 'Previous search match', context: 'reader', group: 'Search', run: () => cycleMatch(-1) }),
      registry.register({
        id: 'r-hl-remove', keys: ['x'], label: 'Remove clicked highlight', context: 'reader', group: 'Annotate', palette: false,
        run: () => {
          const pop = popoverRef.current
          if (pop?.kind === 'existing') void deleteHighlight(pop.highlightId)
        },
      }),
      registry.register({ id: 'r-note', keys: ['e'], label: 'Add or edit note on selection or clicked highlight', context: 'reader', group: 'Annotate', palette: false, run: () => editNoteFromPopover() }),
      registry.register({ id: 'r-page-note', keys: ['M'], label: 'Add note to this page', context: 'reader', group: 'Annotate', run: () => void addPageNote() }),
      registry.register({ id: 'r-export-md', keys: [], label: 'Copy highlights and notes as Markdown', context: 'reader', group: 'Annotate', run: () => void copyMarkdown() }),
      registry.register({ id: 'r-bookmark', keys: ['m'], label: 'Toggle bookmark on page', context: 'reader', group: 'Annotate', run: () => void toggleBookmark() }),
      registry.register({
        id: 'r-hl', keys: HIGHLIGHT_COLORS.map((_, i) => String(i + 1)), label: 'Highlight selection or recolor', context: 'reader', group: 'Annotate', palette: false,
        run: (k) => void addHighlight(HIGHLIGHT_COLORS[Number(k) - 1]),
      }),
      registry.register({
        id: 'r-back', keys: ['backspace', 'escape'], label: 'Back to library', context: 'reader', group: 'General',
        run: () => {
          if (popoverRef.current) {
            setPopover(null)
            window.getSelection()?.removeAllRanges()
            return
          }
          const s = useStore.getState()
          if (s.sidebar) s.toggleSidebar(s.sidebar)
          else s.closeBook()
        },
      }),
    ]
    return () => offs.forEach((off) => off())
  }, [setCustomZoom, addHighlight, toggleBookmark, cycleMatch, deleteHighlight, editNoteFromPopover, addPageNote, copyMarkdown])

  if (!doc || !meta) return <div className="reader-loading">Opening…</div>

  const [first, last] = visibleRange(layouts, scrollTop, size.h, 2)
  const pct = Math.round(((currentPage - 1) / Math.max(doc.numPages - 1, 1)) * 100)
  const popoverHighlight: Highlight | undefined =
    popover?.kind === 'existing' ? highlights.find((h) => h.id === popover.highlightId) : undefined

  return (
    <div className={`reader page-filter-${pageFilter}`} onMouseDown={onMouseDown} onMouseUp={onMouseUp}>
      <header className={`reader-chrome${chromeVisible ? '' : ' is-hidden'}`}>
        <button className="ghost-button" onClick={closeBook}>
          ← Library
        </button>
        <div className="reader-title" title={meta.title}>
          {meta.title}
        </div>
        <div className="reader-status">
          <span>
            {currentPage} / {doc.numPages}
          </span>
          <span className="reader-pct">{pct}%</span>
        </div>
      </header>
      <Sidebar
        doc={doc}
        currentPage={currentPage}
        highlights={highlights}
        bookmarks={bookmarks}
        onJump={(p) => api.current.goToPage(p)}
        onDeleteHighlight={(id) => void deleteHighlight(id)}
        onDeleteBookmark={(id) => {
          void db.deleteBookmark(id)
          setBookmarks((bs) => bs.filter((b) => b.id !== id))
        }}
        onSaveHighlightNote={(id, text) => void saveHighlightNote(id, text)}
        onSaveBookmarkNote={(id, text) => void saveBookmarkNote(id, text)}
      />
      <div className="reader-scroll" id="reader-scroll" ref={scrollRef} onScroll={onScroll}>
        <div
          className="reader-pages"
          style={{
            height: totalHeight,
            width: layouts.reduce((w, l) => Math.max(w, l.width), 0),
          }}
        >
          {layouts.slice(first, last + 1).map((l, i) => {
            const pageNum = first + i + 1
            return (
              <PageView
                key={pageNum}
                doc={doc}
                pageNum={pageNum}
                layout={l}
                highlights={highlightsByPage.get(pageNum) ?? NO_HIGHLIGHTS}
                bookmark={bookmarksByPage.get(pageNum)}
                flashRect={flash}
                onNoteBadge={openNoteBadge}
              />
            )
          })}
        </div>
      </div>
      {overlay === 'goto' && (
        <GoToDialog
          maxPage={doc.numPages}
          currentPage={currentPage}
          onGo={(p) => api.current.goToPage(p)}
        />
      )}
      {overlay === 'search' && (
        <SearchOverlay
          doc={doc}
          onJump={jumpToHit}
          onCommit={(hits, index) => {
            searchRef.current = { hits, index }
          }}
        />
      )}
      {popover && (
        <SelectionPopover
          key={popover.kind === 'existing' ? popover.highlightId : 'create'}
          popover={popover}
          note={popoverHighlight?.note}
          onHighlight={(c) => void addHighlight(c)}
          onEditNote={editNoteFromPopover}
          onSaveNote={(text) => {
            if (popover.kind !== 'existing') return
            void saveHighlightNote(popover.highlightId, text)
            setPopover((p) => (p?.kind === 'existing' ? { ...p, editing: false } : p))
          }}
          onCancelNote={() =>
            setPopover((p) => (p?.kind === 'existing' ? { ...p, editing: false } : p))
          }
          onCopy={
            popover.kind === 'create'
              ? () => {
                  void navigator.clipboard.writeText(popover.text)
                  toast('Copied')
                  setPopover(null)
                  window.getSelection()?.removeAllRanges()
                }
              : undefined
          }
          onDelete={
            popoverHighlight ? () => void deleteHighlight(popoverHighlight.id) : undefined
          }
        />
      )}
    </div>
  )
}
