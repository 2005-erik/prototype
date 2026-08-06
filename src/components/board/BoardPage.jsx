import { useState, useMemo, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { Plus, Search, RotateCcw, KanbanSquare } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useProjectNav } from '../../contexts/ProjectNavContext'
import {
  useProjects,
  useProject,
  useWorkload,
  useProjectsOverview,
} from '../../hooks/useProjects'
import { useTasks } from '../../hooks/useTasks'
import { PRIORITY } from '../../lib/constants'
import { getInitials, cn } from '../../lib/utils'
import BoardColumn from './BoardColumn'
import TaskCard from './TaskCard'
import ProjectSelector from './ProjectSelector'
import StatusCommentModal from './StatusCommentModal'
import TaskDrawer from '../task/TaskDrawer'
import CreateTaskModal from '../task/CreateTaskModal'
import Button from '../ui/Button'
import EmptyState from '../ui/EmptyState'
import Skeleton from '../ui/Skeleton'
import { useToast } from '../ui/Toast'

const POS_STEP = 1000

// Позиция для вставки в список list (без перетаскиваемой карточки) на index
function computeNewPosition(list, index) {
  const eff = list.map((t, i) => (t.position ?? (i + 1) * POS_STEP))
  const prev = index - 1 >= 0 ? eff[index - 1] : null
  const next = index < eff.length ? eff[index] : null
  if (prev == null && next == null) return POS_STEP
  if (prev == null) return next - POS_STEP
  if (next == null) return prev + POS_STEP
  return (prev + next) / 2
}

export default function BoardPage() {
  const { projectId: paramId } = useParams()
  const navigate = useNavigate()
  const { isManager } = useAuth()
  const { toast } = useToast()

  const { lastProjectId, setLastProjectId } = useProjectNav()

  const { projects, loading: projectsLoading, error: projectsError } =
    useProjects()
  const activeProjectId = paramId ?? lastProjectId ?? projects[0]?.id ?? null

  // Метрики по всем проектам — для счётчиков в селекторе
  const projectIds = useMemo(() => projects.map((p) => p.id), [projects])
  const { metrics: projectsMetrics } = useProjectsOverview(projectIds)

  // Запоминаем последний открытый проект (в контексте, не в localStorage)
  useEffect(() => {
    if (paramId) setLastProjectId(paramId)
  }, [paramId, setLastProjectId])

  // Заход на /board без id — редирект на последний/первый проект
  useEffect(() => {
    if (!paramId && activeProjectId) {
      navigate(`/board/${activeProjectId}`, { replace: true })
    }
  }, [paramId, activeProjectId, navigate])

  const { project, statuses, members, error: projectError } =
    useProject(activeProjectId)
  const { workload } = useWorkload(activeProjectId)

  // ---- Фильтры ----
  const [searchParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [priority, setPriority] = useState(null)
  const [assignees, setAssignees] = useState(() => new Set())
  const [showCompleted, setShowCompleted] = useState(false)
  // Спецфильтр из URL (переход с дашборда): overdue | today | stale
  const [special, setSpecial] = useState(null)

  // Инициализация фильтров из query-параметров (?assignee=&filter=&completed=)
  useEffect(() => {
    const a = searchParams.get('assignee')
    if (a) setAssignees(new Set(a.split(',').filter(Boolean)))
    const f = searchParams.get('filter')
    setSpecial(['overdue', 'today', 'stale'].includes(f) ? f : null)
    // ?completed=1 — переход из отчёта импорта: иначе задачи, пришедшие
    // в завершающем статусе, не видны и кажется, что импорт не сработал.
    // Только включаем: снятый вручную флажок обратно не навязываем.
    if (searchParams.get('completed') === '1') setShowCompleted(true)
  }, [searchParams])

  // debounce поиска 300мс
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const {
    tasks,
    loading,
    error: tasksError,
    moveTask,
    changeStatus,
    createTask,
  } = useTasks(activeProjectId, {
    priority,
    search: debouncedSearch,
    showCompleted,
  })

  // Ошибки хуков — показываем через Toast (презентационный слой)
  useEffect(() => {
    if (projectsError) toast.error(projectsError)
  }, [projectsError, toast])
  useEffect(() => {
    if (projectError) toast.error(projectError)
  }, [projectError, toast])
  useEffect(() => {
    if (tasksError) toast.error(tasksError)
  }, [tasksError, toast])

  // Клиентские фильтры: исполнитель (множественный) + спецфильтр из URL
  const visibleTasks = useMemo(() => {
    let list = tasks
    if (assignees.size > 0) {
      list = list.filter((t) => assignees.has(t.assignee_id))
    }
    if (special === 'overdue') {
      list = list.filter((t) => t.deadline_state === 'overdue')
    } else if (special === 'today') {
      const today = new Date().toDateString()
      list = list.filter(
        (t) =>
          !t.completed_at &&
          t.due_date &&
          new Date(t.due_date).toDateString() === today
      )
    } else if (special === 'stale') {
      list = list.filter((t) => t.is_stale)
    }
    return list
  }, [tasks, assignees, special])

  // Группировка по статусу
  const tasksByStatus = useMemo(() => {
    const map = {}
    for (const s of statuses) map[s.id] = []
    for (const t of visibleTasks) {
      if (!map[t.status_id]) map[t.status_id] = []
      map[t.status_id].push(t)
    }
    return map
  }, [statuses, visibleTasks])

  // ---- Быстрое добавление задачи ----
  const [addingColumnId, setAddingColumnId] = useState(null)
  const initialStatus = useMemo(
    () => statuses.find((s) => s.is_initial) ?? statuses[0] ?? null,
    [statuses]
  )

  const handleSubmitAdd = async (statusId, title) => {
    await createTask({ title, status_id: statusId })
    setAddingColumnId(null)
  }

  // ---- Открытие задачи в боковой панели ----
  const [openTask, setOpenTask] = useState(null)

  // ---- Модалка создания задачи ----
  const [createOpen, setCreateOpen] = useState(false)

  // ---- Drag & drop ----
  const [activeTask, setActiveTask] = useState(null)
  // Отложенное перемещение, ожидающее обязательного комментария
  const [pendingMove, setPendingMove] = useState(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const handleDragStart = (event) => {
    const t = tasks.find((x) => x.id === event.active.id)
    setActiveTask(t ?? null)
  }

  const handleDragEnd = (event) => {
    setActiveTask(null)
    const { active, over } = event
    if (!over) return

    const activeId = active.id
    const overId = String(over.id)

    // Определяем целевой статус и позицию вставки
    let targetStatusId
    let overTaskId = null
    if (overId.startsWith('col:')) {
      targetStatusId = overId.slice(4)
    } else {
      const overTask = tasks.find((t) => t.id === overId)
      if (!overTask) return
      targetStatusId = overTask.status_id
      overTaskId = overId
    }

    const sourceTask = tasks.find((t) => t.id === activeId)
    if (!sourceTask) return

    // Список целевой колонки без перетаскиваемой карточки
    const list = (tasksByStatus[targetStatusId] ?? []).filter(
      (t) => t.id !== activeId
    )
    const index =
      overTaskId != null
        ? Math.max(0, list.findIndex((t) => t.id === overTaskId))
        : list.length

    const newPosition = computeNewPosition(list, index)
    const statusChanged = targetStatusId !== sourceTask.status_id
    const targetStatus = statuses.find((s) => s.id === targetStatusId)

    // Переход в статус, требующий комментарий — сначала модалка
    if (statusChanged && targetStatus?.requires_comment) {
      setPendingMove({
        taskId: activeId,
        statusId: targetStatusId,
        statusName: targetStatus.name,
      })
      return
    }

    // Иначе — сразу перемещаем (moveTask сам делает оптимистичное обновление и откат)
    moveTask(activeId, targetStatusId, newPosition)
  }

  // Подтверждение перехода с комментарием → RPC change_task_status
  const confirmPendingMove = async (comment) => {
    if (!pendingMove) return
    await changeStatus(pendingMove.taskId, pendingMove.statusId, comment)
    setPendingMove(null)
  }

  const resetFilters = () => {
    setSearch('')
    setDebouncedSearch('')
    setPriority(null)
    setAssignees(new Set())
    setShowCompleted(false)
    setSpecial(null)
  }

  const SPECIAL_LABEL = {
    overdue: 'Просрочено',
    today: 'Срок сегодня',
    stale: 'Застряли',
  }

  const toggleAssignee = (id) => {
    setAssignees((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const overdueCount = useMemo(
    () => visibleTasks.filter((t) => t.deadline_state === 'overdue').length,
    [visibleTasks]
  )

  const hasActiveFilters =
    !!debouncedSearch ||
    !!priority ||
    assignees.size > 0 ||
    showCompleted ||
    !!special

  // ---- Состояния загрузки/пустоты ----
  if (projectsLoading) {
    return (
      <div className="flex gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="w-80 flex-shrink-0 space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ))}
      </div>
    )
  }
  if (projects.length === 0) {
    return (
      <EmptyState
        icon={KanbanSquare}
        title="Нет доступных проектов"
        description="Проекты, в которых вы состоите, появятся здесь."
      />
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Шапка доски */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {projects.length > 1 ? (
          <ProjectSelector
            projects={projects}
            activeProjectId={activeProjectId}
            metrics={projectsMetrics}
            isManager={isManager}
          />
        ) : (
          <h2 className="text-base font-medium text-fg">
            {project?.name ?? ''}
          </h2>
        )}

        {isManager && (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Новая задача
          </Button>
        )}

        {/* Счётчик */}
        <span className="ml-auto text-sm text-muted">
          Задач: {visibleTasks.length} · Просрочено:{' '}
          <span className={cn(overdueCount > 0 && 'text-red-400')}>
            {overdueCount}
          </span>
        </span>
      </div>

      {/* Панель фильтров */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {/* Поиск */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по названию…"
            className="w-56 rounded-lg border border-line bg-surface py-1.5 pl-8 pr-3 text-sm text-fg placeholder-muted outline-none focus:border-accent"
          />
        </div>

        {/* Исполнители (множественный выбор) */}
        {members.length > 0 && (
          <div className="flex items-center gap-1">
            {members.map((m) => {
              const p = m.profiles
              if (!p) return null
              const active = assignees.has(p.id)
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggleAssignee(p.id)}
                  title={p.full_name}
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold text-white transition',
                    active
                      ? 'bg-accent ring-2 ring-accent ring-offset-2 ring-offset-app'
                      : 'bg-line text-muted hover:text-fg'
                  )}
                >
                  {getInitials(p.full_name)}
                </button>
              )
            })}
          </div>
        )}

        {/* Приоритет */}
        <div className="flex items-center gap-1">
          {Object.entries(PRIORITY).map(([key, val]) => (
            <button
              key={key}
              type="button"
              onClick={() => setPriority((cur) => (cur === key ? null : key))}
              className={cn(
                'rounded-lg px-2 py-1 text-xs font-medium transition',
                priority === key
                  ? val.badge
                  : 'text-muted hover:bg-line hover:text-fg'
              )}
            >
              {val.label}
            </button>
          ))}
        </div>

        {/* Показывать выполненные */}
        <label className="flex cursor-pointer items-center gap-1.5 text-sm text-muted">
          <input
            type="checkbox"
            checked={showCompleted}
            onChange={(e) => setShowCompleted(e.target.checked)}
            className="accent-[#ecc371]"
          />
          Показывать выполненные
        </label>

        {/* Чип спецфильтра из URL */}
        {special && (
          <button
            type="button"
            onClick={() => setSpecial(null)}
            className="flex items-center gap-1 rounded-lg bg-accent/15 px-2 py-1 text-xs font-medium text-accent transition hover:bg-accent/25"
          >
            {SPECIAL_LABEL[special]}
            <span aria-hidden="true">✕</span>
          </button>
        )}

        {/* Сброс */}
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={resetFilters}>
            <RotateCcw className="h-3.5 w-3.5" />
            Сбросить
          </Button>
        )}
      </div>

      {/* Проект без задач — подсказываем, с чего начать
          (колонки оставляем: они нужны как цели перетаскивания) */}
      {!loading && tasks.length === 0 && !hasActiveFilters && (
        <EmptyState
          title="Задач пока нет"
          description={
            isManager
              ? 'Создайте первую или импортируйте из Trello.'
              : 'Задачи появятся здесь, когда руководитель их назначит.'
          }
        />
      )}

      {/* Тело: колонки статусов с горизонтальным скроллом */}
      {loading && tasks.length === 0 ? (
        <div className="flex flex-1 gap-4 overflow-hidden">
          {(statuses.length ? statuses : Array.from({ length: 4 })).map(
            (s, i) => (
              <div key={s?.id ?? i} className="w-80 flex-shrink-0 space-y-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            )
          )}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveTask(null)}
        >
          <div className="flex flex-1 gap-4 overflow-x-auto pb-2">
            {statuses.map((status) => (
              <BoardColumn
                key={status.id}
                status={status}
                tasks={tasksByStatus[status.id] ?? []}
                canManage={isManager}
                adding={addingColumnId === status.id}
                onStartAdd={setAddingColumnId}
                onCancelAdd={() => setAddingColumnId(null)}
                onSubmitAdd={handleSubmitAdd}
                onOpenTask={setOpenTask}
              />
            ))}
          </div>

          <DragOverlay>
            {activeTask ? <TaskCard task={activeTask} overlay /> : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Модалка обязательного комментария при переходе в rework-статус */}
      <StatusCommentModal
        key={pendingMove?.taskId}
        pending={pendingMove}
        onConfirm={confirmPendingMove}
        onCancel={() => setPendingMove(null)}
      />

      {/* Модалка создания задачи */}
      {createOpen && (
        <CreateTaskModal
          members={members}
          workload={workload}
          defaultStatusId={initialStatus?.id ?? null}
          onCreate={createTask}
          onClose={() => setCreateOpen(false)}
        />
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
