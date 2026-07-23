import { useState, useMemo } from 'react'
import { CheckCircle2 } from 'lucide-react'
import EmptyState from '../ui/EmptyState'
import { cn, formatDeadline } from '../../lib/utils'

// Собирает приоритизированный список проблемных задач
function buildAttention(tasks) {
  const seen = new Set()
  const out = []

  // 1) Просроченные
  for (const t of tasks) {
    if (t.completed_at) continue
    if (t.deadline_state === 'overdue' && !seen.has(t.id)) {
      seen.add(t.id)
      out.push({ task: t, dot: 'bg-red-500', reason: formatDeadline(t.due_date) })
    }
  }
  // 2) Застрявшие
  for (const t of tasks) {
    if (t.completed_at) continue
    if (t.is_stale && !seen.has(t.id)) {
      seen.add(t.id)
      const days = Math.round(t.days_in_current_status ?? 0)
      out.push({ task: t, dot: 'bg-amber-500', reason: `Не двигается ${days} дн.` })
    }
  }
  // 3) Частые возвраты
  for (const t of tasks) {
    if (t.completed_at) continue
    if ((t.rework_count ?? 0) >= 2 && !seen.has(t.id)) {
      seen.add(t.id)
      out.push({
        task: t,
        dot: 'bg-orange-500',
        reason: `Возвращали ${t.rework_count} раз`,
      })
    }
  }
  return out
}

export default function AttentionList({ tasks = [], onOpen }) {
  const [showAll, setShowAll] = useState(false)
  const all = useMemo(() => buildAttention(tasks), [tasks])
  const shown = showAll ? all : all.slice(0, 10)

  if (all.length === 0) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title="Всё под контролем"
        description="Проблемных задач нет."
      />
    )
  }

  return (
    <div>
      <ul className="space-y-1">
        {shown.map(({ task, dot, reason }) => (
          <li key={task.id}>
            <button
              type="button"
              onClick={() => onOpen(task)}
              className="flex w-full items-start gap-2.5 rounded-lg p-2 text-left transition hover:bg-line"
            >
              <span className={cn('mt-1.5 h-2 w-2 flex-shrink-0 rounded-full', dot)} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-fg">
                  <span className="text-muted">#{task.number}</span> {task.title}
                </p>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted">{reason}</span>
                  {task.assignee_name && (
                    <span className="truncate text-muted/70">
                      · {task.assignee_name}
                    </span>
                  )}
                </div>
              </div>
            </button>
          </li>
        ))}
      </ul>

      {all.length > 10 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-2 text-xs text-accent transition hover:underline"
        >
          {showAll ? 'Свернуть' : `Показать все (${all.length})`}
        </button>
      )}
    </div>
  )
}
