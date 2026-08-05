import { corsHeaders, json, requireAdmin } from '../_shared/utils.ts'

// Дата создания карточки закодирована в первых 8 hex-символах её id
// (Trello/Mongo ObjectId: unix-время в секундах).
function cardCreatedAt(id: string): string | null {
  try {
    const secs = parseInt(String(id).substring(0, 8), 16)
    if (!Number.isFinite(secs) || secs <= 0) return null
    return new Date(secs * 1000).toISOString()
  } catch {
    return null
  }
}

type Any = Record<string, unknown>

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
  const listPos = new Map<string, number>()
  for (const l of trello.lists as Any[]) {
    listPos.set(String(l.id), Number(l.pos ?? 0))
  }
  const mappedListIds = new Set(listMap.map((l) => String(l.trello_id)))
  const outLists = listMap.map((l) => {
    const base = {
      trello_id: String(l.trello_id),
      position: listPos.get(String(l.trello_id)) ?? 0,
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
      due_date: c.due ?? null,
      due_complete: !!c.dueComplete,
      assignee_trello_id: idMembers.length ? idMembers[0] : null,
      position: c.pos ?? null,
      archived: !!c.closed,
      created_at: cardCreatedAt(String(c.id)),
    })
    importedCardIds.add(String(c.id))
  }

  // ---- Чек-листы ----
  const checklists: Any[] = []
  if (options.import_checklists) {
    for (const ch of ((trello.checklists as Any[]) ?? [])) {
      if (!importedCardIds.has(String(ch.idCard))) continue
      for (const it of ((ch.checkItems as Any[]) ?? [])) {
        checklists.push({
          trello_card_id: String(ch.idCard),
          title: String(it.name ?? ''),
          is_done: it.state === 'complete',
          position: it.pos ?? null,
        })
      }
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
        created_at: a.date ?? null,
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

  return json({
    ok: true,
    report: {
      ...data,
      board_name: String(trello.name ?? ''),
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
