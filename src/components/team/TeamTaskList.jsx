import { ArrowLeft, Clock } from 'lucide-react'
import Avatar from '../ui/Avatar'
import Button from '../ui/Button'
import ShowMore from '../ui/ShowMore'
import PriorityChip from '../ui/PriorityChip'
import { useIncrementalList } from '../../hooks/useCollapse'
import { DEADLINE_STATE } from '../../lib/constants'
import { formatDeadline, plural, cn } from '../../lib/utils'

// Плоский список задач за счётчиком сводки: клик по «112 на проверке»
// показывает те самые 112 задач, а не фильтрует карточки сотрудников.
export default function TeamTaskList({
  title,
  tasks = [],
  projectsById,
  onOpen,
  onContextMenu,
  onBack,
}) {
  const { visible, hidden, showMore, showAll, step } = useIncrementalList(tasks, 20)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          К сотрудникам
        </Button>
        <h3 className="text-sm font-semibold text-fg">{title}</h3>
        <span className="text-xs text-muted">
          {tasks.length} {plural(tasks.length, 'задача', 'задачи', 'задач')}
        </span>
      </div>

      {tasks.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted/60">Задач нет</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-sm">
            <thead className="bg-app text-left text-xs uppercase text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Задача</th>
                {projectsById && <th className="px-3 py-2 font-medium">Проект</th>}
                <th className="px-3 py-2 font-medium">Исполнитель</th>
                <th className="px-3 py-2 font-medium">Статус</th>
                <th className="px-3 py-2 font-medium">Срок</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((t) => {
                const dl = DEADLINE_STATE[t.deadline_state]
                return (
                  <tr
                    key={t.id}
                    onClick={() => onOpen?.(t)}
                    onContextMenu={(e) => {
                      if (!onContextMenu) return
                      e.preventDefault()
                      onContextMenu(e, t)
                    }}
                    className="cursor-pointer border-t border-line transition hover:bg-line/40"
                  >
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-2">
                        <span className="text-xs text-muted">#{t.number}</span>
                        <span className="text-fg">{t.title}</span>
                        <PriorityChip priority={t.priority} size="xs" />
                      </span>
                    </td>
                    {projectsById && (
                      <td className="px-3 py-2 text-muted">
                        {projectsById[t.project_id]?.name ?? '—'}
                      </td>
                    )}
                    <td className="px-3 py-2">
                      {t.assignee_id ? (
                        <span className="flex items-center gap-2">
                          <Avatar name={t.assignee_name} size="xs" />
                          <span className="text-muted">{t.assignee_name}</span>
                        </span>
                      ) : (
                        <span className="text-muted/60">не назначен</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className="rounded px-1.5 py-0.5 text-xs"
                        style={{
                          backgroundColor: `${t.status_color ?? '#2bbaac'}26`,
                          color: t.status_color ?? '#2bbaac',
                        }}
                      >
                        {t.status_name ?? '—'}
                      </span>
                    </td>
                    <td className={cn('px-3 py-2', dl ? '' : 'text-muted')}>
                      {t.due_date ? (
                        <span
                          className="flex items-center gap-1"
                          style={{ color: dl?.color }}
                        >
                          <Clock className="h-3 w-3" />
                          {formatDeadline(t.due_date)}
                        </span>
                      ) : (
                        <span className="text-muted/60">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <ShowMore
            hidden={hidden}
            step={step}
            onMore={showMore}
            onAll={showAll}
            className="border-t border-line"
          />
        </div>
      )}
    </div>
  )
}
