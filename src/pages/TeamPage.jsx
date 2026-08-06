import { useState, useMemo, useEffect } from 'react'
import { Search, Columns3, Table2, Users } from 'lucide-react'
import {
  useProjects,
  useProjectStatusesMap,
  useManagedProjectMembers,
} from '../hooks/useProjects'
import { useTeam } from '../hooks/useTeam'
import { useAuth } from '../contexts/AuthContext'
import Select from '../components/ui/Select'
import Skeleton from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import { useToast } from '../components/ui/Toast'
import { PRIORITY } from '../lib/constants'
import { cn } from '../lib/utils'
import TeamSummary from '../components/team/TeamSummary'
import { TeamMemberCard, UnassignedCard } from '../components/team/TeamMemberCard'
import MemberTasksDrawer from '../components/team/MemberTasksDrawer'
import TeamTable from '../components/team/TeamTable'
import UnassignedPanel from '../components/team/UnassignedPanel'
import TaskContextMenu from '../components/team/TaskContextMenu'
import TaskDrawer from '../components/task/TaskDrawer'

export default function TeamPage() {
  const { toast } = useToast()
  const { isManager } = useAuth()
  const { projects } = useProjects()
  const [pid, setPid] = useState('') // '' = все проекты
  const projectId = pid || null

  const {
    columns,
    unassigned,
    allTasks,
    loading,
    error,
    reassignTask,
    patchTask,
    patchTasks,
    refetch,
  } = useTeam(projectId)

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

  // Задачи сотрудника открываются в панели справа — сетка не прыгает
  const [memberDrawer, setMemberDrawer] = useState(null)

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
      // «активных» — именно в работе, а не всё незакрытое
      active: columns.reduce((sum, c) => sum + c.load.active, 0),
      queued: columns.reduce((sum, c) => sum + c.load.queued, 0),
      high: columns.filter((c) => c.load.load_state === 'high').length,
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
    if (filter === 'high') cols = cols.filter((c) => c.load.load_state === 'high')
    if (filter === 'overloaded')
      cols = cols.filter((c) => c.load.load_state === 'overloaded')
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

  // ---- Массовая смена приоритета выбранных задач ----
  const doBulkPriority = async (ids, priority) => {
    const res = await patchTasks(ids, { priority })
    if (res.error) toast.error(res.error)
    else
      toast.success(
        `Приоритет «${PRIORITY[priority]?.label ?? priority}» · задач: ${ids.length}`
      )
    return res
  }

  // ---- Переназначение ----
  const applyReassign = async (taskId, assigneeId) => {
    const { error: err } = await reassignTask(taskId, assigneeId)
    if (err) toast.error(err)
    else toast.success(assigneeId ? 'Переназначено' : 'Исполнитель снят')
  }

  const doReassign = async (taskId, assigneeId) => {
    // Назначение на перегруженного — только после подтверждения
    if (assigneeId) {
      const col = columns.find((c) => c.user_id === assigneeId)
      if (col?.load.load_state === 'overloaded') {
        setPendingReassign({
          taskId,
          assigneeId,
          name: col.profile?.full_name,
          count: col.load.active,
        })
        return
      }
    }
    await applyReassign(taskId, assigneeId)
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
        /* Карточки-сводки: список задач — в панели справа, по клику */
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <UnassignedCard
            count={displayUnassigned.length}
            onDistribute={() => setPanelOpen(true)}
          />
          {displayColumns.map((c) => (
            <TeamMemberCard key={c.user_id} column={c} onOpen={setMemberDrawer} />
          ))}
        </div>
      )}

      {/* Задачи выбранного сотрудника */}
      {memberDrawer && (
        <MemberTasksDrawer
          column={columns.find((c) => c.user_id === memberDrawer.user_id) ?? memberDrawer}
          projectsById={showAllProjects ? projectsById : null}
          canEditLimit={isManager}
          onLimitChanged={refetch}
          onOpenTask={(t) => {
            setMemberDrawer(null)
            setOpenTask(t)
          }}
          onContextMenu={(e, task) => setMenu({ task, x: e.clientX, y: e.clientY })}
          onClose={() => setMemberDrawer(null)}
        />
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
        onBulkPriority={doBulkPriority}
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
          applyReassign(pendingReassign.taskId, pendingReassign.assigneeId)
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
