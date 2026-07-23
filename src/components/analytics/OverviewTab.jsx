import { Timer, CheckCircle2, RotateCcw, CheckSquare, BarChart3 } from 'lucide-react'
import {
  useCompletionTrend,
  useOntimeStats,
  useReworkAnalysis,
  useCycleTime,
  useOverviewDeltas,
} from '../../hooks/useAnalytics'
import Skeleton from '../ui/Skeleton'
import EmptyState from '../ui/EmptyState'
import MetricWithTrend from './MetricWithTrend'
import TrendChart from './TrendChart'
import ReworkPie from './ReworkPie'
import { fmtDays1, fmtPct0 } from './chartTheme'

export default function OverviewTab({ projectId, period, onOpenBoard }) {
  const trend = useCompletionTrend(projectId, period)
  const ontime = useOntimeStats(projectId, period)
  const rework = useReworkAnalysis(projectId, period)
  const cycle = useCycleTime(projectId, period)
  const deltas = useOverviewDeltas(projectId, period)

  const loading =
    trend.loading || ontime.loading || rework.loading || cycle.loading

  if (loading && !trend.data) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
        <Skeleton className="h-72 w-full" />
      </div>
    )
  }

  const dist = rework.data?.distribution ?? []
  const distTotal = dist.reduce((s, d) => s + (d.count ?? 0), 0)

  return (
    <div className="space-y-6">
      {/* Метрики */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricWithTrend
          icon={Timer}
          label="Среднее выполнение, дней"
          value={fmtDays1(cycle.data?.avg_days)}
          delta={deltas?.avgCompletion}
          higherIsBetter={false}
          onClick={onOpenBoard}
        />
        <MetricWithTrend
          icon={CheckCircle2}
          label="В срок"
          value={fmtPct0(ontime.data?.on_time_percent)}
          delta={deltas?.onTime}
          higherIsBetter
          onClick={onOpenBoard}
        />
        <MetricWithTrend
          icon={RotateCcw}
          label="Средний возврат"
          value={rework.data?.avg_rework ?? 0}
          delta={deltas?.avgRework}
          higherIsBetter={false}
          onClick={onOpenBoard}
        />
        <MetricWithTrend
          icon={CheckSquare}
          label="Завершено за период"
          value={ontime.data?.completed ?? 0}
          delta={deltas?.completed}
          higherIsBetter
          onClick={onOpenBoard}
        />
      </div>

      {/* Динамика */}
      <section className="rounded-lg border border-line bg-surface p-4">
        <h3 className="mb-3 text-sm font-semibold text-fg">Динамика</h3>
        <TrendChart data={trend.data ?? []} />
      </section>

      {/* Распределение по возвратам */}
      <section className="rounded-lg border border-line bg-surface p-4">
        <h3 className="mb-3 text-sm font-semibold text-fg">
          Распределение по возвратам
        </h3>
        {distTotal === 0 ? (
          <EmptyState icon={BarChart3} title="Нет задач за период" />
        ) : (
          <ReworkPie distribution={dist} />
        )}
      </section>
    </div>
  )
}
