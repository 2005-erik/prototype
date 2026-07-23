import {
  format,
  formatDistanceToNow,
  formatDistanceStrict,
  isYesterday,
  isTomorrow,
} from 'date-fns'
import { ru } from 'date-fns/locale'

// Объединение классов Tailwind без лишних пробелов и falsy-значений
export function cn(...classes) {
  return classes.filter(Boolean).join(' ')
}

// Экранирование пользовательского ввода для PostgREST .or(ilike):
// запятая/скобки/бэкслеш ломают синтаксис фильтра — заменяем на пробел.
export function sanitizeSearchTerm(value) {
  return (value ?? '').replace(/[,()\\]/g, ' ').trim()
}

// Безопасное имя файла: убрать путь, оставить безопасные символы,
// схлопнуть подчёркивания. Расширение сохраняется.
export function sanitizeFileName(name) {
  const base = String(name ?? 'file').split(/[\\/]/).pop() || 'file'
  return base
    .replace(/[^\w.\-а-яА-ЯёЁ ]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^[._]+/, '')
    .slice(0, 120) || 'file'
}

// Приводим вход к Date, отсекаем некорректные значения
function toDate(value) {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

// «22 июля 2026»
export function formatDate(date) {
  const d = toDate(date)
  if (!d) return ''
  return format(d, 'd MMMM yyyy', { locale: ru })
}

// «22 июля, 14:30»
export function formatDateTime(date) {
  const d = toDate(date)
  if (!d) return ''
  return format(d, 'd MMMM, HH:mm', { locale: ru })
}

// «2 часа назад», «вчера»
export function formatRelative(date) {
  const d = toDate(date)
  if (!d) return ''
  if (isYesterday(d)) return 'вчера'
  return formatDistanceToNow(d, { addSuffix: true, locale: ru })
}

// «2 дн 4 ч» из числа дней (например 2.17 → «2 дн 4 ч»)
export function formatDaysDuration(days) {
  if (days == null || Number.isNaN(Number(days))) return '—'
  const total = Number(days)
  if (total <= 0) return '0 ч'
  const d = Math.floor(total)
  const h = Math.round((total - d) * 24)
  const parts = []
  if (d > 0) parts.push(`${d} дн`)
  if (h > 0) parts.push(`${h} ч`)
  if (parts.length === 0) return '< 1 ч'
  return parts.join(' ')
}

// «ТА» из «Турар Абухан» (первые буквы первых двух слов)
export function getInitials(fullName) {
  if (!fullName) return '?'
  return fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

// «Просрочено на 2 дня», «Осталось 5 часов», «Завтра»
export function formatDeadline(dueDate) {
  const d = toDate(dueDate)
  if (!d) return ''

  const now = new Date()

  // Просрочено
  if (d.getTime() < now.getTime()) {
    return `Просрочено на ${formatDistanceStrict(d, now, { locale: ru })}`
  }

  // Завтра — отдельным словом
  if (isTomorrow(d)) return 'Завтра'

  // Иначе — сколько осталось («5 часов», «3 дня»)
  return `Осталось ${formatDistanceStrict(d, now, { locale: ru })}`
}
