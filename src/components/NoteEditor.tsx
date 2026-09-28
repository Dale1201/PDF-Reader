import { useEffect, useLayoutEffect, useRef, useState } from 'react'

interface Props {
  initial: string
  onSave: (text: string) => void
  onCancel: () => void
  placeholder?: string
}

// saves on ⌘↵, on blur, and on unmount (e.g. the popover closing from a click elsewhere); Esc discards
export default function NoteEditor({ initial, onSave, onCancel, placeholder = 'Write a note…' }: Props) {
  const [value, setValue] = useState(initial)
  const ref = useRef<HTMLTextAreaElement>(null)
  const done = useRef(false)
  const latest = useRef({ value, onSave })
  latest.current = { value, onSave }

  useEffect(() => {
    const el = ref.current
    el?.focus()
    el?.setSelectionRange(el.value.length, el.value.length)
    return () => {
      if (!done.current) latest.current.onSave(latest.current.value)
    }
  }, [])

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`
  }, [value])

  const save = () => {
    if (done.current) return
    done.current = true
    onSave(value)
  }

  return (
    <div className="note-editor">
      <textarea
        ref={ref}
        value={value}
        placeholder={placeholder}
        rows={2}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            save()
          } else if (e.key === 'Escape') {
            // keep Esc from also closing the popover or panel behind the editor
            e.preventDefault()
            e.stopPropagation()
            done.current = true
            onCancel()
          }
        }}
      />
      <div className="note-editor-hint">
        <span>
          <kbd>⌘↵</kbd> save
        </span>
        <span>
          <kbd>esc</kbd> cancel
        </span>
      </div>
    </div>
  )
}
