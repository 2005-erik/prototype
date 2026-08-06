import { ChevronDown, ChevronRight } from 'lucide-react'
import { usePersistedCollapse } from '../../hooks/useCollapse'
import { cn } from '../../lib/utils'

// Сворачиваемый блок с запоминанием состояния между сессиями.
// count — общее число элементов внутри: в свёрнутом виде должно быть
// понятно, что скрыто и сколько.
export default function CollapsibleSection({
  id,
  title,
  count = null,
  hint = null,
  defaultOpen = true,
  actions = null,
  className,
  children,
}) {
  const [open, toggle] = usePersistedCollapse(id, defaultOpen)

  return (
    <section
      className={cn('rounded-lg border border-line bg-surface', className)}
    >
      <div className="flex items-center gap-2 px-4 py-3">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          {open ? (
            <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted" />
          ) : (
            <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted" />
          )}
          <span className="truncate text-sm font-semibold text-fg">{title}</span>
          {count != null && (
            <span className="flex-shrink-0 rounded-full bg-line px-1.5 text-xs text-muted">
              {count}
            </span>
          )}
          {!open && hint && (
            <span className="truncate text-xs text-muted">{hint}</span>
          )}
        </button>
        {actions && <div className="flex-shrink-0">{actions}</div>}
      </div>

      {open && <div className="px-4 pb-4">{children}</div>}
    </section>
  )
}
