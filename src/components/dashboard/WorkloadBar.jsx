import Avatar from '../ui/Avatar'
import { LOAD_STATE } from '../../lib/constants'
import { cn } from '../../lib/utils'

// Цвет прогресс-бара по состоянию загрузки
const BAR_COLOR = {
  free: 'bg-slate-500',
  normal: 'bg-blue-500',
  busy: 'bg-orange-500',
  overloaded: 'bg-red-500',
}

// Одна строка загрузки сотрудника
export default function WorkloadBar({ row, profile, onSelect }) {
  const load = LOAD_STATE[row.load_state]
  const pct = Math.min(100, Math.round(row.load_percent ?? 0))

  return (
    <button
      type="button"
      onClick={() => onSelect?.(row.user_id)}
      className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition hover:bg-line"
    >
      <Avatar name={row.full_name} src={profile?.avatar_url} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm text-fg">{row.full_name}</span>
          <span className="flex-shrink-0 text-xs text-muted">
            {row.active_tasks} / {row.max_concurrent_tasks} задач
          </span>
        </div>
        {profile?.position && (
          <p className="truncate text-xs text-muted">{profile.position}</p>
        )}
        <div className="mt-1.5 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                BAR_COLOR[row.load_state] ?? 'bg-slate-500'
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span
            className="flex-shrink-0 text-[11px] font-medium"
            style={{ color: load?.color }}
          >
            {load?.label}
          </span>
          {row.overdue_tasks > 0 && (
            <span className="flex-shrink-0 rounded bg-red-500/15 px-1.5 py-0.5 text-[11px] font-medium text-red-400">
              {row.overdue_tasks} просрочено
            </span>
          )}
        </div>
      </div>
    </button>
  )
}
