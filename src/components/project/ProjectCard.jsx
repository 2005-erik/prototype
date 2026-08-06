import { useState, useRef, useEffect } from 'react'
import { MoreVertical, Settings, Archive, Trash2, ArchiveRestore } from 'lucide-react'
import Avatar from '../ui/Avatar'
import { cn } from '../../lib/utils'

export default function ProjectCard({
  project,
  metrics,
  members = [],
  canManage,
  onOpen,
  onSettings,
  onArchive,
  onDelete,
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menuOpen])

  const m = metrics ?? { total: 0, overdue: 0, completed: 0 }
  const shown = members.slice(0, 5)
  const rest = members.length - shown.length

  const stop = (e) => e.stopPropagation()

  return (
    <div
      onClick={() => onOpen(project)}
      className="group flex cursor-pointer flex-col overflow-hidden rounded-lg border border-line bg-surface transition hover:border-accent"
    >
      {/* Цветная полоса */}
      <div
        className="h-1.5 w-full"
        style={{ backgroundColor: project.color ?? '#ecc371' }}
      />

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 flex-1 truncate font-medium text-fg">
            {project.name}
            {project.is_archived && (
              <span className="ml-2 text-xs text-muted">(в архиве)</span>
            )}
          </h3>

          {canManage && (
            <div className="relative flex-shrink-0" ref={menuRef}>
              <button
                type="button"
                onClick={(e) => {
                  stop(e)
                  setMenuOpen((v) => !v)
                }}
                className="rounded p-1 text-muted transition hover:bg-line hover:text-fg"
                aria-label="Меню проекта"
              >
                <MoreVertical className="h-4 w-4" />
              </button>

              {menuOpen && (
                <div
                  onClick={stop}
                  className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-lg"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      onSettings(project)
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-fg transition hover:bg-line"
                  >
                    <Settings className="h-4 w-4" />
                    Настройки
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      onArchive(project)
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-fg transition hover:bg-line"
                  >
                    {project.is_archived ? (
                      <>
                        <ArchiveRestore className="h-4 w-4" />
                        Из архива
                      </>
                    ) : (
                      <>
                        <Archive className="h-4 w-4" />
                        Архивировать
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      onDelete(project)
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-red-400 transition hover:bg-line"
                  >
                    <Trash2 className="h-4 w-4" />
                    Удалить
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-sm text-muted">
          {project.description || '—'}
        </p>

        {/* Метрики */}
        <div className="mt-3 flex items-center gap-3 text-xs text-muted">
          <span>Всего {m.total}</span>
          <span className={cn(m.overdue > 0 && 'text-red-400')}>
            Просрочено {m.overdue}
          </span>
          <span>Выполнено {m.completed}</span>
        </div>

        {/* Участники */}
        <div className="mt-3 flex items-center">
          <div className="flex -space-x-2">
            {shown.map((mem, idx) => (
              <Avatar
                key={mem.profiles?.id ?? idx}
                name={mem.profiles?.full_name}
                src={mem.profiles?.avatar_url}
                size="xs"
                className="ring-2 ring-surface"
                title={mem.profiles?.full_name}
              />
            ))}
          </div>
          {rest > 0 && (
            <span className="ml-2 text-xs text-muted">+{rest}</span>
          )}
          {members.length === 0 && (
            <span className="text-xs text-muted/60">Нет участников</span>
          )}
        </div>
      </div>
    </div>
  )
}
