import { useState } from 'react'
import Modal from '../ui/Modal'
import Input from '../ui/Input'
import Button from '../ui/Button'
import { useToast } from '../ui/Toast'
import ProjectPicker, { projectsRequiredFor } from './ProjectPicker'
import { DEFAULT_WORK_LIMIT } from '../../lib/constants'
import { useWorkLimit } from '../../hooks/useWorkLimit'

// Сравнение состава проектов (порядок не важен)
function sameSet(a, b) {
  if (a.size !== b.size) return false
  for (const id of a) if (!b.has(id)) return false
  return true
}

export default function EditUserModal({
  user,
  projects = [],
  onSave,
  onSaveProjects,
  onClose,
}) {
  const { toast } = useToast()
  const [fullName, setFullName] = useState(user.full_name ?? '')
  const [position, setPosition] = useState(user.position ?? '')
  const [department, setDepartment] = useState(user.department ?? '')
  const [projectIds, setProjectIds] = useState(
    () => new Set((user.projects ?? []).map((p) => p.id))
  )
  const [workLimit, setWorkLimit] = useState(
    String(user.work_limit ?? DEFAULT_WORK_LIMIT)
  )
  const { setWorkLimit: saveWorkLimit } = useWorkLimit()
  const [busy, setBusy] = useState(false)

  const initialProjects = new Set((user.projects ?? []).map((p) => p.id))
  const needsProject = projectsRequiredFor(user.role) && projectIds.size === 0

  const toggleProject = (id) =>
    setProjectIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const submit = async () => {
    if (!fullName.trim()) return toast.error('ФИО не может быть пустым')
    if (needsProject)
      return toast.error('Выберите хотя бы один проект для сотрудника')

    setBusy(true)
    const { error } = await onSave({
      full_name: fullName.trim(),
      position: position.trim() || null,
      department: department.trim() || null,
    })
    if (error) {
      setBusy(false)
      return toast.error(error)
    }

    // Лимит задач — через RPC: колонку нельзя открыть на запись напрямую
    const limitValue = Number(workLimit)
    if (!Number.isFinite(limitValue) || limitValue <= 0) {
      setBusy(false)
      return toast.error('Лимит задач должен быть больше нуля')
    }
    if (limitValue !== (user.work_limit ?? DEFAULT_WORK_LIMIT)) {
      const { error: lErr } = await saveWorkLimit(user.id, limitValue)
      if (lErr) {
        setBusy(false)
        return toast.error(lErr)
      }
    }

    // Проекты сохраняем отдельным запросом, только если состав изменился
    if (!sameSet(projectIds, initialProjects)) {
      const { error: pErr } = await onSaveProjects([...projectIds])
      if (pErr) {
        setBusy(false)
        return toast.error(pErr)
      }
    }

    setBusy(false)
    toast.success('Сохранено')
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Редактировать · ${user.full_name}`}
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
      <div className="space-y-4">
        <Input
          autoFocus
          label="ФИО"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
        <Input
          label="Должность"
          value={position}
          onChange={(e) => setPosition(e.target.value)}
        />
        <Input
          label="Отдел"
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
        />
        <div>
          <label className="mb-1 block text-xs font-medium uppercase text-muted">
            Лимит одновременных задач
          </label>
          <input
            type="number"
            min={1}
            value={workLimit}
            onChange={(e) => setWorkLimit(e.target.value)}
            className="w-28 rounded-lg border border-line bg-app px-3 py-2 text-sm text-fg outline-none focus:border-accent"
          />
          <p className="mt-1 text-xs text-muted">
            Сколько задач в работе сотрудник тянет одновременно. Очередь
            («Новая») в лимит не входит.
          </p>
        </div>

        <ProjectPicker
          projects={projects}
          selected={projectIds}
          onToggle={toggleProject}
          role={user.role}
        />
      </div>
    </Modal>
  )
}
