import { AlertTriangle, Hourglass } from 'lucide-react'
import { useBottlenecks } from '../../hooks/useAnalytics'
import Skeleton from '../ui/Skeleton'
import EmptyState from '../ui/EmptyState'
import CollapsibleSection from '../ui/CollapsibleSection'
import { formatDaysDuration } from '../../lib/utils'
import BottleneckChart from './BottleneckChart'

export default function BottlenecksTab({ projectId, period }) {
  const { data, loading } = useBottlenecks(projectId, period)

  if (loading && !data) {
    return <Skeleton className="h-72 w-full" />
  }

  const rows = data ?? []
  const totalCycle = rows.reduce((s, r) => s + (r.avg_days ?? 0), 0)

  if (totalCycle === 0) {
    return (
      <EmptyState
        icon={Hourglass}
        title="Недостаточно данных"
        description="Пока нет закрытых интервалов статусов за период."
      />
    )
  }

  // Самый долгий статус — узкое место
  const slowest = rows.reduce(
    (max, r) => ((r.avg_days ?? 0) > (max?.avg_days ?? 0) ? r : max),
    null
  )
  const slowestPct = slowest
    ? Math.round((slowest.avg_days / totalCycle) * 100)
    : 0

  return (
    <div className="space-y-6">
      {/* Диаграмма */}
      <CollapsibleSection
        id="analytics.bottlenecks.chart"
        title="Среднее время в статусе"
        count={rows.length}
        defaultOpen
      >
        <BottleneckChart rows={rows} slowestId={slowest?.status_id} />
      </CollapsibleSection>

      {/* Текстовый вывод */}
      {slowest && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-fg">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-400" />
          <p>
            Больше всего времени задачи проводят в статусе{' '}
            <span className="font-semibold">«{slowest.status_name}»</span> — в
            среднем {formatDaysDuration(slowest.avg_days)}. Это {slowestPct}% от
            общего цикла.
          </p>
        </div>
      )}

      {/* Таблица */}
      <CollapsibleSection
        id="analytics.bottlenecks.table"
        title="Подробно по статусам"
        count={rows.length}
        defaultOpen={false}
        className="overflow-hidden"
      >
        <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="bg-app text-left text-xs uppercase text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Статус</th>
              <th className="px-3 py-2 font-medium">Среднее</th>
              <th className="px-3 py-2 font-medium">Медиана</th>
              <th className="px-3 py-2 font-medium">Максимум</th>
              <th className="px-3 py-2 font-medium">Задач прошло</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.status_id} className="border-t border-line">
                <td className="px-3 py-2">
                  <span className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: r.status_color ?? '#94a3b8' }}
                    />
                    <span className="text-fg">{r.status_name}</span>
                    {slowest && r.status_id === slowest.status_id && (
                      <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[11px] font-medium text-red-400">
                        Узкое место
                      </span>
                    )}
                  </span>
                </td>
                <td className="px-3 py-2 text-fg">
                  {formatDaysDuration(r.avg_days)}
                </td>
                <td className="px-3 py-2 text-muted">
                  {formatDaysDuration(r.median_days)}
                </td>
                <td className="px-3 py-2 text-muted">
                  {formatDaysDuration(r.max_days)}
                </td>
                <td className="px-3 py-2 text-muted">{r.tasks_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </CollapsibleSection>
    </div>
  )
}
