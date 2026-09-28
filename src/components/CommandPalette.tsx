import { useEffect, useMemo, useRef, useState } from 'react'
import { fuzzyScore } from '../fuzzy'
import { formatKey, registry } from '../keys'
import { useStore } from '../store'
import type { Settings } from '../types'

interface Command {
  id: string
  label: string
  group: string
  keyHint?: string
  run: () => void
}

export default function CommandPalette() {
  const screen = useStore((s) => s.screen)
  const books = useStore((s) => s.books)
  const setOverlay = useStore((s) => s.setOverlay)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => inputRef.current?.focus(), [])

  const commands = useMemo<Command[]>(() => {
    const s = useStore.getState()
    const fromRegistry = registry
      .list(screen)
      .filter((sc) => sc.id !== 'palette' && sc.palette !== false)
      .map((sc) => ({
        id: sc.id,
        label: sc.label,
        group: sc.group,
        keyHint: sc.keys[0] ? formatKey(sc.keys[0]) : undefined,
        run: sc.run,
      }))
    const themes: Settings['theme'][] = ['light', 'dark', 'sepia']
    const filters: Settings['pageFilter'][] = ['normal', 'dark', 'sepia']
    const extras: Command[] = [
      ...themes.map((t) => ({
        id: `theme-${t}`,
        label: `Theme: ${t[0].toUpperCase()}${t.slice(1)}`,
        group: 'Appearance',
        run: () => s.setTheme(t),
      })),
      ...filters.map((f) => ({
        id: `filter-${f}`,
        label: `Page rendering: ${f[0].toUpperCase()}${f.slice(1)}`,
        group: 'Appearance',
        run: () => s.setPageFilter(f),
      })),
    ]
    const bookJumps: Command[] = books
      .filter((b) => b.id !== s.currentBookId)
      .map((b) => ({
        id: `book-${b.id}`,
        label: `Open: ${b.title}`,
        group: 'Books',
        run: () => s.openBook(b.id),
      }))
    return [...fromRegistry, ...extras, ...bookJumps]
  }, [screen, books])

  const results = useMemo(() => {
    const scored = commands
      .map((c) => ({ c, score: fuzzyScore(query, c.label) }))
      .filter((x): x is { c: Command; score: number } => x.score !== null)
    if (query) scored.sort((a, b) => b.score - a.score)
    return scored.map((x) => x.c).slice(0, 60)
  }, [commands, query])

  useEffect(() => setActive(0), [query])

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-i="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const run = (cmd: Command | undefined) => {
    if (!cmd) return
    setOverlay(null)
    cmd.run()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || (e.key === 'n' && e.ctrlKey)) {
      setActive((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp' || (e.key === 'p' && e.ctrlKey)) {
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      run(results[active])
    } else {
      return
    }
    e.preventDefault()
  }

  return (
    <div className="modal-backdrop" onClick={() => setOverlay(null)}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Type a command…"
          spellCheck={false}
        />
        <div className="palette-list" ref={listRef}>
          {results.length === 0 && <div className="sidebar-empty">No matching commands</div>}
          {results.map((c, i) => (
            <button
              key={c.id}
              data-i={i}
              className={`palette-item${i === active ? ' is-selected' : ''}`}
              onClick={() => run(c)}
              onMouseEnter={() => setActive(i)}
            >
              <span className="palette-group">{c.group}</span>
              <span className="item-label">{c.label}</span>
              {c.keyHint && <kbd>{c.keyHint}</kbd>}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
