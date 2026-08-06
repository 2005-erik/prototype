import { useState } from 'react'
import { UserPlus, Trash2 } from 'lucide-react'
import Avatar from '../../ui/Avatar'
import Button from '../../ui/Button'
import ConfirmDialog from '../../ui/ConfirmDialog'
import { useToast } from '../../ui/Toast'
import { LOAD_STATE } from '../../../lib/constants'
import { cn } from '../../../lib/utils'
import AddMemberModal from './AddMemberModal'

const ROLE_OPTIONS = [
  { value: 'owner', label: 'Владелец' },
  { value: 'manager', label: 'Менеджер' },
  { value: 'member', label: 'Участник' },
]

export default function MembersTab({ settings, currentUserId }) {
  const { members, workload, updateMemberRole, removeMember } = settings
  const { toast } = useToast()
  const [addOpen, setAddOpen] = useState(false)
  const [toRemove, setToRemove] = useState(null)
  const [removing, setRemoving] = useState(false)

  const ownerCount = members.filter((m) => m.role === 'owner').length

  const onRoleChange = async (member, role) => {
    if (member.role === role) return
    // Владелец не может понизить себе роль; единственного владельца не трогаем
    if (member.role === 'owner') {
      if (member.user_id === currentUserId) {
        toast.error('Нельзя понизить собственную роль владельца')
        return
      }
      if (ownerCount === 1) {
        toast.error('В проекте только один владелец — сначала назначьте другого')
        return
      }
    }
    const { error } = await updateMemberRole(member.user_id, role)
    if (error) toast.error(error)
    else toast.success('Роль изменена')
  }

  const confirmRemove = async () => {
    if (!toRemove) return
    setRemoving(true)
    const { error } = await removeMember(toRemove.user_id)
    setRemoving(false)
    if (error) toast.error(error)
    else {
      toast.success('Участник удалён')
      setToRemove(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <UserPlus className="h-4 w-4" />
          Добавить участника
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-line">
        <table className="w-full text-sm">
          <thead className="bg-app text-left text-xs uppercase text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Сотрудник</th>
              <th className="px-3 py-2 font-medium">Должность</th>
              <th className="px-3 py-2 font-medium">Роль</th>
              <th className="px-3 py-2 font-medium">Загрузка</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const p = m.profiles
              const w = workload[m.user_id]
              const load = w ? LOAD_STATE[w.load_state] : null
              const isOwner = m.role === 'owner'
              const roleLocked =
                isOwner &&
                (ownerCount === 1 || m.user_id === currentUserId)
              return (
                <tr key={m.user_id} className="border-t border-line">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2.5">
                      <Avatar
                        name={p?.full_name}
                        src={p?.avatar_url}
                        size="sm"
                      />
                      <span className="text-fg">{p?.full_name ?? '—'}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-muted">{p?.position ?? '—'}</td>
                  <td className="px-3 py-2">
                    <select
                      value={m.role}
                      disabled={roleLocked}
                      onChange={(e) => onRoleChange(m, e.target.value)}
                      className="rounded border border-line bg-app px-2 py-1 text-sm text-fg outline-none focus:border-accent disabled:opacity-60"
                    >
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    {w ? (
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium',
                          load?.badge
                        )}
                      >
                        {w.active_tasks} в работе
                        {w.queued_tasks > 0 ? ` · ${w.queued_tasks} в очереди` : ''} ·{' '}
                        {load?.label ?? ''}
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => setToRemove(m)}
                      disabled={isOwner}
                      className="text-muted transition hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label="Удалить участника"
                      title={isOwner ? 'Владельца нельзя удалить' : 'Удалить'}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              )
            })}
            {members.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-muted">
                  Нет участников
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {addOpen && (
        <AddMemberModal settings={settings} onClose={() => setAddOpen(false)} />
      )}

      <ConfirmDialog
        open={!!toRemove}
        title="Удалить участника?"
        message={
          toRemove
            ? `${toRemove.profiles?.full_name ?? 'Участник'} будет исключён из проекта.`
            : ''
        }
        confirmText="Удалить"
        danger
        loading={removing}
        onConfirm={confirmRemove}
        onCancel={() => !removing && setToRemove(null)}
      />
    </div>
  )
}
