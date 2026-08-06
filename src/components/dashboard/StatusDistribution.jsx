import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Cell,
  LabelList,
  ResponsiveContainer,
} from 'recharts'
import EmptyState from '../ui/EmptyState'

// data: [{ status_id, status_name, status_color, count }]
// onSelect(statusId) — клик по столбцу
export default function StatusDistribution({ data = [], onSelect }) {
  if (!data.length || data.every((d) => (d.count ?? 0) === 0)) {
    return (
      <EmptyState
        title="Задач пока нет"
        description="Создайте первую или импортируйте из Trello."
      />
    )
  }

  const rows = data.map((d) => ({
    id: d.status_id,
    name: d.status_name,
    count: d.count ?? 0,
    color: d.status_color ?? '#ecc371',
  }))

  return (
    <ResponsiveContainer width="100%" height={Math.max(160, rows.length * 44)}>
      <BarChart
        data={rows}
        layout="vertical"
        margin={{ top: 4, right: 28, bottom: 4, left: 8 }}
      >
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="name"
          width={110}
          tick={{ fill: '#9ca3af', fontSize: 12 }}
          axisLine={{ stroke: '#2a2f3a' }}
          tickLine={false}
        />
        <Bar
          dataKey="count"
          radius={[0, 4, 4, 0]}
          barSize={20}
          cursor="pointer"
          onClick={(entry) => onSelect?.(entry?.id)}
        >
          {rows.map((r, i) => (
            <Cell key={i} fill={r.color} />
          ))}
          <LabelList
            dataKey="count"
            position="right"
            fill="#e5e7eb"
            fontSize={12}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
