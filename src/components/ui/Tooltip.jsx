import { cn } from '../../lib/utils'

// Простой CSS-тултип (появляется по hover/focus), без внешних библиотек
export default function Tooltip({ content, children, side = 'top' }) {
  if (!content) return children
  return (
    <span className="group relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute z-50 hidden whitespace-nowrap rounded bg-app px-2 py-1 text-xs text-fg shadow-lg ring-1 ring-line group-hover:block',
          side === 'bottom'
            ? 'left-1/2 top-full mt-1 -translate-x-1/2'
            : 'bottom-full left-1/2 mb-1 -translate-x-1/2'
        )}
      >
        {content}
      </span>
    </span>
  )
}
