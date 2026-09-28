import { useMemo } from 'react'
import { formatKey, registry } from '../keys'
import { useStore } from '../store'

export default function HelpOverlay() {
  const screen = useStore((s) => s.screen)
  const setOverlay = useStore((s) => s.setOverlay)

  const groups = useMemo(() => {
    const map = new Map<string, { label: string; keys: string[] }[]>()
    for (const s of registry.list(screen === 'reader' ? ['reader', 'sidebar'] : screen)) {
      if (s.keys.length === 0) continue
      const list = map.get(s.group) ?? []
      list.push({ label: s.label, keys: s.keys })
      map.set(s.group, list)
    }
    // handled by the palette/search inputs themselves, not the registry
    map.set('Palette and search', [
      { label: 'Move selection', keys: ['arrowdown', 'arrowup'] },
      { label: 'Move selection (emacs)', keys: ['ctrl+n', 'ctrl+p'] },
      { label: 'Run or jump', keys: ['enter'] },
      { label: 'Close', keys: ['escape'] },
    ])
    return Array.from(map.entries())
  }, [screen])

  return (
    <div className="modal-backdrop" onClick={() => setOverlay(null)}>
      <div className="help" onClick={(e) => e.stopPropagation()}>
        <div className="help-header">
          <h2>Keyboard shortcuts</h2>
          <kbd>esc</kbd>
        </div>
        <div className="help-columns">
          {groups.map(([group, items]) => (
            <section key={group}>
              <h3>{group}</h3>
              {items.map((it) => (
                <div key={it.label} className="help-row">
                  <span>{it.label}</span>
                  <span className="help-keys">
                    {it.keys.slice(0, 4).map((k) => (
                      <kbd key={k}>{formatKey(k)}</kbd>
                    ))}
                  </span>
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
