import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Inbox } from 'lucide-react'
import Avatar from '../ui/Avatar'
import TeamTaskCard from './TeamTaskCard'
import { LOAD_STATE } from '../../lib/constants'
import { cn } from '../../lib/utils'

const BAR_COLOR = {
  free: 'bg-slate-500',
  normal: 'bg-blue-500',
  busy: 'bg-orange-500',
  overloaded: 'bg-red-500',
}

// column: { user_id, profile, tasks, load } либо unassigned: { isUnassigned, tasks }
export default function TeamColumn({
  column,
  projectsById,
  onOpen,
  onContextMenu,
}) {
  const isUnassigned = column.isUnassigned
  const dropId = isUnassigned ? 'col:unassigned' : `col:${column.user_id}`
  const { setNodeRef, isOver } = useDroppable({
    id: dropId,
    data: { type: 'column', assigneeId: isUnassigned ? null : column.user_id },
  })

  const load = column.load
  const overloaded = load?.load_state === 'overloaded'
  const pct = Math.min(100, load?.load_percent ?? 0)
  const problems = load ? load.overdue + load.today : 0

  return (
    <div
      className={cn(
        'flex w-[300px] flex-shrink-0 flex-col rounded-lg border',
        overloaded ? 'border-red-500/50' : 'border-line',
        isUnassigned && 'bg-line/20'
      )}
    >
      {/* Шапка колонки */}
      <div className={cn('border-b border-line p-3', overloaded && 'border-t-2 border-t-red-500')}>
        {isUnassigned ? (
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-line text-muted">
              <Inbox className="h-4 w-4" />
            </span>
            <span className="text-sm font-medium text-fg">Без исполнителя</span>
            <span className="ml-auto rounded-full bg-line px-1.5 text-xs text-muted">
              {column.tasks.length}
            </span>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2.5">
              <Avatar
                name={column.profile?.full_name}
                src={column.profile?.avatar_url}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-fg">
                  {column.profile?.full_name}
                </p>
                {column.profile?.position && (
                  <p className="truncate text-xs text-muted">{column.profile.position}</p>
                )}
              </div>
            </div>
            {/* Бар загрузки */}
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                <div
                  className={cn('h-full rounded-full', BAR_COLOR[load.load_state])}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="flex-shrink-0 text-xs text-muted">
                {load.active} / {load.max_concurrent_tasks} задач
              </span>
            </div>
            {/* Проблемы */}
            {problems > 0 && (
              <div className="mt-1 flex gap-2 text-xs">
                {load.overdue > 0 && (
                  <span className="text-red-400">{load.overdue} просрочено</span>
                )}
                {load.today > 0 && (
                  <span className="text-orange-400">{load.today} горит</span>
                )}
              </div>
            )}
            <p
              className="mt-1 text-[11px] font-medium"
              style={{ color: LOAD_STATE[load.load_state]?.color }}
            >
              {LOAD_STATE[load.load_state]?.label}
            </p>
          </>
        )}
      </div>

      {/* Тело — карточки */}
      <div
        ref={setNodeRef}
        className={cn(
          'flex flex-1 flex-col gap-2 overflow-y-auto p-2 transition',
          isOver && (overloaded ? 'bg-red-500/10' : 'bg-line/40')
        )}
      >
        {isOver && overloaded && (
          <div className="rounded bg-red-500/15 px-2 py-1 text-xs text-red-400">
            У сотрудника уже {load.active} задач
          </div>
        )}
        <SortableContext items={column.tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {column.tasks.map((task) => (
            <TeamTaskCard
              key={task.id}
              task={task}
              projectName={projectsById?.[task.project_id]?.name}
              onOpen={onOpen}
              onContextMenu={onContextMenu}
            />
          ))}
        </SortableContext>
        {column.tasks.length === 0 && (
          <p className="py-6 text-center text-xs text-muted/60">Нет задач</p>
        )}
      </div>
    </div>
  )
}
