import { ArrowUp, ArrowDown } from 'lucide-react'
import { cn } from '../../lib/utils'

// Одна карточка метрики. delta — изменение в процентах (может быть null).
// higherIsBetter — рост метрики это «хорошо» (зелёный) или «плохо» (красный).
export default function MetricCard({
  icon: Icon,
  label,
  value,
  accent = 'default',
  delta = null,
  higherIsBetter = true,
  onClick,
}) {
  const accentClass = {
    default: 'text-muted',
    red: value > 0 ? 'text-red-400' : 'text-muted',
    orange: value > 0 ? 'text-orange-400' : 'text-muted',
    amber: value > 0 ? 'text-amber-400' : 'text-muted',
  }[accent]

  // Хорошо, если направление дельты совпадает со «смыслом» роста
  const isGood = delta != null && (delta > 0 ? higherIsBetter : !higherIsBetter)

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
              isGood ? 'text-green-400' : 'text-red-400'
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
