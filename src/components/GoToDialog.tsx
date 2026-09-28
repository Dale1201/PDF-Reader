import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'

interface Props {
  maxPage: number
  currentPage: number
  onGo: (page: number) => void
}

export default function GoToDialog({ maxPage, currentPage, onGo }: Props) {
  const setOverlay = useStore((s) => s.setOverlay)
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => inputRef.current?.focus(), [])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter') return
    const page = parseInt(value, 10)
    if (!Number.isNaN(page)) onGo(Math.min(Math.max(page, 1), maxPage))
    setOverlay(null)
  }

  return (
    <div className="search-overlay goto">
      <div className="search-box">
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/\D/g, ''))}
          onKeyDown={onKeyDown}
          placeholder={`Go to page (${currentPage} of ${maxPage})`}
          inputMode="numeric"
        />
        <span className="search-count">↵ to go</span>
      </div>
    </div>
  )
}
