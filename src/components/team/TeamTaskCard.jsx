import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Clock } from 'lucide-react'
import { DEADLINE_STATE } from '../../lib/constants'
import PriorityChip from '../ui/PriorityChip'
import { formatDeadline, cn } from '../../lib/utils'

// Содержимое карточки — без хуков, чтобы её можно было рисовать
// и вне DndContext (например, в панели задач сотрудника).
function CardBody({ task, projectName }) {
  const deadline = DEADLINE_STATE[task.deadline_state]
  return (
    <>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs text-muted">#{task.number}</span>
        <PriorityChip priority={task.priority} size="xs" />
      </div>
      <p className="line-clamp-2 text-sm text-fg">{task.title}</p>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
        {projectName && (
          <span className="rounded bg-line px-1.5 py-0.5 text-muted">{projectName}</span>
        )}
        {task.due_date && (
          <span className="flex items-center gap-1" style={{ color: deadline?.color }}>
            <Clock className="h-3 w-3" />
            {formatDeadline(task.due_date)}
          </span>
        )}
      </div>
    </>
  )
}

const CARD_CLASS =
  'cursor-pointer rounded-lg border border-line border-l-4 bg-app p-2.5 text-left transition hover:border-accent'

// Карточка вне drag&drop: клик открывает задачу, правый клик — меню.
export function StaticTeamTaskCard({ task, projectName, onOpen, onContextMenu }) {
  const deadline = DEADLINE_STATE[task.deadline_state]
  return (
    <div
      style={{ borderLeftColor: deadline?.color ?? 'transparent' }}
      onClick={() => onOpen?.(task)}
      onContextMenu={(e) => {
        e.preventDefault()
        onContextMenu?.(e, task)
      }}
      className={CARD_CLASS}
    >
      <CardBody task={task} projectName={projectName} />
    </div>
  )
}

export default function TeamTaskCard({ task, projectName, onOpen, onContextMenu, overlay }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id, data: { type: 'task' }, disabled: overlay })

  const deadline = DEADLINE_STATE[task.deadline_state]

  const style = {
    borderLeftColor: deadline?.color ?? 'transparent',
    ...(overlay
      ? {}
      : { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }),
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => !overlay && onOpen?.(task)}
      onContextMenu={(e) => {
        if (overlay) return
        e.preventDefault()
        onContextMenu?.(e, task)
      }}
      className={cn(CARD_CLASS, overlay && 'rotate-2 shadow-xl')}
    >
      <CardBody task={task} projectName={projectName} />
    </div>
  )
}
