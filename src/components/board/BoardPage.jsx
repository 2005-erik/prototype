import { useState, useMemo, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { Plus, Search, RotateCcw } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useProjects, useProject, useWorkload } from '../../hooks/useProjects'
import { useTasks } from '../../hooks/useTasks'
import { PRIORITY } from '../../lib/constants'
import { getInitials, cn } from '../../lib/utils'
import BoardColumn from './BoardColumn'
import TaskCard from './TaskCard'
import StatusCommentModal from './StatusCommentModal'
import TaskDrawer from '../task/TaskDrawer'
import CreateTaskModal from '../task/CreateTaskModal'

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

  const { projects, loading: projectsLoading } = useProjects()
  const activeProjectId = paramId ?? projects[0]?.id ?? null

  const { project, statuses, members } = useProject(activeProjectId)
  const { workload } = useWorkload(activeProjectId)

  // ---- Фильтры ----
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [priority, setPriority] = useState(null)
  const [assignees, setAssignees] = useState(() => new Set())
  const [showCompleted, setShowCompleted] = useState(false)

  // debounce поиска 300мс
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const { tasks, loading, moveTask, changeStatus, createTask } = useTasks(
    activeProjectId,
    {
      priority,
      search: debouncedSearch,
      showCompleted,
    }
  )

  // Множественный фильтр по исполнителю — на клиенте
  const visibleTasks = useMemo(() => {
    if (assignees.size === 0) return tasks
    return tasks.filter((t) => assignees.has(t.assignee_id))
  }, [tasks, assignees])

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
    !!debouncedSearch || !!priority || assignees.size > 0 || showCompleted

  // ---- Состояния загрузки/пустоты ----
  if (projectsLoading) {
    return <p className="text-muted">Загрузка проектов…</p>
  }
  if (projects.length === 0) {
    return <p className="text-muted">Нет доступных проектов.</p>
  }

  return (
    <div className="flex h-full flex-col">
      {/* Шапка доски */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {projects.length > 1 ? (
          <select
            value={activeProjectId ?? ''}
            onChange={(e) => navigate(`/board/${e.target.value}`)}
            className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-fg outline-none focus:border-accent"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        ) : (
          <h2 className="text-base font-medium text-fg">
            {project?.name ?? ''}
          </h2>
        )}

        {isManager && (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition hover:bg-accent-hover"
          >
            <Plus className="h-4 w-4" />
            Новая задача
          </button>
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
            className="accent-blue-600"
          />
          Показывать выполненные
        </label>

        {/* Сброс */}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={resetFilters}
            className="flex items-center gap-1 text-sm text-muted transition hover:text-fg"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Сбросить
          </button>
        )}
      </div>

      {/* Тело: колонки статусов с горизонтальным скроллом */}
      {loading && tasks.length === 0 ? (
        <p className="text-muted">Загрузка задач…</p>
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
