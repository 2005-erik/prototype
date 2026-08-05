import { useState, useMemo, useEffect, useRef } from 'react'
import {
  Search,
  Plus,
  MoreVertical,
  Pencil,
  KeyRound,
  FolderKanban,
  UserX,
  UserCheck,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useUserAdmin } from '../hooks/useUserAdmin'
import { useProjects } from '../hooks/useProjects'
import { ROLES, ROLE_LABELS, ROLE_DESCRIPTIONS } from '../lib/constants'
import { formatRelative, cn } from '../lib/utils'
import Button from '../components/ui/Button'
import Select from '../components/ui/Select'
import Avatar from '../components/ui/Avatar'
import Skeleton from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import { useToast } from '../components/ui/Toast'
import CreateUserModal from '../components/admin/CreateUserModal'
import EditUserModal from '../components/admin/EditUserModal'
import ManageProjectsModal from '../components/admin/ManageProjectsModal'
import DeactivateUserDialog from '../components/admin/DeactivateUserDialog'
import { Users } from 'lucide-react'

function statusOf(u) {
  if (!u.is_active) return { label: 'Деактивирован', cls: 'text-red-400' }
  if (u.invited_at && !u.last_login_at)
    return { label: 'Приглашение отправлено', cls: 'text-amber-400' }
  return { label: 'Активен', cls: 'text-green-400' }
}

// Меню действий строки
function RowMenu({ user, isSelf, onEdit, onReset, onProjects, onToggleActive }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const item = (icon, label, fn, danger) => (
    <button
      type="button"
      onClick={() => {
        setOpen(false)
        fn()
      }}
      className={cn(
        'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition hover:bg-line',
        danger ? 'text-red-400' : 'text-fg'
      )}
    >
      {icon}
      {label}
    </button>
  )

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded p-1 text-muted transition hover:bg-line hover:text-fg"
        aria-label="Действия"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-lg">
          {item(<Pencil className="h-4 w-4" />, 'Редактировать', onEdit)}
          {item(<KeyRound className="h-4 w-4" />, 'Сбросить пароль', onReset)}
          {item(<FolderKanban className="h-4 w-4" />, 'Управление проектами', onProjects)}
          {user.is_active
            ? item(
                <UserX className="h-4 w-4" />,
                isSelf ? 'Деактивировать (нельзя себя)' : 'Деактивировать',
                onToggleActive,
                true
              )
            : item(<UserCheck className="h-4 w-4" />, 'Активировать', onToggleActive)}
        </div>
      )}
    </div>
  )
}

export default function UsersAdminPage() {
  const { user: me } = useAuth()
  const { toast } = useToast()
  const {
    users,
    loading,
    error,
    createUser,
    deactivateUser,
    resetPassword,
    activateUser,
    updateUser,
    setUserProjects,
    countActiveTasks,
    logAdminAction,
  } = useUserAdmin()
  const { projects } = useProjects()

  useEffect(() => {
    if (error) toast.error(error)
  }, [error, toast])

  // Фильтры
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [deptFilter, setDeptFilter] = useState('')

  // Модалки/диалоги
  const [inviteOpen, setInviteOpen] = useState(false)
  const [editUser, setEditUser] = useState(null)
  const [projectsUser, setProjectsUser] = useState(null)
  const [pendingRole, setPendingRole] = useState(null) // { user, newRole }
  const [roleBusy, setRoleBusy] = useState(false)
  const [resetUser, setResetUser] = useState(null)
  const [resetBusy, setResetBusy] = useState(false)
  const [deact, setDeact] = useState(null) // { user, tasks }
  const [deactBusy, setDeactBusy] = useState(false)

  const departments = useMemo(
    () => [...new Set(users.map((u) => u.department).filter(Boolean))].sort(),
    [users]
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return users.filter((u) => {
      if (
        q &&
        !(u.full_name ?? '').toLowerCase().includes(q) &&
        !(u.email ?? '').toLowerCase().includes(q)
      )
        return false
      if (roleFilter && u.role !== roleFilter) return false
      if (deptFilter && u.department !== deptFilter) return false
      if (statusFilter === 'active' && !u.is_active) return false
      if (statusFilter === 'inactive' && u.is_active) return false
      if (
        statusFilter === 'invited' &&
        !(u.is_active && u.invited_at && !u.last_login_at)
      )
        return false
      return true
    })
  }, [users, search, roleFilter, deptFilter, statusFilter])

  // ---- Обработчики ----
  const onRoleSelect = (u, newRole) => {
    if (newRole === u.role) return
    if (u.id === me?.id && u.role === 'admin' && newRole !== 'admin') {
      const activeAdmins = users.filter(
        (x) => x.role === 'admin' && x.is_active
      ).length
      if (activeAdmins <= 1) {
        toast.error('Нельзя снять роль admin: вы единственный администратор')
        return
      }
    }
    setPendingRole({ user: u, newRole })
  }

  const confirmRole = async () => {
    setRoleBusy(true)
    const { error: err } = await updateUser(pendingRole.user.id, {
      role: pendingRole.newRole,
    })
    setRoleBusy(false)
    if (err) toast.error(err)
    else {
      logAdminAction('role_changed', pendingRole.user.id, {
        from: pendingRole.user.role,
        to: pendingRole.newRole,
      })
      toast.success('Роль изменена')
      setPendingRole(null)
    }
  }

  // Правка профиля / проекты — с логированием
  const handleEditSave = async (patch) => {
    const res = await updateUser(editUser.id, patch)
    if (!res.error) logAdminAction('user_edited', editUser.id, patch)
    return res
  }
  const handleProjectsSave = async (ids) => {
    const res = await setUserProjects(projectsUser.id, ids)
    if (!res.error)
      logAdminAction('projects_changed', projectsUser.id, { count: ids.length })
    return res
  }

  const confirmReset = async () => {
    setResetBusy(true)
    const { error: err } = await resetPassword(resetUser.id, resetUser.email)
    setResetBusy(false)
    if (err) toast.error(err)
    else {
      toast.success('Письмо сброса отправлено')
      setResetUser(null)
    }
  }

  const openDeactivate = async (u) => {
    const n = await countActiveTasks(u.id)
    setDeact({ user: u, tasks: n })
  }

  const confirmDeactivate = async (reassignTo) => {
    setDeactBusy(true)
    const { data, error: err } = await deactivateUser(deact.user.id, reassignTo)
    setDeactBusy(false)
    if (err) toast.error(err)
    else {
      toast.success(
        `Деактивирован${data?.reassigned ? ` · задач переназначено: ${data.reassigned}` : ''}`
      )
      setDeact(null)
    }
  }

  const toggleActive = (u) => {
    if (u.is_active) {
      if (u.id === me?.id) {
        toast.error('Нельзя деактивировать самого себя')
        return
      }
      openDeactivate(u)
    } else {
      activateUser(u.id).then(({ error: err }) => {
        if (err) toast.error(err)
        else {
          logAdminAction('user_activated', u.id)
          toast.success('Активирован')
        }
      })
    }
  }

  return (
    <div className="space-y-5">
      {/* Шапка */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по ФИО / email…"
            className="w-64 rounded-lg border border-line bg-surface py-1.5 pl-8 pr-3 text-sm text-fg placeholder-muted outline-none focus:border-accent"
          />
        </div>
        <Select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          options={[
            { value: '', label: 'Все роли' },
            ...Object.values(ROLES).map((r) => ({ value: r, label: ROLE_LABELS[r] })),
          ]}
          className="w-40"
        />
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={[
            { value: '', label: 'Любой статус' },
            { value: 'active', label: 'Активные' },
            { value: 'inactive', label: 'Деактивированные' },
            { value: 'invited', label: 'Приглашённые' },
          ]}
          className="w-44"
        />
        <Select
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)}
          options={[
            { value: '', label: 'Все отделы' },
            ...departments.map((d) => ({ value: d, label: d })),
          ]}
          className="w-40"
        />
        <Button size="sm" className="ml-auto" onClick={() => setInviteOpen(true)}>
          <Plus className="h-4 w-4" />
          Добавить сотрудника
        </Button>
      </div>

      {/* Таблица */}
      {loading && users.length === 0 ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Users} title="Пользователи не найдены" />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-sm">
            <thead className="bg-app text-left text-xs uppercase text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Сотрудник</th>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Должность</th>
                <th className="px-3 py-2 font-medium">Отдел</th>
                <th className="px-3 py-2 font-medium">Роль</th>
                <th className="px-3 py-2 font-medium">Проекты</th>
                <th className="px-3 py-2 font-medium">Статус</th>
                <th className="px-3 py-2 font-medium">Последний вход</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => {
                const st = statusOf(u)
                return (
                  <tr key={u.id} className="border-t border-line">
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-2.5">
                        <Avatar name={u.full_name} src={u.avatar_url} size="sm" />
                        <span className="text-fg">{u.full_name}</span>
                        {u.id === me?.id && (
                          <span className="text-xs text-muted">(вы)</span>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted">{u.email ?? '—'}</td>
                    <td className="px-3 py-2 text-muted">{u.position ?? '—'}</td>
                    <td className="px-3 py-2 text-muted">{u.department ?? '—'}</td>
                    <td className="px-3 py-2">
                      <select
                        value={u.role}
                        onChange={(e) => onRoleSelect(u, e.target.value)}
                        className="rounded border border-line bg-app px-2 py-1 text-sm text-fg outline-none focus:border-accent"
                      >
                        {Object.values(ROLES).map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className="text-muted"
                        title={(u.projects ?? []).map((p) => p.name).join(', ')}
                      >
                        {(u.projects ?? []).length}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={cn('text-xs font-medium', st.cls)}>
                        {st.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted">
                      {u.last_login_at ? formatRelative(u.last_login_at) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <RowMenu
                        user={u}
                        isSelf={u.id === me?.id}
                        onEdit={() => setEditUser(u)}
                        onReset={() => setResetUser(u)}
                        onProjects={() => setProjectsUser(u)}
                        onToggleActive={() => toggleActive(u)}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Модалки */}
      {inviteOpen && (
        <CreateUserModal
          projects={projects}
          onCreate={createUser}
          onClose={() => setInviteOpen(false)}
        />
      )}
      {editUser && (
        <EditUserModal
          user={editUser}
          onSave={handleEditSave}
          onClose={() => setEditUser(null)}
        />
      )}
      {projectsUser && (
        <ManageProjectsModal
          user={projectsUser}
          projects={projects}
          onSave={handleProjectsSave}
          onClose={() => setProjectsUser(null)}
        />
      )}
      {deact && (
        <DeactivateUserDialog
          user={deact.user}
          activeTasks={deact.tasks}
          candidates={users.filter((u) => u.is_active && u.id !== deact.user.id)}
          busy={deactBusy}
          onConfirm={confirmDeactivate}
          onCancel={() => !deactBusy && setDeact(null)}
        />
      )}

      {/* Смена роли */}
      <ConfirmDialog
        open={!!pendingRole}
        title="Изменить роль?"
        message={
          pendingRole
            ? `${pendingRole.user.full_name}: «${ROLE_LABELS[pendingRole.newRole]}». ${ROLE_DESCRIPTIONS[pendingRole.newRole]}`
            : ''
        }
        confirmText="Изменить"
        loading={roleBusy}
        onConfirm={confirmRole}
        onCancel={() => !roleBusy && setPendingRole(null)}
      />

      {/* Сброс пароля */}
      <ConfirmDialog
        open={!!resetUser}
        title="Сбросить пароль?"
        message={
          resetUser
            ? `На ${resetUser.email} будет отправлено письмо для установки нового пароля.`
            : ''
        }
        confirmText="Отправить"
        loading={resetBusy}
        onConfirm={confirmReset}
        onCancel={() => !resetBusy && setResetUser(null)}
      />
    </div>
  )
}
