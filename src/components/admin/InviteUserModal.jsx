import { useState, useMemo } from 'react'
import { Check, X, AlertTriangle } from 'lucide-react'
import Modal from '../ui/Modal'
import Input from '../ui/Input'
import Button from '../ui/Button'
import { useToast } from '../ui/Toast'
import { ROLES, ROLE_LABELS, ROLE_DESCRIPTIONS } from '../../lib/constants'
import { cn } from '../../lib/utils'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Нормализация роли из импорта (коды или русские названия)
function normalizeRole(raw) {
  const v = String(raw ?? '').trim().toLowerCase()
  if (['admin', 'администратор'].includes(v)) return 'admin'
  if (['manager', 'руководитель', 'менеджер'].includes(v)) return 'manager'
  if (['employee', 'сотрудник'].includes(v)) return 'employee'
  return null
}

// Разбор строк формата email;ФИО;должность;роль
function parseImport(raw) {
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line, i) => {
      const [email = '', full_name = '', position = '', roleRaw = ''] = line
        .split(';')
        .map((s) => s.trim())
      const role = normalizeRole(roleRaw)
      const errors = []
      if (!EMAIL_RE.test(email)) errors.push('email')
      if (!full_name) errors.push('ФИО')
      if (!role) errors.push('роль')
      return {
        n: i + 1,
        email,
        full_name,
        position: position || null,
        roleRaw,
        role,
        errors,
        valid: errors.length === 0,
      }
    })
}

// ---- Вкладка одиночного приглашения ----
function SingleTab({ projects, onInvite, onClose }) {
  const { toast } = useToast()
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [position, setPosition] = useState('')
  const [department, setDepartment] = useState('')
  const [role, setRole] = useState('employee')
  const [projectIds, setProjectIds] = useState(() => new Set())
  const [busy, setBusy] = useState(false)

  const toggleProject = (id) =>
    setProjectIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const submit = async () => {
    if (!EMAIL_RE.test(email.trim())) return toast.error('Некорректный email')
    if (!fullName.trim()) return toast.error('Укажите ФИО')
    setBusy(true)
    const { error } = await onInvite({
      email: email.trim(),
      full_name: fullName.trim(),
      position: position.trim() || null,
      department: department.trim() || null,
      role,
      project_ids: [...projectIds],
    })
    setBusy(false)
    if (error) toast.error(error)
    else {
      toast.success(`Приглашение отправлено на ${email.trim()}`)
      onClose()
    }
  }

  return (
    <>
      <div className="space-y-4">
        <Input
          autoFocus
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="user@company.ru"
        />
        <Input label="ФИО" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Должность" value={position} onChange={(e) => setPosition(e.target.value)} />
          <Input label="Отдел" value={department} onChange={(e) => setDepartment(e.target.value)} />
        </div>

        {/* Роль — радио с описанием */}
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase text-muted">
            Роль
          </label>
          <div className="space-y-1.5">
            {Object.values(ROLES).map((r) => (
              <label
                key={r}
                className={cn(
                  'flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition',
                  role === r ? 'border-accent bg-accent/5' : 'border-line hover:bg-line/40'
                )}
              >
                <input
                  type="radio"
                  name="role"
                  checked={role === r}
                  onChange={() => setRole(r)}
                  className="mt-0.5 accent-blue-600"
                />
                <span>
                  <span className="block text-sm font-medium text-fg">
                    {ROLE_LABELS[r]}
                  </span>
                  <span className="block text-xs text-muted">
                    {ROLE_DESCRIPTIONS[r]}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Проекты */}
        <div>
          <label className="mb-1 block text-xs font-medium uppercase text-muted">
            Проекты
          </label>
          {projects.length === 0 ? (
            <p className="text-sm text-muted/60">Нет проектов</p>
          ) : (
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-line bg-app p-2">
              {projects.map((p) => (
                <label
                  key={p.id}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm text-fg hover:bg-line"
                >
                  <input
                    type="checkbox"
                    checked={projectIds.has(p.id)}
                    onChange={() => toggleProject(p.id)}
                    className="accent-blue-600"
                  />
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color ?? '#2563eb' }} />
                  {p.name}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Отмена
        </Button>
        <Button onClick={submit} loading={busy}>
          Пригласить
        </Button>
      </div>
    </>
  )
}

// ---- Вкладка импорта ----
function ImportTab({ onInvite }) {
  const { toast } = useToast()
  const [raw, setRaw] = useState('')
  const [progress, setProgress] = useState(null) // { done, total }
  const [result, setResult] = useState(null) // { ok, failed[] , invalidCount }

  const rows = useMemo(() => parseImport(raw), [raw])
  const validCount = rows.filter((r) => r.valid).length

  const inviteAll = async () => {
    const valid = rows.filter((r) => r.valid)
    if (valid.length === 0) return
    setResult(null)
    setProgress({ done: 0, total: valid.length })
    const failed = []
    let ok = 0
    for (const r of valid) {
      const { error } = await onInvite({
        email: r.email,
        full_name: r.full_name,
        position: r.position,
        department: null,
        role: r.role,
        project_ids: [],
      })
      if (error) failed.push({ email: r.email, error })
      else ok += 1
      setProgress((p) => ({ ...p, done: p.done + 1 }))
    }
    setProgress(null)
    setResult({ ok, failed, invalidCount: rows.length - valid.length })
    toast.success(`Готово: ${ok} успешно, ${failed.length + (rows.length - valid.length)} с ошибками`)
  }

  const importing = !!progress

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium uppercase text-muted">
          Вставьте строки из Excel — формат <code className="text-fg">email;ФИО;должность;роль</code>
        </label>
        <textarea
          rows={5}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder={'ivanov@company.ru;Иванов Иван;Инженер;employee\npetrova@company.ru;Петрова Мария;Руководитель;manager'}
          className="w-full resize-y rounded-lg border border-line bg-app p-2.5 font-mono text-xs text-fg placeholder-muted outline-none focus:border-accent"
        />
      </div>

      {/* Предпросмотр */}
      {rows.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-line">
          <table className="w-full text-xs">
            <thead className="bg-app text-left uppercase text-muted">
              <tr>
                <th className="px-2 py-1.5">#</th>
                <th className="px-2 py-1.5">Email</th>
                <th className="px-2 py-1.5">ФИО</th>
                <th className="px-2 py-1.5">Должность</th>
                <th className="px-2 py-1.5">Роль</th>
                <th className="px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.n}
                  className={cn('border-t border-line', !r.valid && 'bg-red-500/5')}
                >
                  <td className="px-2 py-1 text-muted">{r.n}</td>
                  <td className={cn('px-2 py-1', r.errors.includes('email') ? 'text-red-400' : 'text-fg')}>
                    {r.email || '—'}
                  </td>
                  <td className={cn('px-2 py-1', r.errors.includes('ФИО') ? 'text-red-400' : 'text-fg')}>
                    {r.full_name || '—'}
                  </td>
                  <td className="px-2 py-1 text-muted">{r.position ?? '—'}</td>
                  <td className={cn('px-2 py-1', r.errors.includes('роль') ? 'text-red-400' : 'text-fg')}>
                    {r.role ? ROLE_LABELS[r.role] : r.roleRaw || '—'}
                  </td>
                  <td className="px-2 py-1">
                    {r.valid ? (
                      <Check className="h-4 w-4 text-green-400" />
                    ) : (
                      <span
                        className="flex items-center gap-1 text-red-400"
                        title={`Ошибки: ${r.errors.join(', ')}`}
                      >
                        <X className="h-4 w-4" />
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Прогресс */}
      {importing && (
        <div>
          <div className="mb-1 flex justify-between text-xs text-muted">
            <span>Приглашаем…</span>
            <span>
              {progress.done} / {progress.total}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${(progress.done / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Итоговый отчёт */}
      {result && (
        <div className="space-y-2 rounded-lg border border-line bg-app p-3 text-sm">
          <p className="flex items-center gap-2 text-green-400">
            <Check className="h-4 w-4" />
            Успешно приглашено: {result.ok}
          </p>
          {(result.failed.length > 0 || result.invalidCount > 0) && (
            <div>
              <p className="flex items-center gap-2 text-red-400">
                <AlertTriangle className="h-4 w-4" />
                С ошибками: {result.failed.length + result.invalidCount}
                {result.invalidCount > 0 && ` (пропущено невалидных: ${result.invalidCount})`}
              </p>
              {result.failed.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-xs text-muted">
                  {result.failed.map((f, i) => (
                    <li key={i}>
                      {f.email} — {f.error}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={inviteAll} loading={importing} disabled={validCount === 0}>
          Пригласить всех ({validCount})
        </Button>
      </div>
    </div>
  )
}

// ---- Модалка с вкладками ----
export default function InviteUserModal({ projects = [], onInvite, onClose }) {
  const [tab, setTab] = useState('single')

  return (
    <Modal open onClose={onClose} title="Пригласить сотрудника" size="md">
      {/* Вкладки */}
      <div className="mb-4 flex gap-1 border-b border-line">
        {[
          { key: 'single', label: 'Одиночное' },
          { key: 'import', label: 'Импорт' },
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              '-mb-px border-b-2 px-4 py-2 text-sm font-medium transition',
              tab === t.key
                ? 'border-accent text-fg'
                : 'border-transparent text-muted hover:text-fg'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'single' ? (
        <SingleTab projects={projects} onInvite={onInvite} onClose={onClose} />
      ) : (
        <ImportTab onInvite={onInvite} />
      )}
    </Modal>
  )
}
