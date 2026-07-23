import { useState, useEffect, useCallback, useRef } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Kanban,
  FolderKanban,
  Users,
  BarChart3,
  Sun,
  CheckSquare,
  Settings,
  LogOut,
  Bell,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronRight,
  ChevronDown,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { ru } from 'date-fns/locale'
import { useAuth } from '../../contexts/AuthContext'
import { useProjects } from '../../hooks/useProjects'
import { supabase } from '../../lib/supabase'
import { getInitials } from '../../lib/utils'

// ---------------------------------------------------------------------
// Колокольчик уведомлений с бейджем и выпадающим списком
// ---------------------------------------------------------------------
function NotificationsBell({ userId }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)
  const wrapRef = useRef(null)

  const fetchNotifications = useCallback(async () => {
    if (!userId) return
    try {
      // Список последних + отдельный точный счётчик непрочитанных
      const [list, count] = await Promise.all([
        supabase
          .from('notifications')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('is_read', false),
      ])

      if (list.error) throw list.error
      if (count.error) throw count.error

      setItems(list.data ?? [])
      setUnread(count.count ?? 0)
    } catch {
      // Тихо игнорируем — колокольчик не должен ронять раскладку
    }
  }, [userId])

  // Первичная загрузка + realtime-подписка на свои уведомления
  useEffect(() => {
    if (!userId) return
    fetchNotifications()

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        () => fetchNotifications()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId, fetchNotifications])

  // Закрытие по клику вне области
  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const markRead = async (id) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', id)
      if (error) throw error
      setItems((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      )
      setUnread((c) => Math.max(0, c - 1))
    } catch {
      // без действий — состояние восстановит следующий fetch
    }
  }

  const markAllRead = async () => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', userId)
        .eq('is_read', false)
      if (error) throw error
      setItems((prev) => prev.map((n) => ({ ...n, is_read: true })))
      setUnread(0)
    } catch {
      // игнорируем
    }
  }

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-lg p-2 text-muted transition hover:bg-line hover:text-fg"
        aria-label="Уведомления"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-80 overflow-hidden rounded-lg border border-line bg-surface shadow-lg">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <span className="text-sm font-medium text-fg">Уведомления</span>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-xs text-accent transition hover:underline"
              >
                Прочитать все
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted">
                Уведомлений нет
              </p>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => !n.is_read && markRead(n.id)}
                  className={`flex w-full flex-col items-start gap-0.5 border-b border-line px-4 py-2.5 text-left transition last:border-0 hover:bg-line/50 ${
                    n.is_read ? 'opacity-60' : ''
                  }`}
                >
                  <span className="flex w-full items-start gap-2">
                    {!n.is_read && (
                      <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-accent" />
                    )}
                    <span className="text-sm text-fg">{n.message}</span>
                  </span>
                  <span className="pl-4 text-xs text-muted">
                    {n.created_at
                      ? formatDistanceToNow(new Date(n.created_at), {
                          addSuffix: true,
                          locale: ru,
                        })
                      : ''}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------
// Основной каркас: сайдбар + шапка + контент
// ---------------------------------------------------------------------
export default function AppLayout() {
  const { profile, user, isAdmin, isEmployee, signOut } = useAuth()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const [projectsOpen, setProjectsOpen] = useState(false)

  // Проекты для вложенного списка под «Доской задач» (только не для employee)
  const { projects } = useProjects()
  const activeBoardProjectId =
    location.pathname.match(/^\/board\/([^/]+)/)?.[1] ?? null

  // Навигация в зависимости от роли
  const nav = isEmployee
    ? [
        { to: '/', label: 'Мой день', icon: Sun, end: true },
        { to: '/my-tasks', label: 'Мои задачи', icon: CheckSquare },
      ]
    : [
        { to: '/', label: 'Дашборд', icon: LayoutDashboard, end: true },
        { to: '/projects', label: 'Проекты', icon: FolderKanban },
        { to: '/board', label: 'Доска задач', icon: Kanban },
        { to: '/team', label: 'Сотрудники', icon: Users },
        { to: '/analytics', label: 'Аналитика', icon: BarChart3 },
      ]

  if (isAdmin) {
    nav.push({ to: '/admin/users', label: 'Пользователи', icon: Settings })
  }

  // Заголовок текущей страницы
  const homeTitle = isEmployee ? 'Мой день' : 'Дашборд'
  const titleMap = {
    '/': homeTitle,
    '/projects': 'Проекты',
    '/board': 'Доска задач',
    '/team': 'Сотрудники',
    '/analytics': 'Аналитика',
    '/my-tasks': 'Мои задачи',
    '/admin/users': 'Пользователи',
  }
  const pageTitle =
    titleMap[location.pathname] ??
    nav.find((n) => !n.end && location.pathname.startsWith(n.to))?.label ??
    'Планировщик задач'

  const linkClass = ({ isActive }) =>
    [
      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
      collapsed ? 'justify-center' : '',
      isActive
        ? 'bg-accent text-white'
        : 'text-muted hover:bg-line hover:text-fg',
    ].join(' ')

  return (
    <div className="flex min-h-screen bg-app text-fg">
      {/* Сайдбар */}
      <aside
        className="flex flex-shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-200"
        style={{ width: collapsed ? 64 : 260 }}
      >
        {/* Шапка сайдбара: название + кнопка сворачивания */}
        <div className="flex h-16 items-center justify-between px-3">
          {!collapsed && (
            <span className="truncate px-1 font-semibold text-fg">
              Планировщик задач
            </span>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="rounded-lg p-2 text-muted transition hover:bg-line hover:text-fg"
            aria-label={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-5 w-5" />
            ) : (
              <PanelLeftClose className="h-5 w-5" />
            )}
          </button>
        </div>

        {/* Навигация */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-2">
          {nav.map(({ to, label, icon: Icon, end }) => {
            // Пункт «Доска задач» со сворачиваемым списком проектов
            if (to === '/board') {
              return (
                <div key={to}>
                  <div className="flex items-center gap-1">
                    <NavLink
                      to={to}
                      end={end}
                      className={(s) => `${linkClass(s)} flex-1`}
                      title={collapsed ? label : undefined}
                    >
                      <Icon className="h-5 w-5 flex-shrink-0" />
                      {!collapsed && <span className="truncate">{label}</span>}
                    </NavLink>
                    {!collapsed && (
                      <button
                        type="button"
                        onClick={() => setProjectsOpen((v) => !v)}
                        className="rounded-lg p-1.5 text-muted transition hover:bg-line hover:text-fg"
                        aria-label={projectsOpen ? 'Свернуть проекты' : 'Развернуть проекты'}
                      >
                        {projectsOpen ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>
                    )}
                  </div>

                  {!collapsed && projectsOpen && (
                    <div className="ml-3 mt-1 space-y-0.5 border-l border-line pl-2">
                      {projects.length === 0 ? (
                        <p className="px-2 py-1 text-xs text-muted/60">
                          Нет проектов
                        </p>
                      ) : (
                        projects.map((p) => {
                          const active = activeBoardProjectId === p.id
                          return (
                            <NavLink
                              key={p.id}
                              to={`/board/${p.id}`}
                              className={[
                                'flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition',
                                active
                                  ? 'bg-line text-fg'
                                  : 'text-muted hover:bg-line hover:text-fg',
                              ].join(' ')}
                            >
                              <span
                                className="h-2 w-2 flex-shrink-0 rounded-full"
                                style={{ backgroundColor: p.color ?? '#2563eb' }}
                              />
                              <span className="truncate">{p.name}</span>
                            </NavLink>
                          )
                        })
                      )}
                    </div>
                  )}
                </div>
              )
            }

            return (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={linkClass}
                title={collapsed ? label : undefined}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                {!collapsed && <span className="truncate">{label}</span>}
              </NavLink>
            )
          })}
        </nav>

        {/* Низ: профиль + выход */}
        <div className="border-t border-line p-2">
          <div
            className={`flex items-center gap-3 rounded-lg px-2 py-2 ${
              collapsed ? 'justify-center' : ''
            }`}
          >
            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt=""
                className="h-9 w-9 flex-shrink-0 rounded-full object-cover"
              />
            ) : (
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-white">
                {getInitials(profile?.full_name)}
              </span>
            )}
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-fg">
                  {profile?.full_name ?? 'Пользователь'}
                </p>
                {profile?.position && (
                  <p className="truncate text-xs text-muted">
                    {profile.position}
                  </p>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={signOut}
            className={`mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted transition hover:bg-line hover:text-fg ${
              collapsed ? 'justify-center' : ''
            }`}
            title={collapsed ? 'Выйти' : undefined}
          >
            <LogOut className="h-5 w-5 flex-shrink-0" />
            {!collapsed && <span>Выйти</span>}
          </button>
        </div>
      </aside>

      {/* Основная область */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-line bg-surface px-6">
          <h1 className="text-lg font-semibold text-fg">{pageTitle}</h1>
          <NotificationsBell userId={user?.id} />
        </header>

        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
