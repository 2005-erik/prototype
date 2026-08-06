import { useState, useRef, useEffect, useMemo } from 'react'
import { ChevronUp, ChevronDown, Inbox, Flag } from 'lucide-react'
import { LOAD_STATE, DEADLINE_STATE, PRIORITY } from '../../lib/constants'
import { formatDeadline, plural, cn } from '../../lib/utils'
import PriorityChip from '../ui/PriorityChip'
import ShowMore from '../ui/ShowMore'
import { useIncrementalList } from '../../hooks/useCollapse'

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

// Панель массовых действий над отмеченными задачами
function BulkBar({ count, onPriority, onClear }) {
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
    <div className="mb-2 flex items-center gap-3 rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5">
      <span className="text-sm text-fg">
        Выбрано: {count} {plural(count, 'задача', 'задачи', 'задач')}
      </span>

      <div className="relative ml-auto" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-2.5 py-1 text-xs font-medium text-on-accent transition hover:bg-accent-hover"
        >
          <Flag className="h-3.5 w-3.5" />
          Приоритет
        </button>
        {open && (
          <div className="absolute bottom-full right-0 z-20 mb-1 w-48 overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-xl">
            {Object.entries(PRIORITY).map(([key, val]) => {
              const Icon = val.icon
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    onPriority(key)
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-fg transition hover:bg-line"
                >
                  <Icon className="h-3.5 w-3.5" style={{ color: val.color }} />
                  {val.label}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onClear}
        className="text-xs text-muted transition hover:text-fg"
      >
        Снять выделение
      </button>
    </div>
  )
}

export default function UnassignedPanel({
  tasks = [],
  members = [],
  projectsById,
  onAssign,
  onOpen,
  onBulkPriority,
  open,
  onToggle,
}) {
  const [selected, setSelected] = useState(() => new Set())
  const { visible, hidden, showMore, showAll, step } = useIncrementalList(tasks, 20)

  // Сотрудники по возрастанию загрузки
  const sorted = [...members].sort(
    (a, b) => (a.load?.load_percent ?? 0) - (b.load?.load_percent ?? 0)
  )

  // Из выделения убираем задачи, которых в панели уже нет (назначены/обновились)
  const visibleIds = useMemo(() => new Set(tasks.map((t) => t.id)), [tasks])
  useEffect(() => {
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => visibleIds.has(id)))
      // Сравниваем поэлементно: размер мог совпасть при одновременной
      // замене одной задачи другой
      const same =
        next.size === prev.size && [...prev].every((id) => next.has(id))
      return same ? prev : next
    })
  }, [visibleIds])

  const toggle = (id) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const allSelected = tasks.length > 0 && selected.size === tasks.length

  const applyPriority = async (priority) => {
    const ids = [...selected]
    const { error } = (await onBulkPriority?.(ids, priority)) ?? {}
    if (!error) setSelected(new Set())
  }

  return (
    <div className="safe-bottom safe-x fixed bottom-0 left-0 right-0 z-30 border-t border-line bg-surface">
      <button
        type="button"
        onClick={onToggle}
        className="touch-target flex w-full items-center gap-2 px-4 py-2 text-sm text-fg transition hover:bg-line/40 sm:px-6"
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
        <div className="max-h-72 overflow-y-auto px-4 pb-3 sm:px-6">
          {tasks.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted/60">
              Все задачи распределены
            </p>
          ) : (
            <>
              {selected.size > 0 ? (
                <BulkBar
                  count={selected.size}
                  onPriority={applyPriority}
                  onClear={() => setSelected(new Set())}
                />
              ) : (
                <label className="mb-2 flex cursor-pointer items-center gap-2 text-xs text-muted">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked ? new Set(tasks.map((t) => t.id)) : new Set()
                      )
                    }
                    className="accent-[#ecc371]"
                  />
                  Выбрать все — для массовой смены приоритета
                </label>
              )}

              <div className="space-y-1.5">
                {visible.map((t) => {
                  const dl = DEADLINE_STATE[t.deadline_state]
                  const prio = PRIORITY[t.priority]
                  return (
                    <div
                      key={t.id}
                      className={cn(
                        'flex items-center gap-3 rounded-lg border border-line border-l-4 bg-app px-3 py-1.5',
                        selected.has(t.id) && 'border-accent/60 bg-accent/5'
                      )}
                      style={{ borderLeftColor: prio?.stripe ?? 'transparent' }}
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(t.id)}
                        onChange={() => toggle(t.id)}
                        className="accent-[#ecc371]"
                        aria-label={`Выбрать задачу №${t.number}`}
                      />
                      <button
                        type="button"
                        onClick={() => onOpen(t)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <span className="text-xs text-muted">#{t.number}</span>{' '}
                        <span className="text-sm text-fg">{t.title}</span>
                        <PriorityChip
                          priority={t.priority}
                          size="xs"
                          className="ml-2 align-middle"
                        />
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
                <ShowMore hidden={hidden} step={step} onMore={showMore} onAll={showAll} />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
