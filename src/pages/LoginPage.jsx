import { useState } from 'react'
import { Navigate, useNavigate, useLocation } from 'react-router-dom'
import { Mail, Lock, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { AzimutSpinner } from '../components/ui/AzimutLoader'

// Приводим технические тексты Supabase к понятным русским сообщениям
function humanizeError(message) {
  if (!message) return 'Не удалось войти'
  const m = String(message).toLowerCase()

  if (m.includes('invalid login credentials')) {
    return 'Неверный email или пароль'
  }
  if (m.includes('email not confirmed')) {
    return 'Email не подтверждён'
  }
  if (
    m.includes('failed to fetch') ||
    m.includes('networkerror') ||
    m.includes('network request failed') ||
    m.includes('load failed')
  ) {
    return 'Не удалось подключиться к серверу'
  }
  // Уже локализованные сообщения (например, «Учётная запись деактивирована»)
  return message
}

export default function LoginPage() {
  const { user, signIn, error: authError } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState(null)

  // Куда вернуть пользователя после входа
  const from = location.state?.from?.pathname ?? '/'

  // Уже авторизован — сразу на главную
  if (user) {
    return <Navigate to="/" replace />
  }

  const handleSubmit = async () => {
    if (submitting) return

    if (!email.trim() || !password) {
      setFormError('Введите email и пароль')
      return
    }

    setFormError(null)
    setSubmitting(true)
    const { error } = await signIn(email.trim(), password)
    if (error) {
      setFormError(humanizeError(error))
      setSubmitting(false)
      return
    }

    // Успех — возвращаем на исходный путь
    navigate(from, { replace: true })
  }

  // Enter в любом поле отправляет форму
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }
  }

  const displayError = formError ?? (authError ? humanizeError(authError) : null)

  const inputClass =
    'w-full rounded-lg border border-line bg-app py-2.5 pl-10 pr-3 text-fg placeholder-muted outline-none transition focus:border-accent focus:ring-1 focus:ring-accent'

  return (
    <div className="safe-bottom safe-x flex min-h-screen flex-col items-center justify-center bg-app px-4 py-10">
      {/* Знак и название — над формой */}
      <div className="mb-8 flex flex-col items-center text-center">
        <img
          src="/azimut-mark.svg"
          alt="Azimut"
          width={72}
          height={72}
          className="h-[72px] w-[72px]"
        />
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-fg">
          Азимут
        </h1>
        <p className="mt-1.5 text-sm text-muted">Система управления задачами</p>
      </div>

      <div className="w-full max-w-sm rounded-lg border border-line bg-surface p-5 shadow-xl sm:p-8">

        {/* Email */}
        <label className="mb-4 block">
          <span className="mb-1.5 block text-sm text-fg">Email</span>
          <div className="relative">
            <Mail
              className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="you@company.ru"
              className={inputClass}
            />
          </div>
        </label>

        {/* Пароль */}
        <label className="mb-2 block">
          <span className="mb-1.5 block text-sm text-fg">Пароль</span>
          <div className="relative">
            <Lock
              className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <input
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="••••••••"
              className={`${inputClass} pr-10`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted transition hover:text-fg"
              aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
            >
              {showPassword ? (
                <EyeOff className="h-5 w-5" aria-hidden="true" />
              ) : (
                <Eye className="h-5 w-5" aria-hidden="true" />
              )}
            </button>
          </div>
        </label>

        {/* Ошибка */}
        {displayError && (
          <p
            className="mb-4 mt-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400"
            role="alert"
          >
            {displayError}
          </p>
        )}

        {/* Кнопка входа */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="mt-4 flex min-h-11 w-full items-center justify-center rounded-lg bg-accent py-2.5 font-medium text-on-accent transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? <AzimutSpinner size={18} /> : 'Войти'}
        </button>
      </div>
    </div>
  )
}
