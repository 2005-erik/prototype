import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { TOOLTIP_STYLE } from './chartTheme'

const COLORS = {
  '0': '#64748b',
  '1': '#3b82f6',
  '2': '#f59e0b',
  '3plus': '#ef4444',
}

// Круговая диаграмма распределения по числу возвратов
export default function ReworkPie({ distribution = [] }) {
  const data = distribution.filter((d) => (d.count ?? 0) > 0)

  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={data}
          dataKey="count"
          nameKey="label"
          innerRadius={55}
          outerRadius={90}
          paddingAngle={2}
          label={({ percent }) => `${Math.round(percent * 100)}%`}
        >
          {data.map((d) => (
            <Cell key={d.bucket} fill={COLORS[d.bucket] ?? '#64748b'} />
          ))}
        </Pie>
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  )
}
