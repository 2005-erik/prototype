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
  Flame,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useMyDay, useMyTasks, useReworkReasons } from '../hooks/useMyDay'
import { useProjects, useProjectStatusesMap } from '../hooks/useProjects'
import { compareByPriorityAndDue } from '../lib/constants'
import { formatDate, cn } from '../lib/utils'
import Skeleton from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'
import ShowMore from '../components/ui/ShowMore'
import { useIncrementalList } from '../hooks/useCollapse'
import TaskRow from '../components/task/TaskRow'

// Приветствие по времени суток
function greeting() {
  const h = new Date().getHours()
  if (h < 6) return 'Доброй ночи'
  if (h < 12) return 'Доброе утро'
  if (h < 18) return 'Добрый день'
  return 'Добрый вечер'
}

// Список задач внутри секции: сначала 20, дальше по кнопке
function GroupTasks({ tasks, render }) {
  const { visible, hidden, showMore, showAll, step } = useIncrementalList(tasks, 20)
  return (
    <>
      {visible.map(render)}
      <ShowMore hidden={hidden} step={step} onMore={showMore} onAll={showAll} />
    </>
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
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { data, loading: dayLoading } = useMyDay()
  const { tasks: allMine, loading: tasksLoading } = useMyTasks({
    showCompleted: false,
  })
  const { projects } = useProjects({ includeArchived: true })

  const projectById = useMemo(() => {
    const map = {}
    for (const p of projects) map[p.id] = p
    return map
  }, [projects])

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

    // Критические — первыми: срочность важнее того, в какой они стадии
    const gCritical = take(
      [...allMine]
        .filter((t) => t.priority === 'critical')
        .sort(compareByPriorityAndDue)
    )
    const gRework = take(rework)
    const gOverdue = take(overdue)
    const gToday = take(today)
    const gInProgress = take(inProgress)
    const gSoon = take(soon)
    // «Без срока» — из полного набора, не попавшие выше
    const gNoDeadline = allMine.filter(
      (t) => t.deadline_state === 'no_deadline' && !seen.has(t.id)
    )

    return {
      gCritical,
      gRework,
      gOverdue,
      gToday,
      gInProgress,
      gSoon,
      gNoDeadline,
    }
  }, [data, allMine])

  const reworkIds = useMemo(
    () => groups.gRework.map((t) => t.id),
    [groups.gRework]
  )
  const reasons = useReworkReasons(reworkIds)

  // Статусы задействованных проектов — для кнопок смены статуса в TaskRow
  const involvedIds = useMemo(() => {
    const ids = new Set()
    for (const key of Object.keys(groups)) {
      for (const t of groups[key]) ids.add(t.project_id)
    }
    return [...ids]
  }, [groups])
  const statusesByProject = useProjectStatusesMap(involvedIds)

  const renderTask = (t, reason) => (
    <TaskRow
      key={t.id}
      task={t}
      statuses={statusesByProject[t.project_id] ?? []}
      project={projectById[t.project_id]}
      reason={reason}
      onOpen={(task) => navigate(`/task/${task.id}`)}
    />
  )

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
    groups.gCritical.length === 0 &&
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
          {/* 0. Критические — то, что горит по важности, а не по сроку */}
          {groups.gCritical.length > 0 && (
            <Section
              icon={Flame}
              title="Критические"
              titleClass="text-red-400"
              count={groups.gCritical.length}
              danger
            >
              <GroupTasks tasks={groups.gCritical} render={(t) => renderTask(t, reasons[t.id])} />
            </Section>
          )}

          {/* 1. Вернули на доработку */}
          {groups.gRework.length > 0 && (
            <Section
              icon={RotateCcw}
              title="Вернули на доработку"
              titleClass="text-red-400"
              count={groups.gRework.length}
              danger
            >
              <GroupTasks tasks={groups.gRework} render={(t) => renderTask(t, reasons[t.id])} />
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
              <GroupTasks tasks={groups.gOverdue} render={(t) => renderTask(t)} />
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
              <GroupTasks tasks={groups.gToday} render={(t) => renderTask(t)} />
            </Section>
          )}

          {/* 4. В работе */}
          {groups.gInProgress.length > 0 && (
            <Section
              icon={Play}
              title="В работе"
              count={groups.gInProgress.length}
            >
              <GroupTasks tasks={groups.gInProgress} render={(t) => renderTask(t)} />
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
              <GroupTasks tasks={groups.gSoon} render={(t) => renderTask(t)} />
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
              <GroupTasks tasks={groups.gNoDeadline} render={(t) => renderTask(t)} />
            </Section>
          )}
        </div>
      )}
    </div>
  )
}
