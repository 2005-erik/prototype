import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useRef,
} from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'
import { cn } from '../../lib/utils'

const ToastContext = createContext(null)

const TYPES = {
  success: { icon: CheckCircle2, ring: 'ring-green-500/40', color: 'text-green-400' },
  error: { icon: AlertCircle, ring: 'ring-red-500/40', color: 'text-red-400' },
  info: { icon: Info, ring: 'ring-blue-500/40', color: 'text-blue-400' },
}

function ToastViewport({ toasts, onClose }) {
  return createPortal(
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-full max-w-sm flex-col gap-2">
      {toasts.map((t) => {
        const { icon: Icon, ring, color } = TYPES[t.type] ?? TYPES.info
        return (
          <div
            key={t.id}
            role="status"
            className={cn(
              'pointer-events-auto flex items-start gap-2.5 rounded-lg border border-line bg-surface px-3.5 py-2.5 shadow-lg ring-1',
              ring
            )}
          >
            <Icon className={cn('mt-0.5 h-5 w-5 flex-shrink-0', color)} />
            <p className="flex-1 text-sm text-fg">{t.message}</p>
            <button
              type="button"
              onClick={() => onClose(t.id)}
              className="text-muted transition hover:text-fg"
              aria-label="Закрыть"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )
      })}
    </div>,
    document.body
  )
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const idRef = useRef(0)

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const push = useCallback(
    (type, message, opts = {}) => {
      const id = ++idRef.current
      setToasts((prev) => [...prev, { id, type, message }])
      const duration = opts.duration ?? 4000
      if (duration > 0) setTimeout(() => dismiss(id), duration)
      return id
    },
    [dismiss]
  )

  const value = useMemo(
    () => ({
      toast: {
        success: (message, opts) => push('success', message, opts),
        error: (message, opts) => push('error', message, opts),
        info: (message, opts) => push('info', message, opts),
      },
      dismiss,
    }),
    [push, dismiss]
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onClose={dismiss} />
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast должен использоваться внутри <ToastProvider>')
  }
  return ctx
}
