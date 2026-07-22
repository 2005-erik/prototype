import { Navigate, useLocation, Outlet } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

// Полноэкранный спиннер на время проверки сессии
function FullScreenSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-app">
      <div
        className="h-8 w-8 animate-spin rounded-full border-4 border-line border-t-accent"
        role="status"
        aria-label="Загрузка"
      />
    </div>
  )
}

// Защищённый маршрут.
// Можно использовать как обёртку (<ProtectedRoute>...</ProtectedRoute>)
// или как layout-маршрут с вложенным <Outlet />.
export default function ProtectedRoute({ allowedRoles, children }) {
  const { user, profile, loading } = useAuth()
  const location = useLocation()

  // Пока идёт проверка сессии — не принимаем решений
  if (loading) {
    return <FullScreenSpinner />
  }

  // Нет сессии — на страницу входа, запоминаем откуда пришли
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // Проверка роли, если маршрут её ограничивает
  if (allowedRoles && allowedRoles.length > 0) {
    const role = profile?.role
    if (!role || !allowedRoles.includes(role)) {
      // Роль не подходит — уводим на главную без показа контента
      return <Navigate to="/" replace />
    }
  }

  return children ?? <Outlet />
}
