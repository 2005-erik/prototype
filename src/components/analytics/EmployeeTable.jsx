import { useState, useMemo } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import Avatar from '../ui/Avatar'
import { LOAD_STATE } from '../../lib/constants'
import { cn } from '../../lib/utils'
import { fmtDays1 } from './chartTheme'

const COLUMNS = [
  { key: 'full_name', label: 'Сотрудник' },
  { key: 'completed', label: 'Завершено' },
  { key: 'avg_completion_days', label: 'Ср. время, дн' },
  { key: 'on_time_percent', label: '% в срок' },
  { key: 'avg_rework', label: 'Ср. возврат' },
  { key: 'load_percent', label: 'Загрузка' },
]

function ontimeCellClass(pct) {
  if (pct == null) return 'text-muted'
  if (pct > 90) return 'bg-green-500/15 text-green-400'
  if (pct >= 70) return 'bg-amber-500/15 text-amber-400'
  return 'bg-red-500/15 text-red-400'
}

// Сортируемая таблица метрик сотрудников с выбором для сравнения (до 4)
export default function EmployeeTable({ rows = [], selected, onToggleSelect }) {
  const [sortKey, setSortKey] = useState('completed')
  const [sortDir, setSortDir] = useState('desc')

  const sorted = useMemo(() => {
    const arr = [...rows]
    arr.sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      }
      return sortDir === 'asc' ? av - bv : bv - av
    })
    return arr
  }, [rows, sortKey, sortDir])

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir(key === 'full_name' ? 'asc' : 'desc')
    }
  }

  const limitReached = selected.size >= 4

  return (
    <>
      {/* Телефон: карточки — в таблице 6 колонок, на узком экране
          они превращаются в горизонтальный скролл вслепую */}
      <div className="space-y-2 md:hidden">
        {sorted.map((e) => {
          const load = LOAD_STATE[e.load_state]
          const checked = selected.has(e.user_id)
          return (
            <div
              key={e.user_id}
              className="rounded-lg border border-line bg-surface p-3"
            >
              <label className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!checked && limitReached}
                  onChange={() => onToggleSelect(e.user_id)}
                  className="mt-1 accent-[#ecc371] disabled:opacity-40"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-fg">
                    {e.full_name}
                  </span>
                  <span
                    className="block text-xs"
                    style={{ color: load?.color }}
                  >
                    {Math.round(e.load_percent ?? 0)}% · {load?.label}
                  </span>
                </span>
              </label>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <div className="flex justify-between">
                  <dt className="text-muted">Завершено</dt>
                  <dd className="text-fg">{e.completed ?? 0}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">% в срок</dt>
                  <dd className="text-fg">{e.on_time_percent ?? '—'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Ср. время</dt>
                  <dd className="text-fg">{e.avg_completion_days ?? '—'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Ср. возврат</dt>
                  <dd className="text-fg">{e.avg_rework ?? 0}</dd>
                </div>
              </dl>
            </div>
          )
        })}
      </div>

    <div className="hidden overflow-x-auto rounded-lg border border-line md:block">
      <table className="w-full text-sm">
        <thead className="bg-app text-left text-xs uppercase text-muted">
          <tr>
            <th className="w-8 px-3 py-2" />
            {COLUMNS.map((c) => (
              <th key={c.key} className="px-3 py-2 font-medium">
                <button
                  type="button"
                  onClick={() => toggleSort(c.key)}
                  className="flex items-center gap-1 transition hover:text-fg"
                >
                  {c.label}
                  {sortKey === c.key &&
                    (sortDir === 'asc' ? (
                      <ChevronUp className="h-3 w-3" />
                    ) : (
                      <ChevronDown className="h-3 w-3" />
                    ))}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((e) => {
            const load = LOAD_STATE[e.load_state]
            const checked = selected.has(e.user_id)
            return (
              <tr key={e.user_id} className="border-t border-line">
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!checked && limitReached}
                    onChange={() => onToggleSelect(e.user_id)}
                    className="accent-[#ecc371] disabled:opacity-40"
                  />
                </td>
                <td className="px-3 py-2">
                  <span className="flex items-center gap-2.5">
                    <Avatar name={e.full_name} src={e.avatar_url} size="sm" />
                    <span className="text-fg">{e.full_name}</span>
                  </span>
                </td>
                <td className="px-3 py-2 text-fg">{e.completed}</td>
                <td className="px-3 py-2 text-muted">
                  {fmtDays1(e.avg_completion_days)}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={cn(
                      'inline-block rounded px-1.5 py-0.5 text-xs font-medium',
                      ontimeCellClass(e.on_time_percent)
                    )}
                  >
                    {e.on_time_percent != null
                      ? `${Math.round(e.on_time_percent)}%`
                      : '—'}
                  </span>
                </td>
                <td className="px-3 py-2 text-muted">{e.avg_rework}</td>
                <td className="px-3 py-2">
                  <span
                    className="text-xs font-medium"
                    style={{ color: load?.color }}
                  >
                    {Math.round(e.load_percent)}% · {load?.label}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
    </>
  )
}
