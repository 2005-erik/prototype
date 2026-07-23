import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Lock, Eye, EyeOff, Check, X, LoaderCircle } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/ui/Toast'
import { cn } from '../lib/utils'

// Требования (согласовано с M2: minimum_password_length = 10)
function checks(pw) {
  return {
    length: pw.length >= 10,
    lower: /[a-zа-яё]/.test(pw),
    upper: /[A-ZА-ЯЁ]/.test(pw),
    digit: /\d/.test(pw),
  }
}

const REQS = [
  { key: 'length', label: 'Минимум 10 символов' },
  { key: 'lower', label: 'Строчная буква' },
  { key: 'upper', label: 'Заглавная буква' },
  { key: 'digit', label: 'Цифра' },
]

const STRENGTH = [
  { label: '', cls: '' },
  { label: 'Слабый', cls: 'bg-red-500' },
  { label: 'Средний', cls: 'bg-amber-500' },
  { label: 'Хороший', cls: 'bg-blue-500' },
  { label: 'Надёжный', cls: 'bg-green-500' },
]

export default function SetPasswordPage() {
  const navigate = useNavigate()
  const { profile, user, logAuth } = useAuth()
  const { toast } = useToast()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)

  const c = useMemo(() => checks(password), [password])
  const score = useMemo(
    () => Object.values(c).filter(Boolean).length,
    [c]
  )
  const allMet = score === 4
  const matches = password.length > 0 && password === confirm
  const canSubmit = allMet && matches && !busy

  const firstName = (profile?.full_name ?? '').trim().split(/\s+/)[0] || ''

  const submit = async () => {
    if (!allMet) return toast.error('Пароль не соответствует требованиям')
    if (!matches) return toast.error('Пароли не совпадают')
    setBusy(true)
    try {
      // Установка пароля (сессия из ссылки письма уже активна)
      const { error: updErr } = await supabase.auth.updateUser({ password })
      if (updErr) throw updErr

      // Снимаем флаг обязательной смены
      if (user?.id) {
        await supabase
          .from('profiles')
          .update({ must_change_password: false })
          .eq('id', user.id)
      }

      await logAuth('password_changed')
      toast.success('Пароль установлен')
      navigate('/', { replace: true })
    } catch (err) {
      toast.error(err.message ?? 'Не удалось установить пароль')
    } finally {
      setBusy(false)
    }
  }

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && canSubmit) submit()
  }

  const inputClass =
    'w-full rounded-lg border border-line bg-app py-2.5 pl-10 pr-10 text-fg placeholder-muted outline-none transition focus:border-accent'

  return (
    <div className="flex min-h-screen items-center justify-center bg-app px-4">
      <div className="w-full max-w-sm rounded-lg border border-line bg-surface p-8 shadow-xl">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold text-fg">
            {firstName ? `Здравствуйте, ${firstName}!` : 'Установка пароля'}
          </h1>
          <p className="mt-1 text-sm text-muted">Задайте пароль для входа</p>
        </div>

        {/* Пароль */}
        <label className="mb-3 block">
          <span className="mb-1.5 block text-sm text-fg">Новый пароль</span>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
            <input
              autoFocus
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={onKeyDown}
              className={inputClass}
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted transition hover:text-fg"
              aria-label={show ? 'Скрыть' : 'Показать'}
            >
              {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
        </label>

        {/* Индикатор надёжности */}
        {password.length > 0 && (
          <div className="mb-3">
            <div className="flex gap-1">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className={cn(
                    'h-1 flex-1 rounded-full',
                    i <= score ? STRENGTH[score].cls : 'bg-line'
                  )}
                />
              ))}
            </div>
            {STRENGTH[score].label && (
              <p className="mt-1 text-xs text-muted">{STRENGTH[score].label}</p>
            )}
          </div>
        )}

        {/* Повтор */}
        <label className="mb-3 block">
          <span className="mb-1.5 block text-sm text-fg">Повторите пароль</span>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
            <input
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={onKeyDown}
              className={inputClass}
            />
          </div>
          {confirm.length > 0 && !matches && (
            <span className="mt-1 block text-xs text-red-400">Пароли не совпадают</span>
          )}
        </label>

        {/* Требования */}
        <ul className="mb-5 space-y-1">
          {REQS.map((r) => (
            <li
              key={r.key}
              className={cn(
                'flex items-center gap-1.5 text-xs',
                c[r.key] ? 'text-green-400' : 'text-muted'
              )}
            >
              {c[r.key] ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
              {r.label}
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="flex w-full items-center justify-center rounded-lg bg-accent py-2.5 font-medium text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? <LoaderCircle className="h-5 w-5 animate-spin" /> : 'Сохранить пароль'}
        </button>
      </div>
    </div>
  )
}
