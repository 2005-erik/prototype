import { cn } from '../../lib/utils'

// totals: { active, review, queued, high, overloaded, unassigned, overdue }
export default function TeamSummary({ totals, filter, onFilter }) {
  const chip = (key, label, value, danger, filterable = true) => (
    <button
      type="button"
      disabled={!filterable}
      onClick={() => filterable && onFilter(filter === key ? null : key)}
      className={cn(
        'flex items-baseline gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition',
        filter === key ? 'border-accent bg-accent/10' : 'border-line hover:border-accent'
      )}
    >
      <span className={cn('text-base font-semibold', danger && value > 0 ? 'text-red-400' : 'text-fg')}>
        {value}
      </span>
      <span className="text-xs text-muted">{label}</span>
    </button>
  )

  return (
    <div className="flex flex-wrap gap-2">
      {chip('active', 'в работе', totals.active)}
      {chip('review', 'на проверке', totals.review, false, false)}
      {chip('queued', 'в очереди', totals.queued, false, false)}
      {chip('high', 'высокая загрузка', totals.high)}
      {chip('overloaded', 'перегружено', totals.overloaded, true)}
      {chip('unassigned', 'без исполнителя', totals.unassigned, true)}
      {chip('overdue', 'просрочено', totals.overdue, true)}
    </div>
  )
}
