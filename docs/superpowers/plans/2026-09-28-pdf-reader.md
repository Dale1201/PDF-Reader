# PDF Reader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A keyboard-first, minimalist, feature-rich local web app for reading PDF books with persistent library, highlights, bookmarks, and search.

**Architecture:** Vite + React SPA with two screens (Library, Reader). pdf.js renders pages into a virtualized continuous scroller. All persistence in IndexedDB. A single keyboard registry drives shortcuts, the command palette, and the help overlay.

**Tech Stack:** Vite, React 18, TypeScript, pdfjs-dist, zustand, idb, vitest, fake-indexeddb.

**Spec:** docs/superpowers/specs/2026-09-28-pdf-reader-design.md

## Global Constraints

- No `git commit` at any point (user rule); leave changes uncommitted.
- No em dashes in any authored text or UI copy; use plain dash.
- Plain CSS with design tokens; no CSS framework.
- All state persists in IndexedDB; app must work offline after install of deps.
- Keyboard shortcuts must never fire while focus is in a text input.
- pdf.js worker must be bundled locally (no CDN).

## Review Focus

1. Opening a corrupt or non-PDF file: import must toast an error and not add a broken book. Test in Task 2/6.
2. A `gg` sequence followed by an unrelated key (`g` then `x`): must not trigger and must reset pending state. Test in Task 3.
3. Search query with regex special characters (`C++`): must match literally, not throw. Test in Task 4.
4. Reopening a book after zoom change: restored scroll position must map to the same page despite different page heights. Test in Task 5 (position stored as page + fraction, not pixels).
5. Highlight on a page rendered at one zoom, viewed at another: rects stored normalized (0-1 of page size) so they re-anchor at any zoom. Test in Task 4 rect math.

---

### Task 1: Scaffold

**Files:** Create `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/styles.css`, `.gitignore`.

**Interfaces:** Produces a running dev server and `npm test` (vitest). `src/styles.css` defines tokens: `--bg`, `--bg-raised`, `--fg`, `--fg-muted`, `--accent`, `--border`, `--highlight-{yellow,green,blue,pink}`; themes via `[data-theme="light"|"dark"|"sepia"]` on `<html>`.

- [ ] Init npm project, install react, react-dom, zustand, idb, pdfjs-dist; dev: vite, @vitejs/plugin-react, typescript, vitest, fake-indexeddb, @types/react, @types/react-dom, jsdom.
- [ ] Vite config with react plugin; vitest config (environment jsdom, globals).
- [ ] Minimal App renders "Library" placeholder; verify `npm run build` and `npx vitest run` pass.

### Task 2: IndexedDB layer (`src/db.ts`)

**Files:** Create `src/db.ts`, `src/types.ts`; Test `src/db.test.ts`.

**Interfaces (Produces):**
```ts
// types.ts
interface BookMeta { id: string; title: string; author?: string; pages: number; addedAt: number; lastReadAt: number; coverDataUrl?: string; sizeBytes: number }
interface BookState { bookId: string; page: number; pageFraction: number; zoomMode: 'fit-width'|'fit-page'|'custom'; zoom: number }
type HighlightColor = 'yellow'|'green'|'blue'|'pink'
interface Highlight { id: string; bookId: string; page: number; color: HighlightColor; text: string; rects: NormRect[]; createdAt: number }
interface NormRect { x: number; y: number; w: number; h: number } // fractions of page width/height
interface Bookmark { id: string; bookId: string; page: number; label: string; createdAt: number }
interface Settings { theme: 'light'|'dark'|'sepia'; pageFilter: 'normal'|'dark'|'sepia' }
// db.ts
saveBook(meta: BookMeta, bytes: ArrayBuffer): Promise<void>
listBooks(): Promise<BookMeta[]>
getBookBytes(id: string): Promise<ArrayBuffer|undefined>
updateBookMeta(id: string, patch: Partial<BookMeta>): Promise<void>
deleteBook(id: string): Promise<void> // cascades state + annotations
getBookState / saveBookState; listHighlights(bookId) / saveHighlight / deleteHighlight
listBookmarks(bookId) / saveBookmark / deleteBookmark
getSettings(): Promise<Settings> / saveSettings
```

- [ ] Write failing tests with fake-indexeddb: save/list/delete book cascade, state round-trip, highlight and bookmark CRUD, settings default.
- [ ] Implement with idb (`openDB`, stores: books, bookBytes, bookState, highlights [index by bookId], bookmarks [index by bookId], settings).
- [ ] Tests pass.

### Task 3: Keyboard registry (`src/keys.ts`)

**Files:** Create `src/keys.ts`; Test `src/keys.test.ts`.

**Interfaces (Produces):**
```ts
type KeyContext = 'library' | 'reader' | 'global'
interface Shortcut { id: string; keys: string[]; label: string; context: KeyContext; group: string; run: () => void; hidden?: boolean }
class KeyRegistry {
  register(s: Shortcut): () => void  // returns unregister
  handle(e: KeyboardEvent, activeContext: 'library'|'reader'): boolean // true if consumed
  list(context: 'library'|'reader'): Shortcut[] // context + global, for help/palette
}
normalizeKey(e: KeyboardEvent): string // e.g. 'mod+k', 'shift+ ', 'g', '?'
```
Sequences: a `keys` entry like `'g g'` means two-key sequence with 600ms window. `handle` ignores events when `e.target` is an input/textarea/contenteditable, except `Escape`.

- [ ] Failing tests: single key dispatch, mod+k, context filtering, `g g` sequence success, `g` then `x` resets and does not fire, input-focus guard, unregister.
- [ ] Implement; tests pass.

### Task 4: PDF service + pure utils (`src/pdf/`)

**Files:** Create `src/pdf/pdfService.ts` (load doc from bytes, get page, render page to canvas at scale x dpr, render text layer data, get outline, extract page text with caching, render cover thumbnail), `src/pdf/searchUtils.ts`, `src/pdf/rectUtils.ts`; Test `src/pdf/searchUtils.test.ts`, `src/pdf/rectUtils.test.ts`.

**Interfaces (Produces):**
```ts
// searchUtils
findMatches(pageTexts: string[], query: string): SearchMatch[] // case-insensitive, literal (escape regex chars)
interface SearchMatch { page: number; index: number; before: string; term: string; after: string }
// rectUtils
selectionToNormRects(range: Range, pageEl: HTMLElement): NormRect[] // merge line fragments, clamp to [0,1]
mergeAdjacentRects(rects: NormRect[]): NormRect[]
// pdfService
loadDocument(bytes: ArrayBuffer): Promise<PdfDoc> // wraps PDFDocumentProxy; throws on corrupt
```

- [ ] Failing tests: literal matching with `C++`, case-insensitivity, context slicing at page boundaries; rect merging of same-line fragments, clamping.
- [ ] Implement utils; tests pass. Implement pdfService against pdfjs-dist with worker via `new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)`.

### Task 5: App store (`src/store.ts`)

**Files:** Create `src/store.ts`; Test `src/store.test.ts`.

**Interfaces (Produces):** zustand store with: `screen: 'library'|'reader'`, `books`, `currentBookId`, `sidebar: null|'toc'|'thumbs'|'annotations'`, `overlay: null|'palette'|'help'|'goto'|'search'`, `theme`, `pageFilter`, `toasts`, and actions `openBook(id)`, `closeBook()`, `toggleSidebar(kind)`, `setOverlay(kind)`, `toast(msg, kind?)`, `cycleTheme()`. Position rule: stored as `{page, pageFraction}`; helper `resolveScroll(page, fraction, pageOffsets: number[]): number` and inverse `resolvePosition(scrollTop, pageOffsets): {page, fraction}`.

- [ ] Failing tests: overlay exclusivity (opening palette closes search), sidebar toggle, theme cycle order light->dark->sepia->light, resolveScroll/resolvePosition round-trip with uneven page heights.
- [ ] Implement; tests pass.

### Task 6: Library screen

**Files:** Create `src/components/Library.tsx`, `src/components/ImportDrop.tsx`; Modify `src/App.tsx`.

**Interfaces (Consumes):** db.ts, store, keys. **Produces:** import flow used by E2E.

- [ ] Grid of book cards (cover, title, progress %, last read). Empty state with "Press o to open a PDF" hint.
- [ ] Import: hidden `<input type=file accept=application/pdf multiple>` + drag-drop overlay. On import: loadDocument (reject corrupt with toast), render page-1 cover thumbnail (~360px wide JPEG data URL), extract Title metadata fallback filename, saveBook.
- [ ] Keyboard: arrows/hjkl move selection ring, Enter opens, `o` import, `x` deletes selected (inline confirm: press `x` again within 2s), `Cmd+K` palette works here.
- [ ] Verify manually with a generated multi-page sample PDF.

### Task 7: Reader core

**Files:** Create `src/components/Reader.tsx`, `src/components/PageView.tsx`, `src/reader/useVirtualPages.ts`.

**Interfaces (Consumes):** pdfService, store, db. **Produces:** `Reader` mounts per `currentBookId`; scroll container id `#reader-scroll`; each page wrapper `.page[data-page]` sized from viewport-scaled page dims.

- [ ] Load doc, compute per-page sizes for current zoom mode; virtualize: render canvas+text layer for pages within viewport +/- 2, placeholders otherwise; re-render on zoom change; crisp at devicePixelRatio.
- [ ] Zoom: `+`/`-` step 10% (custom), `0` reset 100%, `w` fit-width, `p` fit-page. Fit modes recompute on window resize.
- [ ] Nav: j/k and arrows scroll, Space/Shift+Space one viewport page snap, `g g` top, `G` end, `[`/`]` prev/next page top. Header shows `page / total` and %; chrome (top bar) auto-hides after 1.5s idle scroll, reappears on mouse move to top or any chrome-relevant key.
- [ ] Persist BookState (page, fraction, zoom) debounced 500ms; restore on open; update `lastReadAt` and progress.
- [ ] `Backspace`/`Esc` returns to library.

### Task 8: Text selection + highlights + bookmarks

**Files:** Create `src/components/HighlightLayer.tsx`, `src/components/SelectionPopover.tsx`; Modify `PageView.tsx`, `Reader.tsx`.

- [ ] Render pdf.js text layer per page (transparent spans) enabling native selection and copy.
- [ ] On selection within a page: floating popover with 4 color dots + copy; keys `1-4` create highlight via `selectionToNormRects`, persist, clear selection.
- [ ] HighlightLayer renders stored highlights as absolutely positioned tinted divs under text layer; click selects highlight; `x` or popover trash deletes.
- [ ] `m` toggles bookmark for current page (label: first line of page text or `Page N`).

### Task 9: Sidebars + search

**Files:** Create `src/components/Sidebar.tsx`, `src/components/TocPanel.tsx`, `src/components/ThumbsPanel.tsx`, `src/components/AnnotationsPanel.tsx`, `src/components/SearchOverlay.tsx`.

- [ ] Sidebar shell (left, 280px, slides in): `c` TOC, `b` thumbnails, `a` annotations; same key or Esc closes; arrows + Enter navigate within panel, jumping to page/heading/highlight.
- [ ] TOC from pdf outline (indented tree); current chapter highlighted from scroll position.
- [ ] Thumbnails: lazy-rendered small canvases, current page ringed.
- [ ] Annotations: highlights (color chip + snippet) and bookmarks sorted by page; Enter jumps, `x` deletes.
- [ ] Search: `/` opens top overlay input; extracts all page text (cached), findMatches, list with context; Enter/n/N cycle, jump + flash match region on page via text-layer span matching; Esc closes.

### Task 10: Palette, help, goto, themes, toasts

**Files:** Create `src/components/CommandPalette.tsx`, `src/components/HelpOverlay.tsx`, `src/components/GoToDialog.tsx`, `src/components/Toasts.tsx`.

- [ ] Command palette (Cmd+K): fuzzy-filters `registry.list(context)` plus library book jump entries; shows shortcut hints; Enter runs.
- [ ] Help overlay (`?`): groups from registry by `group`, rendered as key-cap grid.
- [ ] GoTo (`:` or `Ctrl+G`): number input, Enter jumps to page.
- [ ] Themes: `t` cycles app theme; palette commands for explicit theme and page filter (normal/dark/sepia); dark page filter via CSS `filter: invert(0.93) hue-rotate(180deg)` on canvases, sepia via tint overlay; persist settings.
- [ ] Toasts bottom-center, auto-dismiss 3s.

### Task 11: Polish + E2E verification

- [ ] Generate a sample multi-chapter PDF (script into scratchpad) with outline + varied text.
- [ ] Launch app, E2E: import, read, all shortcuts, highlight, bookmark, search, TOC, themes, reload persistence, delete book. Fix everything found; be picky about pixels (spacing, focus rings, scrollbars, hover states, empty states).
- [ ] Run full test suite + `tsc --noEmit` + production build.
