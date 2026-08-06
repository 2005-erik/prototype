import { useState, useRef, useEffect } from 'react'
import { ChevronUp, ChevronDown, Inbox } from 'lucide-react'
import { LOAD_STATE, DEADLINE_STATE } from '../../lib/constants'
import { formatDeadline, cn } from '../../lib/utils'

// Выпадающий список сотрудников для назначения
function AssignMenu({ members, onAssign }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg bg-accent px-2.5 py-1 text-xs font-medium text-on-accent transition hover:bg-accent-hover"
      >
        Назначить
      </button>
      {open && (
        <div className="absolute bottom-full right-0 z-20 mb-1 max-h-56 w-56 overflow-y-auto rounded-lg border border-line bg-surface py-1 shadow-xl">
          {members.map((m) => (
            <button
              key={m.user_id}
              type="button"
              onClick={() => {
                setOpen(false)
                onAssign(m.user_id)
              }}
              className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm transition hover:bg-line"
            >
              <span className="truncate text-fg">{m.profile?.full_name}</span>
              <span
                className={cn(
                  'flex-shrink-0 text-xs',
                  m.load?.load_state === 'overloaded' ? 'text-red-400' : 'text-muted'
                )}
              >
                {m.load?.active} · {LOAD_STATE[m.load?.load_state]?.label}
              </span>
            </button>
          ))}
          {members.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted/60">Нет сотрудников</p>
          )}
        </div>
      )}
    </div>
  )
}

export default function UnassignedPanel({
  tasks = [],
  members = [],
  projectsById,
  onAssign,
  onOpen,
  open,
  onToggle,
}) {
  // Сотрудники по возрастанию загрузки
  const sorted = [...members].sort(
    (a, b) => (a.load?.load_percent ?? 0) - (b.load?.load_percent ?? 0)
  )

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-line bg-surface">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-6 py-2 text-sm text-fg transition hover:bg-line/40"
      >
        <Inbox className="h-4 w-4 text-muted" />
        Требуют распределения
        <span className="rounded-full bg-red-500/15 px-1.5 text-xs font-medium text-red-400">
          {tasks.length}
        </span>
        <span className="ml-auto text-muted">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </span>
      </button>

      {open && (
        <div className="max-h-72 overflow-y-auto px-6 pb-3">
          {tasks.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted/60">
              Все задачи распределены
            </p>
          ) : (
            <div className="space-y-1.5">
              {tasks.map((t) => {
                const dl = DEADLINE_STATE[t.deadline_state]
                return (
                  <div
                    key={t.id}
                    className="flex items-center gap-3 rounded-lg border border-line border-l-4 bg-app px-3 py-1.5"
                    style={{ borderLeftColor: dl?.color }}
                  >
                    <button
                      type="button"
                      onClick={() => onOpen(t)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="text-xs text-muted">#{t.number}</span>{' '}
                      <span className="text-sm text-fg">{t.title}</span>
                      {projectsById?.[t.project_id] && (
                        <span className="ml-2 rounded bg-line px-1.5 py-0.5 text-xs text-muted">
                          {projectsById[t.project_id].name}
                        </span>
                      )}
                      {t.due_date && (
                        <span className="ml-2 text-xs" style={{ color: dl?.color }}>
                          {formatDeadline(t.due_date)}
                        </span>
                      )}
                    </button>
                    <AssignMenu members={sorted} onAssign={(uid) => onAssign(t.id, uid)} />
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
