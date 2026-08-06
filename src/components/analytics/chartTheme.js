// Единая тёмная тема для графиков recharts (палитра «Азимут»)
export const AXIS_TICK = { fill: '#2bbaac', fontSize: 12 }
export const AXIS_LINE = { stroke: '#0f534c' }
export const GRID = '#0f534c'
export const TOOLTIP_STYLE = {
  background: '#04322c',
  border: '1px solid #0f534c',
  borderRadius: 8,
  color: '#eaf3f0',
}
export const TOOLTIP_LABEL = { color: '#eaf3f0' }

// Цвета рядов данных: золотой — основной, бирюзовый — сравнительный,
// зелёный/янтарный/красный оставлены за семантикой (успех, риск, ошибка)
export const SERIES_PRIMARY = '#ecc371'
export const SERIES_SECONDARY = '#2bbaac'

// Числа: дни с одним знаком, проценты целыми
export const fmtDays1 = (v) =>
  v == null || Number.isNaN(Number(v)) ? '—' : Number(v).toFixed(1)
export const fmtPct0 = (v) =>
  v == null || Number.isNaN(Number(v)) ? '—' : `${Math.round(Number(v))}%`
