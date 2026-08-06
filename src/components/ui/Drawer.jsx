import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

// Выезжающая справа панель
export default function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
  width = 600,
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className="safe-bottom safe-right absolute right-0 top-0 flex h-full w-full flex-col border-l border-line bg-surface shadow-xl"
        style={{ maxWidth: width }}
        role="dialog"
        aria-modal="true"
      >
        {title && (
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-3">
            <div className="min-w-0 flex-1 text-base font-semibold text-fg">
              {title}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="touch-target mt-0.5 flex-shrink-0 rounded-lg p-1.5 text-muted transition hover:bg-line hover:text-fg"
              aria-label="Закрыть"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
            {footer}
          </div>
        )}
      </aside>
    </div>,
    document.body
  )
}
