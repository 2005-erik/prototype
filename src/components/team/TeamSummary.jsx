import { cn } from '../../lib/utils'

// Сводка над карточками. Два разных вида чипов:
//
//   счётчики задач (в работе / на проверке / в очереди / просрочено /
//   без исполнителя) — это переходы к списку самих задач: фильтровать
//   по ним карточки сотрудников бессмысленно;
//
//   состояния людей (высокая загрузка / перегружено) — переключатели,
//   они действительно сужают набор карточек.
//
// totals: { active, review, queued, high, overloaded, unassigned, overdue }
export default function TeamSummary({ totals, filter, onFilter, onOpenList }) {
  const base =
    'flex items-baseline gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition'

  // Переход к списку задач
  const link = (kind, label, value, danger, hint) => (
    <button
      type="button"
      onClick={() => onOpenList(kind)}
      title={hint}
      className={cn(base, 'cursor-pointer border-line hover:border-accent hover:bg-line/40')}
    >
      <span
        className={cn(
          'text-base font-semibold',
          danger && value > 0 ? 'text-red-400' : 'text-fg'
        )}
      >
        {value}
      </span>
      <span className="text-xs text-muted">{label}</span>
    </button>
  )

  // Переключатель состава карточек
  const toggle = (key, label, value, danger) => (
    <button
      type="button"
      onClick={() => onFilter(filter === key ? null : key)}
      title={
        filter === key
          ? 'Показать всех сотрудников'
          : `Оставить только тех, у кого ${label.toLowerCase()}`
      }
      className={cn(
        base,
        'cursor-pointer',
        filter === key
          ? 'border-accent bg-accent/10'
          : 'border-line hover:border-accent'
      )}
    >
      <span
        className={cn(
          'text-base font-semibold',
          danger && value > 0 ? 'text-red-400' : 'text-fg'
        )}
      >
        {value}
      </span>
      <span className="text-xs text-muted">{label}</span>
    </button>
  )

  return (
    <div className="flex flex-wrap gap-2">
      {link('in_work', 'в работе', totals.active, false, 'Показать задачи в работе')}
      {link('review', 'на проверке', totals.review, false, 'Показать задачи на проверке')}
      {link('queued', 'в очереди', totals.queued, false, 'Показать задачи в очереди')}
      {toggle('high', 'высокая загрузка', totals.high)}
      {toggle('overloaded', 'перегружено', totals.overloaded, true)}
      {link(
        'unassigned',
        'без исполнителя',
        totals.unassigned,
        true,
        'Открыть распределение задач'
      )}
      {link('overdue', 'просрочено', totals.overdue, true, 'Показать просроченные задачи')}
    </div>
  )
}
