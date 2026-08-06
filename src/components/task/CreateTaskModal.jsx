import { useState } from 'react'
import { Plus, Trash2, AlertTriangle } from 'lucide-react'
import { PRIORITY, LOAD_STATE } from '../../lib/constants'
import { cn } from '../../lib/utils'
import Modal from '../ui/Modal'
import Input from '../ui/Input'
import Textarea from '../ui/Textarea'
import DatePicker from '../ui/DatePicker'
import Button from '../ui/Button'
import Avatar from '../ui/Avatar'
import { useToast } from '../ui/Toast'

const EMPTY = {
  title: '',
  description: '',
  assigneeId: '',
  priority: 'medium',
  dueDate: '', // ISO-строка или ''
  estimate: '',
}

export default function CreateTaskModal({
  members = [],
  workload = {},
  defaultStatusId = null,
  onCreate,
  onClose,
}) {
  const { toast } = useToast()
  const [form, setForm] = useState(EMPTY)
  const [checklist, setChecklist] = useState([])
  const [newItem, setNewItem] = useState('')
  const [busy, setBusy] = useState(false)

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
  }

  const submit = async (addAnother) => {
    if (!form.title.trim()) {
      toast.error('Введите заголовок задачи')
      return
    }
    setBusy(true)

    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      assignee_id: form.assigneeId || null,
      priority: form.priority,
      due_date: form.dueDate || null,
      estimate_hours: form.estimate ? Number(form.estimate) : null,
      status_id: defaultStatusId,
    }

    const { error: err } = await onCreate(payload, checklist)
    setBusy(false)

    if (err) {
      toast.error(err)
      return
    }
    toast.success('Задача создана')
    if (addAnother) resetForm()
    else onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Новая задача"
      size="md"
      closeOnOverlay={!busy}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Отмена
          </Button>
          <Button variant="secondary" onClick={() => submit(true)} disabled={busy}>
            Создать и добавить ещё
          </Button>
          <Button onClick={() => submit(false)} loading={busy}>
            Создать
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          autoFocus
          label="Заголовок"
          value={form.title}
          onChange={(e) => set({ title: e.target.value })}
          placeholder="Что нужно сделать?"
        />

        <Textarea
          label="Описание"
          rows={3}
          value={form.description}
          onChange={(e) => set({ description: e.target.value })}
          placeholder="Детали, контекст…"
        />

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
                  <Avatar name={p.full_name} size="sm" />
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
                        {w.active_tasks} в работе · {load?.label ?? ''}
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
                  form.priority === key ? val.badge : 'text-muted hover:text-fg'
                )}
              >
                {val.label}
              </button>
            ))}
          </div>
        </div>

        {/* Срок + быстрые кнопки (пресеты DatePicker) */}
        <div>
          <label className="mb-1 block text-xs font-medium uppercase text-muted">
            Срок
          </label>
          <DatePicker
            value={form.dueDate || null}
            onChange={(iso) => set({ dueDate: iso ?? '' })}
            presets
          />
        </div>

        {/* Оценка */}
        <Input
          label="Оценка, часов"
          type="number"
          min="0"
          step="0.5"
          value={form.estimate}
          onChange={(e) => set({ estimate: e.target.value })}
          placeholder="—"
          className="w-32"
        />

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
            <Input
              className="flex-1"
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) =>
                e.key === 'Enter' && (e.preventDefault(), addItem())
              }
              placeholder="Пункт чек-листа…"
            />
            <Button variant="ghost" onClick={addItem} aria-label="Добавить пункт">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
