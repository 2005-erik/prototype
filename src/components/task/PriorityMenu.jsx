import { useEffect, useRef } from 'react'
import { Check } from 'lucide-react'
import { PRIORITY } from '../../lib/constants'
import { cn } from '../../lib/utils'

// Контекстное меню приоритета: правый клик по карточке — смена без
// открытия задачи. menu: { task, x, y }.
export default function PriorityMenu({ menu, onSelect, onClose }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!menu) return
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    const onEsc = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onEsc)
    }
  }, [menu, onClose])

  if (!menu) return null

  // Клэмп по вьюпорту, чтобы меню не уезжало за край
  const left = Math.min(menu.x, window.innerWidth - 220)
  const top = Math.min(menu.y, window.innerHeight - 200)
  const current = menu.task.priority

  return (
    <div
      ref={ref}
      style={{ left, top }}
      className="fixed z-50 w-52 overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-xl"
      role="menu"
    >
      <p className="px-3 py-1 text-xs uppercase text-muted">Приоритет</p>
      {Object.entries(PRIORITY).map(([key, val]) => {
        const Icon = val.icon
        return (
          <button
            key={key}
            type="button"
            role="menuitemradio"
            aria-checked={current === key}
            onClick={() => {
              onClose()
              if (key !== current) onSelect(menu.task, key)
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-fg transition hover:bg-line"
          >
            <Icon className="h-3.5 w-3.5" style={{ color: val.color }} />
            <span className="flex-1">{val.label}</span>
            {current === key && (
              <Check className={cn('h-3.5 w-3.5 text-accent')} />
            )}
          </button>
        )
      })}
    </div>
  )
}
