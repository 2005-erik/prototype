import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  RotateCcw,
  AlertTriangle,
  Clock,
  Play,
  CalendarDays,
  Inbox,
  ChevronDown,
  ChevronRight,
  Sun,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useMyDay, useMyTasks, useReworkReasons } from '../hooks/useMyDay'
import { PRIORITY, DEADLINE_STATE } from '../lib/constants'
import { formatDate, formatDeadline, cn } from '../lib/utils'
import Skeleton from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'

// Приветствие по времени суток
function greeting() {
  const h = new Date().getHours()
  if (h < 6) return 'Доброй ночи'
  if (h < 12) return 'Доброе утро'
  if (h < 18) return 'Добрый день'
  return 'Добрый вечер'
}

// Компактная карточка задачи
function TaskRow({ task, reason }) {
  const navigate = useNavigate()
  const prio = PRIORITY[task.priority]
  const deadline = DEADLINE_STATE[task.deadline_state]
  return (
    <button
      type="button"
      onClick={() => navigate(`/task/${task.id}`)}
      className="flex w-full items-start gap-3 rounded-lg border border-line bg-app p-3 text-left transition hover:border-accent"
    >
      {prio && (
        <span
          className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full"
          style={{ backgroundColor: prio.color }}
          title={prio.label}
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-fg">
          <span className="text-muted">#{task.number}</span> {task.title}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
          {task.status_name && (
            <span
              className="rounded px-1.5 py-0.5 text-white"
              style={{ backgroundColor: task.status_color ?? '#3b82f6' }}
            >
              {task.status_name}
            </span>
          )}
          {task.due_date && (
            <span style={{ color: deadline?.color }}>
              {formatDeadline(task.due_date)}
            </span>
          )}
        </div>
        {reason && (
          <p className="mt-1.5 rounded bg-red-500/10 px-2 py-1 text-xs text-red-300">
            <span className="font-medium">Причина возврата:</span> {reason}
          </p>
        )}
      </div>
    </button>
  )
}

// Секция группы задач
function Section({ icon: Icon, title, titleClass, count, danger, children, collapsible, defaultCollapsed }) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed ?? false)
  return (
    <section
      className={cn(
        'rounded-lg border p-4',
        danger ? 'border-red-500/40' : 'border-line'
      )}
    >
      <button
        type="button"
        onClick={() => collapsible && setCollapsed((v) => !v)}
        className={cn(
          'mb-3 flex w-full items-center gap-2',
          collapsible ? 'cursor-pointer' : 'cursor-default'
        )}
      >
        {Icon && <Icon className={cn('h-4 w-4', titleClass)} />}
        <h3 className={cn('text-sm font-semibold', titleClass ?? 'text-fg')}>
          {title}
        </h3>
        <span className="rounded-full bg-line px-1.5 text-xs text-muted">
          {count}
        </span>
        {collapsible && (
          <span className="ml-auto text-muted">
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </span>
        )}
      </button>
      {!collapsed && <div className="space-y-2">{children}</div>}
    </section>
  )
}

export default function MyDayPage() {
  const { profile } = useAuth()
  const { data, loading: dayLoading } = useMyDay()
  const { tasks: allMine, loading: tasksLoading } = useMyTasks({
    showCompleted: false,
  })

  const groups = useMemo(() => {
    const rework = data?.rework ?? []
    const overdue = data?.overdue ?? []
    const today = data?.today ?? []
    const inProgress = data?.in_progress ?? []
    const soon = data?.soon ?? []

    // Дедуп по приоритету секций
    const seen = new Set()
    const take = (arr) => {
      const out = []
      for (const t of arr) {
        if (seen.has(t.id)) continue
        seen.add(t.id)
        out.push(t)
      }
      return out
    }

    const gRework = take(rework)
    const gOverdue = take(overdue)
    const gToday = take(today)
    const gInProgress = take(inProgress)
    const gSoon = take(soon)
    // «Без срока» — из полного набора, не попавшие выше
    const gNoDeadline = allMine.filter(
      (t) => t.deadline_state === 'no_deadline' && !seen.has(t.id)
    )

    return { gRework, gOverdue, gToday, gInProgress, gSoon, gNoDeadline }
  }, [data, allMine])

  const reworkIds = useMemo(
    () => groups.gRework.map((t) => t.id),
    [groups.gRework]
  )
  const reasons = useReworkReasons(reworkIds)

  const firstName = (profile?.full_name ?? '').trim().split(/\s+/)[0] || ''

  const totalActive = allMine.length
  const burning = groups.gOverdue.length + groups.gToday.length
  const reworkCount = groups.gRework.length

  const summary = [
    `${totalActive} задач`,
    burning > 0 ? `${burning} горят` : null,
    reworkCount > 0 ? `${reworkCount} на доработке` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const loading = dayLoading || tasksLoading
  const nothing =
    !loading &&
    totalActive === 0 &&
    groups.gRework.length === 0 &&
    groups.gOverdue.length === 0 &&
    groups.gToday.length === 0 &&
    groups.gInProgress.length === 0 &&
    groups.gSoon.length === 0 &&
    groups.gNoDeadline.length === 0

  if (loading && !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {/* Приветствие */}
      <div>
        <h1 className="text-2xl font-semibold text-fg">
          {greeting()}
          {firstName ? `, ${firstName}` : ''}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {formatDate(new Date())}
          {summary && <span className="text-muted"> · {summary}</span>}
        </p>
      </div>

      {nothing ? (
        <EmptyState
          icon={Sun}
          title="На сегодня задач нет"
          description="Отличная работа — можно выдохнуть."
        />
      ) : (
        <div className="space-y-4">
          {/* 1. Вернули на доработку */}
          {groups.gRework.length > 0 && (
            <Section
              icon={RotateCcw}
              title="Вернули на доработку"
              titleClass="text-red-400"
              count={groups.gRework.length}
              danger
            >
              {groups.gRework.map((t) => (
                <TaskRow key={t.id} task={t} reason={reasons[t.id]} />
              ))}
            </Section>
          )}

          {/* 2. Просрочено */}
          {groups.gOverdue.length > 0 && (
            <Section
              icon={AlertTriangle}
              title="Просрочено"
              titleClass="text-red-400"
              count={groups.gOverdue.length}
            >
              {groups.gOverdue.map((t) => (
                <TaskRow key={t.id} task={t} />
              ))}
            </Section>
          )}

          {/* 3. Сегодня */}
          {groups.gToday.length > 0 && (
            <Section
              icon={Clock}
              title="Сегодня"
              titleClass="text-orange-400"
              count={groups.gToday.length}
            >
              {groups.gToday.map((t) => (
                <TaskRow key={t.id} task={t} />
              ))}
            </Section>
          )}

          {/* 4. В работе */}
          {groups.gInProgress.length > 0 && (
            <Section
              icon={Play}
              title="В работе"
              count={groups.gInProgress.length}
            >
              {groups.gInProgress.map((t) => (
                <TaskRow key={t.id} task={t} />
              ))}
            </Section>
          )}

          {/* 5. Ближайшие 3 дня */}
          {groups.gSoon.length > 0 && (
            <Section
              icon={CalendarDays}
              title="Ближайшие 3 дня"
              titleClass="text-muted"
              count={groups.gSoon.length}
            >
              {groups.gSoon.map((t) => (
                <TaskRow key={t.id} task={t} />
              ))}
            </Section>
          )}

          {/* 6. Без срока (свёрнута по умолчанию) */}
          {groups.gNoDeadline.length > 0 && (
            <Section
              icon={Inbox}
              title="Без срока"
              titleClass="text-muted"
              count={groups.gNoDeadline.length}
              collapsible
              defaultCollapsed
            >
              {groups.gNoDeadline.map((t) => (
                <TaskRow key={t.id} task={t} />
              ))}
            </Section>
          )}
        </div>
      )}
    </div>
  )
}
