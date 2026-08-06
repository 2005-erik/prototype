import { corsHeaders, json, requireAdmin } from '../_shared/utils.ts'

type Any = Record<string, unknown>

// Границы допустимых дат: Trello отдаёт даты строками, мусор в timestamptz
// пускать нельзя (упадёт вся транзакция импорта).
const MIN_TS = Date.UTC(1990, 0, 1)
const MAX_TS = Date.UTC(2100, 0, 1)

// ---------------------------------------------------------------------
// Приведение значений из Trello к безопасным для БД диапазонам.
// Ни на одно число из экспорта нельзя полагаться: pos приходит как
// 14073748437248 (большое дробное), остальные поля тоже произвольные.
// ---------------------------------------------------------------------

// Конечное число или null. Пустые значения отсеиваем до Number():
// Number(null) и Number('') дают 0, и элемент без pos уехал бы
// в начало списка вместо конца.
function trelloNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

// Сравнение по позиции Trello: null-ы в конец, порядок стабильный
function byPos(a: { pos: number | null }, b: { pos: number | null }): number {
  if (a.pos === null && b.pos === null) return 0
  if (a.pos === null) return 1
  if (b.pos === null) return -1
  return a.pos - b.pos
}

// Валидная ISO-дата в разумных границах или null
function safeTimestamp(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  const ms = typeof v === 'number' ? v : Date.parse(String(v))
  if (!Number.isFinite(ms) || ms < MIN_TS || ms > MAX_TS) return null
  return new Date(ms).toISOString()
}

// Дата создания карточки закодирована в первых 8 hex-символах её id
// (Trello/Mongo ObjectId: unix-время в секундах).
function cardCreatedAt(id: string): string | null {
  const secs = parseInt(String(id).substring(0, 8), 16)
  if (!Number.isFinite(secs) || secs <= 0) return null
  return safeTimestamp(secs * 1000)
}

// Проверка, что это похоже на экспорт доски Trello
function validateTrello(t: Any): string | null {
  if (!t || typeof t !== 'object') return 'Файл не является объектом JSON'
  if (typeof t.name !== 'string') return 'Нет поля name — это не экспорт доски Trello'
  if (!Array.isArray(t.lists)) return 'Нет массива lists — это не экспорт доски Trello'
  if (!Array.isArray(t.cards)) return 'Нет массива cards — это не экспорт доски Trello'
  return null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Метод не поддерживается' }, 405)
  }

  // Импорт создаёт задачи от имени админа — строгая проверка прав
  const auth = await requireAdmin(req)
  if (auth.error) return auth.error
  const { svc, callerId } = auth

  let body: Any
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Некорректный запрос' }, 400)
  }

  const trello = body.trello as Any
  const vErr = validateTrello(trello)
  if (vErr) return json({ error: vErr }, 400)

  const project = (body.project ?? {}) as Any
  if (project.mode !== 'new' && project.mode !== 'existing') {
    return json({ error: 'Не выбран проект назначения' }, 400)
  }
  const options = {
    import_archived: !!(body.options as Any)?.import_archived,
    import_comments: (body.options as Any)?.import_comments !== false,
    import_checklists: (body.options as Any)?.import_checklists !== false,
  }
  const listMap = Array.isArray(body.lists) ? (body.lists as Any[]) : []
  const memberMap = Array.isArray(body.members) ? (body.members as Any[]) : []

  const importId = crypto.randomUUID()

  // ---- Списки → статусы (нормализуем в формат RPC) ----
  // Позиция списка нужна только как порядок: raw pos из Trello в int-колонку
  // statuses.position не влезет, поэтому нумеруем 1..N.
  const listOrder = new Map<string, number>()
  ;(trello.lists as Any[])
    .map((l) => ({ id: String(l.id), pos: trelloNumber(l.pos) }))
    .sort(byPos)
    .forEach((l, i) => listOrder.set(l.id, i + 1))

  const mappedListIds = new Set(listMap.map((l) => String(l.trello_id)))
  const outLists = listMap.map((l) => {
    const base = {
      trello_id: String(l.trello_id),
      position: listOrder.get(String(l.trello_id)) ?? 0,
    }
    if (l.kind === 'status') return { ...base, status_id: l.value }
    if (l.kind === 'create') return { ...base, create_name: l.value }
    return { ...base, status_code: l.value }
  })

  const outMembers = memberMap.map((m) => ({
    trello_id: String(m.trello_id),
    profile_id: m.profile_id ?? null,
  }))

  // ---- Карточки → задачи (+ список пропущенных с причиной) ----
  const skipped: { name: string; reason: string }[] = []
  const importedCardIds = new Set<string>()
  const tasks: Any[] = []

  for (const c of trello.cards as Any[]) {
    const name = String(c.name ?? '')
    if (c.closed && !options.import_archived) {
      skipped.push({ name, reason: 'архивная карточка' })
      continue
    }
    if (!mappedListIds.has(String(c.idList))) {
      skipped.push({ name, reason: 'список не сопоставлен со статусом' })
      continue
    }

    // Описание + метки + вложения (файлы остаются в Trello)
    let desc = String(c.desc ?? '')
    const labels = ((c.labels as Any[]) ?? [])
      .map((l) => String(l.name ?? '').trim())
      .filter(Boolean)
    if (labels.length) desc += `\n\nМетки Trello: ${labels.join(', ')}`

    const atts = ((c.attachments as Any[]) ?? []).filter((a) => a.url)
    if (atts.length) {
      desc +=
        '\n\nВложения из Trello (файлы остались в Trello и требуют ручного переноса):'
      for (const a of atts) desc += `\n- ${a.name || a.url}: ${a.url}`
    }

    const idMembers = Array.isArray(c.idMembers) ? (c.idMembers as string[]) : []

    tasks.push({
      trello_card_id: String(c.id),
      trello_url: c.shortUrl ?? null,
      title: name,
      description: desc.trim() || null,
      list_trello_id: String(c.idList),
      due_date: safeTimestamp(c.due),
      due_complete: !!c.dueComplete,
      assignee_trello_id: idMembers.length ? idMembers[0] : null,
      // tasks.position — numeric, большие значения pos из Trello выдерживает,
      // поэтому пишем как есть (нормализация нужна только int-колонкам)
      position: trelloNumber(c.pos),
      archived: !!c.closed,
      created_at: cardCreatedAt(String(c.id)),
    })
    importedCardIds.add(String(c.id))
  }

  // ---- Чек-листы ----
  // checklist_items.position — integer, а Trello отдаёт pos как большое
  // дробное число (отсюда «integer out of range»). Значение не нужно:
  // сортируем пункты по исходному pos (чек-лист, затем пункт внутри него)
  // и пишем порядковый номер 1..N в пределах карточки.
  const checklists: Any[] = []
  if (options.import_checklists) {
    const itemsByCard = new Map<
      string,
      { listPos: number | null; pos: number | null; item: Any }[]
    >()

    for (const ch of ((trello.checklists as Any[]) ?? [])) {
      const cardId = String(ch.idCard)
      if (!importedCardIds.has(cardId)) continue
      const listPos = trelloNumber(ch.pos)
      for (const it of ((ch.checkItems as Any[]) ?? [])) {
        const entry = {
          listPos,
          pos: trelloNumber(it.pos),
          item: {
            trello_card_id: cardId,
            title: String(it.name ?? ''),
            is_done: it.state === 'complete',
            position: 0,
          } as Any,
        }
        const arr = itemsByCard.get(cardId)
        if (arr) arr.push(entry)
        else itemsByCard.set(cardId, [entry])
      }
    }

    for (const arr of itemsByCard.values()) {
      arr
        .sort((a, b) => byPos({ pos: a.pos }, { pos: b.pos }))
        .sort((a, b) => byPos({ pos: a.listPos }, { pos: b.listPos }))
        .forEach((e, i) => {
          e.item.position = i + 1
          checklists.push(e.item)
        })
    }
  }

  // ---- Комментарии (actions type=commentCard) ----
  const actions = ((trello.actions as Any[]) ?? [])
  const comments: Any[] = []
  if (options.import_comments) {
    for (const a of actions) {
      if (a.type !== 'commentCard') continue
      const dataObj = (a.data as Any) ?? {}
      const card = (dataObj.card as Any) ?? {}
      const cardId = card.id ? String(card.id) : ''
      if (!cardId || !importedCardIds.has(cardId)) continue
      const creator = (a.memberCreator as Any) ?? {}
      comments.push({
        trello_card_id: cardId,
        author_trello_id: a.idMemberCreator ?? creator.id ?? null,
        username: creator.username ?? null,
        text: dataObj.text ?? '',
        created_at: safeTimestamp(a.date),
      })
    }
  }

  // ---- Атомарный импорт в БД ----
  const { data, error } = await svc.rpc('import_trello', {
    p_payload: {
      actor_id: callerId,
      import_id: importId,
      project: {
        mode: project.mode,
        id: project.id ?? null,
        name: project.name ?? null,
        desc: project.desc ?? null,
      },
      options,
      lists: outLists,
      members: outMembers,
      tasks,
      checklists,
      comments,
    },
  })

  if (error) {
    return json({ error: error.message ?? 'Не удалось выполнить импорт' }, 500)
  }

  // Trello ограничивает экспорт 1000 последними действиями → часть
  // старых комментариев могла не попасть в файл
  const commentsTruncated = actions.length >= 1000

  // Задачи, пришедшие завершёнными (completed_at заполнен), на доске скрыты
  // фильтром «Показывать выполненные» — их число идёт в отчёт.
  const projectId = (data as Any)?.project_id as string | undefined
  const { count: completedCount } = await svc
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('trello_import_id', importId)
    .not('completed_at', 'is', null)

  let completedStatusName = 'Выполнено'
  if (completedCount && projectId) {
    const { data: finalStatus } = await svc
      .from('statuses')
      .select('name')
      .eq('project_id', projectId)
      .eq('is_final', true)
      .order('position')
      .limit(1)
    if (finalStatus?.[0]?.name) completedStatusName = String(finalStatus[0].name)
  }

  return json({
    ok: true,
    report: {
      ...data,
      board_name: String(trello.name ?? ''),
      tasks_completed: completedCount ?? 0,
      completed_status_name: completedStatusName,
      skipped,
      warnings: {
        attachments_manual: tasks.some(
          (t) => ((t.description as string) ?? '').includes('Вложения из Trello')
        ),
        comments_truncated: commentsTruncated,
      },
    },
  })
})
