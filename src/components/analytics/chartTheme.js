// Единая тёмная тема для графиков recharts
export const AXIS_TICK = { fill: '#6b7280', fontSize: 12 }
export const AXIS_LINE = { stroke: '#2a2f3a' }
export const GRID = '#2a2f3a'
export const TOOLTIP_STYLE = {
  background: '#1a1d24',
  border: '1px solid #2a2f3a',
  borderRadius: 8,
  color: '#e5e7eb',
}
export const TOOLTIP_LABEL = { color: '#e5e7eb' }

// Числа: дни с одним знаком, проценты целыми
export const fmtDays1 = (v) =>
  v == null || Number.isNaN(Number(v)) ? '—' : Number(v).toFixed(1)
export const fmtPct0 = (v) =>
  v == null || Number.isNaN(Number(v)) ? '—' : `${Math.round(Number(v))}%`
