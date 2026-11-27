import { FileText, ClipboardList, Gavel, BookMarked, StickyNote } from 'lucide-react'

// Типы документов. Ключ — код в БД, label — подпись в интерфейсе.
export const DOC_TYPE = {
  tz: { label: 'ТЗ', icon: FileText },
  spec: { label: 'Спецификация', icon: ClipboardList },
  protocol: { label: 'Протокол', icon: Gavel },
  regulation: { label: 'Регламент', icon: BookMarked },
  note: { label: 'Заметка', icon: StickyNote },
}

// Состояние документа целиком
export const DOC_STATUS = {
  draft: { label: 'Черновик', badge: 'bg-line text-muted' },
  review: { label: 'На согласовании', badge: 'bg-[#ecc371]/15 text-[#ecc371]' },
  approved: { label: 'Утверждён', badge: 'bg-[#2bbaac]/15 text-[#2bbaac]' },
}

// Состояние отдельного раздела — из него считается прогресс документа
export const SECTION_STATUS = {
  not_started: { label: 'Не начат', badge: 'bg-line text-muted', dot: '#9aa8a5' },
  in_progress: { label: 'В работе', badge: 'bg-[#ecc371]/15 text-[#ecc371]', dot: '#ecc371' },
  ready: { label: 'Готов', badge: 'bg-[#2bbaac]/15 text-[#2bbaac]', dot: '#2bbaac' },
}

// Заготовки разделов под тип документа: пустой документ без структуры
// никто не заполняет, а типовой набор сразу задаёт рамку.
export const SECTION_TEMPLATES = {
  tz: [
    'Цель и контекст',
    'Область применения',
    'Функциональные требования',
    'Нефункциональные требования',
    'Критерии приёмки',
  ],
  spec: ['Обзор решения', 'Интерфейсы', 'Модель данных', 'Ограничения'],
  protocol: ['Участники', 'Повестка', 'Решения', 'Поручения'],
  regulation: ['Назначение', 'Порядок действий', 'Ответственные', 'Контроль'],
  note: ['Заметка'],
}

// Мягкая блокировка живёт 5 минут без активности — то же значение,
// что и в public.document_lock_ttl() на стороне БД.
export const LOCK_TTL_MS = 5 * 60 * 1000

// Пауза автосохранения: правки уходят на сервер сами, кнопки «Сохранить» нет
export const AUTOSAVE_DELAY_MS = 3000

// Пустой документ TipTap
export function emptyDoc() {
  return { type: 'doc', content: [{ type: 'paragraph' }] }
}

// Блокировка ещё жива?
export function isLockActive(lockedAt) {
  if (!lockedAt) return false
  return Date.now() - new Date(lockedAt).getTime() < LOCK_TTL_MS
}

// Все узлы заданного типа из JSON-документа TipTap (mention, taskRef)
export function collectNodes(json, type) {
  const found = []
  const walk = (node) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      node.forEach(walk)
      return
    }
    if (node.type === type) found.push(node)
    if (Array.isArray(node.content)) node.content.forEach(walk)
  }
  walk(json)
  return found
}

// Плоский текст документа — для превью в списке и в истории версий
export function docToPlainText(json) {
  const parts = []
  const walk = (node) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      node.forEach(walk)
      return
    }
    if (node.type === 'text' && node.text) parts.push(node.text)
    if (node.type === 'mention') parts.push(`@${node.attrs?.label ?? ''}`)
    if (node.type === 'taskRef') parts.push(`#${node.attrs?.number ?? ''}`)
    if (Array.isArray(node.content)) {
      node.content.forEach(walk)
      if (['paragraph', 'heading', 'listItem', 'blockquote'].includes(node.type)) {
        parts.push(' ')
      }
    }
  }
  walk(json)
  return parts.join('').replace(/\s+/g, ' ').trim()
}

// Документ пустой? (нужно, чтобы не показывать «Раздел не начат» вместо текста)
export function isDocEmpty(json) {
  return docToPlainText(json).length === 0
}
