import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Clock } from 'lucide-react'
import { PRIORITY, DEADLINE_STATE } from '../../lib/constants'
import { formatDeadline, cn } from '../../lib/utils'

export default function TeamTaskCard({ task, projectName, onOpen, onContextMenu, overlay }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id, data: { type: 'task' }, disabled: overlay })

  const prio = PRIORITY[task.priority]
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
      className={cn(
        'cursor-pointer rounded-lg border border-line border-l-4 bg-app p-2.5 text-left transition hover:border-accent',
        overlay && 'rotate-2 shadow-xl'
      )}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs text-muted">#{task.number}</span>
        {prio && (
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: prio.color }} title={prio.label} />
        )}
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
    </div>
  )
}
