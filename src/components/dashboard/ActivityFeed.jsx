import {
  Plus,
  Download,
  ArrowRightLeft,
  UserPlus,
  CalendarClock,
  Flag,
  Circle,
} from 'lucide-react'
import { SkeletonText } from '../ui/Skeleton'
import EmptyState from '../ui/EmptyState'
import { Activity } from 'lucide-react'
import { formatRelative } from '../../lib/utils'

const ICON = {
  created: Plus,
  imported: Download,
  status_changed: ArrowRightLeft,
  assigned: UserPlus,
  due_changed: CalendarClock,
  priority_changed: Flag,
}

// Текст действия: «Иванов перевёл #12 в На доработке»
function describe(a) {
  const who = a.profiles?.full_name ?? 'Кто-то'
  const num = a.tasks?.number != null ? `#${a.tasks.number}` : 'задачу'
  switch (a.action) {
    case 'created':
      return `${who} создал(а) ${num}`
    case 'imported':
      return `${who} импортировал(а) ${num} из Trello`
    case 'status_changed':
      return `${who} перевёл(а) ${num} в «${a.new_value ?? '—'}»`
    case 'assigned':
      return `${who} сменил(а) исполнителя ${num}`
    case 'due_changed':
      return `${who} изменил(а) срок ${num}`
    case 'priority_changed':
      return `${who} изменил(а) приоритет ${num}`
    default:
      return `${who}: ${a.action} ${num}`
  }
}

export default function ActivityFeed({ items = [], loading, onShowMore, canShowMore }) {
  if (loading && items.length === 0) {
    return <SkeletonText lines={5} />
  }
  if (items.length === 0) {
    return <EmptyState icon={Activity} title="Пока нет активности" />
  }

  return (
    <div>
      <ul className="space-y-3">
        {items.map((a) => {
          const Icon = ICON[a.action] ?? Circle
          return (
            <li key={a.id} className="animate-fade-slide-in flex gap-2.5">
              <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-line text-muted">
                <Icon className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-fg">{describe(a)}</p>
                {a.action === 'status_changed' && a.comment && (
                  <p className="mt-0.5 text-xs italic text-muted">
                    «{a.comment}»
                  </p>
                )}
                <span className="text-xs text-muted">
                  {formatRelative(a.created_at)}
                </span>
              </div>
            </li>
          )
        })}
      </ul>

      {canShowMore && (
        <button
          type="button"
          onClick={onShowMore}
          className="mt-3 text-xs text-accent transition hover:underline"
        >
          Показать больше
        </button>
      )}
    </div>
  )
}
