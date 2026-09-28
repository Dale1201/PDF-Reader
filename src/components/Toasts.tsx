import { useEffect } from 'react'
import { useStore } from '../store'

export default function Toasts() {
  const toasts = useStore((s) => s.toasts)
  const dismissToast = useStore((s) => s.dismissToast)

  useEffect(() => {
    if (toasts.length === 0) return
    const t = toasts[toasts.length - 1]
    const timer = setTimeout(() => dismissToast(t.id), t.kind === 'error' ? 5000 : 2600)
    return () => clearTimeout(timer)
  }, [toasts, dismissToast])

  if (toasts.length === 0) return null
  return (
    <div className="toasts" role="status">
      {toasts.slice(-3).map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`} onClick={() => dismissToast(t.id)}>
          {t.message}
        </div>
      ))}
    </div>
  )
}
