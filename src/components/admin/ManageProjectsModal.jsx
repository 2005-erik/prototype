import { useState } from 'react'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import { useToast } from '../ui/Toast'
import ProjectPicker, { projectsRequiredFor } from './ProjectPicker'

export default function ManageProjectsModal({ user, projects = [], onSave, onClose }) {
  const { toast } = useToast()
  const [selected, setSelected] = useState(
    () => new Set((user.projects ?? []).map((p) => p.id))
  )
  const [busy, setBusy] = useState(false)

  const needsProject = projectsRequiredFor(user.role) && selected.size === 0

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const submit = async () => {
    if (needsProject)
      return toast.error('Выберите хотя бы один проект для сотрудника')
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
          <Button onClick={submit} loading={busy} disabled={needsProject}>
            Сохранить
          </Button>
        </>
      }
    >
      <ProjectPicker
        projects={projects}
        selected={selected}
        onToggle={toggle}
        role={user.role}
        label="Состав проектов"
      />
    </Modal>
  )
}
