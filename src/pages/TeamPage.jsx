import { useState, useMemo, useEffect } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { Search, Columns3, Table2, Users } from 'lucide-react'
import {
  useProjects,
  useProjectStatusesMap,
  useManagedProjectMembers,
} from '../hooks/useProjects'
import { useTeam } from '../hooks/useTeam'
import Select from '../components/ui/Select'
import Skeleton from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import { useToast } from '../components/ui/Toast'
import { cn } from '../lib/utils'
import TeamSummary from '../components/team/TeamSummary'
import TeamColumn from '../components/team/TeamColumn'
import TeamTaskCard from '../components/team/TeamTaskCard'
import TeamTable from '../components/team/TeamTable'
import UnassignedPanel from '../components/team/UnassignedPanel'
import TaskContextMenu from '../components/team/TaskContextMenu'
import TaskDrawer from '../components/task/TaskDrawer'

export default function TeamPage() {
  const { toast } = useToast()
  const { projects } = useProjects()
  const [pid, setPid] = useState('') // '' = все проекты
  const projectId = pid || null

  const { columns, unassigned, allTasks, loading, error, reassignTask, patchTask } =
    useTeam(projectId)

  useEffect(() => {
    if (error) toast.error(error)
  }, [error, toast])

  const [view, setView] = useState('columns')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [openTask, setOpenTask] = useState(null)
  const [menu, setMenu] = useState(null) // { task, x, y }
  const [pendingReassign, setPendingReassign] = useState(null)

  const [activeTask, setActiveTask] = useState(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const projectsById = useMemo(() => {
    const m = {}
    for (const p of projects) m[p.id] = p
    return m
  }, [projects])

  // Данные для drawer
  const involvedIds = useMemo(
    () => [...new Set(allTasks.map((t) => t.project_id))],
    [allTasks]
  )
  const statusesByProject = useProjectStatusesMap(involvedIds)
  const drawerMembers = useManagedProjectMembers(openTask?.project_id ?? null)

  // Сводка
  const totals = useMemo(
    () => ({
      active: allTasks.length,
      free: columns.filter((c) => c.load.load_state === 'free').length,
      overloaded: columns.filter((c) => c.load.load_state === 'overloaded').length,
      unassigned: unassigned.length,
      overdue: allTasks.filter((t) => t.deadline_state === 'overdue').length,
    }),
    [allTasks, columns, unassigned]
  )

  const showAllProjects = projectId === null

  // Фильтрация отображения
  const nameQ = search.trim().toLowerCase()
  const overdueOnly = filter === 'overdue'

  const displayColumns = useMemo(() => {
    let cols = columns
    if (nameQ)
      cols = cols.filter((c) => (c.profile?.full_name ?? '').toLowerCase().includes(nameQ))
    if (filter === 'free') cols = cols.filter((c) => c.load.load_state === 'free')
    if (filter === 'overloaded') cols = cols.filter((c) => c.load.load_state === 'overloaded')
    if (overdueOnly)
      cols = cols.map((c) => ({
        ...c,
        tasks: c.tasks.filter((t) => t.deadline_state === 'overdue'),
      }))
    return cols
  }, [columns, nameQ, filter, overdueOnly])

  const displayUnassigned = useMemo(
    () => (overdueOnly ? unassigned.filter((t) => t.deadline_state === 'overdue') : unassigned),
    [unassigned, overdueOnly]
  )

  const onFilter = (key) => {
    setFilter(key)
    if (key === 'unassigned') setPanelOpen(true)
  }

  // ---- Переназначение ----
  const doReassign = async (taskId, assigneeId) => {
    const { error: err } = await reassignTask(taskId, assigneeId)
    if (err) toast.error(err)
    else toast.success(assigneeId ? 'Переназначено' : 'Исполнитель снят')
  }

  const handleDragStart = (e) => {
    setActiveTask(allTasks.find((t) => t.id === e.active.id) ?? null)
  }

  const handleDragEnd = (e) => {
    setActiveTask(null)
    const { active, over } = e
    if (!over) return
    const overId = String(over.id)
    let target
    if (overId.startsWith('col:')) {
      const seg = overId.slice(4)
      target = seg === 'unassigned' ? null : seg
    } else {
      target = allTasks.find((t) => t.id === overId)?.assignee_id ?? null
    }
    const src = allTasks.find((t) => t.id === active.id)
    if (!src || src.assignee_id === target) return

    // Перегрузка целевого сотрудника → подтверждение
    if (target) {
      const col = columns.find((c) => c.user_id === target)
      if (col?.load.load_state === 'overloaded') {
        setPendingReassign({
          taskId: active.id,
          assigneeId: target,
          name: col.profile?.full_name,
          count: col.load.active,
        })
        return
      }
    }
    doReassign(active.id, target)
  }

  if (loading && columns.length === 0) {
    return (
      <div className="flex gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="w-[300px] flex-shrink-0 space-y-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4 pb-12">
      {/* Шапка */}
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={pid}
          onChange={(e) => setPid(e.target.value)}
          options={[
            { value: '', label: 'Все проекты' },
            ...projects.map((p) => ({ value: p.id, label: p.name })),
          ]}
          className="w-52"
        />
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по имени…"
            className="w-52 rounded-lg border border-line bg-surface py-1.5 pl-8 pr-3 text-sm text-fg placeholder-muted outline-none focus:border-accent"
          />
        </div>
        <div className="ml-auto flex gap-1 rounded-lg border border-line bg-surface p-1">
          <button
            type="button"
            onClick={() => setView('columns')}
            className={cn('rounded p-1.5 transition', view === 'columns' ? 'bg-accent text-on-accent' : 'text-muted hover:text-fg')}
            aria-label="Колонки"
          >
            <Columns3 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setView('table')}
            className={cn('rounded p-1.5 transition', view === 'table' ? 'bg-accent text-on-accent' : 'text-muted hover:text-fg')}
            aria-label="Таблица"
          >
            <Table2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Сводка */}
      <TeamSummary totals={totals} filter={filter} onFilter={onFilter} />

      {/* Контент */}
      {columns.length === 0 ? (
        <EmptyState icon={Users} title="В проекте нет участников" />
      ) : view === 'table' ? (
        <TeamTable
          columns={displayColumns}
          members={columns}
          onOpen={setOpenTask}
          onReassign={doReassign}
        />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveTask(null)}
        >
          <div className="flex gap-4 overflow-x-auto pb-2">
            {/* Без исполнителя — всегда слева */}
            <TeamColumn
              column={{ isUnassigned: true, tasks: displayUnassigned }}
              projectsById={showAllProjects ? projectsById : null}
              onOpen={setOpenTask}
              onContextMenu={(e, task) => setMenu({ task, x: e.clientX, y: e.clientY })}
            />
            {displayColumns.map((c) => (
              <TeamColumn
                key={c.user_id}
                column={c}
                projectsById={showAllProjects ? projectsById : null}
                onOpen={setOpenTask}
                onContextMenu={(e, task) => setMenu({ task, x: e.clientX, y: e.clientY })}
              />
            ))}
          </div>
          <DragOverlay>
            {activeTask ? <TeamTaskCard task={activeTask} overlay /> : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Панель «Требуют распределения» (по текущему охвату) */}
      <UnassignedPanel
        tasks={unassigned}
        members={columns}
        projectsById={showAllProjects ? projectsById : null}
        open={panelOpen}
        onToggle={() => setPanelOpen((v) => !v)}
        onAssign={doReassign}
        onOpen={setOpenTask}
      />

      {/* Контекстное меню */}
      <TaskContextMenu
        menu={menu}
        members={columns}
        onClose={() => setMenu(null)}
        onOpen={setOpenTask}
        onReassign={doReassign}
        onPatch={async (id, patch) => {
          const { error: err } = await patchTask(id, patch)
          if (err) toast.error(err)
        }}
      />

      {/* Подтверждение переназначения на перегруженного */}
      <ConfirmDialog
        open={!!pendingReassign}
        title="Сотрудник перегружен"
        message={
          pendingReassign
            ? `У сотрудника ${pendingReassign.name} уже ${pendingReassign.count} задач. Всё равно переназначить?`
            : ''
        }
        confirmText="Переназначить"
        danger
        onConfirm={() => {
          doReassign(pendingReassign.taskId, pendingReassign.assigneeId)
          setPendingReassign(null)
        }}
        onCancel={() => setPendingReassign(null)}
      />

      {/* Drawer задачи */}
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
