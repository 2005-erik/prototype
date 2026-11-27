import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Plus, X, Search } from 'lucide-react'
import Badge from '../ui/Badge'
import { useToast } from '../ui/Toast'
import { cn, formatDeadline } from '../../lib/utils'

// ---------------------------------------------------------------------
// Связанные задачи документа. Ссылки #142 из текста подтягиваются сами
// (auto), ручные привязки добавляются здесь — например, задача на
// согласование самого документа.
// ---------------------------------------------------------------------
export default function RelatedTasks({
  links = [],
  sectionTitles = {},
  canEdit = false,
  searchTasks,
  onLink,
  onUnlink,
}) {
  const { toast } = useToast()

  const [adding, setAdding] = useState(false)
  const [term, setTerm] = useState('')
  const [found, setFound] = useState([])
  const wrapRef = useRef(null)

  // Поиск с задержкой: запрос уходит не на каждую букву
  useEffect(() => {
    if (!adding) return
    let alive = true
    const id = setTimeout(async () => {
      const rows = await searchTasks(term)
      if (alive) setFound(rows)
    }, 250)
    return () => {
      alive = false
      clearTimeout(id)
    }
  }, [adding, term, searchTasks])

  useEffect(() => {
    if (!adding) return
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setAdding(false)
        setTerm('')
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [adding])

  const linkedIds = new Set(links.map((l) => l.task_id))

  const pick = async (task) => {
    const { error } = await onLink(task.id)
    if (error) {
      toast.error(error)
      return
    }
    setAdding(false)
    setTerm('')
  }

  const unlink = async (row) => {
    const { error } = await onUnlink(row.task_id)
    if (error) toast.error(error)
  }

  return (
    <section className="rounded-lg border border-line bg-surface p-4">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-sm font-semibold text-fg">Связанные задачи</h2>
        {links.length > 0 && (
          <span className="rounded-full bg-line px-1.5 text-xs text-muted">
            {links.length}
          </span>
        )}
        {canEdit && (
          <div className="relative ml-auto" ref={wrapRef}>
            <button
              type="button"
              onClick={() => setAdding((v) => !v)}
              className="flex items-center gap-1 text-xs text-accent transition hover:underline"
            >
              <Plus className="h-3.5 w-3.5" />
              Привязать
            </button>

            {adding && (
              <div className="absolute right-0 z-30 mt-1 w-80 max-w-[calc(100vw-3rem)] overflow-hidden rounded-lg border border-line bg-surface shadow-lg">
                <div className="flex items-center gap-2 border-b border-line px-3 py-2">
                  <Search className="h-4 w-4 flex-shrink-0 text-muted" />
                  <input
                    autoFocus
                    value={term}
                    onChange={(e) => setTerm(e.target.value)}
                    placeholder="Номер или название задачи"
                    className="min-w-0 flex-1 bg-transparent text-sm text-fg placeholder-muted outline-none"
                  />
                </div>
                <div className="max-h-64 overflow-y-auto py-1">
                  {found.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-muted/60">
                      Задач не нашли
                    </p>
                  ) : (
                    found.map((task) => {
                      const already = linkedIds.has(task.id)
                      return (
                        <button
                          key={task.id}
                          type="button"
                          disabled={already}
                          onClick={() => pick(task)}
                          className={cn(
                            'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition',
                            already
                              ? 'cursor-default text-muted/50'
                              : 'text-fg hover:bg-line'
                          )}
                        >
                          <span className="flex-shrink-0 font-mono text-xs text-muted">
                            #{task.number}
                          </span>
                          <span className="min-w-0 flex-1 truncate">
                            {task.title}
                          </span>
                          {already && (
                            <span className="flex-shrink-0 text-xs">связана</span>
                          )}
                        </button>
                      )
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {links.length === 0 ? (
        <p className="text-sm text-muted/60">
          Пока нет. Ссылка вида #142 прямо в тексте раздела свяжет задачу сама.
        </p>
      ) : (
        <ul className="space-y-1">
          {links.map((row) => {
            const task = row.tasks
            const status = task.statuses
            return (
              <li
                key={row.task_id}
                className="group flex items-center gap-2 rounded-lg border border-line bg-app px-2.5 py-1.5"
              >
                <Link
                  to={`/task/${task.id}`}
                  className="flex min-w-0 flex-1 items-center gap-2"
                >
                  <span className="flex-shrink-0 font-mono text-xs text-muted">
                    #{task.number}
                  </span>
                  <span
                    className={cn(
                      'min-w-0 flex-1 truncate text-sm',
                      task.completed_at ? 'text-muted line-through' : 'text-fg'
                    )}
                  >
                    {task.title}
                  </span>
                </Link>

                {row.section_id && sectionTitles[row.section_id] && (
                  <span className="hidden flex-shrink-0 text-xs text-muted sm:block">
                    {sectionTitles[row.section_id]}
                  </span>
                )}

                {task.due_date && !task.completed_at && (
                  <span className="hidden flex-shrink-0 text-xs text-muted sm:block">
                    {formatDeadline(task.due_date)}
                  </span>
                )}

                {status && (
                  <Badge
                    className="flex-shrink-0"
                    style={{
                      backgroundColor: `${status.color}26`,
                      color: status.color,
                    }}
                  >
                    {status.name}
                  </Badge>
                )}

                {/* Автосвязи снимаются вместе со ссылкой из текста */}
                {canEdit && !row.auto && (
                  <button
                    type="button"
                    onClick={() => unlink(row)}
                    className="flex-shrink-0 rounded p-0.5 text-muted opacity-0 transition hover:text-red-400 focus:opacity-100 group-hover:opacity-100"
                    aria-label="Отвязать задачу"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
                {row.auto && (
                  <span
                    className="flex-shrink-0 text-xs text-muted/60"
                    title="Связь появилась из ссылки #номер в тексте"
                  >
                    из текста
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
