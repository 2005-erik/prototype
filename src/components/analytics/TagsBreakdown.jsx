import { useTagStats } from '../../hooks/useTags'
import { SkeletonText } from '../ui/Skeleton'
import EmptyState from '../ui/EmptyState'
import TagChip from '../ui/TagChip'

// Разрез по направлениям: сколько задач в работе по каждому тегу.
// «В работе» считается так же, как загрузка сотрудников: без очереди,
// завершённых и архива — иначе цифра ничего не значит.
export default function TagsBreakdown({ projectId, onSelect }) {
  const { data, loading } = useTagStats(projectId)

  if (loading && data.length === 0) return <SkeletonText lines={4} />
  if (data.length === 0) {
    return (
      <EmptyState
        title="Направлений пока нет"
        description="Теги появятся после импорта из Trello или добавления вручную в карточке задачи."
      />
    )
  }

  const max = Math.max(...data.map((r) => r.in_work), 1)

  return (
    <div className="space-y-2">
      {data.map((row) => (
        <button
          key={row.tag_id}
          type="button"
          onClick={() => onSelect?.(row.tag_id)}
          className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition hover:bg-line"
        >
          <span className="w-44 flex-shrink-0">
            <TagChip tag={{ name: row.name, color: row.color }} />
          </span>

          <span className="h-2 flex-1 overflow-hidden rounded-full bg-line">
            <span
              className="block h-full rounded-full transition-all"
              style={{
                width: `${(row.in_work / max) * 100}%`,
                backgroundColor: row.color || '#2bbaac',
              }}
            />
          </span>

          <span className="flex-shrink-0 text-sm text-fg">
            {row.in_work}
            <span className="text-xs text-muted"> в работе</span>
          </span>
          <span className="w-32 flex-shrink-0 text-right text-xs text-muted">
            {row.queued} в очереди · {row.completed} готово
          </span>
        </button>
      ))}
    </div>
  )
}
