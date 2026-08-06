import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, Settings, LayoutGrid, Check } from 'lucide-react'
import { cn } from '../../lib/utils'

export default function ProjectSelector({
  projects,
  activeProjectId,
  metrics = {},
  isManager,
}) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const active = projects.find((p) => p.id === activeProjectId)

  const activeCount = (id) => {
    const m = metrics[id]
    if (!m) return null
    return Math.max(0, (m.total ?? 0) - (m.completed ?? 0))
  }

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-fg transition hover:border-accent"
      >
        <span
          className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
          style={{ backgroundColor: active?.color ?? '#ecc371' }}
        />
        <span className="max-w-48 truncate font-medium">
          {active?.name ?? 'Проект'}
        </span>
        <ChevronDown className="h-4 w-4 text-muted" />
      </button>

      {open && (
        <div className="absolute left-0 z-30 mt-1 w-64 overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-lg">
          <div className="max-h-72 overflow-y-auto">
            {projects.map((p) => {
              const count = activeCount(p.id)
              const isActive = p.id === activeProjectId
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    navigate(`/board/${p.id}`)
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition hover:bg-line',
                    isActive ? 'text-fg' : 'text-muted'
                  )}
                >
                  <span
                    className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: p.color ?? '#ecc371' }}
                  />
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  {count !== null && (
                    <span className="flex-shrink-0 text-xs text-muted">
                      {count}
                    </span>
                  )}
                  {isActive && <Check className="h-4 w-4 flex-shrink-0 text-accent" />}
                </button>
              )
            })}
          </div>

          <div className="my-1 border-t border-line" />

          {isManager && activeProjectId && (
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                navigate(`/projects/${activeProjectId}/settings`)
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-fg transition hover:bg-line"
            >
              <Settings className="h-4 w-4" />
              Настройки проекта
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              navigate('/projects')
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-fg transition hover:bg-line"
          >
            <LayoutGrid className="h-4 w-4" />
            Все проекты
          </button>
        </div>
      )}
    </div>
  )
}
