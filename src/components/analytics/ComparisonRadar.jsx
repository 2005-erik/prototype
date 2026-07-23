import { useMemo } from 'react'
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { GRID, AXIS_TICK, TOOLTIP_STYLE } from './chartTheme'

const RADAR_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#a855f7']

// Оси: доступ к значению + «выше = лучше»
const AXES = [
  { label: 'Скорость', get: (e) => e.avg_completion_days, higherBetter: false },
  { label: 'Сроки', get: (e) => e.on_time_percent, higherBetter: true },
  { label: 'Качество', get: (e) => e.avg_rework, higherBetter: false },
  { label: 'Объём', get: (e) => e.completed, higherBetter: true },
  { label: 'Загрузка', get: (e) => e.load_percent, higherBetter: true },
]

// Нормировка оси в 0..100 по выбранным сотрудникам
function normalize(values, higherBetter) {
  const present = values.filter((v) => v != null)
  if (present.length === 0) return values.map(() => 0)
  const min = Math.min(...present)
  const max = Math.max(...present)
  return values.map((v) => {
    if (v == null) return 0
    if (max === min) return 100
    const scaled = ((v - min) / (max - min)) * 100
    return Math.round(higherBetter ? scaled : 100 - scaled)
  })
}

// Радарная диаграмма сравнения выбранных сотрудников (значения 0–100)
export default function ComparisonRadar({ employees = [] }) {
  const radarData = useMemo(() => {
    if (employees.length === 0) return []
    return AXES.map((axis) => {
      const normed = normalize(
        employees.map((e) => axis.get(e)),
        axis.higherBetter
      )
      const point = { axis: axis.label }
      employees.forEach((e, i) => {
        point[e.user_id] = normed[i]
      })
      return point
    })
  }, [employees])

  if (employees.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted/60">
        Выберите сотрудников для сравнения
      </p>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={340}>
      <RadarChart data={radarData}>
        <PolarGrid stroke={GRID} />
        <PolarAngleAxis dataKey="axis" tick={AXIS_TICK} />
        <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
        {employees.map((e, i) => (
          <Radar
            key={e.user_id}
            name={e.full_name}
            dataKey={e.user_id}
            stroke={RADAR_COLORS[i]}
            fill={RADAR_COLORS[i]}
            fillOpacity={0.15}
          />
        ))}
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
      </RadarChart>
    </ResponsiveContainer>
  )
}
