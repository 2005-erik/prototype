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

// Приоритеты задач: подпись, цвет (hex), классы бейджа, иконка (lucide)
export const PRIORITY = {
  low: {
    label: 'Низкий',
    color: '#64748b',
    badge: 'bg-slate-100 text-slate-600',
    icon: ArrowDown,
  },
  medium: {
    label: 'Средний',
    color: '#3b82f6',
    badge: 'bg-blue-100 text-blue-700',
    icon: Minus,
  },
  high: {
    label: 'Высокий',
    color: '#f59e0b',
    badge: 'bg-amber-100 text-amber-700',
    icon: ArrowUp,
  },
  critical: {
    label: 'Критический',
    color: '#ef4444',
    badge: 'bg-red-100 text-red-700',
    icon: AlertTriangle,
  },
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
    color: '#3b82f6',
    badge: 'bg-blue-100 text-blue-700',
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
    color: '#3b82f6',
    badge: 'bg-blue-100 text-blue-700',
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
