# Reader

A minimalist, keyboard-first PDF reader for books.
Runs entirely locally: your books, reading positions, highlights, and bookmarks live in your browser's IndexedDB.

## Run it

```bash
npm install
npm run dev        # then open the printed URL
```

Production build: `npm run build`, serve with `npm run preview`.

## Features

- Library with covers, reading progress, and last-read ordering; import via `o` or drag-drop.
- Continuous, virtualized page rendering, crisp at any zoom (fit width, fit page, custom).
- Every book reopens exactly where you left it, including zoom mode.
- Full-text search with context previews and match flashing.
- Text selection with color highlights, page bookmarks, and an annotations panel.
- Notes on highlights and bookmarks, with margin markers on the page; export everything as Markdown from the palette.
- Table of contents and thumbnail sidebars.
- Command palette with fuzzy matching; help overlay generated from the live shortcut registry.
- Light, dark, and sepia themes, plus independent page rendering filters (including dark-inverted pages).

## Keyboard shortcuts

Press `?` in the app for the full list. Highlights:

| Key | Action |
| --- | --- |
| `Cmd+K` | Command palette |
| `o` | Open PDF (library) |
| `j` / `k`, arrows | Scroll |
| `Space` / `Shift+Space` | Next / previous page |
| `g g` / `G` | Beginning / end |
| `[` / `]` | Previous / next page top |
| `:` or `Cmd+G` | Go to page |
| `w` / `p` / `+` / `-` / `0` | Fit width / fit page / zoom |
| `/` then `n` / `N` | Search, cycle matches |
| `h` / `l` | Scroll left / right (when zoomed in) |
| `c` / `b` / `a` | Contents / thumbnails / annotations |
| `j` / `k`, `Enter`, `x` (panel open) | Move selection, jump, delete annotation |
| `1`-`4` | Highlight selection, or recolor a clicked highlight |
| `x` (highlight clicked) | Remove that highlight |
| `e` | Note on the selection or clicked highlight (in the panel: the selected annotation) |
| `Shift+M` | Add a note to the current page |
| `m` | Toggle bookmark |
| `t` | Cycle theme |
| `Esc` / `Backspace` | Close panel / back to library |

## Tests

```bash
npm test           # unit tests (vitest)
node e2e/make-sample.mjs sample.pdf   # generate a test book
npx vite --port 5199 &                # then:
SHOT_DIR=/tmp SAMPLE=./sample.pdf node e2e/full.mjs
```
