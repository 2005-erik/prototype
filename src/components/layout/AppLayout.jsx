import { useState, useEffect, useCallback, useRef } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
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
  Menu,
  X,
  Download,
  ChevronRight,
  ChevronDown,
  ArrowRightLeft,
  UserPlus,
  CalendarClock,
  MessageSquare,
  Clock,
  AlertTriangle,
  ScrollText,
  Import,
  FileText,
  AtSign,
  ClipboardList,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { ru } from 'date-fns/locale'
import { useAuth } from '../../contexts/AuthContext'
import { useProjects } from '../../hooks/useProjects'
import { supabase } from '../../lib/supabase'
import { getInitials, cn } from '../../lib/utils'
import { useToast } from '../ui/Toast'
import PersonalWorkload from './PersonalWorkload'
import { IosInstallHint } from './PwaBanners'
import { useInstallPrompt } from '../../hooks/usePwa'

// Иконка уведомления по типу
const NOTIF_ICON = {
  status_changed: ArrowRightLeft,
  assigned: UserPlus,
  due_changed: CalendarClock,
  comment: MessageSquare,
  due_soon: Clock,
  overdue: AlertTriangle,
  doc_assigned: ClipboardList,
  doc_mention: AtSign,
  doc_comment: MessageSquare,
}

// ---------------------------------------------------------------------
// Колокольчик уведомлений с бейджем и выпадающим списком
// ---------------------------------------------------------------------
function NotificationsBell({ userId }) {
  const navigate = useNavigate()
  const { toast } = useToast()
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
      toast.success('Все уведомления прочитаны')
    } catch (err) {
      toast.error(err.message ?? 'Не удалось отметить прочитанными')
    }
  }

  // Клик по уведомлению: пометить прочитанным + открыть задачу или документ
  const onItemClick = async (n) => {
    if (!n.is_read) await markRead(n.id)
    setOpen(false)
    if (n.task_id) navigate(`/task/${n.task_id}`)
    else if (n.document_id) navigate(`/document/${n.document_id}`)
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
        <div className="absolute right-0 z-20 mt-2 w-[400px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-line bg-surface shadow-lg">
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
                Нет уведомлений
              </p>
            ) : (
              items.map((n) => {
                const Icon = NOTIF_ICON[n.type] ?? Bell
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => onItemClick(n)}
                    className={cn(
                      'flex w-full items-start gap-2.5 border-b border-line px-4 py-2.5 text-left transition last:border-0 hover:bg-line/50',
                      !n.is_read && 'bg-accent/5'
                    )}
                  >
                    {/* Точка непрочитанного */}
                    <span className="mt-1.5 w-2 flex-shrink-0">
                      {!n.is_read && (
                        <span className="block h-2 w-2 rounded-full bg-accent" />
                      )}
                    </span>
                    <Icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-fg">{n.message}</span>
                      <span className="mt-0.5 block text-xs text-muted">
                        {n.created_at
                          ? formatDistanceToNow(new Date(n.created_at), {
                              addSuffix: true,
                              locale: ru,
                            })
                          : ''}
                      </span>
                    </span>
                  </button>
                )
              })
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
        { to: '/documents', label: 'Документы', icon: FileText },
      ]
    : [
        { to: '/', label: 'Дашборд', icon: LayoutDashboard, end: true },
        { to: '/projects', label: 'Проекты', icon: FolderKanban },
        { to: '/board', label: 'Доска задач', icon: Kanban },
        { to: '/documents', label: 'Документы', icon: FileText },
        { to: '/team', label: 'Сотрудники', icon: Users },
        { to: '/analytics', label: 'Аналитика', icon: BarChart3 },
      ]

  if (isAdmin) {
    nav.push({ to: '/admin/users', label: 'Пользователи', icon: Settings })
    nav.push({ to: '/admin/import-trello', label: 'Импорт из Trello', icon: Import })
    nav.push({ to: '/admin/auth-log', label: 'Журнал входов', icon: ScrollText })
  }

  // Выдвижное меню на узком экране
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  // Установка приложения
  const { canInstall, iosHint, install } = useInstallPrompt()
  const [iosHintOpen, setIosHintOpen] = useState(false)

  // Переход по ссылке закрывает меню — иначе панель остаётся поверх контента
  useEffect(() => {
    setMobileNavOpen(false)
  }, [location.pathname])

  // Заголовок текущей страницы
  const homeTitle = isEmployee ? 'Мой день' : 'Дашборд'
  const titleMap = {
    '/': homeTitle,
    '/projects': 'Проекты',
    '/board': 'Доска задач',
    '/team': 'Сотрудники',
    '/analytics': 'Аналитика',
    '/my-tasks': 'Мои задачи',
    '/documents': 'Документы',
    '/profile': 'Профиль',
    '/admin/users': 'Пользователи',
    '/admin/import-trello': 'Импорт из Trello',
    '/admin/auth-log': 'Журнал входов',
  }
  const pageTitle =
    titleMap[location.pathname] ??
    // Отдельный документ лежит на /document/:id — под пункт меню
    // «/documents» он не подходит, поэтому разбираем его явно
    (location.pathname.startsWith('/document/') ? 'Документ' : null) ??
    nav.find((n) => !n.end && location.pathname.startsWith(n.to))?.label ??
    'Азимут'

  const linkClass = ({ isActive }) =>
    [
      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
      collapsed ? 'justify-center' : '',
      isActive
        ? 'bg-accent text-on-accent'
        : 'text-muted hover:bg-line hover:text-fg',
    ].join(' ')

  return (
    <div className="flex h-screen bg-app text-fg">
      {/* Затемнение под выдвижным меню (только узкий экран) */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileNavOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Сайдбар. На узком экране — выдвижная панель поверх контента,
          на широком — обычная колонка, сжимающая рабочую область. */}
      <aside
        className={cn(
          'flex flex-col border-r border-line bg-surface transition-transform duration-200',
          'safe-left fixed inset-y-0 left-0 z-50 lg:static lg:z-auto lg:translate-x-0 lg:transition-[width]',
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full lg:flex-shrink-0'
        )}
        style={{ width: collapsed ? 64 : 260 }}
      >
        {/* Шапка сайдбара: знак + название + кнопка сворачивания.
            В свёрнутом виде остаётся только знак — он же разворачивает меню. */}
        <div
          className={cn(
            'flex h-16 items-center px-3',
            collapsed ? 'justify-center' : 'justify-between'
          )}
        >
          {collapsed ? (
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              className="rounded-lg transition hover:opacity-80"
              aria-label="Развернуть меню"
              title="Азимут — развернуть меню"
            >
              <img
                src="/azimut-mark.svg"
                alt="Azimut"
                width={28}
                height={28}
                className="h-7 w-7"
              />
            </button>
          ) : (
            <>
              <span className="flex min-w-0 items-center px-1">
                <img
                  src="/azimut-mark.svg"
                  alt="Azimut"
                  width={28}
                  height={28}
                  className="h-7 w-7 shrink-0"
                />
                <span className="ml-[10px] truncate font-semibold text-fg">
                  Азимут
                </span>
              </span>
              <button
                type="button"
                onClick={() => setCollapsed(true)}
                className="hidden rounded-lg p-2 text-muted transition hover:bg-line hover:text-fg lg:block"
                aria-label="Свернуть меню"
              >
                <PanelLeftClose className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="touch-target rounded-lg p-2 text-muted transition hover:bg-line hover:text-fg lg:hidden"
                aria-label="Закрыть меню"
              >
                <X className="h-5 w-5" />
              </button>
            </>
          )}
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
                                style={{ backgroundColor: p.color ?? '#ecc371' }}
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
          <NavLink
            to="/profile"
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-line ${
                collapsed ? 'justify-center' : ''
              } ${isActive ? 'bg-line' : ''}`
            }
            title="Профиль"
          >
            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt=""
                className="h-9 w-9 flex-shrink-0 rounded-full object-cover"
              />
            ) : (
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-on-accent">
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
          </NavLink>

          {/* Личная загрузка */}
          {!collapsed && <PersonalWorkload />}

          {(canInstall || iosHint) && (
            <button
              type="button"
              onClick={() => (canInstall ? install() : setIosHintOpen(true))}
              className={`mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-accent transition hover:bg-line ${
                collapsed ? 'justify-center' : ''
              }`}
              title={collapsed ? 'Установить приложение' : undefined}
            >
              <Download className="h-5 w-5 flex-shrink-0" />
              {!collapsed && <span>Установить приложение</span>}
            </button>
          )}

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
        <header className="safe-top flex h-16 flex-shrink-0 items-center gap-2 border-b border-line bg-surface px-4 sm:px-6">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="touch-target -ml-2 rounded-lg p-2 text-muted transition hover:bg-line hover:text-fg lg:hidden"
            aria-label="Открыть меню"
          >
            <Menu className="h-5 w-5" />
          </button>
          <h1 className="min-w-0 flex-1 truncate text-base font-semibold text-fg sm:text-lg">
            {pageTitle}
          </h1>
          <NotificationsBell userId={user?.id} />
        </header>

        <main className="safe-bottom min-h-0 flex-1 overflow-auto p-4 sm:p-6">
          <Outlet />
        </main>
      </div>

      {/* Подсказка про установку на iPhone */}
      <IosInstallHint open={iosHintOpen} onClose={() => setIosHintOpen(false)} />
    </div>
  )
}
