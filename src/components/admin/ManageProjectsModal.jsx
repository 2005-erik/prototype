import { useState } from 'react'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import { useToast } from '../ui/Toast'

export default function ManageProjectsModal({ user, projects = [], onSave, onClose }) {
  const { toast } = useToast()
  const [selected, setSelected] = useState(
    () => new Set((user.projects ?? []).map((p) => p.id))
  )
  const [busy, setBusy] = useState(false)

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const submit = async () => {
    setBusy(true)
    const { error } = await onSave([...selected])
    setBusy(false)
    if (error) toast.error(error)
    else {
      toast.success('Проекты обновлены')
      onClose()
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Проекты · ${user.full_name}`}
      size="sm"
      closeOnOverlay={!busy}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Отмена
          </Button>
          <Button onClick={submit} loading={busy}>
            Сохранить
          </Button>
        </>
      }
    >
      {projects.length === 0 ? (
        <p className="text-sm text-muted/60">Нет проектов</p>
      ) : (
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {projects.map((p) => (
            <label
              key={p.id}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-fg hover:bg-line"
            >
              <input
                type="checkbox"
                checked={selected.has(p.id)}
                onChange={() => toggle(p.id)}
                className="accent-blue-600"
              />
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: p.color ?? '#2563eb' }}
              />
              {p.name}
            </label>
          ))}
        </div>
      )}
    </Modal>
  )
}
