import { lazy, Suspense, useEffect, useRef } from 'react'
import * as db from './db'
import { registry, type ActiveContext } from './keys'
import { useStore } from './store'
import Library from './components/Library'
import Toasts from './components/Toasts'

const Reader = lazy(() => import('./components/Reader'))
const CommandPalette = lazy(() => import('./components/CommandPalette'))
const HelpOverlay = lazy(() => import('./components/HelpOverlay'))

export default function App() {
  const screen = useStore((s) => s.screen)
  const overlay = useStore((s) => s.overlay)
  const theme = useStore((s) => s.theme)
  const pageFilter = useStore((s) => s.pageFilter)
  const currentBookId = useStore((s) => s.currentBookId)
  const settingsLoaded = useRef(false)

  useEffect(() => {
    void db.getSettings().then((s) => {
      useStore.setState({ theme: s.theme, pageFilter: s.pageFilter })
      settingsLoaded.current = true
    })
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    if (settingsLoaded.current) void db.saveSettings({ theme, pageFilter })
  }, [theme, pageFilter])

  useEffect(() => {
    const offs = [
      registry.register({
        id: 'palette', keys: ['mod+k'], label: 'Command palette', context: 'global', group: 'General',
        run: () => useStore.setState((s) => ({ overlay: s.overlay === 'palette' ? null : 'palette' })),
      }),
      registry.register({
        id: 'help', keys: ['?'], label: 'Keyboard shortcuts', context: 'global', group: 'General',
        run: () => useStore.setState((s) => ({ overlay: s.overlay === 'help' ? null : 'help' })),
      }),
      registry.register({
        id: 'theme-cycle', keys: ['t'], label: 'Cycle theme', context: 'global', group: 'General',
        run: () => useStore.getState().cycleTheme(),
      }),
    ]
    return () => offs.forEach((off) => off())
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const state = useStore.getState()
      if (state.overlay) {
        if (e.key === 'Escape') {
          state.setOverlay(null)
          e.preventDefault()
        }
        return
      }
      if (e.key === 'Escape' && state.screen === 'library') return
      const contexts: ActiveContext[] =
        state.screen === 'reader' && state.sidebar ? ['sidebar', 'reader'] : [state.screen]
      if (registry.handle(e, contexts)) e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      {screen === 'library' && <Library />}
      {screen === 'reader' && currentBookId && (
        <Suspense fallback={<div className="reader-loading">Opening…</div>}>
          <Reader key={currentBookId} bookId={currentBookId} />
        </Suspense>
      )}
      <Suspense fallback={null}>
        {overlay === 'palette' && <CommandPalette />}
        {overlay === 'help' && <HelpOverlay />}
      </Suspense>
      <Toasts />
    </>
  )
}
