import { beforeEach, describe, expect, test, vi } from 'vitest'
import { KeyRegistry, normalizeKey } from './keys'

function keyEvent(key: string, opts: Partial<KeyboardEventInit> = {}, target?: EventTarget): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { key, ...opts })
  if (target) Object.defineProperty(e, 'target', { value: target })
  return e
}

describe('normalizeKey', () => {
  test('plain key', () => {
    expect(normalizeKey(keyEvent('j'))).toBe('j')
  })
  test('mod combo', () => {
    expect(normalizeKey(keyEvent('k', { metaKey: true }))).toBe('mod+k')
    expect(normalizeKey(keyEvent('g', { ctrlKey: true }))).toBe('mod+g')
  })
  test('shift+space distinct from space', () => {
    expect(normalizeKey(keyEvent(' '))).toBe('space')
    expect(normalizeKey(keyEvent(' ', { shiftKey: true }))).toBe('shift+space')
  })
  test('shifted characters keep their symbol without shift prefix', () => {
    expect(normalizeKey(keyEvent('?', { shiftKey: true }))).toBe('?')
    expect(normalizeKey(keyEvent('G', { shiftKey: true }))).toBe('G')
  })
})

describe('KeyRegistry', () => {
  let reg: KeyRegistry
  let ran: string[]

  const add = (id: string, keys: string[], context: 'library' | 'reader' | 'sidebar' | 'global' = 'global') =>
    reg.register({ id, keys, label: id, context, group: 'Test', run: () => ran.push(id) })

  beforeEach(() => {
    reg = new KeyRegistry()
    ran = []
  })

  test('dispatches single key in matching context', () => {
    add('scroll', ['j'], 'reader')
    expect(reg.handle(keyEvent('j'), 'reader')).toBe(true)
    expect(ran).toEqual(['scroll'])
  })

  test('does not dispatch outside context', () => {
    add('scroll', ['j'], 'reader')
    expect(reg.handle(keyEvent('j'), 'library')).toBe(false)
    expect(ran).toEqual([])
  })

  test('global shortcuts fire in any context', () => {
    add('palette', ['mod+k'])
    expect(reg.handle(keyEvent('k', { metaKey: true }), 'library')).toBe(true)
    expect(ran).toEqual(['palette'])
  })

  test('two-key sequence g g fires', () => {
    vi.useFakeTimers()
    add('top', ['g g'], 'reader')
    expect(reg.handle(keyEvent('g'), 'reader')).toBe(true)
    expect(ran).toEqual([])
    expect(reg.handle(keyEvent('g'), 'reader')).toBe(true)
    expect(ran).toEqual(['top'])
    vi.useRealTimers()
  })

  test('g then x resets pending sequence and does not fire', () => {
    add('top', ['g g'], 'reader')
    add('other', ['x'], 'reader')
    reg.handle(keyEvent('g'), 'reader')
    reg.handle(keyEvent('x'), 'reader')
    expect(ran).toEqual(['other'])
    reg.handle(keyEvent('g'), 'reader')
    expect(ran).toEqual(['other'])
  })

  test('sequence times out after 600ms', () => {
    vi.useFakeTimers()
    add('top', ['g g'], 'reader')
    reg.handle(keyEvent('g'), 'reader')
    vi.advanceTimersByTime(700)
    reg.handle(keyEvent('g'), 'reader')
    expect(ran).toEqual([])
    vi.useRealTimers()
  })

  test('ignores keys while typing in an input, except Escape', () => {
    add('scroll', ['j'], 'reader')
    add('close', ['escape'])
    const input = document.createElement('input')
    expect(reg.handle(keyEvent('j', {}, input), 'reader')).toBe(false)
    expect(reg.handle(keyEvent('Escape', {}, input), 'reader')).toBe(true)
    expect(ran).toEqual(['close'])
  })

  test('unregister removes the shortcut', () => {
    const off = add('scroll', ['j'], 'reader')
    off()
    expect(reg.handle(keyEvent('j'), 'reader')).toBe(false)
  })

  test('passes the matched key to the handler', () => {
    const got: (string | undefined)[] = []
    reg.register({ id: 'hl', keys: ['1', '2'], label: 'hl', context: 'reader', group: 'T', run: (k) => got.push(k) })
    reg.handle(keyEvent('2'), 'reader')
    expect(got).toEqual(['2'])
  })

  test('earlier contexts take priority over later ones', () => {
    add('scroll', ['j'], 'reader')
    add('panel-down', ['j'], 'sidebar')
    expect(reg.handle(keyEvent('j'), ['sidebar', 'reader'])).toBe(true)
    expect(ran).toEqual(['panel-down'])
    expect(reg.handle(keyEvent('j'), ['reader'])).toBe(true)
    expect(ran).toEqual(['panel-down', 'scroll'])
  })

  test('falls through to later contexts for keys the first does not bind', () => {
    add('toc', ['c'], 'reader')
    add('panel-down', ['j'], 'sidebar')
    reg.handle(keyEvent('c'), ['sidebar', 'reader'])
    expect(ran).toEqual(['toc'])
  })

  test('list accepts several contexts', () => {
    add('scroll', ['j'], 'reader')
    add('panel-down', ['j'], 'sidebar')
    add('lib', ['o'], 'library')
    expect(reg.list(['reader', 'sidebar']).map((s) => s.id)).toEqual(['scroll', 'panel-down'])
  })

  test('list returns context plus global, hides hidden', () => {
    add('scroll', ['j'], 'reader')
    add('palette', ['mod+k'])
    add('lib', ['o'], 'library')
    reg.register({ id: 'secret', keys: ['z'], label: 'z', context: 'reader', group: 'Test', hidden: true, run: () => {} })
    expect(reg.list('reader').map((s) => s.id)).toEqual(['scroll', 'palette'])
  })
})

describe('formatKey', () => {
  test('formats mod combos and glyphs', async () => {
    const { formatKey } = await import('./keys')
    expect(formatKey('mod+k')).toBe('⌘k')
    expect(formatKey('g g')).toBe('g g')
    expect(formatKey('shift+space')).toBe('⇧space')
  })
  test('the plus key itself renders as +', async () => {
    const { formatKey } = await import('./keys')
    expect(formatKey('+')).toBe('+')
  })
})
