import { useState } from 'react'
import { Archive, ArchiveRestore, Trash2 } from 'lucide-react'
import Input from '../../ui/Input'
import Textarea from '../../ui/Textarea'
import Button from '../../ui/Button'
import Modal from '../../ui/Modal'
import { useToast } from '../../ui/Toast'
import { cn } from '../../../lib/utils'

const COLORS = [
  '#ecc371',
  '#7c3aed',
  '#db2777',
  '#dc2626',
  '#ea580c',
  '#d97706',
  '#16a34a',
  '#0891b2',
]

export default function GeneralTab({ settings, onDeleted }) {
  const { project, updateProject, deleteProject } = settings
  const { toast } = useToast()

  const [name, setName] = useState(project?.name ?? '')
  const [description, setDescription] = useState(project?.description ?? '')
  const [color, setColor] = useState(project?.color ?? COLORS[0])
  const [saving, setSaving] = useState(false)

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [archiving, setArchiving] = useState(false)

  const dirty =
    name !== (project?.name ?? '') ||
    description !== (project?.description ?? '') ||
    color !== (project?.color ?? COLORS[0])

  const save = async () => {
    if (!name.trim()) {
      toast.error('Название не может быть пустым')
      return
    }
    setSaving(true)
    const { error } = await updateProject({
      name: name.trim(),
      description: description.trim() || null,
      color,
    })
    setSaving(false)
    if (error) toast.error(error)
    else toast.success('Сохранено')
  }

  const toggleArchive = async () => {
    setArchiving(true)
    const { error } = await updateProject({ is_archived: !project.is_archived })
    setArchiving(false)
    if (error) toast.error(error)
    else
      toast.success(project.is_archived ? 'Возвращён из архива' : 'Проект в архиве')
  }

  const doDelete = async () => {
    setDeleting(true)
    const { error } = await deleteProject()
    setDeleting(false)
    if (error) {
      toast.error(error)
      return
    }
    toast.success('Проект удалён')
    onDeleted()
  }

  return (
    <div className="max-w-xl space-y-5">
      <Input
        label="Название"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <Textarea
        label="Описание"
        rows={3}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

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
                'h-7 w-7 rounded-full transition',
                color === c && 'ring-2 ring-offset-2 ring-offset-surface'
              )}
              style={{ backgroundColor: c, '--tw-ring-color': c }}
              aria-label={`Цвет ${c}`}
            />
          ))}
        </div>
      </div>

      <Button onClick={save} disabled={!dirty} loading={saving}>
        Сохранить
      </Button>

      {/* Опасная зона */}
      <div className="mt-8 rounded-lg border border-red-500/30 p-4">
        <h3 className="text-sm font-semibold text-red-400">Опасная зона</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={toggleArchive} loading={archiving}>
            {project?.is_archived ? (
              <>
                <ArchiveRestore className="h-4 w-4" />
                Вернуть из архива
              </>
            ) : (
              <>
                <Archive className="h-4 w-4" />
                Архивировать
              </>
            )}
          </Button>
          <Button variant="danger" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="h-4 w-4" />
            Удалить проект
          </Button>
        </div>
      </div>

      {/* Модалка удаления с подтверждением вводом названия */}
      <Modal
        open={deleteOpen}
        onClose={deleting ? undefined : () => setDeleteOpen(false)}
        title="Удалить проект?"
        size="sm"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setDeleteOpen(false)}
              disabled={deleting}
            >
              Отмена
            </Button>
            <Button
              variant="danger"
              onClick={doDelete}
              loading={deleting}
              disabled={confirmText !== project?.name}
            >
              Удалить
            </Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-muted">
          Проект и все его задачи будут удалены безвозвратно. Для подтверждения
          введите название проекта:{' '}
          <span className="font-medium text-fg">{project?.name}</span>
        </p>
        <Input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={project?.name}
        />
      </Modal>
    </div>
  )
}
