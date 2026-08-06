import { useState } from 'react'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import Avatar from '../ui/Avatar'

// Диалог деактивации: показывает число активных задач и даёт выбрать их судьбу.
export default function DeactivateUserDialog({
  user,
  activeTasks,
  candidates = [], // активные пользователи для переназначения
  busy,
  onConfirm,
  onCancel,
}) {
  const [mode, setMode] = useState('unassign') // 'unassign' | 'reassign'
  const [reassignTo, setReassignTo] = useState('')

  const canConfirm = mode === 'unassign' || (mode === 'reassign' && reassignTo)

  return (
    <Modal
      open
      onClose={busy ? undefined : onCancel}
      title="Деактивировать пользователя"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Отмена
          </Button>
          <Button
            variant="danger"
            onClick={() => onConfirm(mode === 'reassign' ? reassignTo : null)}
            loading={busy}
            disabled={!canConfirm}
          >
            Деактивировать
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2.5">
          <Avatar name={user.full_name} src={user.avatar_url} size="sm" />
          <span className="text-sm text-fg">{user.full_name}</span>
        </div>

        <p className="text-sm text-muted">
          Активных задач у пользователя: <span className="font-medium text-fg">{activeTasks}</span>.
          Сессии будут отозваны, доступ прекратится. Пользователь и его история
          сохраняются.
        </p>

        {activeTasks > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase text-muted">
              Что сделать с активными задачами?
            </p>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-fg">
              <input
                type="radio"
                name="fate"
                checked={mode === 'unassign'}
                onChange={() => setMode('unassign')}
                className="accent-[#ecc371]"
              />
              Оставить без исполнителя
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-fg">
              <input
                type="radio"
                name="fate"
                checked={mode === 'reassign'}
                onChange={() => setMode('reassign')}
                className="accent-[#ecc371]"
              />
              Переназначить на:
            </label>
            {mode === 'reassign' && (
              <select
                value={reassignTo}
                onChange={(e) => setReassignTo(e.target.value)}
                className="ml-6 w-full rounded-lg border border-line bg-app px-3 py-2 text-sm text-fg outline-none focus:border-accent"
              >
                <option value="">— выберите сотрудника —</option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
