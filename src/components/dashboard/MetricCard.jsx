import { ArrowUp, ArrowDown } from 'lucide-react'
import { cn } from '../../lib/utils'

// Одна карточка метрики. delta — число в процентах (может быть null).
export default function MetricCard({
  icon: Icon,
  label,
  value,
  accent = 'default',
  delta = null,
  onClick,
}) {
  const accentClass = {
    default: 'text-muted',
    red: value > 0 ? 'text-red-400' : 'text-muted',
    orange: value > 0 ? 'text-orange-400' : 'text-muted',
    amber: value > 0 ? 'text-amber-400' : 'text-muted',
  }[accent]

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-start rounded-lg border border-line bg-surface p-4 text-left transition hover:border-accent"
    >
      <div className="mb-2 flex w-full items-center justify-between">
        <Icon className={cn('h-5 w-5', accentClass)} />
        {delta != null && delta !== 0 && (
          <span
            className={cn(
              'flex items-center gap-0.5 text-xs font-medium',
              delta > 0 ? 'text-green-400' : 'text-red-400'
            )}
          >
            {delta > 0 ? (
              <ArrowUp className="h-3 w-3" />
            ) : (
              <ArrowDown className="h-3 w-3" />
            )}
            {Math.abs(delta)}%
          </span>
        )}
      </div>
      <span className={cn('text-3xl font-semibold', accentClass)}>{value}</span>
      <span className="mt-1 text-sm text-muted">{label}</span>
    </button>
  )
}
