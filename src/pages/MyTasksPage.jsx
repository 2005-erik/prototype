import { useState, useEffect, useMemo } from 'react'
import { Search } from 'lucide-react'
import { useMyTasks, useMyTasksSummary } from '../hooks/useMyDay'
import {
  useProjects,
  useProjectStatusesMap,
  useManagedProjectMembers,
} from '../hooks/useProjects'
import { PRIORITY, STATUSES, STATUS_LABELS, DEADLINE_STATE } from '../lib/constants'
import { cn } from '../lib/utils'
import Select from '../components/ui/Select'
import Skeleton from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'
import TaskRow from '../components/task/TaskRow'
import TaskDrawer from '../components/task/TaskDrawer'

const PAGE = 20

const PRIO_RANK = { critical: 4, high: 3, medium: 2, low: 1 }

const SORTS = [
  { value: 'due', label: 'По сроку' },
  { value: 'priority', label: 'По приоритету' },
  { value: 'created', label: 'По дате создания' },
  { value: 'project', label: 'По проекту' },
]

const GROUPS = [
  { value: 'due', label: 'По сроку' },
  { value: 'project', label: 'По проекту' },
  { value: 'status', label: 'По статусу' },
]

const DUE_BUCKETS = [
  { key: 'overdue', label: 'Просрочено', cls: 'text-red-400' },
  { key: 'today', label: 'Сегодня', cls: 'text-orange-400' },
  { key: 'week', label: 'На неделе', cls: 'text-fg' },
  { key: 'later', label: 'Позже', cls: 'text-muted' },
  { key: 'no_deadline', label: 'Без срока', cls: 'text-muted' },
]

const DEADLINE_FILTERS = ['overdue', 'critical', 'warning', 'normal', 'no_deadline']

// Определить срочную корзину задачи
function dueBucket(task) {
  if (!task.due_date) return 'no_deadline'
  const due = new Date(task.due_date)
  const now = new Date()
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const endToday = new Date(startToday.getTime() + 86400000)
  const week = new Date(startToday.getTime() + 7 * 86400000)
  if (due < startToday) return 'overdue'
  if (due < endToday) return 'today'
  if (due < week) return 'week'
  return 'later'
}

export default function MyTasksPage() {
  // Фильтры
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [projectId, setProjectId] = useState('')
  const [statusCode, setStatusCode] = useState('')
  const [priority, setPriority] = useState('')
  const [deadlineState, setDeadlineState] = useState('')
  const [showCompleted, setShowCompleted] = useState(false)
  const [sortBy, setSortBy] = useState('due')
  const [groupBy, setGroupBy] = useState('due')
  const [visible, setVisible] = useState(PAGE)
  const [openTask, setOpenTask] = useState(null)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const { projects } = useProjects({ includeArchived: true })
  const { summary } = useMyTasksSummary()
  const { tasks, loading } = useMyTasks({
    projectId: projectId || undefined,
    statusCode: statusCode || undefined,
    priority: priority || undefined,
    deadlineState: deadlineState || undefined,
    search: debounced,
    showCompleted,
  })

  // Карты проектов и статусов
  const projectById = useMemo(() => {
    const map = {}
    for (const p of projects) map[p.id] = p
    return map
  }, [projects])

  const involvedIds = useMemo(
    () => [...new Set(tasks.map((t) => t.project_id))],
    [tasks]
  )
  const statusesByProject = useProjectStatusesMap(involvedIds)

  // Участники проекта открытой задачи — только если пользователь ими управляет
  const drawerMembers = useManagedProjectMembers(openTask?.project_id ?? null)

  // Сортировка
  const sorted = useMemo(() => {
    const arr = [...tasks]
    arr.sort((a, b) => {
      if (sortBy === 'priority') {
        return (PRIO_RANK[b.priority] ?? 0) - (PRIO_RANK[a.priority] ?? 0)
      }
      if (sortBy === 'created') {
        return new Date(b.created_at) - new Date(a.created_at)
      }
      if (sortBy === 'project') {
        const an = projectById[a.project_id]?.name ?? ''
        const bn = projectById[b.project_id]?.name ?? ''
        return an.localeCompare(bn)
      }
      // due (nulls last)
      if (!a.due_date && !b.due_date) return 0
      if (!a.due_date) return 1
      if (!b.due_date) return -1
      return new Date(a.due_date) - new Date(b.due_date)
    })
    return arr
  }, [tasks, sortBy, projectById])

  const paged = sorted.slice(0, visible)

  // Группировка
  const groups = useMemo(() => {
    if (groupBy === 'due') {
      const b = {}
      for (const key of DUE_BUCKETS.map((x) => x.key)) b[key] = []
      for (const t of paged) b[dueBucket(t)].push(t)
      return DUE_BUCKETS.map((x) => ({
        key: x.key,
        label: x.label,
        cls: x.cls,
        items: b[x.key],
      })).filter((g) => g.items.length > 0)
    }
    if (groupBy === 'project') {
      const b = {}
      for (const t of paged) {
        const id = t.project_id
        if (!b[id]) b[id] = []
        b[id].push(t)
      }
      return Object.entries(b).map(([id, items]) => ({
        key: id,
        label: projectById[id]?.name ?? 'Проект',
        cls: 'text-fg',
        items,
      }))
    }
    // status
    const b = {}
    for (const t of paged) {
      const key = t.status_name ?? '—'
      if (!b[key]) b[key] = []
      b[key].push(t)
    }
    return Object.entries(b).map(([label, items]) => ({
      key: label,
      label,
      cls: 'text-fg',
      items,
    }))
  }, [paged, groupBy, projectById])

  const renderRow = (t) => (
    <TaskRow
      key={t.id}
      task={t}
      statuses={statusesByProject[t.project_id] ?? []}
      project={projectById[t.project_id]}
      onOpen={setOpenTask}
    />
  )

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {/* Сводка */}
      <p className="text-sm text-muted">
        Всего {summary.total} · Активных {summary.active} ·{' '}
        <span className={cn(summary.overdue > 0 && 'text-red-400')}>
          Просрочено {summary.overdue}
        </span>{' '}
        · Выполнено за месяц {summary.completedMonth}
      </p>

      {/* Шапка: поиск + фильтры */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск…"
            className="w-52 rounded-lg border border-line bg-surface py-1.5 pl-8 pr-3 text-sm text-fg placeholder-muted outline-none focus:border-accent"
          />
        </div>

        <Select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          options={[
            { value: '', label: 'Все проекты' },
            ...projects.map((p) => ({ value: p.id, label: p.name })),
          ]}
          className="w-40"
        />
        <Select
          value={statusCode}
          onChange={(e) => setStatusCode(e.target.value)}
          options={[
            { value: '', label: 'Любой статус' },
            ...Object.values(STATUSES).map((code) => ({
              value: code,
              label: STATUS_LABELS[code],
            })),
          ]}
          className="w-40"
        />
        <Select
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          options={[
            { value: '', label: 'Любой приоритет' },
            ...Object.entries(PRIORITY).map(([k, v]) => ({
              value: k,
              label: v.label,
            })),
          ]}
          className="w-40"
        />
        <Select
          value={deadlineState}
          onChange={(e) => setDeadlineState(e.target.value)}
          options={[
            { value: '', label: 'Любой срок' },
            ...DEADLINE_FILTERS.map((k) => ({
              value: k,
              label: DEADLINE_STATE[k].label,
            })),
          ]}
          className="w-40"
        />

        <label className="flex cursor-pointer items-center gap-1.5 text-sm text-muted">
          <input
            type="checkbox"
            checked={showCompleted}
            onChange={(e) => setShowCompleted(e.target.checked)}
            className="accent-[#ecc371]"
          />
          Показывать выполненные
        </label>
      </div>

      {/* Сортировка + группировка */}
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          options={SORTS}
          className="w-48"
        />
        <div className="ml-auto flex gap-1 rounded-lg border border-line bg-surface p-1">
          {GROUPS.map((g) => (
            <button
              key={g.value}
              type="button"
              onClick={() => setGroupBy(g.value)}
              className={cn(
                'rounded px-2.5 py-1 text-xs font-medium transition',
                groupBy === g.value
                  ? 'bg-accent text-on-accent'
                  : 'text-muted hover:text-fg'
              )}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>

      {/* Список */}
      {loading && tasks.length === 0 ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <EmptyState
          title="Задач не найдено"
          description="Измените фильтры или загляните позже."
        />
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.key}>
              <div className="mb-2 flex items-center gap-2">
                <h3 className={cn('text-sm font-semibold', g.cls)}>{g.label}</h3>
                <span className="rounded-full bg-line px-1.5 text-xs text-muted">
                  {g.items.length}
                </span>
              </div>
              <div className="space-y-2">{g.items.map(renderRow)}</div>
            </section>
          ))}

          {sorted.length > visible && (
            <button
              type="button"
              onClick={() => setVisible((v) => v + PAGE)}
              className="mx-auto block rounded-lg border border-line px-4 py-2 text-sm text-fg transition hover:border-accent"
            >
              Показать ещё ({sorted.length - visible})
            </button>
          )}
        </div>
      )}

      {/* Боковая панель задачи */}
      {openTask && (
        <TaskDrawer
          key={openTask.id}
          task={openTask}
          statuses={statusesByProject[openTask.project_id] ?? []}
          members={drawerMembers}
          onClose={() => setOpenTask(null)}
        />
      )}
    </div>
  )
}
