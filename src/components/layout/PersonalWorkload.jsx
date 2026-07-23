import { AlertTriangle } from 'lucide-react'
import { usePersonalWorkload } from '../../hooks/useProjects'
import { LOAD_STATE } from '../../lib/constants'
import { cn } from '../../lib/utils'

const BAR_COLOR = {
  free: 'bg-slate-500',
  normal: 'bg-blue-500',
  busy: 'bg-orange-500',
  overloaded: 'bg-red-500',
}

// Мини-виджет личной загрузки под профилем в сайдбаре
export default function PersonalWorkload() {
  const { active, max, percent, loadState } = usePersonalWorkload()
  const overloaded = loadState === 'overloaded'
  const width = Math.min(100, percent)

  return (
    <div
      className="px-2 py-2"
      title={overloaded ? 'Высокая загрузка' : undefined}
    >
      <div className="mb-1 flex items-center justify-between text-xs">
        <span
          className={cn(
            'flex items-center gap-1 font-medium',
            overloaded ? 'text-red-400' : 'text-muted'
          )}
          style={overloaded ? undefined : { color: LOAD_STATE[loadState]?.color }}
        >
          {overloaded && <AlertTriangle className="h-3 w-3" />}
          {LOAD_STATE[loadState]?.label}
        </span>
        <span className="text-muted">
          {active} из {max} задач
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            BAR_COLOR[loadState] ?? 'bg-slate-500'
          )}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  )
}
