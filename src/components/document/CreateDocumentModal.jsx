import { useState, useEffect } from 'react'
import { Plus, X, GripVertical } from 'lucide-react'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import Input from '../ui/Input'
import Select from '../ui/Select'
import { DOC_TYPE, SECTION_TEMPLATES } from '../../lib/documents'

// Создание документа. Разделы предлагаются по типу, но список правится
// до создания: у отдела свои привычки, и навязанная структура только мешает.
export default function CreateDocumentModal({ open, onClose, onCreate }) {
  const [title, setTitle] = useState('')
  const [type, setType] = useState('tz')
  const [sections, setSections] = useState(SECTION_TEMPLATES.tz)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  // Открыли заново — начинаем с чистого листа
  useEffect(() => {
    if (!open) return
    setTitle('')
    setType('tz')
    setSections(SECTION_TEMPLATES.tz)
    setError(null)
    setSaving(false)
  }, [open])

  // Смена типа подменяет заготовку разделов
  const changeType = (value) => {
    setType(value)
    setSections(SECTION_TEMPLATES[value] ?? [])
  }

  const setSection = (index, value) =>
    setSections((prev) => prev.map((s, i) => (i === index ? value : s)))

  const removeSection = (index) =>
    setSections((prev) => prev.filter((_, i) => i !== index))

  const addSection = () => setSections((prev) => [...prev, ''])

  const submit = async () => {
    const clean = title.trim()
    if (!clean) {
      setError('Введите название документа')
      return
    }
    setSaving(true)
    setError(null)
    const { error: err } = await onCreate({
      title: clean,
      type,
      sectionTitles: sections.map((s) => s.trim()).filter(Boolean),
    })
    setSaving(false)
    if (err) {
      setError(err)
      return
    }
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={saving ? undefined : onClose}
      title="Новый документ"
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Отмена
          </Button>
          <Button onClick={submit} loading={saving}>
            Создать
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label="Название"
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
          placeholder="Например: ТЗ на личный кабинет"
          error={error}
        />

        <Select
          label="Тип документа"
          value={type}
          onChange={(e) => changeType(e.target.value)}
          options={Object.entries(DOC_TYPE).map(([value, meta]) => ({
            value,
            label: meta.label,
          }))}
        />

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium uppercase text-muted">
              Разделы
            </span>
            <button
              type="button"
              onClick={addSection}
              className="flex items-center gap-1 text-xs text-accent transition hover:underline"
            >
              <Plus className="h-3.5 w-3.5" />
              Добавить
            </button>
          </div>

          {sections.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-sm text-muted/60">
              Без разделов. Их можно добавить и позже.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {sections.map((section, index) => (
                // Порядок задаётся только позицией в списке, поэтому индекс
                // здесь — честный ключ: строки не переставляются и не сортируются
                // eslint-disable-next-line react/no-array-index-key
                <li key={index} className="flex items-center gap-1.5">
                  <GripVertical className="h-4 w-4 flex-shrink-0 text-muted/40" />
                  <input
                    value={section}
                    onChange={(e) => setSection(index, e.target.value)}
                    placeholder="Название раздела"
                    className="min-w-0 flex-1 rounded-lg border border-line bg-app px-3 py-1.5 text-sm text-fg placeholder-muted outline-none transition focus:border-accent"
                  />
                  <button
                    type="button"
                    onClick={() => removeSection(index)}
                    className="flex-shrink-0 rounded p-1 text-muted transition hover:text-red-400"
                    aria-label="Убрать раздел"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-2 text-xs text-muted">
            У каждого раздела свой ответственный и свой статус — документ можно
            писать вчетвером, не мешая друг другу.
          </p>
        </div>
      </div>
    </Modal>
  )
}
