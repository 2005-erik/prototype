import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { formatDate } from '../../lib/utils'
import { AXIS_TICK, AXIS_LINE, GRID, TOOLTIP_STYLE, TOOLTIP_LABEL } from './chartTheme'

const shortDate = (d) => (d ? `${d.slice(8, 10)}.${d.slice(5, 7)}` : '')

// ComposedChart динамики: столбцы создано/завершено + линия открыто всего
export default function TrendChart({ data = [] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data}>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={shortDate}
          tick={AXIS_TICK}
          axisLine={AXIS_LINE}
          tickLine={false}
        />
        <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelStyle={TOOLTIP_LABEL}
          labelFormatter={(d) => formatDate(d)}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="created" name="Создано" fill="#ecc371" radius={[2, 2, 0, 0]} />
        <Bar dataKey="completed" name="Завершено" fill="#22c55e" radius={[2, 2, 0, 0]} />
        <Line
          dataKey="open_total"
          name="Открыто всего"
          stroke="#f59e0b"
          strokeWidth={2}
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
