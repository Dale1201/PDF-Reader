# PDF Reader - Design Spec

Date: 2026-09-28

## Purpose

A book-reading focused PDF reader for a developer who reads many books in PDF.
It must feel minimalistic like Notion but be feature rich, and be fully drivable from the keyboard.
Success: the user can import books, read them comfortably in long sessions, never touch the mouse, and everything (position, highlights, bookmarks, settings) persists across sessions.

## Platform

Local web app: Vite + React 18 + TypeScript + pdfjs-dist.
Runs via `npm run dev` or as a built static bundle.
All data (PDF bytes, metadata, positions, annotations, settings) lives in IndexedDB, so no backend and no file re-picking on every visit.

Rationale: highest quality-to-complexity ratio.
pdf.js is the most robust open PDF engine; a web app avoids Electron/Tauri packaging weight while remaining installable later if desired.

## Architecture

Two screens in one SPA:

1. **Library** - grid of imported books with rendered covers, title, progress %, sorted by last read. Import via file picker or drag-drop. Keyboard navigable (arrows + Enter, `x` delete with confirm).
2. **Reader** - virtualized continuous-scroll page view with auto-hiding minimal chrome.

### Modules

- `src/db.ts` - IndexedDB layer (idb): books (bytes + metadata), per-book state (position, zoom), annotations (highlights, bookmarks), settings.
- `src/store.ts` - zustand app state: current screen, current book, UI panels, theme, toasts.
- `src/pdf/` - pdf.js wrapper: document loading, page render queue (canvas at devicePixelRatio), text layer, outline extraction, full-text search.
- `src/keys.ts` - central keyboard dispatcher: single registry of shortcuts (context-aware: library / reader / overlay), powers both handling and the `?` help overlay and command palette so they can never drift apart.
- `src/components/` - Library, Reader, Sidebar (TOC / thumbnails / annotations), CommandPalette, SearchBar, HelpOverlay, GoToDialog, Toast.
- Plain CSS with design tokens (`src/styles.css`): light / dark / sepia themes.

### Reader behavior

- Continuous vertical scroll, virtualized: render only visible pages plus a buffer; placeholder boxes sized from page dimensions keep scroll geometry stable.
- Zoom modes: fit-width, fit-page, and stepped custom zoom. Fit-page + Space gives a paged-reading feel (Space advances one page, snap-aligned).
- Text layer on rendered pages for selection and copy.
- Page rendering theme filter: normal, dark (smart invert), sepia tint - independent from app chrome theme but defaulted together.
- Position (page + scroll offset) and zoom saved per book, restored on open.

### Search

`/` opens in-reader search: scans text content of all pages (cached per book), lists matches with context, `Enter`/`n`/`N` navigate, matches highlighted on the page.

### Annotations

- **Highlights**: select text, press `1-4` (yellow/green/blue/pink) or use the popover; stored as page + normalized rects + captured text. Rendered as overlay divs. Annotations panel lists them with text snippets; Enter jumps; `x` deletes.
- **Bookmarks**: `m` toggles a bookmark on the current page; listed in the annotations panel.

### Keyboard model (core set)

- Global: `Cmd+K` palette, `?` help, `Esc` close/back, `t` theme cycle.
- Library: arrows/`hjkl` move, `Enter` open, `o` import, `x` delete.
- Reader: `j/k`/arrows scroll, `Space`/`Shift+Space` page forward/back, `gg`/`G` start/end, `Ctrl+G` or `:` go-to-page, `+/-/0` zoom, `w` fit-width, `p` fit-page, `/` search, `n/N` next/prev match, `c` TOC, `b` thumbnails, `a` annotations panel, `m` bookmark, `1-4` highlight selection, `[`/`]` prev/next chapter, `Backspace`/`Esc` library.

Every palette command shows its shortcut; the help overlay is generated from the same registry.

### Error handling

- Corrupt/unloadable PDFs: toast with the pdf.js error, book stays in library marked failed.
- IndexedDB quota errors surface as a toast on import.
- Render errors on individual pages show an inline retry placeholder without killing the session.

### Testing

- Vitest unit tests for pure logic: keyboard registry/dispatch, search match utilities, highlight rect math, store reducers, db layer (with fake-indexeddb).
- Manual E2E verification by launching the app and exercising import, reading, shortcuts, and persistence with a real PDF.

## Out of scope (v1)

Cloud sync, EPUB/other formats, PDF editing/form filling, two-page spreads, ink/freeform annotations, mobile layout.
