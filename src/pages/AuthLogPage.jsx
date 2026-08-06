import { useState, useMemo, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { Search, Download, ChevronLeft, ChevronRight, ScrollText } from 'lucide-react'
import { useAuthLog } from '../hooks/useAuthLog'
import Select from '../components/ui/Select'
import Button from '../components/ui/Button'
import Skeleton from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'
import { useToast } from '../components/ui/Toast'
import { formatDateTime } from '../lib/utils'

const PAGE_SIZE = 50

const ACTION_LABEL = {
  login: 'Вход',
  logout: 'Выход',
  failed_login: 'Неудачный вход',
  password_changed: 'Смена пароля',
}

function ru(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function AuthLogPage() {
  const { toast } = useToast()
  const [email, setEmail] = useState('')
  const [debounced, setDebounced] = useState('')
  const [action, setAction] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(email), 300)
    return () => clearTimeout(t)
  }, [email])

  // Сброс на первую страницу при смене фильтров
  useEffect(() => {
    setPage(1)
  }, [debounced, action, from, to])

  const filters = useMemo(
    () => ({
      email: debounced,
      action,
      fromISO: from ? new Date(`${from}T00:00:00`).toISOString() : null,
      toISO: to ? new Date(`${to}T23:59:59.999`).toISOString() : null,
    }),
    [debounced, action, from, to]
  )

  const { logs, total, loading, error, fetchAll } = useAuthLog(filters, page, PAGE_SIZE)

  useEffect(() => {
    if (error) toast.error(error)
  }, [error, toast])

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const exportXlsx = async () => {
    setExporting(true)
    const { data, error: err } = await fetchAll()
    setExporting(false)
    if (err) return toast.error(err)
    const rows = data.map((r) => ({
      Дата: ru(r.created_at),
      Пользователь: r.profiles?.full_name ?? '',
      Email: r.email ?? '',
      Действие: ACTION_LABEL[r.action] ?? r.action,
      IP: r.ip_address ?? '',
      'User-Agent': r.user_agent ?? '',
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(rows.length ? rows : [{ Дата: 'Нет записей' }]),
      'Журнал входов'
    )
    const today = ru(new Date().toISOString()).slice(0, 10)
    XLSX.writeFile(wb, `Журнал_входов_${today}.xlsx`)
    toast.success('Экспортировано')
  }

  return (
    <div className="space-y-5">
      {/* Фильтры */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email пользователя…"
            className="w-56 rounded-lg border border-line bg-surface py-1.5 pl-8 pr-3 text-sm text-fg placeholder-muted outline-none focus:border-accent"
          />
        </div>
        <Select
          value={action}
          onChange={(e) => setAction(e.target.value)}
          options={[
            { value: '', label: 'Все действия' },
            { value: 'login', label: 'Вход' },
            { value: 'logout', label: 'Выход' },
            { value: 'failed_login', label: 'Неудачный вход' },
            { value: 'password_changed', label: 'Смена пароля' },
          ]}
          className="w-44"
        />
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-fg outline-none focus:border-accent"
          aria-label="С даты"
        />
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-fg outline-none focus:border-accent"
          aria-label="По дату"
        />
        <Button
          variant="secondary"
          size="sm"
          className="ml-auto"
          onClick={exportXlsx}
          loading={exporting}
        >
          <Download className="h-4 w-4" />
          Экспорт в Excel
        </Button>
      </div>

      {/* Таблица */}
      {loading && logs.length === 0 ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : logs.length === 0 ? (
        <EmptyState icon={ScrollText} title="Записей нет" />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-app text-left text-xs uppercase text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Дата</th>
                <th className="px-3 py-2 font-medium">Пользователь</th>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Действие</th>
                <th className="px-3 py-2 font-medium">IP</th>
                <th className="px-3 py-2 font-medium">Устройство</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="whitespace-nowrap px-3 py-2 text-muted">
                    {formatDateTime(r.created_at)}
                  </td>
                  <td className="px-3 py-2 text-fg">
                    {r.profiles?.full_name ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-muted">{r.email ?? '—'}</td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        r.action === 'failed_login'
                          ? 'text-red-400'
                          : 'text-fg'
                      }
                    >
                      {ACTION_LABEL[r.action] ?? r.action}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted">{r.ip_address ?? '—'}</td>
                  <td className="max-w-xs truncate px-3 py-2 text-muted" title={r.user_agent ?? ''}>
                    {r.user_agent ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Пагинация */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-muted">
          <span>
            Всего: {total} · стр. {page} из {pages}
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-line p-1.5 text-fg transition hover:border-accent disabled:opacity-40"
              aria-label="Назад"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={page >= pages}
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              className="rounded-lg border border-line p-1.5 text-fg transition hover:border-accent disabled:opacity-40"
              aria-label="Вперёд"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
