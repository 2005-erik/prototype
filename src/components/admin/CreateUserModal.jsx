import { useState, useMemo, useEffect } from 'react'
import {
  Check,
  X,
  AlertTriangle,
  Eye,
  EyeOff,
  RefreshCw,
  Copy,
  ShieldAlert,
  Download,
} from 'lucide-react'
import Modal from '../ui/Modal'
import Input from '../ui/Input'
import Button from '../ui/Button'
import { useToast } from '../ui/Toast'
import ProjectPicker, { projectsRequiredFor } from './ProjectPicker'
import { ROLES, ROLE_LABELS, ROLE_DESCRIPTIONS } from '../../lib/constants'
import { cn } from '../../lib/utils'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD = 10

// Криптостойкое целое в [0, max) без modulo-смещения
function randInt(max) {
  const buf = new Uint32Array(1)
  const limit = Math.floor(0xffffffff / max) * max
  let x
  do {
    crypto.getRandomValues(buf)
    x = buf[0]
  } while (x >= limit)
  return x % max
}

// Генерация пароля из 12 символов через crypto.getRandomValues.
// Гарантируем по одному символу каждого класса (строчная/заглавная/цифра/знак).
function generatePassword(len = 12) {
  const lower = 'abcdefghijkmnpqrstuvwxyz'
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const digits = '23456789'
  const symbols = '!@#$%*-_'
  const all = lower + upper + digits + symbols
  const pick = (set) => set[randInt(set.length)]
  const chars = [pick(lower), pick(upper), pick(digits), pick(symbols)]
  while (chars.length < len) chars.push(pick(all))
  // Перемешивание Фишера — Йетса на криптослучайности
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randInt(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

// Персист общего пароля между открытиями модалки (в пределах сессии вкладки)
const sharedPwStore = { enabled: false, value: '' }

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

// Экранирование значения для CSV
function csvCell(v) {
  const s = String(v ?? '')
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// ---- Экран подтверждения после создания ----
function CreatedScreen({ email, password, onCreateAnother, onClose }) {
  const { toast } = useToast()

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${email} ${password}`)
      toast.success('Скопировано')
    } catch {
      toast.error('Не удалось скопировать')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-500">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Передайте эти данные сотруднику. Пароль больше не будет показан —
          скопируйте или запишите его сейчас.
        </span>
      </div>

      <div className="space-y-3 rounded-lg border border-line bg-app p-4">
        <div>
          <div className="mb-1 text-xs font-medium uppercase text-muted">Email</div>
          <div className="break-all font-mono text-lg text-fg">{email}</div>
        </div>
        <div>
          <div className="mb-1 text-xs font-medium uppercase text-muted">Пароль</div>
          <div className="break-all font-mono text-lg text-fg">{password}</div>
        </div>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={copy}>
          <Copy className="h-4 w-4" />
          Скопировать
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Закрыть
        </Button>
        <Button onClick={onCreateAnother}>Создать ещё одного</Button>
      </div>
    </div>
  )
}

// ---- Вкладка одиночного создания ----
function SingleTab({
  projects,
  onCreate,
  onClose,
  oneForAll,
  setOneForAll,
  password,
  setPassword,
}) {
  const { toast } = useToast()
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [position, setPosition] = useState('')
  const [department, setDepartment] = useState('')
  const [role, setRole] = useState('employee')
  const [projectIds, setProjectIds] = useState(() => new Set())
  const [showPass, setShowPass] = useState(false)
  const [pwTouched, setPwTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState(null) // { email, password }

  const pwError =
    pwTouched && password.length > 0 && password.length < MIN_PASSWORD
      ? `Минимум ${MIN_PASSWORD} символов`
      : null

  // manager/employee без проекта не увидит ни одной задачи — блокируем создание
  const needsProject = projectsRequiredFor(role) && projectIds.size === 0

  const toggleProject = (id) =>
    setProjectIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const generate = () => {
    setPassword(generatePassword())
    setPwTouched(true)
    setShowPass(true)
  }

  const submit = async () => {
    if (!EMAIL_RE.test(email.trim())) return toast.error('Некорректный email')
    if (!fullName.trim()) return toast.error('Укажите ФИО')
    if (password.length < MIN_PASSWORD) {
      setPwTouched(true)
      return toast.error(`Пароль минимум ${MIN_PASSWORD} символов`)
    }
    if (needsProject)
      return toast.error('Выберите хотя бы один проект для сотрудника')
    setBusy(true)
    const { error } = await onCreate({
      email: email.trim(),
      password,
      full_name: fullName.trim(),
      position: position.trim() || null,
      department: department.trim() || null,
      role,
      project_ids: [...projectIds],
    })
    setBusy(false)
    if (error) toast.error(error)
    else {
      toast.success('Учётная запись создана')
      setCreated({ email: email.trim(), password })
    }
  }

  // Сброс формы под нового сотрудника (пароль сохраняем, если общий)
  const createAnother = () => {
    setCreated(null)
    setEmail('')
    setFullName('')
    setPosition('')
    setDepartment('')
    setRole('employee')
    setProjectIds(new Set())
    setPwTouched(false)
    if (!oneForAll) {
      setPassword('')
      setShowPass(false)
    }
  }

  if (created) {
    return (
      <CreatedScreen
        email={created.email}
        password={created.password}
        onCreateAnother={createAnother}
        onClose={onClose}
      />
    )
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

        {/* Пароль */}
        <div>
          <label className="mb-1 block text-xs font-medium uppercase text-muted">
            Пароль
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                autoComplete="new-password"
                onChange={(e) => {
                  setPassword(e.target.value)
                  setPwTouched(true)
                }}
                className={cn(
                  'w-full rounded-lg border bg-app py-2 pl-3 pr-10 font-mono text-sm text-fg placeholder-muted outline-none transition focus:border-accent',
                  pwError ? 'border-red-500' : 'border-line'
                )}
                placeholder="минимум 10 символов"
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted transition hover:text-fg"
                aria-label={showPass ? 'Скрыть' : 'Показать'}
              >
                {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <Button type="button" variant="ghost" onClick={generate}>
              <RefreshCw className="h-4 w-4" />
              Сгенерировать
            </Button>
          </div>
          {pwError && <p className="mt-1 text-xs text-red-400">{pwError}</p>}
          <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={oneForAll}
              onChange={(e) => setOneForAll(e.target.checked)}
              className="accent-blue-600"
            />
            Использовать один пароль для всех создаваемых
          </label>
        </div>

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
        <ProjectPicker
          projects={projects}
          selected={projectIds}
          onToggle={toggleProject}
          role={role}
        />
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Отмена
        </Button>
        <Button onClick={submit} loading={busy} disabled={needsProject}>
          Создать
        </Button>
      </div>
    </>
  )
}

// ---- Вкладка импорта ----
function ImportTab({ projects, onCreate }) {
  const { toast } = useToast()
  const [raw, setRaw] = useState('')
  const [projectIds, setProjectIds] = useState(() => new Set())
  const [progress, setProgress] = useState(null) // { done, total }
  const [result, setResult] = useState(null) // { created[], failed[], invalidCount }

  const rows = useMemo(() => parseImport(raw), [raw])
  const validCount = rows.filter((r) => r.valid).length

  // Если среди строк есть manager/employee — проекты обязательны для всех
  const needsProject =
    rows.some((r) => r.valid && projectsRequiredFor(r.role)) && projectIds.size === 0

  const toggleProject = (id) =>
    setProjectIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const createAll = async () => {
    const valid = rows.filter((r) => r.valid)
    if (valid.length === 0 || needsProject) return
    setResult(null)
    setProgress({ done: 0, total: valid.length })
    const createdRows = []
    const failed = []
    for (const r of valid) {
      const password = generatePassword()
      const { error } = await onCreate({
        email: r.email,
        password,
        full_name: r.full_name,
        position: r.position,
        department: null,
        role: r.role,
        project_ids: [...projectIds],
      })
      if (error) failed.push({ email: r.email, error })
      else createdRows.push({ email: r.email, full_name: r.full_name, password })
      setProgress((p) => ({ ...p, done: p.done + 1 }))
    }
    setProgress(null)
    setResult({ created: createdRows, failed, invalidCount: rows.length - valid.length })
    toast.success(
      `Готово: ${createdRows.length} создано, ${failed.length + (rows.length - valid.length)} с ошибками`
    )
  }

  const downloadCsv = () => {
    if (!result?.created.length) return
    const header = ['email', 'ФИО', 'пароль']
    const lines = [
      header.join(';'),
      ...result.created.map((r) =>
        [csvCell(r.email), csvCell(r.full_name), csvCell(r.password)].join(';')
      ),
    ]
    // BOM для корректной кириллицы в Excel
    const blob = new Blob(['﻿' + lines.join('\r\n')], {
      type: 'text/csv;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'created-users.csv'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const importing = !!progress

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium uppercase text-muted">
          Вставьте строки из Excel — формат <code className="text-fg">email;ФИО;должность;роль</code>.
          Пароль генерируется автоматически для каждой строки.
        </label>
        <textarea
          rows={5}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder={'ivanov@company.ru;Иванов Иван;Инженер;employee\npetrova@company.ru;Петрова Мария;Руководитель;manager'}
          className="w-full resize-y rounded-lg border border-line bg-app p-2.5 font-mono text-xs text-fg placeholder-muted outline-none focus:border-accent"
        />
      </div>

      {/* Проекты — общие для всех импортируемых строк */}
      {!result && (
        <ProjectPicker
          projects={projects}
          selected={projectIds}
          onToggle={toggleProject}
          role={
            rows.some((r) => r.valid && projectsRequiredFor(r.role))
              ? 'employee'
              : 'admin'
          }
          label="Проекты для всех импортируемых"
        />
      )}

      {/* Предпросмотр (до создания) */}
      {rows.length > 0 && !result && (
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
            <span>Создаём…</span>
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

      {/* Итоговая таблица email/пароль */}
      {result && (
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-500">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Пароли показаны один раз. Скачайте CSV и передайте данные
              сотрудникам — повторно пароли не отображаются.
            </span>
          </div>

          {result.created.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-line">
              <table className="w-full text-xs">
                <thead className="bg-app text-left uppercase text-muted">
                  <tr>
                    <th className="px-2 py-1.5">Email</th>
                    <th className="px-2 py-1.5">ФИО</th>
                    <th className="px-2 py-1.5">Пароль</th>
                  </tr>
                </thead>
                <tbody>
                  {result.created.map((r, i) => (
                    <tr key={i} className="border-t border-line">
                      <td className="px-2 py-1 font-mono text-fg">{r.email}</td>
                      <td className="px-2 py-1 text-muted">{r.full_name}</td>
                      <td className="px-2 py-1 font-mono text-fg">{r.password}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {(result.failed.length > 0 || result.invalidCount > 0) && (
            <div className="rounded-lg border border-line bg-app p-3 text-sm">
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

      <div className="flex justify-end gap-2">
        {result?.created.length > 0 && (
          <Button variant="ghost" onClick={downloadCsv}>
            <Download className="h-4 w-4" />
            Скачать CSV
          </Button>
        )}
        {!result && (
          <Button
            onClick={createAll}
            loading={importing}
            disabled={validCount === 0 || needsProject}
          >
            Создать всех ({validCount})
          </Button>
        )}
      </div>
    </div>
  )
}

// ---- Модалка с вкладками ----
export default function CreateUserModal({ projects = [], onCreate, onClose }) {
  const [tab, setTab] = useState('single')
  const [oneForAll, setOneForAll] = useState(sharedPwStore.enabled)
  const [password, setPassword] = useState(sharedPwStore.value)

  // Персист общего пароля между открытиями модалки
  useEffect(() => {
    sharedPwStore.enabled = oneForAll
    sharedPwStore.value = oneForAll ? password : ''
  }, [oneForAll, password])

  return (
    <Modal open onClose={onClose} title="Добавить сотрудника" size="md">
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
        <SingleTab
          projects={projects}
          onCreate={onCreate}
          onClose={onClose}
          oneForAll={oneForAll}
          setOneForAll={setOneForAll}
          password={password}
          setPassword={setPassword}
        />
      ) : (
        <ImportTab projects={projects} onCreate={onCreate} />
      )}
    </Modal>
  )
}
