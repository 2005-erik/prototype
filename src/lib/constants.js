import {
  ArrowDown,
  Minus,
  ArrowUp,
  AlertTriangle,
} from 'lucide-react'

// Роли пользователей
export const ROLES = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  EMPLOYEE: 'employee',
}

// Человекочитаемые названия ролей
export const ROLE_LABELS = {
  admin: 'Администратор',
  manager: 'Руководитель',
  employee: 'Сотрудник',
}

// Описания ролей (для радио/подтверждений)
export const ROLE_DESCRIPTIONS = {
  admin: 'Полный доступ: управление пользователями и всеми проектами.',
  manager:
    'Создаёт задачи и проекты, назначает исполнителей, видит аналитику проекта.',
  employee: 'Видит свои задачи, меняет их статус, комментирует.',
}

// Статусы задач (настраиваемые, значения по умолчанию)
export const STATUSES = {
  NEW: 'new',
  IN_PROGRESS: 'in_progress',
  REVIEW: 'review',
  REWORK: 'rework',
  DONE: 'done',
}

// Человекочитаемые названия статусов
export const STATUS_LABELS = {
  [STATUSES.NEW]: 'Новая',
  [STATUSES.IN_PROGRESS]: 'В работе',
  [STATUSES.REVIEW]: 'На проверке',
  [STATUSES.REWORK]: 'На доработке',
  [STATUSES.DONE]: 'Готово',
}

// Приоритеты задач: подпись, цвет (hex), классы чипа, иконка (lucide),
// stripe — цвет полосы слева на карточке (null = без полосы),
// rank — вес для сортировки (больше = важнее).
//
// «Средний» намеренно без цвета и без полосы: это значение по умолчанию,
// в нём нет информации, и подсвечивать его — значит шуметь на всей доске.
export const PRIORITY = {
  low: {
    label: 'Низкий',
    color: '#2bbaac',
    badge: 'bg-[#2bbaac]/10 text-[#2bbaac]/70',
    stripe: 'rgba(43, 186, 172, 0.45)',
    rank: 1,
    icon: ArrowDown,
  },
  medium: {
    label: 'Средний',
    color: '#9aa8a5',
    badge: 'bg-line text-muted',
    stripe: null,
    rank: 2,
    icon: Minus,
  },
  high: {
    label: 'Высокий',
    color: '#ecc371',
    badge: 'bg-[#ecc371]/15 text-[#ecc371]',
    stripe: '#ecc371',
    rank: 3,
    icon: ArrowUp,
  },
  critical: {
    label: 'Критический',
    color: '#ef4444',
    badge: 'bg-red-500/15 text-red-400',
    stripe: '#ef4444',
    rank: 4,
    icon: AlertTriangle,
  },
}

// Порядок задач в колонке и списках: критические сверху, дальше по сроку
// (без срока — в конец), при равенстве — ручной порядок position.
export function compareByPriorityAndDue(a, b) {
  const critA = a.priority === 'critical' ? 0 : 1
  const critB = b.priority === 'critical' ? 0 : 1
  if (critA !== critB) return critA - critB

  const dueA = a.due_date ? new Date(a.due_date).getTime() : null
  const dueB = b.due_date ? new Date(b.due_date).getTime() : null
  if (dueA !== dueB) {
    if (dueA === null) return 1
    if (dueB === null) return -1
    return dueA - dueB
  }

  const posA = a.position ?? Number.MAX_SAFE_INTEGER
  const posB = b.position ?? Number.MAX_SAFE_INTEGER
  return posA - posB
}

// Состояние дедлайна (светофор из tasks_enriched.deadline_state)
export const DEADLINE_STATE = {
  no_deadline: {
    label: 'Без срока',
    color: '#94a3b8',
    badge: 'bg-slate-100 text-slate-500',
  },
  completed: {
    label: 'Завершено',
    color: '#22c55e',
    badge: 'bg-green-100 text-green-700',
  },
  overdue: {
    label: 'Просрочено',
    color: '#ef4444',
    badge: 'bg-red-100 text-red-700',
  },
  critical: {
    label: 'Критично',
    color: '#f97316',
    badge: 'bg-orange-100 text-orange-700',
  },
  warning: {
    label: 'Скоро срок',
    color: '#f59e0b',
    badge: 'bg-amber-100 text-amber-700',
  },
  normal: {
    label: 'В срок',
    color: '#2bbaac',
    badge: 'bg-[#2bbaac]/15 text-[#2bbaac]',
  },
}

// Уровень загрузки сотрудника (из employee_workload.load_state)
export const LOAD_STATE = {
  free: {
    label: 'Свободен',
    color: '#22c55e',
    badge: 'bg-green-100 text-green-700',
  },
  normal: {
    label: 'Норма',
    color: '#2bbaac',
    badge: 'bg-[#2bbaac]/15 text-[#2bbaac]',
  },
  busy: {
    label: 'Занят',
    color: '#f59e0b',
    badge: 'bg-amber-100 text-amber-700',
  },
  overloaded: {
    label: 'Перегружен',
    color: '#ef4444',
    badge: 'bg-red-100 text-red-700',
  },
}
