import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ListTodo,
  AlertTriangle,
  Clock,
  Pause,
  Download,
  Users,
  Flame,
} from 'lucide-react'
import { useProjectNav } from '../contexts/ProjectNavContext'
import { useProjects, useProject } from '../hooks/useProjects'
import { useTasks } from '../hooks/useTasks'
import { useDashboard, useActivityFeed } from '../hooks/useDashboard'
import { useReportExport } from '../hooks/useReportExport'
import Select from '../components/ui/Select'
import Button from '../components/ui/Button'
import Skeleton from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'
import CollapsibleSection from '../components/ui/CollapsibleSection'
import { useToast } from '../components/ui/Toast'
import { cn } from '../lib/utils'
import MetricCard from '../components/dashboard/MetricCard'
import WorkloadBar from '../components/dashboard/WorkloadBar'
import StatusDistribution from '../components/dashboard/StatusDistribution'
import AttentionList from '../components/dashboard/AttentionList'
import ActivityFeed from '../components/dashboard/ActivityFeed'
import TaskDrawer from '../components/task/TaskDrawer'

const PERIODS = [7, 30, 90]

function isSameDay(iso) {
  if (!iso) return false
  return new Date(iso).toDateString() === new Date().toDateString()
}

export default function ManagerDashboard() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { lastProjectId, setLastProjectId } = useProjectNav()
  const { projects, loading: projectsLoading } = useProjects()
  const { exporting, exportReport } = useReportExport()

  const [pid, setPid] = useState(null)
  const [period, setPeriod] = useState(30)
  const [feedLimit, setFeedLimit] = useState(20)
  const [openTask, setOpenTask] = useState(null)

  // Выбор проекта по умолчанию
  useEffect(() => {
    if (pid || projects.length === 0) return
    const initial =
      (lastProjectId && projects.some((p) => p.id === lastProjectId)
        ? lastProjectId
        : null) ?? projects[0].id
    setPid(initial)
  }, [pid, projects, lastProjectId])

  useEffect(() => {
    if (pid) setLastProjectId(pid)
  }, [pid, setLastProjectId])

  const { data: dash } = useDashboard(pid)
  const { statuses, members } = useProject(pid)
  const { tasks, loading: tasksLoading } = useTasks(pid, { showCompleted: true })
  const { items: activity, loading: activityLoading } = useActivityFeed(
    pid,
    feedLimit
  )

  // Метрики (текущее состояние)
  const metrics = useMemo(() => {
    const active = tasks.filter((t) => !t.completed_at).length
    const overdue = tasks.filter((t) => t.deadline_state === 'overdue').length
    const dueToday = tasks.filter(
      (t) => !t.completed_at && isSameDay(t.due_date)
    ).length
    const stale = tasks.filter((t) => t.is_stale).length
    // Критические в работе — незавершённые задачи наивысшего приоритета
    const critical = tasks.filter(
      (t) => !t.completed_at && t.priority === 'critical'
    ).length
    return { active, overdue, dueToday, stale, critical }
  }, [tasks])

  // Тренд входящих задач за период (для карточки «активных»)
  const inflowDelta = useMemo(() => {
    const dayMs = 86400000
    const now = Date.now()
    const curStart = now - period * dayMs
    const prevStart = now - 2 * period * dayMs
    let cur = 0
    let prev = 0
    for (const t of tasks) {
      const c = t.created_at ? new Date(t.created_at).getTime() : 0
      if (c >= curStart) cur += 1
      else if (c >= prevStart) prev += 1
    }
    if (prev === 0) return cur > 0 ? 100 : null
    return Math.round(((cur - prev) / prev) * 100)
  }, [tasks, period])

  // Профили участников по id (для аватаров/должностей в загрузке)
  const profilesById = useMemo(() => {
    const map = {}
    for (const m of members) if (m.profiles) map[m.user_id] = m.profiles
    return map
  }, [members])

  const goBoard = (query) =>
    navigate(`/board/${pid}${query ? `?${query}` : ''}`)

  const currentProject = projects.find((p) => p.id === pid) ?? null

  const handleExport = async () => {
    if (!currentProject) return
    const { error } = await exportReport({
      project: currentProject,
      tasks,
      workload: dash?.workload ?? [],
      metrics,
      avg: {
        avg_completion_days: dash?.avg_completion_days,
        avg_rework_count: dash?.avg_rework_count,
      },
      period,
    })
    if (error) toast.error(error)
    else toast.success('Отчёт сформирован')
  }

  if (projectsLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (projects.length === 0) {
    return (
      <EmptyState
        icon={ListTodo}
        title="Нет проектов"
        description="Создайте проект, чтобы увидеть дашборд."
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* Заголовок: проект + период */}
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold text-fg">Дашборд</h2>
        {projects.length > 1 && (
          <Select
            value={pid ?? ''}
            onChange={(e) => setPid(e.target.value)}
            options={projects.map((p) => ({ value: p.id, label: p.name }))}
            className="w-56"
          />
        )}
        <div className="ml-auto flex items-center gap-2">
          <div className="flex gap-1 rounded-lg border border-line bg-surface p-1">
            {PERIODS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setPeriod(d)}
                className={cn(
                  'rounded px-2.5 py-1 text-xs font-medium transition',
                  period === d
                    ? 'bg-accent text-on-accent'
                    : 'text-muted hover:text-fg'
                )}
              >
                {d} дней
              </button>
            ))}
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExport}
            loading={exporting}
          >
            <Download className="h-4 w-4" />
            Выгрузить отчёт
          </Button>
        </div>
      </div>

      {/* Блок 1 — метрики */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard
          icon={Flame}
          label="Критических в работе"
          value={metrics.critical}
          accent="red"
          onClick={() => goBoard('priority=critical')}
        />
        <MetricCard
          icon={ListTodo}
          label="Активных задач"
          value={metrics.active}
          delta={inflowDelta}
          onClick={() => goBoard('')}
        />
        <MetricCard
          icon={AlertTriangle}
          label="Просрочено"
          value={metrics.overdue}
          accent="red"
          onClick={() => goBoard('filter=overdue')}
        />
        <MetricCard
          icon={Clock}
          label="Срок сегодня"
          value={metrics.dueToday}
          accent="orange"
          onClick={() => goBoard('filter=today')}
        />
        <MetricCard
          icon={Pause}
          label="Застряли > 7 дней"
          value={metrics.stale}
          accent="amber"
          onClick={() => goBoard('filter=stale')}
        />
      </div>

      {/* Блок 2 — две колонки */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Левая (2/3) */}
        <div className="space-y-6 lg:col-span-2">
          <CollapsibleSection
            id="dashboard.workload"
            title="Загрузка команды"
            count={(dash?.workload ?? []).length}
            defaultOpen
          >
            {(dash?.workload ?? []).length === 0 ? (
              <EmptyState icon={Users} title="Нет данных о загрузке" />
            ) : (
              <div className="space-y-3">
                {[...(dash?.workload ?? [])]
                  .sort(
                    (a, b) => (b.load_percent ?? 0) - (a.load_percent ?? 0)
                  )
                  .map((w) => (
                    <WorkloadBar
                      key={w.user_id}
                      row={w}
                      profile={profilesById[w.user_id]}
                      onSelect={(userId) => goBoard(`assignee=${userId}`)}
                    />
                  ))}
              </div>
            )}
          </CollapsibleSection>

          <CollapsibleSection
            id="dashboard.statuses"
            title="Распределение по статусам"
            count={(dash?.tasks_by_status ?? []).length}
            defaultOpen={false}
          >
            <StatusDistribution
              data={dash?.tasks_by_status ?? []}
              onSelect={() => goBoard('')}
            />
          </CollapsibleSection>
        </div>

        {/* Правая (1/3) */}
        <div className="space-y-6">
          <CollapsibleSection
            id="dashboard.attention"
            title="Требует внимания"
            count={metrics.overdue + metrics.dueToday + metrics.stale}
            defaultOpen={false}
          >
            {tasksLoading && tasks.length === 0 ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              <AttentionList tasks={tasks} onOpen={setOpenTask} />
            )}
          </CollapsibleSection>

          <CollapsibleSection
            id="dashboard.activity"
            title="Лента активности"
            count={activity.length}
            defaultOpen={false}
          >
            <ActivityFeed
              items={activity}
              loading={activityLoading}
              canShowMore={activity.length >= feedLimit}
              onShowMore={() => setFeedLimit((n) => n + 20)}
            />
          </CollapsibleSection>
        </div>
      </div>

      {/* Боковая панель задачи */}
      {openTask && (
        <TaskDrawer
          key={openTask.id}
          task={openTask}
          statuses={statuses}
          members={members}
          onClose={() => setOpenTask(null)}
        />
      )}
    </div>
  )
}
