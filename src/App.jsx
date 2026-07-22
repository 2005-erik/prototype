import { BrowserRouter, Routes, Route } from 'react-router-dom'
import ProtectedRoute from './components/auth/ProtectedRoute'
import AppLayout from './components/layout/AppLayout'
import LoginPage from './pages/LoginPage'
import RoleHomePage from './pages/RoleHomePage'
import BoardPage from './pages/BoardPage'
import TaskPage from './pages/TaskPage'
import MyTasksPage from './pages/MyTasksPage'
import TeamPage from './pages/TeamPage'
import AnalyticsPage from './pages/AnalyticsPage'
import UsersAdminPage from './pages/UsersAdminPage'
import NotFoundPage from './pages/NotFoundPage'

// Роли для доски/аналитики/команды
const MANAGERS = ['admin', 'manager']

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Публичный маршрут */}
        <Route path="/login" element={<LoginPage />} />

        {/* Защищённая зона: сессия обязательна, общий каркас с сайдбаром */}
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            {/* Главная — зависит от роли */}
            <Route path="/" element={<RoleHomePage />} />

            {/* Доска задач — только руководители */}
            <Route
              path="/board"
              element={
                <ProtectedRoute allowedRoles={MANAGERS}>
                  <BoardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/board/:projectId"
              element={
                <ProtectedRoute allowedRoles={MANAGERS}>
                  <BoardPage />
                </ProtectedRoute>
              }
            />

            {/* Задача — все роли */}
            <Route path="/task/:taskId" element={<TaskPage />} />

            {/* Мои задачи — все роли */}
            <Route path="/my-tasks" element={<MyTasksPage />} />

            {/* Сотрудники — только руководители */}
            <Route
              path="/team"
              element={
                <ProtectedRoute allowedRoles={MANAGERS}>
                  <TeamPage />
                </ProtectedRoute>
              }
            />

            {/* Аналитика — только руководители */}
            <Route
              path="/analytics"
              element={
                <ProtectedRoute allowedRoles={MANAGERS}>
                  <AnalyticsPage />
                </ProtectedRoute>
              }
            />

            {/* Управление пользователями — только admin */}
            <Route
              path="/admin/users"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <UsersAdminPage />
                </ProtectedRoute>
              }
            />

            {/* 404 внутри каркаса */}
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
