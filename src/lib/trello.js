// Разбор и анализ экспорта доски Trello (JSON).

// Разбор файла: возвращает объект доски либо бросает понятную ошибку.
export function parseTrello(text) {
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('Файл не является корректным JSON')
  }
  if (!data || typeof data !== 'object') {
    throw new Error('Файл не является объектом JSON')
  }
  if (typeof data.name !== 'string') {
    throw new Error('Нет поля name — это не экспорт доски Trello')
  }
  if (!Array.isArray(data.lists)) {
    throw new Error('Нет массива lists — это не экспорт доски Trello')
  }
  if (!Array.isArray(data.cards)) {
    throw new Error('Нет массива cards — это не экспорт доски Trello')
  }
  return data
}

// Списки, отсортированные по pos
export function sortedLists(data) {
  return [...(data.lists ?? [])].sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0))
}

// Число комментариев (actions type=commentCard)
function countComments(data) {
  return (data.actions ?? []).filter((a) => a.type === 'commentCard').length
}

// Сводка для шага 1
export function summarize(data) {
  const cards = data.cards ?? []
  return {
    boardName: data.name ?? '',
    boardDesc: data.desc ?? '',
    lists: (data.lists ?? []).length,
    cardsActive: cards.filter((c) => !c.closed).length,
    cardsArchived: cards.filter((c) => c.closed).length,
    members: (data.members ?? []).length,
    checklists: (data.checklists ?? []).length,
    comments: countComments(data),
    actionsTotal: (data.actions ?? []).length,
  }
}

// Эвристика: имя списка Trello → код системного статуса
export function suggestStatusCode(listName) {
  const n = String(listName ?? '').toLowerCase()
  if (/готово|done|complete|выполнено|завершен/.test(n)) return 'done'
  if (/в работе|doing|in\s*progress|в процессе/.test(n)) return 'in_progress'
  if (/проверк|review|на проверке/.test(n)) return 'review'
  if (/доработк|rework/.test(n)) return 'rework'
  return 'new'
}
