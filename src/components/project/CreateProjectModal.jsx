import { useState } from 'react'
import { Plus, Trash2, Check } from 'lucide-react'
import { cn } from '../../lib/utils'
import Modal from '../ui/Modal'
import Input from '../ui/Input'
import Textarea from '../ui/Textarea'
import Button from '../ui/Button'
import { useToast } from '../ui/Toast'

// Палитра из 8 предустановленных цветов
const COLORS = [
  '#2563eb',
  '#7c3aed',
  '#db2777',
  '#dc2626',
  '#ea580c',
  '#d97706',
  '#16a34a',
  '#0891b2',
]

// Стандартный набор для стартового заполнения редактора статусов
const DEFAULT_STATUSES = [
  { name: 'Новая', color: '#94a3b8' },
  { name: 'В работе', color: '#3b82f6' },
  { name: 'На проверке', color: '#f59e0b' },
  { name: 'На доработке', color: '#ef4444' },
  { name: 'Выполнено', color: '#22c55e' },
]

export default function CreateProjectModal({ onCreate, onClose }) {
  const { toast } = useToast()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState(COLORS[0])
  const [useDefaultStatuses, setUseDefaultStatuses] = useState(true)
  const [statuses, setStatuses] = useState(DEFAULT_STATUSES)
  const [busy, setBusy] = useState(false)

  const setStatus = (i, patch) =>
    setStatuses((s) => s.map((st, idx) => (idx === i ? { ...st, ...patch } : st)))

  const addStatus = () =>
    setStatuses((s) => [...s, { name: '', color: '#64748b' }])

  const removeStatus = (i) =>
    setStatuses((s) => s.filter((_, idx) => idx !== i))

  const submit = async () => {
    if (!name.trim()) {
      toast.error('Введите название проекта')
      return
    }
    if (!useDefaultStatuses && statuses.filter((s) => s.name.trim()).length < 2) {
      toast.error('Нужно минимум два статуса')
      return
    }

    setBusy(true)
    const { error } = await onCreate({
      name: name.trim(),
      description: description.trim() || null,
      color,
      statuses: useDefaultStatuses ? null : statuses,
    })
    setBusy(false)

    // При успехе страница уводит на доску — модалка размонтируется.
    if (error) toast.error(error)
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Новый проект"
      size="md"
      closeOnOverlay={!busy}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Отмена
          </Button>
          <Button onClick={submit} loading={busy}>
            Создать
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          autoFocus
          label="Название"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Например, Маркетинг Q3"
        />

        <Textarea
          label="Описание"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Кратко о проекте…"
        />

        {/* Цвет */}
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase text-muted">
            Цвет
          </label>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full transition',
                  color === c && 'ring-2 ring-offset-2 ring-offset-surface'
                )}
                style={{ backgroundColor: c, '--tw-ring-color': c }}
                aria-label={`Цвет ${c}`}
              >
                {color === c && <Check className="h-4 w-4 text-white" />}
              </button>
            ))}
          </div>
        </div>

        {/* Набор статусов */}
        <div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-fg">
            <input
              type="checkbox"
              checked={useDefaultStatuses}
              onChange={(e) => setUseDefaultStatuses(e.target.checked)}
              className="accent-blue-600"
            />
            Использовать стандартный набор статусов
          </label>

          {!useDefaultStatuses && (
            <div className="mt-3 space-y-2 rounded-lg border border-line bg-app p-2.5">
              <p className="text-xs text-muted">
                Первый статус — стартовый, последний — финальный.
              </p>
              {statuses.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="color"
                    value={s.color}
                    onChange={(e) => setStatus(i, { color: e.target.value })}
                    className="h-7 w-7 flex-shrink-0 cursor-pointer rounded border border-line bg-transparent"
                    aria-label="Цвет статуса"
                  />
                  <input
                    value={s.name}
                    onChange={(e) => setStatus(i, { name: e.target.value })}
                    placeholder="Название статуса"
                    className="flex-1 rounded border border-line bg-surface px-2 py-1 text-sm text-fg placeholder-muted outline-none focus:border-accent"
                  />
                  <button
                    type="button"
                    onClick={() => removeStatus(i)}
                    className="text-muted transition hover:text-red-400"
                    aria-label="Удалить статус"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <Button variant="ghost" size="sm" onClick={addStatus}>
                <Plus className="h-4 w-4" />
                Добавить статус
              </Button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
