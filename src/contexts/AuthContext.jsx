import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
} from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Защита от обновления состояния после размонтирования
  const mountedRef = useRef(true)

  // Загрузка профиля пользователя из таблицы profiles.
  // При деактивированной учётной записи — принудительный выход.
  const loadProfile = useCallback(async (authUser) => {
    if (!authUser) {
      if (mountedRef.current) setProfile(null)
      return
    }

    try {
      const { data, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .single()

      if (profileError) throw profileError

      // Деактивированная учётная запись — выкидываем из сессии
      if (data && data.is_active === false) {
        await supabase.auth.signOut()
        if (mountedRef.current) {
          setUser(null)
          setProfile(null)
          setError('Учётная запись деактивирована')
        }
        return
      }

      if (mountedRef.current) setProfile(data)
    } catch (err) {
      if (mountedRef.current) {
        setProfile(null)
        setError(err.message ?? 'Не удалось загрузить профиль')
      }
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true

    // Инициализация: текущая сессия + профиль
    const init = async () => {
      try {
        const { data, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) throw sessionError

        const sessionUser = data.session?.user ?? null
        if (mountedRef.current) setUser(sessionUser)
        await loadProfile(sessionUser)
      } catch (err) {
        if (mountedRef.current) {
          setError(err.message ?? 'Ошибка инициализации сессии')
        }
      } finally {
        if (mountedRef.current) setLoading(false)
      }
    }

    init()

    // Подписка на изменения аутентификации
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const sessionUser = session?.user ?? null
      setUser(sessionUser)
      setError(null)
      // Отложенный вызов: нельзя обращаться к supabase синхронно
      // внутри колбэка onAuthStateChange (риск взаимной блокировки)
      setTimeout(() => {
        loadProfile(sessionUser)
      }, 0)
    })

    // Отписка при размонтировании
    return () => {
      mountedRef.current = false
      subscription.unsubscribe()
    }
  }, [loadProfile])

  // Вход по email/паролю
  const signIn = useCallback(async (email, password) => {
    setError(null)
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (signInError) throw signInError
      return { error: null }
    } catch (err) {
      const message = err.message ?? 'Не удалось войти'
      if (mountedRef.current) setError(message)
      return { error: message }
    }
  }, [])

  // Выход из системы
  const signOut = useCallback(async () => {
    setError(null)
    try {
      const { error: signOutError } = await supabase.auth.signOut()
      if (signOutError) throw signOutError
      return { error: null }
    } catch (err) {
      const message = err.message ?? 'Не удалось выйти'
      if (mountedRef.current) setError(message)
      return { error: message }
    }
  }, [])

  // Обновление собственного профиля
  const updateProfile = useCallback(
    async (data) => {
      if (!user) return { error: 'Нет активного пользователя' }
      setError(null)
      try {
        const { data: updated, error: updateError } = await supabase
          .from('profiles')
          .update(data)
          .eq('id', user.id)
          .select()
          .single()
        if (updateError) throw updateError
        if (mountedRef.current) setProfile(updated)
        return { error: null, data: updated }
      } catch (err) {
        const message = err.message ?? 'Не удалось обновить профиль'
        if (mountedRef.current) setError(message)
        return { error: message }
      }
    },
    [user]
  )

  const value = useMemo(() => {
    const role = profile?.role
    return {
      user,
      profile,
      loading,
      error,
      signIn,
      signOut,
      updateProfile,
      isAdmin: role === 'admin',
      isManager: role === 'admin' || role === 'manager',
      isEmployee: role === 'employee',
    }
  }, [user, profile, loading, error, signIn, signOut, updateProfile])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (ctx === null) {
    throw new Error('useAuth должен использоваться внутри <AuthProvider>')
  }
  return ctx
}
