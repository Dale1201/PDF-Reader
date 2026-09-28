import { useEffect, useRef, useState } from 'react'
import type { PdfDoc } from '../pdf/pdfService'
import { findMatches, type SearchMatch } from '../pdf/searchUtils'
import { useStore } from '../store'

export interface SearchHit {
  match: SearchMatch
  fraction: number
}

interface Props {
  doc: PdfDoc
  onJump: (hit: SearchHit) => void
  onCommit: (hits: SearchHit[], index: number) => void
}

export default function SearchOverlay({ doc, onJump, onCommit }: Props) {
  const setOverlay = useStore((s) => s.setOverlay)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [active, setActive] = useState(0)
  const [scanning, setScanning] = useState<number | null>(null)
  const [searched, setSearched] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const textsRef = useRef<string[] | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => inputRef.current?.focus(), [])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setHits([])
      setSearched(false)
      return
    }
    const timer = setTimeout(() => {
      void (async () => {
        if (!textsRef.current) {
          setScanning(0)
          textsRef.current = await doc.getAllPageTexts((done, total) =>
            setScanning(Math.round((done / total) * 100)),
          )
          setScanning(null)
        }
        const texts = textsRef.current
        const matches = findMatches(texts, q)
        setHits(
          matches.map((m) => ({
            match: m,
            fraction: texts[m.page - 1].length > 0 ? m.index / texts[m.page - 1].length : 0,
          })),
        )
        setActive(0)
        setSearched(true)
      })()
    }, 250)
    return () => clearTimeout(timer)
  }, [query, doc])

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-i="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const go = (i: number, close: boolean) => {
    const hit = hits[i]
    if (!hit) return
    onJump(hit)
    onCommit(hits, i)
    if (close) setOverlay(null)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || (e.key === 'n' && e.ctrlKey)) {
      setActive((i) => Math.min(i + 1, hits.length - 1))
      e.preventDefault()
    } else if (e.key === 'ArrowUp' || (e.key === 'p' && e.ctrlKey)) {
      setActive((i) => Math.max(i - 1, 0))
      e.preventDefault()
    } else if (e.key === 'Enter') {
      go(active, true)
      e.preventDefault()
    }
  }

  return (
    <div className="search-overlay">
      <div className="search-box">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search in book…"
          spellCheck={false}
        />
        <span className="search-count">
          {scanning !== null
            ? `Indexing ${scanning}%`
            : hits.length > 0
              ? `${active + 1} of ${hits.length}`
              : searched
                ? 'No matches'
                : ''}
        </span>
      </div>
      {hits.length > 0 && (
        <div className="search-results" ref={listRef}>
          {hits.slice(0, 200).map((h, i) => (
            <button
              key={i}
              data-i={i}
              className={`search-result${i === active ? ' is-selected' : ''}`}
              onClick={() => go(i, true)}
              onMouseEnter={() => setActive(i)}
            >
              <span className="result-context">
                {h.match.before}
                <mark>{h.match.term}</mark>
                {h.match.after}
              </span>
              <span className="item-page">{h.match.page}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
