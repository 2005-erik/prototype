import { useState } from 'react'
import { X, Plus, Trash2, AlertTriangle } from 'lucide-react'
import { PRIORITY, LOAD_STATE } from '../../lib/constants'
import { getInitials, cn } from '../../lib/utils'

// Быстрые значения срока: сегодня / завтра / через неделю (на 18:00)
function quickDue(offsetDays) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  d.setHours(18, 0, 0, 0)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`
}

const EMPTY = {
  title: '',
  description: '',
  assigneeId: '',
  priority: 'medium',
  dueDate: '',
  estimate: '',
}

export default function CreateTaskModal({
  members = [],
  workload = {},
  defaultStatusId = null,
  onCreate,
  onClose,
}) {
  const [form, setForm] = useState(EMPTY)
  const [checklist, setChecklist] = useState([])
  const [newItem, setNewItem] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  const addItem = () => {
    const v = newItem.trim()
    if (!v) return
    setChecklist((c) => [...c, v])
    setNewItem('')
  }

  const resetForm = () => {
    setForm(EMPTY)
    setChecklist([])
    setNewItem('')
    setError(null)
  }

  const submit = async (addAnother) => {
    if (!form.title.trim()) {
      setError('Введите заголовок задачи')
      return
    }
    setBusy(true)
    setError(null)

    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      assignee_id: form.assigneeId || null,
      priority: form.priority,
      due_date: form.dueDate ? new Date(form.dueDate).toISOString() : null,
      estimate_hours: form.estimate ? Number(form.estimate) : null,
      status_id: defaultStatusId,
    }

    const { error: err } = await onCreate(payload, checklist)
    setBusy(false)

    if (err) {
      setError(err)
      return
    }
    if (addAnother) resetForm()
    else onClose()
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={busy ? undefined : onClose}
        aria-hidden="true"
      />
      <div
        className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-line bg-surface shadow-xl"
        role="dialog"
        aria-label="Новая задача"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h3 className="text-base font-semibold text-fg">Новая задача</h3>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg p-1.5 text-muted transition hover:bg-line hover:text-fg disabled:opacity-50"
            aria-label="Закрыть"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {/* Заголовок */}
          <div>
            <label className="mb-1 block text-xs font-medium uppercase text-muted">
              Заголовок
            </label>
            <input
              autoFocus
              value={form.title}
              onChange={(e) => set({ title: e.target.value })}
              placeholder="Что нужно сделать?"
              className="w-full rounded-lg border border-line bg-app px-3 py-2 text-sm text-fg placeholder-muted outline-none focus:border-accent"
            />
          </div>

          {/* Описание */}
          <div>
            <label className="mb-1 block text-xs font-medium uppercase text-muted">
              Описание
            </label>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => set({ description: e.target.value })}
              placeholder="Детали, контекст…"
              className="w-full resize-y rounded-lg border border-line bg-app p-2.5 text-sm text-fg placeholder-muted outline-none focus:border-accent"
            />
          </div>

          {/* Исполнитель с загрузкой */}
          <div>
            <label className="mb-1 block text-xs font-medium uppercase text-muted">
              Исполнитель
            </label>
            <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg border border-line bg-app p-1.5">
              <button
                type="button"
                onClick={() => set({ assigneeId: '' })}
                className={cn(
                  'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition',
                  form.assigneeId === ''
                    ? 'bg-accent/20 text-fg'
                    : 'text-muted hover:bg-line'
                )}
              >
                — не назначен —
              </button>
              {members.map((m) => {
                const p = m.profiles
                if (!p) return null
                const w = workload[p.id]
                const load = w ? LOAD_STATE[w.load_state] : null
                const overloaded = w?.load_state === 'overloaded'
                const active = form.assigneeId === p.id
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => set({ assigneeId: p.id })}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-left transition',
                      active ? 'bg-accent/20' : 'hover:bg-line'
                    )}
                  >
                    <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-semibold text-white">
                      {getInitials(p.full_name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-fg">
                        {p.full_name}
                      </span>
                      {w && (
                        <span
                          className={cn(
                            'flex items-center gap-1 text-xs',
                            overloaded ? 'text-red-400' : 'text-muted'
                          )}
                        >
                          {overloaded && <AlertTriangle className="h-3 w-3" />}
                          {w.active_tasks} задач · {load?.label ?? ''}
                        </span>
                      )}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Приоритет — сегментированный контрол */}
          <div>
            <label className="mb-1 block text-xs font-medium uppercase text-muted">
              Приоритет
            </label>
            <div className="flex gap-1 rounded-lg border border-line bg-app p-1">
              {Object.entries(PRIORITY).map(([key, val]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => set({ priority: key })}
                  className={cn(
                    'flex-1 rounded px-2 py-1.5 text-xs font-medium transition',
                    form.priority === key
                      ? val.badge
                      : 'text-muted hover:text-fg'
                  )}
                >
                  {val.label}
                </button>
              ))}
            </div>
          </div>

          {/* Срок + быстрые кнопки */}
          <div>
            <label className="mb-1 block text-xs font-medium uppercase text-muted">
              Срок
            </label>
            <input
              type="datetime-local"
              value={form.dueDate}
              onChange={(e) => set({ dueDate: e.target.value })}
              className="w-full rounded-lg border border-line bg-app px-3 py-2 text-sm text-fg outline-none focus:border-accent"
            />
            <div className="mt-1.5 flex gap-1.5">
              {[
                { label: 'Сегодня', days: 0 },
                { label: 'Завтра', days: 1 },
                { label: 'Через неделю', days: 7 },
              ].map((b) => (
                <button
                  key={b.days}
                  type="button"
                  onClick={() => set({ dueDate: quickDue(b.days) })}
                  className="rounded-lg border border-line px-2 py-1 text-xs text-muted transition hover:border-accent hover:text-fg"
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>

          {/* Оценка */}
          <div>
            <label className="mb-1 block text-xs font-medium uppercase text-muted">
              Оценка, часов
            </label>
            <input
              type="number"
              min="0"
              step="0.5"
              value={form.estimate}
              onChange={(e) => set({ estimate: e.target.value })}
              placeholder="—"
              className="w-32 rounded-lg border border-line bg-app px-3 py-2 text-sm text-fg placeholder-muted outline-none focus:border-accent"
            />
          </div>

          {/* Чек-лист */}
          <div>
            <label className="mb-1 block text-xs font-medium uppercase text-muted">
              Чек-лист
            </label>
            {checklist.length > 0 && (
              <ul className="mb-2 space-y-1">
                {checklist.map((item, i) => (
                  <li
                    key={i}
                    className="group flex items-center gap-2 rounded border border-line bg-app px-2 py-1"
                  >
                    <span className="flex-1 text-sm text-fg">{item}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setChecklist((c) => c.filter((_, idx) => idx !== i))
                      }
                      className="text-muted opacity-0 transition hover:text-red-400 group-hover:opacity-100"
                      aria-label="Удалить пункт"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-center gap-2">
              <input
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addItem())}
                placeholder="Пункт чек-листа…"
                className="flex-1 rounded border border-line bg-app px-2 py-1 text-sm text-fg placeholder-muted outline-none focus:border-accent"
              />
              <button
                type="button"
                onClick={addItem}
                className="rounded p-1.5 text-muted transition hover:bg-line hover:text-fg"
                aria-label="Добавить пункт"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          {error && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {error}
            </p>
          )}
        </div>

        {/* Кнопки */}
        <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg px-3 py-1.5 text-sm text-muted transition hover:text-fg disabled:opacity-50"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={() => submit(true)}
            disabled={busy}
            className="rounded-lg border border-line px-3 py-1.5 text-sm text-fg transition hover:border-accent disabled:opacity-50"
          >
            Создать и добавить ещё
          </button>
          <button
            type="button"
            onClick={() => submit(false)}
            disabled={busy}
            className="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-white transition hover:bg-accent-hover disabled:opacity-50"
          >
            {busy ? 'Создание…' : 'Создать'}
          </button>
        </div>
      </div>
    </>
  )
}
