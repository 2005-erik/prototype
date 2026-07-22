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
