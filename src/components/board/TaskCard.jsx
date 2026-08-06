import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  MessageSquare,
  Paperclip,
  CheckSquare,
  RotateCcw,
  Clock,
  AlertCircle,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { PRIORITY } from '../../lib/constants'
import { formatDeadline, cn } from '../../lib/utils'
import Avatar from '../ui/Avatar'
import PriorityChip from '../ui/PriorityChip'

// Цвет текста строки со сроком по состоянию дедлайна
const DEADLINE_TEXT = {
  overdue: 'text-red-400',
  critical: 'text-orange-400',
  warning: 'text-amber-400',
}

// Карточка задачи на канбан-доске.
// onOpen(task) — открытие TaskDrawer (без перехода на страницу).
export default function TaskCard({ task, onOpen, onContextMenu, overlay = false }) {
  const { user, isEmployee } = useAuth()

  // Сотрудник может тащить только свои задачи; остальные — нет
  const canDrag = !isEmployee || task.assignee_id === user?.id

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: { type: 'task', statusId: task.status_id },
    disabled: overlay || !canDrag,
  })

  const prio = PRIORITY[task.priority]
  const showPrioLabel = task.priority === 'high' || task.priority === 'critical'
  const deadlineText = DEADLINE_TEXT[task.deadline_state] ?? 'text-muted'

  // Полоса слева — приоритет. Срок читается по цвету строки со сроком ниже.
  const style = {
    borderLeftColor: prio?.stripe ?? 'transparent',
    ...(overlay
      ? {}
      : {
          transform: CSS.Transform.toString(transform),
          transition,
          opacity: isDragging ? 0.4 : 1,
        }),
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => !overlay && onOpen?.(task)}
      onContextMenu={(e) => {
        if (overlay || !onContextMenu) return
        e.preventDefault()
        onContextMenu(e, task)
      }}
      className={cn(
        'rounded-lg border border-line border-l-4 bg-app p-3 text-left transition hover:border-accent',
        canDrag ? 'cursor-pointer' : 'cursor-not-allowed',
        overlay && 'rotate-2 shadow-xl'
      )}
    >
      {/* Верхняя строка: приоритет + номер */}
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          {showPrioLabel && <PriorityChip priority={task.priority} size="xs" />}
        </span>
        <span className="flex-shrink-0 text-xs text-muted">#{task.number}</span>
      </div>

      {/* Заголовок — максимум 2 строки */}
      <p className="line-clamp-2 text-sm text-fg">{task.title}</p>

      {/* Срок + индикатор застоя */}
      {(task.due_date || task.is_stale) && (
        <div className="mt-1.5 flex items-center gap-2">
          {task.due_date && (
            <span className={cn('flex items-center gap-1 text-xs', deadlineText)}>
              <Clock className="h-3 w-3 flex-shrink-0" />
              {formatDeadline(task.due_date)}
            </span>
          )}
          {task.is_stale && (
            <AlertCircle
              className="h-3.5 w-3.5 flex-shrink-0 text-amber-400"
              aria-label="Задача не двигается больше 7 дней"
            >
              <title>Задача не двигается больше 7 дней</title>
            </AlertCircle>
          )}
        </div>
      )}

      {/* Нижняя строка: метрики + исполнитель */}
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5 text-muted">
          {task.comments_count > 0 && (
            <span className="flex items-center gap-0.5 text-[11px]">
              <MessageSquare className="h-3 w-3" />
              {task.comments_count}
            </span>
          )}
          {task.attachments_count > 0 && (
            <span className="flex items-center gap-0.5 text-[11px]">
              <Paperclip className="h-3 w-3" />
              {task.attachments_count}
            </span>
          )}
          {task.checklist_total > 0 && (
            <span className="flex items-center gap-0.5 text-[11px]">
              <CheckSquare className="h-3 w-3" />
              {task.checklist_done}/{task.checklist_total}
            </span>
          )}
          {task.rework_count > 0 && (
            <span className="flex items-center gap-0.5 text-[11px] text-red-400">
              <RotateCcw className="h-3 w-3" />
              {task.rework_count}
            </span>
          )}
        </div>

        {task.assignee_id && (
          <Avatar name={task.assignee_name} size="xs" title={task.assignee_name ?? ''} />
        )}
      </div>
    </div>
  )
}
