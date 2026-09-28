export type KeyContext = 'library' | 'reader' | 'sidebar' | 'global'
export type ActiveContext = Exclude<KeyContext, 'global'>

export interface Shortcut {
  id: string
  keys: string[]
  label: string
  context: KeyContext
  group: string
  run: (matchedKey?: string) => void
  hidden?: boolean
  // false: listed in help but not offered as a palette command (pure movement keys)
  palette?: boolean
}

const SEQUENCE_WINDOW_MS = 600

export function normalizeKey(e: KeyboardEvent): string {
  let key = e.key === ' ' ? 'space' : e.key.length === 1 ? e.key : e.key.toLowerCase()
  const mods: string[] = []
  if (e.metaKey || e.ctrlKey) mods.push('mod')
  if (e.altKey) mods.push('alt')
  if (e.shiftKey && (key.length > 1 || mods.length > 0)) mods.push('shift')
  // stable order: mod, alt, shift
  const order = ['mod', 'alt', 'shift']
  mods.sort((a, b) => order.indexOf(a) - order.indexOf(b))
  return [...mods, key].join('+')
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target.isContentEditable
  )
}

export class KeyRegistry {
  private shortcuts: Shortcut[] = []
  private pending: string | null = null
  private pendingAt = 0

  register(s: Shortcut): () => void {
    this.shortcuts.push(s)
    return () => {
      this.shortcuts = this.shortcuts.filter((x) => x !== s)
    }
  }

  list(contexts: ActiveContext | ActiveContext[]): Shortcut[] {
    const ctxs: KeyContext[] = [...[contexts].flat(), 'global']
    return this.shortcuts.filter((s) => !s.hidden && ctxs.includes(s.context))
  }

  // contexts are in priority order: a key bound in an earlier context shadows later ones
  handle(e: KeyboardEvent, contexts: ActiveContext | ActiveContext[]): boolean {
    const key = normalizeKey(e)
    if (isTypingTarget(e.target) && key !== 'escape') {
      this.pending = null
      return false
    }

    const ctxs: KeyContext[] = [...[contexts].flat(), 'global']
    const active = ctxs.flatMap((c) => this.shortcuts.filter((s) => s.context === c))

    if (this.pending && Date.now() - this.pendingAt > SEQUENCE_WINDOW_MS) this.pending = null

    if (this.pending) {
      const full = `${this.pending} ${key}`
      this.pending = null
      const hit = active.find((s) => s.keys.includes(full))
      if (hit) {
        hit.run(full)
        return true
      }
    }

    const hit = active.find((s) => s.keys.includes(key))
    if (hit) {
      hit.run(key)
      return true
    }

    if (active.some((s) => s.keys.some((k) => k.startsWith(`${key} `)))) {
      this.pending = key
      this.pendingAt = Date.now()
      return true
    }

    return false
  }
}

export const registry = new KeyRegistry()

const KEY_GLYPHS: Record<string, string> = {
  mod: '⌘',
  ctrl: '⌃',
  shift: '⇧',
  alt: '⌥',
  space: 'space',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  escape: 'esc',
  backspace: '⌫',
  enter: '↵',
  pageup: 'pgup',
  pagedown: 'pgdn',
}

export function formatKey(key: string): string {
  return key
    .split(' ')
    .map((chord) =>
      chord === '+'
        ? '+'
        : chord
            .split('+')
            .map((part) => KEY_GLYPHS[part] ?? part)
            .join(''),
    )
    .join(' ')
}
