import { useState, useEffect, useRef } from 'react'
import {
  Clock,
  MoreVertical,
  MessageSquare,
  Paperclip,
  CheckSquare,
} from 'lucide-react'
import { PRIORITY, DEADLINE_STATE } from '../../lib/constants'
import { formatDeadline, cn } from '../../lib/utils'
import { useChangeStatus } from '../../hooks/useChangeStatus'
import { useToast } from '../ui/Toast'
import Button from '../ui/Button'
import StatusCommentModal from '../board/StatusCommentModal'

// Быстрое действие по коду текущего статуса
const QUICK_ACTION = {
  new: { label: 'Взять в работу', targetCode: 'in_progress', cls: '' },
  rework: { label: 'Взять в работу', targetCode: 'in_progress', cls: '' },
  in_progress: {
    label: 'Сдать на проверку',
    targetCode: 'review',
    cls: 'bg-green-600 hover:bg-green-500',
  },
}

// Строка задачи для списочных экранов (крупная, для тапа с телефона).
export default function TaskRow({ task, statuses = [], project = null, reason, onOpen }) {
  const changeStatus = useChangeStatus()
  const { toast } = useToast()
  const [optimistic, setOptimistic] = useState(null)
  const [pending, setPending] = useState(null) // { status } для requires_comment
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  // Сброс оптимистичного значения, когда данные догнали
  useEffect(() => {
    if (optimistic && task.status_id === optimistic.status_id) {
      setOptimistic(null)
    }
  }, [task.status_id, optimistic])

  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menuOpen])

  const cur = optimistic ?? {
    status_id: task.status_id,
    status_code: task.status_code,
    status_name: task.status_name,
    status_color: task.status_color,
  }

  const prio = PRIORITY[task.priority]
  const deadline = DEADLINE_STATE[task.deadline_state]
  const action = QUICK_ACTION[cur.status_code]
  const targetStatus =
    action && statuses.find((s) => s.code === action.targetCode)

  const applyChange = async (status, comment) => {
    const prev = optimistic
    setOptimistic({
      status_id: status.id,
      status_code: status.code,
      status_name: status.name,
      status_color: status.color,
    })
    const { error } = await changeStatus(task.id, status.id, comment)
    if (error) {
      setOptimistic(prev ?? null)
      toast.error(error)
    } else {
      toast.success('Статус обновлён')
    }
  }

  const performChange = (status) => {
    if (!status || status.id === cur.status_id) return
    if (status.requires_comment) {
      setPending({ status })
    } else {
      applyChange(status, null)
    }
  }

  const stop = (e) => e.stopPropagation()

  return (
    <>
      <div
        onClick={() => onOpen?.(task)}
        style={{ borderLeftColor: deadline?.color ?? 'transparent' }}
        className="flex cursor-pointer items-stretch gap-3 rounded-lg border border-line border-l-4 bg-app p-3 transition hover:border-accent"
      >
        {/* Основная область */}
        <div className="min-w-0 flex-1">
          {/* строка 1 */}
          <p className="text-sm font-semibold text-fg sm:text-base">
            <span className="font-normal text-muted">#{task.number}</span>{' '}
            {task.title}
          </p>

          {/* строка 2 */}
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
            {project && (
              <span className="flex items-center gap-1 text-muted">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: project.color ?? '#ecc371' }}
                />
                {project.name}
              </span>
            )}
            {prio && (
              <span
                className={cn(
                  'rounded px-1.5 py-0.5 font-medium',
                  prio.badge
                )}
              >
                {prio.label}
              </span>
            )}
            {task.due_date && (
              <span
                className="flex items-center gap-1"
                style={{ color: deadline?.color }}
              >
                <Clock className="h-3 w-3" />
                {formatDeadline(task.due_date)}
              </span>
            )}
          </div>

          {/* строка 3 */}
          {(task.checklist_total > 0 ||
            task.comments_count > 0 ||
            task.attachments_count > 0) && (
            <div className="mt-1.5 flex items-center gap-3 text-xs text-muted">
              {task.checklist_total > 0 && (
                <span className="flex items-center gap-1.5">
                  <span className="flex items-center gap-0.5">
                    <CheckSquare className="h-3 w-3" />
                    {task.checklist_done} из {task.checklist_total}
                  </span>
                  <span className="h-1 w-12 overflow-hidden rounded-full bg-line">
                    <span
                      className="block h-full rounded-full bg-accent"
                      style={{
                        width: `${
                          (task.checklist_done / task.checklist_total) * 100
                        }%`,
                      }}
                    />
                  </span>
                </span>
              )}
              {task.comments_count > 0 && (
                <span className="flex items-center gap-0.5">
                  <MessageSquare className="h-3 w-3" />
                  {task.comments_count}
                </span>
              )}
              {task.attachments_count > 0 && (
                <span className="flex items-center gap-0.5">
                  <Paperclip className="h-3 w-3" />
                  {task.attachments_count}
                </span>
              )}
            </div>
          )}

          {/* Причина возврата (для секции доработки) */}
          {reason && (
            <p className="mt-1.5 rounded bg-red-500/10 px-2 py-1 text-xs text-red-300">
              <span className="font-medium">Причина возврата:</span> {reason}
            </p>
          )}
        </div>

        {/* Действия справа (тап-таргеты ≥44px) */}
        <div className="flex flex-shrink-0 items-center gap-1.5" onClick={stop}>
          {action && targetStatus ? (
            <Button
              size="sm"
              className={cn('min-h-[44px]', action.cls)}
              onClick={() => performChange(targetStatus)}
            >
              {action.label}
            </Button>
          ) : cur.status_code === 'review' ? (
            <span className="text-xs text-muted">На проверке</span>
          ) : null}

          {/* Полный список статусов */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-muted transition hover:bg-line hover:text-fg"
              aria-label="Сменить статус"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-lg">
                {statuses.length === 0 && (
                  <p className="px-3 py-1.5 text-xs text-muted/60">
                    Нет статусов
                  </p>
                )}
                {statuses.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      performChange(s)
                    }}
                    disabled={s.id === cur.status_id}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition hover:bg-line disabled:opacity-50',
                      s.id === cur.status_id ? 'text-muted' : 'text-fg'
                    )}
                  >
                    <span
                      className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                      style={{ backgroundColor: s.color ?? '#94a3b8' }}
                    />
                    {s.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Модалка обязательного комментария */}
      <StatusCommentModal
        key={pending?.status?.id}
        pending={
          pending ? { statusName: pending.status.name } : null
        }
        onConfirm={async (comment) => {
          await applyChange(pending.status, comment)
          setPending(null)
        }}
        onCancel={() => setPending(null)}
      />
    </>
  )
}
