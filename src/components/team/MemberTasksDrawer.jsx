import Drawer from '../ui/Drawer'
import Avatar from '../ui/Avatar'
import ShowMore from '../ui/ShowMore'
import { StaticTeamTaskCard } from './TeamTaskCard'
import { useIncrementalList } from '../../hooks/useCollapse'
import { LOAD_STATE } from '../../lib/constants'

// Задачи сотрудника — в панели справа, а не внутри карточки:
// раскрытие не перестраивает сетку карточек.
export default function MemberTasksDrawer({
  column,
  projectsById,
  onOpenTask,
  onContextMenu,
  onClose,
}) {
  const tasks = column?.tasks ?? []
  const { visible, hidden, showMore, showAll, step } = useIncrementalList(tasks, 20)
  const load = column?.load

  if (!column) return null

  return (
    <Drawer
      open
      onClose={onClose}
      width={520}
      title={
        <span className="flex items-center gap-2.5">
          <Avatar
            name={column.profile?.full_name}
            src={column.profile?.avatar_url}
            size="sm"
          />
          <span className="min-w-0">
            <span className="block truncate">{column.profile?.full_name}</span>
            <span className="block text-xs font-normal text-muted">
              {tasks.length} активных
              {load ? ` · ${LOAD_STATE[load.load_state]?.label}` : ''}
              {load?.overdue > 0 ? ` · ${load.overdue} просрочено` : ''}
            </span>
          </span>
        </span>
      }
    >
      {tasks.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted/60">
          Активных задач нет
        </p>
      ) : (
        <div className="space-y-2">
          {visible.map((task) => (
            <StaticTeamTaskCard
              key={task.id}
              task={task}
              projectName={projectsById?.[task.project_id]?.name}
              onOpen={onOpenTask}
              onContextMenu={onContextMenu}
            />
          ))}
          <ShowMore hidden={hidden} step={step} onMore={showMore} onAll={showAll} />
        </div>
      )}
    </Drawer>
  )
}
