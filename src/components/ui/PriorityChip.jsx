import { PRIORITY } from '../../lib/constants'
import { cn } from '../../lib/utils'

// Компактный чип приоритета для списков и таблиц.
// «Средний» по умолчанию не показываем (mutedMedium): это значение-заглушка,
// и в плотном списке от него один шум. Явно нужен — передать mutedMedium={false}.
export default function PriorityChip({
  priority,
  size = 'sm',
  withIcon = true,
  mutedMedium = true,
  className,
}) {
  const prio = PRIORITY[priority]
  if (!prio) return null
  if (mutedMedium && priority === 'medium') return null

  const Icon = prio.icon

  return (
    <span
      className={cn(
        'inline-flex flex-shrink-0 items-center gap-1 rounded font-medium',
        size === 'xs' ? 'px-1 py-0 text-[10px]' : 'px-1.5 py-0.5 text-xs',
        prio.badge,
        className
      )}
      title={`Приоритет: ${prio.label}`}
    >
      {withIcon && Icon && (
        <Icon className={size === 'xs' ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
      )}
      {prio.label}
    </span>
  )
}
