import { useState, useMemo, Fragment } from 'react'
import { ChevronRight, ChevronDown, ChevronUp } from 'lucide-react'
import Avatar from '../ui/Avatar'
import PriorityChip from '../ui/PriorityChip'
import { LOAD_STATE, DEADLINE_STATE } from '../../lib/constants'
import { formatDeadline, cn } from '../../lib/utils'

const BAR_COLOR = {
  free: 'bg-slate-500',
  normal: 'bg-[#2bbaac]',
  busy: 'bg-orange-500',
  overloaded: 'bg-red-500',
}

const COLUMNS = [
  { key: 'name', label: 'Сотрудник' },
  { key: 'active', label: 'Активных' },
  { key: 'overdue', label: 'Просрочено' },
  { key: 'today', label: 'Горит' },
  { key: 'rework', label: 'Доработка' },
  { key: 'noDue', label: 'Без срока' },
]

export default function TeamTable({ columns, members, onOpen, onReassign }) {
  const [sortKey, setSortKey] = useState('active')
  const [sortDir, setSortDir] = useState('desc')
  const [expanded, setExpanded] = useState(() => new Set())
  // Сколько задач показано у раскрытого сотрудника
  const [expandedLimit, setExpandedLimit] = useState({})

  const rows = useMemo(() => {
    const arr = [...columns]
    arr.sort((a, b) => {
      let av, bv
      if (sortKey === 'name') {
        av = a.profile?.full_name ?? ''
        bv = b.profile?.full_name ?? ''
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      }
      av = a.load[sortKey] ?? 0
      bv = b.load[sortKey] ?? 0
      return sortDir === 'asc' ? av - bv : bv - av
    })
    return arr
  }, [columns, sortKey, sortDir])

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir(key === 'name' ? 'asc' : 'desc')
    }
  }
  const toggleExpand = (id) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full text-sm">
        <thead className="bg-app text-left text-xs uppercase text-muted">
          <tr>
            <th className="w-8 px-3 py-2" />
            {COLUMNS.map((c) => (
              <th key={c.key} className="px-3 py-2 font-medium">
                <button type="button" onClick={() => toggleSort(c.key)} className="flex items-center gap-1 hover:text-fg">
                  {c.label}
                  {sortKey === c.key && (sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                </button>
              </th>
            ))}
            <th className="px-3 py-2 font-medium">Загрузка</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const open = expanded.has(r.user_id)
            const load = r.load
            return (
              <Fragment key={r.user_id}>
                <tr className="border-t border-line">
                  <td className="px-3 py-2">
                    <button type="button" onClick={() => toggleExpand(r.user_id)} className="text-muted hover:text-fg">
                      {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-2.5">
                      <Avatar name={r.profile?.full_name} src={r.profile?.avatar_url} size="sm" />
                      <span>
                        <span className="block text-fg">{r.profile?.full_name}</span>
                        {r.profile?.position && <span className="block text-xs text-muted">{r.profile.position}</span>}
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-2 text-fg">{load.active}</td>
                  <td className={cn('px-3 py-2', load.overdue > 0 ? 'text-red-400' : 'text-muted')}>{load.overdue}</td>
                  <td className={cn('px-3 py-2', load.today > 0 ? 'text-orange-400' : 'text-muted')}>{load.today}</td>
                  <td className="px-3 py-2 text-muted">{load.rework}</td>
                  <td className="px-3 py-2 text-muted">{load.noDue}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-line">
                        <div className={cn('h-full rounded-full', BAR_COLOR[load.load_state])} style={{ width: `${Math.min(100, load.load_percent)}%` }} />
                      </div>
                      <span className="text-xs" style={{ color: LOAD_STATE[load.load_state]?.color }}>
                        {LOAD_STATE[load.load_state]?.label}
                      </span>
                    </div>
                  </td>
                </tr>
                {open && (
                  <tr className="border-t border-line bg-app/40">
                    <td />
                    <td colSpan={7} className="px-3 py-2">
                      {r.tasks.length === 0 ? (
                        <p className="text-xs text-muted/60">Нет задач</p>
                      ) : (
                        <div className="space-y-1">
                          {r.tasks.slice(0, expandedLimit[r.user_id] ?? 20).map((t) => {
                            const dl = DEADLINE_STATE[t.deadline_state]
                            return (
                              <div key={t.id} className="flex items-center gap-2 rounded border-l-2 bg-surface px-2 py-1" style={{ borderLeftColor: dl?.color }}>
                                <button type="button" onClick={() => onOpen(t)} className="min-w-0 flex-1 text-left">
                                  <span className="text-xs text-muted">#{t.number}</span>{' '}
                                  <span className="text-sm text-fg">{t.title}</span>
                                  <PriorityChip priority={t.priority} size="xs" className="ml-2 align-middle" />
                                  {t.due_date && <span className="ml-2 text-xs" style={{ color: dl?.color }}>{formatDeadline(t.due_date)}</span>}
                                </button>
                                <select
                                  value={r.user_id}
                                  onChange={(e) => onReassign(t.id, e.target.value || null)}
                                  className="rounded border border-line bg-app px-1.5 py-0.5 text-xs text-fg outline-none focus:border-accent"
                                >
                                  <option value="">— снять —</option>
                                  {members.map((m) => (
                                    <option key={m.user_id} value={m.user_id}>
                                      {m.profile?.full_name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )
                          })}
                          {r.tasks.length > (expandedLimit[r.user_id] ?? 20) && (
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedLimit((prev) => ({
                                  ...prev,
                                  [r.user_id]: (prev[r.user_id] ?? 20) + 20,
                                }))
                              }
                              className="mx-auto mt-1 block rounded-lg border border-line px-2.5 py-1 text-xs text-muted transition hover:border-accent hover:text-fg"
                            >
                              Показать ещё{' '}
                              {Math.min(
                                20,
                                r.tasks.length - (expandedLimit[r.user_id] ?? 20)
                              )}{' '}
                              из {r.tasks.length}
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
