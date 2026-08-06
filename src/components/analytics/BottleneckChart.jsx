import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Cell,
  LabelList,
  ResponsiveContainer,
} from 'recharts'
import { formatDaysDuration } from '../../lib/utils'
import { AXIS_TICK, AXIS_LINE } from './chartTheme'

// Горизонтальная диаграмма среднего времени по статусам.
// Подписи «2 дн 4 ч», самый долгий обведён.
export default function BottleneckChart({ rows = [], slowestId }) {
  const data = rows.map((r) => ({
    name: r.status_name,
    days: r.avg_days ?? 0,
    color: r.status_color ?? '#ecc371',
    isSlowest: r.status_id === slowestId,
  }))

  return (
    <ResponsiveContainer width="100%" height={Math.max(200, rows.length * 46)}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 90, bottom: 4, left: 8 }}
      >
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="name"
          width={110}
          tick={AXIS_TICK}
          axisLine={AXIS_LINE}
          tickLine={false}
        />
        <Bar dataKey="days" radius={[0, 4, 4, 0]} barSize={22}>
          {data.map((d, i) => (
            <Cell
              key={i}
              fill={d.color}
              stroke={d.isSlowest ? '#ef4444' : undefined}
              strokeWidth={d.isSlowest ? 2 : 0}
            />
          ))}
          <LabelList
            dataKey="days"
            position="right"
            fill="#e5e7eb"
            fontSize={12}
            formatter={(v) => formatDaysDuration(v)}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
