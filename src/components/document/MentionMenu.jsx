import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ListPlus, MessageSquare } from 'lucide-react'

const WIDTH = 220

// Меню по клику на «@имя» в тексте: упоминание — это чаще всего
// поручение, поэтому первым действием идёт постановка задачи.
export default function MentionMenu({ target, onClose, onCreateTask, onComment }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!target) return
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [target, onClose])

  if (!target) return null

  // Не даём меню уехать за правый край окна
  const left = Math.min(target.x, window.innerWidth - WIDTH - 8)

  return createPortal(
    <div
      ref={ref}
      style={{ top: target.y + 4, left, width: WIDTH }}
      className="fixed z-50 overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-lg"
      role="menu"
    >
      <p className="truncate px-3 py-1 text-xs text-muted">{target.label}</p>
      <button
        type="button"
        onClick={onCreateTask}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-fg transition hover:bg-line"
        role="menuitem"
      >
        <ListPlus className="h-4 w-4 flex-shrink-0 text-muted" />
        Поставить задачу
      </button>
      <button
        type="button"
        onClick={onComment}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-fg transition hover:bg-line"
        role="menuitem"
      >
        <MessageSquare className="h-4 w-4 flex-shrink-0 text-muted" />
        Спросить в комментарии
      </button>
    </div>,
    document.body
  )
}
