import { useLayoutEffect, useRef, useState } from 'react'
import type { HighlightColor } from '../types'
import NoteEditor from './NoteEditor'

export const HIGHLIGHT_COLORS: HighlightColor[] = ['yellow', 'green', 'blue', 'pink']

export type PopoverState =
  | { kind: 'create'; x: number; y: number; page: number; rects: { x: number; y: number; w: number; h: number }[]; text: string }
  | { kind: 'existing'; x: number; y: number; highlightId: string; editing?: boolean; alignRight?: boolean }

interface Props {
  popover: PopoverState
  note?: string
  onHighlight: (color: HighlightColor) => void
  onEditNote: () => void
  onSaveNote: (text: string) => void
  onCancelNote: () => void
  onCopy?: () => void
  onDelete?: () => void
}

const EDGE = 12

export default function SelectionPopover(props: Props) {
  const { popover, note, onHighlight, onEditNote, onSaveNote, onCancelNote, onCopy, onDelete } = props
  const editing = popover.kind === 'existing' && popover.editing
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: popover.x, top: popover.y })

  // keep the popover fully on screen as it grows (note preview, editor)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const alignRight = popover.kind === 'existing' && popover.alignRight
    const anchorX = alignRight ? popover.x - width : popover.x
    const left = Math.max(EDGE, Math.min(anchorX, window.innerWidth - width - EDGE))
    const below = popover.y
    const above = popover.y - height - 36
    const top = below + height + EDGE <= window.innerHeight ? below : Math.max(EDGE, above)
    setPos({ left, top })
  }, [popover, editing, note])

  return (
    <div
      ref={ref}
      className={`selection-popover${editing || note ? ' has-body' : ''}`}
      style={pos}
      onMouseDown={(e) => {
        // keep the text selection alive when clicking buttons, but let the textarea take focus
        if (!(e.target instanceof HTMLTextAreaElement)) e.preventDefault()
      }}
    >
      <div className="popover-row">
        {HIGHLIGHT_COLORS.map((c, i) => (
          <button
            key={c}
            className={`color-dot dot-${c}`}
            title={`Highlight ${c} (${i + 1})`}
            onClick={() => onHighlight(c)}
          />
        ))}
        {!editing && (
          <>
            <span className="popover-divider" />
            <button className="popover-action" onClick={onEditNote} title="Add or edit note (e)">
              {note ? 'Edit note' : 'Note'}
            </button>
          </>
        )}
        {onCopy && (
          <>
            <span className="popover-divider" />
            <button className="popover-action" onClick={onCopy}>
              Copy
            </button>
          </>
        )}
        {onDelete && (
          <>
            <span className="popover-divider" />
            <button className="popover-action danger" onClick={onDelete} title="Remove highlight (x)">
              Remove
            </button>
          </>
        )}
      </div>
      {editing ? (
        <NoteEditor initial={note ?? ''} onSave={onSaveNote} onCancel={onCancelNote} />
      ) : (
        note && <div className="popover-note">{note}</div>
      )}
    </div>
  )
}
