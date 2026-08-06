import { useMemo } from 'react'
import EmptyState from '../ui/EmptyState'
import { formatDaysDuration, formatDeadline } from '../../lib/utils'

function daysInWork(t) {
  if (!t.created_at) return 0
  const end = t.completed_at ? new Date(t.completed_at) : new Date()
  return (end.getTime() - new Date(t.created_at).getTime()) / 86400000
}

function StatusBadge({ task }) {
  return (
    <span
      className="rounded px-1.5 py-0.5 text-[11px] text-white"
      style={{ backgroundColor: task.status_color ?? '#ecc371' }}
    >
      {task.status_name}
    </span>
  )
}

function TaskLine({ task, onOpen, right }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(task)}
      className="flex w-full items-center gap-3 rounded-lg border border-line bg-app px-3 py-2 text-left transition hover:border-accent"
    >
      <span className="text-xs text-muted">#{task.number}</span>
      <span className="min-w-0 flex-1 truncate text-sm text-fg">
        {task.title}
      </span>
      {task.assignee_name && (
        <span className="hidden truncate text-xs text-muted sm:block">
          {task.assignee_name}
        </span>
      )}
      <StatusBadge task={task} />
      <span className="flex-shrink-0 text-xs font-medium text-fg">{right}</span>
    </button>
  )
}

function Block({ title, children }) {
  return (
    <section className="rounded-lg border border-line bg-surface p-4">
      <h3 className="mb-3 text-sm font-semibold text-fg">{title}</h3>
      {children}
    </section>
  )
}

export default function TasksTab({ tasks = [], onOpen }) {
  const topRework = useMemo(
    () =>
      [...tasks]
        .filter((t) => (t.rework_count ?? 0) > 0)
        .sort((a, b) => (b.rework_count ?? 0) - (a.rework_count ?? 0))
        .slice(0, 10),
    [tasks]
  )

  const topLongest = useMemo(
    () =>
      [...tasks]
        .sort((a, b) => daysInWork(b) - daysInWork(a))
        .slice(0, 10),
    [tasks]
  )

  const overdue = useMemo(
    () =>
      [...tasks]
        .filter((t) => t.deadline_state === 'overdue')
        .sort((a, b) => new Date(a.due_date) - new Date(b.due_date)),
    [tasks]
  )

  if (tasks.length === 0) {
    return (
      <EmptyState
        title="Задач пока нет"
        description="Создайте первую или импортируйте из Trello."
      />
    )
  }

  return (
    <div className="space-y-6">
      <Block title="Топ-10 по возвратам">
        {topRework.length === 0 ? (
          <p className="text-sm text-muted/60">Возвратов нет</p>
        ) : (
          <div className="space-y-2">
            {topRework.map((t) => (
              <TaskLine
                key={t.id}
                task={t}
                onOpen={onOpen}
                right={`${t.rework_count} возвр.`}
              />
            ))}
          </div>
        )}
      </Block>

      <Block title="Топ-10 самых долгих">
        <div className="space-y-2">
          {topLongest.map((t) => (
            <TaskLine
              key={t.id}
              task={t}
              onOpen={onOpen}
              right={formatDaysDuration(daysInWork(t))}
            />
          ))}
        </div>
      </Block>

      <Block title="Просроченные">
        {overdue.length === 0 ? (
          <p className="text-sm text-muted/60">Просроченных нет</p>
        ) : (
          <div className="space-y-2">
            {overdue.map((t) => (
              <TaskLine
                key={t.id}
                task={t}
                onOpen={onOpen}
                right={
                  <span className="text-red-400">
                    {formatDeadline(t.due_date)}
                  </span>
                }
              />
            ))}
          </div>
        )}
      </Block>
    </div>
  )
}
