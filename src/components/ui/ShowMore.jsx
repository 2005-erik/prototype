import { ChevronDown } from 'lucide-react'
import { cn } from '../../lib/utils'

// Кнопка «Показать ещё N» под усечённым списком.
// hidden — сколько элементов скрыто, step — размер следующей порции.
export default function ShowMore({ hidden, step = 20, onMore, onAll, className }) {
  if (!hidden) return null
  const next = Math.min(step, hidden)

  return (
    <div className={cn('flex items-center justify-center gap-3 py-2', className)}>
      <button
        type="button"
        onClick={onMore}
        className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-muted transition hover:border-accent hover:text-fg"
      >
        <ChevronDown className="h-3.5 w-3.5" />
        Показать ещё {next}
      </button>
      {onAll && hidden > next && (
        <button
          type="button"
          onClick={onAll}
          className="text-xs text-muted transition hover:text-fg hover:underline"
        >
          все {hidden}
        </button>
      )}
    </div>
  )
}
