import { useState, useEffect, useRef } from 'react'
import {
  ExternalLink,
  CalendarClock,
  Flag,
  UserMinus,
  UserPlus,
  ChevronRight,
} from 'lucide-react'
import { PRIORITY, LOAD_STATE } from '../../lib/constants'
import { cn } from '../../lib/utils'

function toLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

// menu: { task, x, y }; members: [{ user_id, profile, load }] отсортированы по загрузке
export default function TaskContextMenu({ menu, members = [], onClose, onOpen, onReassign, onPatch }) {
  const [view, setView] = useState('root')
  const ref = useRef(null)

  useEffect(() => {
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    const onEsc = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onEsc)
    }
  }, [onClose])

  if (!menu) return null
  const { task } = menu
  // Клэмп по вьюпорту
  const left = Math.min(menu.x, window.innerWidth - 240)
  const top = Math.min(menu.y, window.innerHeight - 320)

  const Item = ({ icon, label, onClick, chevron }) => (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-fg transition hover:bg-line"
    >
      {icon}
      <span className="flex-1">{label}</span>
      {chevron && <ChevronRight className="h-3.5 w-3.5 text-muted" />}
    </button>
  )

  return (
    <div
      ref={ref}
      style={{ left, top }}
      className="fixed z-50 w-56 overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-xl"
    >
      {view === 'root' && (
        <>
          <Item icon={<ExternalLink className="h-4 w-4" />} label="Открыть задачу" onClick={() => { onOpen(task); onClose() }} />
          <Item icon={<CalendarClock className="h-4 w-4" />} label="Изменить срок" onClick={() => setView('due')} chevron />
          <Item icon={<Flag className="h-4 w-4" />} label="Изменить приоритет" onClick={() => setView('priority')} chevron />
          <Item icon={<UserMinus className="h-4 w-4" />} label="Снять исполнителя" onClick={() => { onReassign(task.id, null); onClose() }} />
          <Item icon={<UserPlus className="h-4 w-4" />} label="Переназначить на…" onClick={() => setView('reassign')} chevron />
        </>
      )}

      {view === 'due' && (
        <div className="p-2">
          <p className="mb-1 px-1 text-xs text-muted">Новый срок</p>
          <input
            type="datetime-local"
            defaultValue={toLocalInput(task.due_date)}
            onChange={(e) => {
              onPatch(task.id, { due_date: e.target.value ? new Date(e.target.value).toISOString() : null })
              onClose()
            }}
            className="w-full rounded border border-line bg-app px-2 py-1 text-sm text-fg outline-none focus:border-accent"
          />
        </div>
      )}

      {view === 'priority' && (
        <div className="p-1">
          {Object.entries(PRIORITY).map(([key, val]) => (
            <button
              key={key}
              type="button"
              onClick={() => { onPatch(task.id, { priority: key }); onClose() }}
              className="flex w-full items-center gap-2 rounded px-3 py-1.5 text-left text-sm text-fg transition hover:bg-line"
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: val.color }} />
              {val.label}
            </button>
          ))}
        </div>
      )}

      {view === 'reassign' && (
        <div className="max-h-64 overflow-y-auto p-1">
          {members.map((m) => (
            <button
              key={m.user_id}
              type="button"
              onClick={() => { onReassign(task.id, m.user_id); onClose() }}
              className="flex w-full items-center justify-between gap-2 rounded px-3 py-1.5 text-left text-sm transition hover:bg-line"
            >
              <span className="truncate text-fg">{m.profile?.full_name}</span>
              <span className={cn('flex-shrink-0 text-xs', m.load?.load_state === 'overloaded' ? 'text-red-400' : 'text-muted')}>
                {m.load?.active} · {LOAD_STATE[m.load?.load_state]?.label}
              </span>
            </button>
          ))}
          {members.length === 0 && <p className="px-3 py-2 text-xs text-muted/60">Нет сотрудников</p>}
        </div>
      )}
    </div>
  )
}
