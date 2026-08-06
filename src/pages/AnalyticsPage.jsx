import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw, Download, BarChart3 } from 'lucide-react'
import { useProjectNav } from '../contexts/ProjectNavContext'
import {
  useProjects,
  useProject,
  useManagedProjectMembers,
} from '../hooks/useProjects'
import { useTasks } from '../hooks/useTasks'
import { invalidateAnalyticsCache } from '../hooks/useAnalytics'
import { useAnalyticsExport } from '../hooks/useAnalyticsExport'
import Select from '../components/ui/Select'
import Button from '../components/ui/Button'
import EmptyState from '../components/ui/EmptyState'
import { AzimutSpinner } from '../components/ui/AzimutLoader'
import { useToast } from '../components/ui/Toast'
import { cn } from '../lib/utils'
import OverviewTab from '../components/analytics/OverviewTab'
import BottlenecksTab from '../components/analytics/BottlenecksTab'
import EmployeesTab from '../components/analytics/EmployeesTab'
import TasksTab from '../components/analytics/TasksTab'
import TagsBreakdown from '../components/analytics/TagsBreakdown'
import CollapsibleSection from '../components/ui/CollapsibleSection'
import TaskDrawer from '../components/task/TaskDrawer'

const TABS = [
  { key: 'overview', label: 'Обзор' },
  { key: 'bottlenecks', label: 'Узкие места' },
  { key: 'employees', label: 'Сотрудники' },
  { key: 'tasks', label: 'Задачи' },
  { key: 'tags', label: 'Направления' },
]

const PERIODS = [
  { value: '30', label: '30 дней' },
  { value: '90', label: '90 дней' },
  { value: '180', label: '180 дней' },
  { value: 'all', label: 'Всё время' },
]

export default function AnalyticsPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { lastProjectId, setLastProjectId } = useProjectNav()
  const { projects, loading: projectsLoading } = useProjects()
  const { exporting, exportAnalytics } = useAnalyticsExport()

  const [pid, setPid] = useState(null)
  const [periodValue, setPeriodValue] = useState('90')
  const [tab, setTab] = useState('overview')
  const [refreshKey, setRefreshKey] = useState(0)
  const [openTask, setOpenTask] = useState(null)

  const period = periodValue === 'all' ? null : Number(periodValue)

  useEffect(() => {
    if (pid || projects.length === 0) return
    setPid(
      (lastProjectId && projects.some((p) => p.id === lastProjectId)
        ? lastProjectId
        : null) ?? projects[0].id
    )
  }, [pid, projects, lastProjectId])

  useEffect(() => {
    if (pid) setLastProjectId(pid)
  }, [pid, setLastProjectId])

  const { statuses } = useProject(pid)
  const members = useManagedProjectMembers(pid)
  const { tasks, loading: tasksLoading, refetch: refetchTasks } = useTasks(pid, {
    showCompleted: true,
  })

  const currentProject = projects.find((p) => p.id === pid) ?? null
  const periodLabel = PERIODS.find((p) => p.value === periodValue)?.label ?? ''

  // Достаточно ли данных для графиков (нужно ≥ 5 завершённых)
  const completedCount = useMemo(
    () => tasks.filter((t) => t.completed_at).length,
    [tasks]
  )
  const enoughData = completedCount >= 5

  const refresh = () => {
    invalidateAnalyticsCache()
    setRefreshKey((k) => k + 1)
    refetchTasks()
  }

  const handleExport = async () => {
    if (!currentProject) return
    const { error } = await exportAnalytics({
      project: currentProject,
      period,
      periodLabel,
      tasks,
    })
    if (error) toast.error(error)
    else toast.success('Отчёт сформирован')
  }

  if (projectsLoading) {
    return (
      <div className="flex justify-center py-16">
        <AzimutSpinner size={32} />
      </div>
    )
  }
  if (projects.length === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title="Нет проектов"
        description="Аналитика появится, когда будет проект с задачами."
      />
    )
  }

  const noTasks = !tasksLoading && tasks.length === 0

  return (
    <div className="space-y-5">
      {/* Шапка */}
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold text-fg">Аналитика</h2>
        {projects.length > 1 && (
          <Select
            value={pid ?? ''}
            onChange={(e) => setPid(e.target.value)}
            options={projects.map((p) => ({ value: p.id, label: p.name }))}
            className="w-52"
          />
        )}
        <Select
          value={periodValue}
          onChange={(e) => setPeriodValue(e.target.value)}
          options={PERIODS}
          className="w-36"
        />
        <div className="ml-auto flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={refresh}>
            <RefreshCw className="h-4 w-4" />
            Обновить
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExport}
            loading={exporting}
          >
            <Download className="h-4 w-4" />
            Выгрузить в Excel
          </Button>
        </div>
      </div>

      {/* Вкладки */}
      <div className="flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              '-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition',
              tab === t.key
                ? 'border-accent text-fg'
                : 'border-transparent text-muted hover:text-fg'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Содержимое */}
      {noTasks ? (
        <EmptyState
          title="Задач пока нет"
          description="Создайте первую или импортируйте из Trello — аналитика появится следом."
        />
      ) : !enoughData && tab !== 'tasks' && tab !== 'tags' ? (
        <EmptyState
          icon={BarChart3}
          title="Недостаточно данных для анализа"
          description="Завершите хотя бы 5 задач."
        />
      ) : (
        <div key={`${tab}-${refreshKey}`}>
          {tab === 'overview' && (
            <OverviewTab
              projectId={pid}
              period={period}
              onOpenBoard={() => navigate(`/board/${pid}`)}
            />
          )}
          {tab === 'bottlenecks' && (
            <BottlenecksTab projectId={pid} period={period} />
          )}
          {tab === 'employees' && (
            <EmployeesTab projectId={pid} period={period} />
          )}
          {tab === 'tasks' && <TasksTab tasks={tasks} onOpen={setOpenTask} />}
          {tab === 'tags' && (
            <CollapsibleSection
              id="analytics.tags"
              title="Задачи по направлениям"
              defaultOpen
            >
              <TagsBreakdown
                projectId={pid}
                onSelect={(tagId) => navigate(`/board/${pid}?tags=${tagId}`)}
              />
            </CollapsibleSection>
          )}
        </div>
      )}

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
