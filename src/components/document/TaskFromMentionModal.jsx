import { useState, useEffect } from 'react'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import Input from '../ui/Input'
import Select from '../ui/Select'
import Textarea from '../ui/Textarea'
import DatePicker from '../ui/DatePicker'
import { useToast } from '../ui/Toast'

// Задача из упоминания в тексте: исполнитель уже известен, остальное —
// обычные поля. Созданная задача сразу связывается с документом.
export default function TaskFromMentionModal({
  open,
  onClose,
  mention,
  statuses = [],
  sectionTitle = '',
  onCreate,
  onCreated,
}) {
  const { toast } = useToast()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [statusId, setStatusId] = useState('')
  const [dueDate, setDueDate] = useState(null)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  // Сброс только на открытии: перезагрузка списка статусов не должна
  // стирать уже набранное название
  useEffect(() => {
    if (!open) return
    setTitle('')
    setDescription(sectionTitle ? `Из раздела «${sectionTitle}»` : '')
    setStatusId(statuses[0]?.id ?? '')
    setDueDate(null)
    setError(null)
    setSaving(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const submit = async () => {
    const clean = title.trim()
    if (!clean) {
      setError('Введите название задачи')
      return
    }
    setSaving(true)
    setError(null)
    const { data, error: err } = await onCreate({
      title: clean,
      description: description.trim() || null,
      assigneeId: mention?.id ?? null,
      statusId: statusId || null,
      dueDate,
      sectionId: mention?.sectionId ?? null,
    })
    setSaving(false)
    if (err) {
      setError(err)
      return
    }
    toast.success(`Задача №${data.number} поставлена`)
    onCreated?.(data)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={saving ? undefined : onClose}
      title="Задача из упоминания"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Отмена
          </Button>
          <Button onClick={submit} loading={saving}>
            Поставить
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="rounded-lg border border-line bg-app px-3 py-2 text-sm text-muted">
          Исполнитель:{' '}
          <span className="font-medium text-fg">{mention?.label ?? '—'}</span>
        </p>

        <Input
          label="Название"
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
          placeholder="Что нужно сделать"
          error={error}
        />

        <Textarea
          label="Описание"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        {statuses.length > 0 && (
          <Select
            label="Статус"
            value={statusId}
            onChange={(e) => setStatusId(e.target.value)}
            options={statuses.map((s) => ({ value: s.id, label: s.name }))}
          />
        )}

        <div>
          <span className="mb-1 block text-xs font-medium uppercase text-muted">
            Срок
          </span>
          <DatePicker value={dueDate} onChange={setDueDate} presets />
        </div>
      </div>
    </Modal>
  )
}
