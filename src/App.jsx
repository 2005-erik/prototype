import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import ProtectedRoute from './components/auth/ProtectedRoute'
import AppLayout from './components/layout/AppLayout'
import LoginPage from './pages/LoginPage'
import RoleHomePage from './pages/RoleHomePage'
import SetPasswordPage from './pages/SetPasswordPage'
import ChangePasswordPage from './pages/ChangePasswordPage'
import ProjectsPage from './pages/ProjectsPage'
import ProjectSettingsPage from './pages/ProjectSettingsPage'
import BoardPage from './pages/BoardPage'
import TaskPage from './pages/TaskPage'
import MyTasksPage from './pages/MyTasksPage'
import TeamPage from './pages/TeamPage'
import AnalyticsPage from './pages/AnalyticsPage'
import UsersAdminPage from './pages/UsersAdminPage'
import TrelloImportPage from './pages/TrelloImportPage'
import AuthLogPage from './pages/AuthLogPage'
import ProfilePage from './pages/ProfilePage'
import NotFoundPage from './pages/NotFoundPage'
import { OfflineNotice, UpdateBanner } from './components/layout/PwaBanners'
import { AzimutSpinner } from './components/ui/AzimutLoader'

// Экраны документов грузятся отдельным чанком: редактор текста тянет
// за собой TipTap, а он нужен только здесь и заметно весит.
const DocumentsPage = lazy(() => import('./pages/DocumentsPage'))
const DocumentPage = lazy(() => import('./pages/DocumentPage'))

// Ожидание чанка внутри каркаса: сайдбар и шапка остаются на месте
function Lazy({ children }) {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-20">
          <AzimutSpinner size={48} />
        </div>
      }
    >
      {children}
    </Suspense>
  )
}

// Роли для доски/аналитики/команды
const MANAGERS = ['admin', 'manager']

function App() {
  return (
    <BrowserRouter>
      {/* PWA-плашки вне маршрутов: обновление и потеря сети касаются
          и экрана входа, где каркаса приложения ещё нет */}
      <UpdateBanner />
      <OfflineNotice />
      <Routes>
        {/* Публичный маршрут */}
        <Route path="/login" element={<LoginPage />} />

        {/* Защищённая зона: сессия обязательна, общий каркас с сайдбаром */}
        <Route element={<ProtectedRoute />}>
          {/* Установка пароля — без сайдбара (по ссылке из письма-приглашения) */}
          <Route path="/set-password" element={<SetPasswordPage />} />

          {/* Обязательная смена пароля при первом входе (must_change_password) */}
          <Route path="/change-password" element={<ChangePasswordPage />} />

          <Route element={<AppLayout />}>
            {/* Главная — зависит от роли */}
            <Route path="/" element={<RoleHomePage />} />

            {/* Проекты — доступны всем ролям (создание ограничено в UI) */}
            <Route path="/projects" element={<ProjectsPage />} />
            {/* Настройки проекта — доступ проверяется внутри (owner/manager) */}
            <Route
              path="/projects/:id/settings"
              element={<ProjectSettingsPage />}
            />

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

            {/* Профиль — все роли */}
            <Route path="/profile" element={<ProfilePage />} />

            {/* Мои задачи — все роли */}
            <Route path="/my-tasks" element={<MyTasksPage />} />

            {/* Документы — все роли: сотрудник ведёт свои разделы.
                Права на правку решает RLS и проверки внутри экрана. */}
            <Route
              path="/documents"
              element={
                <Lazy>
                  <DocumentsPage />
                </Lazy>
              }
            />
            <Route
              path="/documents/:projectId"
              element={
                <Lazy>
                  <DocumentsPage />
                </Lazy>
              }
            />
            <Route
              path="/document/:documentId"
              element={
                <Lazy>
                  <DocumentPage />
                </Lazy>
              }
            />

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

            {/* Импорт из Trello — только admin */}
            <Route
              path="/admin/import-trello"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <TrelloImportPage />
                </ProtectedRoute>
              }
            />

            {/* Журнал входов — только admin */}
            <Route
              path="/admin/auth-log"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AuthLogPage />
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
