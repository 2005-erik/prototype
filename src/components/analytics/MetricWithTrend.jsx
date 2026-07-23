import { ArrowUp, ArrowDown } from 'lucide-react'
import { cn } from '../../lib/utils'

// Метрика с дельтой к прошлому периоду.
// higherIsBetter — рост это «хорошо» (зелёный) или «плохо» (красный).
export default function MetricWithTrend({
  icon: Icon,
  label,
  value,
  delta = null,
  higherIsBetter = true,
  onClick,
}) {
  const isGood = delta != null && (delta > 0 ? higherIsBetter : !higherIsBetter)

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-start rounded-lg border border-line bg-surface p-4 text-left transition hover:border-accent"
    >
      <div className="mb-2 flex w-full items-center justify-between">
        {Icon && <Icon className="h-5 w-5 text-muted" />}
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
      <span className="text-3xl font-semibold text-fg">{value}</span>
      <span className="mt-1 text-sm text-muted">{label}</span>
    </button>
  )
}
