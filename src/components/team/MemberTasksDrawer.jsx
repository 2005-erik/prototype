import { useState } from 'react'
import Drawer from '../ui/Drawer'
import Avatar from '../ui/Avatar'
import Button from '../ui/Button'
import ShowMore from '../ui/ShowMore'
import { StaticTeamTaskCard } from './TeamTaskCard'
import { useIncrementalList } from '../../hooks/useCollapse'
import { LOAD_STATE, DEFAULT_WORK_LIMIT } from '../../lib/constants'
import { useWorkLimit } from '../../hooks/useWorkLimit'
import { useToast } from '../ui/Toast'

// Задачи сотрудника — в панели справа, а не внутри карточки:
// раскрытие не перестраивает сетку карточек.
export default function MemberTasksDrawer({
  column,
  projectsById,
  canEditLimit = false,
  onOpenTask,
  onContextMenu,
  onLimitChanged,
  onClose,
}) {
  const { toast } = useToast()
  const { saving, setWorkLimit } = useWorkLimit()
  const [limitDraft, setLimitDraft] = useState(
    String(column?.load?.work_limit ?? DEFAULT_WORK_LIMIT)
  )
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
              {load ? `${load.active} в работе · ${load.queued} в очереди` : `${tasks.length} задач`}
              {load ? ` · ${LOAD_STATE[load.load_state]?.label}` : ''}
              {load?.overdue > 0 ? ` · ${load.overdue} просрочено` : ''}
            </span>
          </span>
        </span>
      }
    >
      {/* Лимит одновременных задач */}
      {canEditLimit && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-app p-3">
          <span className="text-sm text-fg">Лимит одновременных задач</span>
          <input
            type="number"
            min={1}
            value={limitDraft}
            onChange={(e) => setLimitDraft(e.target.value)}
            className="w-20 rounded border border-line bg-surface px-2 py-1 text-sm text-fg outline-none focus:border-accent"
          />
          <Button
            size="sm"
            variant="secondary"
            loading={saving}
            onClick={async () => {
              const value = Number(limitDraft)
              if (!Number.isFinite(value) || value <= 0) {
                toast.error('Лимит должен быть больше нуля')
                return
              }
              const { error } = await setWorkLimit(column.user_id, value)
              if (error) toast.error(error)
              else {
                toast.success('Лимит обновлён')
                onLimitChanged?.()
              }
            }}
          >
            Сохранить
          </Button>
          <span className="text-xs text-muted">
            Сейчас в работе: {column.load?.active ?? 0}
          </span>
        </div>
      )}

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
