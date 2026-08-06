import { Inbox, ChevronRight } from 'lucide-react'
import Avatar from '../ui/Avatar'
import Button from '../ui/Button'
import { LOAD_STATE } from '../../lib/constants'
import { cn } from '../../lib/utils'

const BAR_COLOR = {
  free: 'bg-slate-500',
  normal: 'bg-[#2bbaac]',
  busy: 'bg-orange-500',
  overloaded: 'bg-red-500',
}

// Карточка сотрудника — только сводка. Список задач открывается
// в панели справа: так сетка не перестраивается при раскрытии.
export function TeamMemberCard({ column, onOpen }) {
  const load = column.load
  const overloaded = load?.load_state === 'overloaded'
  const pct = Math.min(100, load?.load_percent ?? 0)

  // «в работе» — начатые, «в очереди» — всё остальное активное
  const inProgress = column.tasks.filter(
    (t) => t.status_code === 'in_progress'
  ).length
  const queued = Math.max(0, column.tasks.length - inProgress)

  return (
    <button
      type="button"
      onClick={() => onOpen(column)}
      className={cn(
        'flex w-full flex-col rounded-lg border bg-surface p-3 text-left transition hover:border-accent',
        overloaded ? 'border-red-500/50' : 'border-line'
      )}
    >
      <div className="flex items-center gap-2.5">
        <Avatar
          name={column.profile?.full_name}
          src={column.profile?.avatar_url}
          size="sm"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-fg">
            {column.profile?.full_name}
          </p>
          {column.profile?.position && (
            <p className="truncate text-xs text-muted">
              {column.profile.position}
            </p>
          )}
        </div>
        <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted" />
      </div>

      {/* Полоса загрузки */}
      <div className="mt-2.5 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
          <div
            className={cn('h-full rounded-full', BAR_COLOR[load.load_state])}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span
          className="flex-shrink-0 text-[11px] font-medium"
          style={{ color: LOAD_STATE[load.load_state]?.color }}
        >
          {LOAD_STATE[load.load_state]?.label}
        </span>
      </div>

      {/* Сводка вместо списка */}
      <p className="mt-2 text-xs text-muted">
        {inProgress} в работе · {queued} в очереди
        <span className="text-muted/60"> · порог {load.max_concurrent_tasks}</span>
      </p>

      {(load.overdue > 0 || load.today > 0) && (
        <p className="mt-1 flex gap-2 text-xs">
          {load.overdue > 0 && (
            <span className="text-red-400">{load.overdue} просрочено</span>
          )}
          {load.today > 0 && (
            <span className="text-orange-400">{load.today} горит</span>
          )}
        </p>
      )}
    </button>
  )
}

// Карточка «Без исполнителя» — счётчик и переход к распределению
export function UnassignedCard({ count, onDistribute }) {
  return (
    <div className="flex flex-col justify-between rounded-lg border border-line bg-line/20 p-3">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-line text-muted">
          <Inbox className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-fg">Без исполнителя</p>
          <p className="text-xs text-muted">
            {count > 0 ? `${count} ждут распределения` : 'все задачи распределены'}
          </p>
        </div>
      </div>

      <Button
        size="sm"
        variant={count > 0 ? 'primary' : 'secondary'}
        className="mt-3 w-full"
        onClick={onDistribute}
        disabled={count === 0}
      >
        Распределить
      </Button>
    </div>
  )
}
