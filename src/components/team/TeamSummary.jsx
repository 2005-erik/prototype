import { cn } from '../../lib/utils'

// totals: { active, free, overloaded, unassigned, overdue }
export default function TeamSummary({ totals, filter, onFilter }) {
  const chip = (key, label, value, danger) => (
    <button
      type="button"
      onClick={() => onFilter(filter === key ? null : key)}
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
      {chip('active', 'активных', totals.active)}
      {chip('free', 'свободных', totals.free)}
      {chip('overloaded', 'перегружено', totals.overloaded, true)}
      {chip('unassigned', 'без исполнителя', totals.unassigned, true)}
      {chip('overdue', 'просрочено', totals.overdue, true)}
    </div>
  )
}
