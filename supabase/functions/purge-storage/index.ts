import { corsHeaders, json, serviceClient } from '../_shared/utils.ts'

// Разбор очереди storage_cleanup_queue: файлы удалённых задач убираются
// из бакета через Storage API. Вызывается приложением после удаления
// задачи/проекта и может дёргаться по расписанию — очередь идемпотентна.

const CHUNK = 100 // Storage API принимает пути пачками
const DEFAULT_LIMIT = 500
const MAX_ATTEMPTS = 5 // после этого строка не берётся в работу, но остаётся

// Любой активный пользователь: параметров, которыми можно управлять
// снаружи, у функции нет — она только дочищает уже удалённое.
async function requireActiveUser(req: Request) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return { error: json({ error: 'Не авторизован' }, 401) }

  const svc = serviceClient()
  const token = authHeader.replace(/^Bearer\s+/i, '')

  const { data: userData, error: userErr } = await svc.auth.getUser(token)
  if (userErr || !userData?.user) {
    return { error: json({ error: 'Недействительный токен' }, 401) }
  }

  const { data: profile } = await svc
    .from('profiles')
    .select('is_active')
    .eq('id', userData.user.id)
    .single()

  if (!profile?.is_active) {
    return { error: json({ error: 'Учётная запись деактивирована' }, 403) }
  }
  return { svc }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Метод не поддерживается' }, 405)
  }

  const auth = await requireActiveUser(req)
  if (auth.error) return auth.error
  const { svc } = auth

  let limit = DEFAULT_LIMIT
  try {
    const body = await req.json()
    const n = Number(body?.limit)
    if (Number.isFinite(n) && n > 0) limit = Math.min(Math.trunc(n), 2000)
  } catch {
    /* тело необязательно */
  }

  const { data: rows, error: qErr } = await svc
    .from('storage_cleanup_queue')
    .select('id, bucket, path, attempts')
    .lt('attempts', MAX_ATTEMPTS)
    .order('enqueued_at', { ascending: true })
    .limit(limit)

  if (qErr) return json({ error: 'Не удалось прочитать очередь' }, 500)
  if (!rows || rows.length === 0) {
    return json({ ok: true, removed: 0, failed: 0, remaining: 0 })
  }

  // Группируем по бакету: remove() работает в пределах одного бакета
  const byBucket = new Map<string, typeof rows>()
  for (const r of rows) {
    const arr = byBucket.get(r.bucket)
    if (arr) arr.push(r)
    else byBucket.set(r.bucket, [r])
  }

  let removed = 0
  const failedIds: number[] = []
  const errorsByBucket: Record<string, string> = {}

  for (const [bucket, list] of byBucket) {
    for (let i = 0; i < list.length; i += CHUNK) {
      const batch = list.slice(i, i + CHUNK)
      const { error: rmErr } = await svc.storage
        .from(bucket)
        .remove(batch.map((r) => r.path))

      if (rmErr) {
        // Пачка не удалась целиком — строки остаются в очереди
        errorsByBucket[bucket] = rmErr.message ?? 'Ошибка Storage'
        failedIds.push(...batch.map((r) => r.id))
        continue
      }

      // Storage считает удаление несуществующего файла успехом,
      // поэтому строку убираем в любом случае — файла в бакете уже нет
      const ids = batch.map((r) => r.id)
      const { error: delErr } = await svc
        .from('storage_cleanup_queue')
        .delete()
        .in('id', ids)

      if (delErr) {
        // Файлы удалены, но очередь не почистилась: следующий проход
        // повторит remove() вхолостую — это безопасно
        errorsByBucket[bucket] = delErr.message ?? 'Очередь не очищена'
      } else {
        removed += batch.length
      }
    }
  }

  // Неудачным попыткам поднимаем счётчик, чтобы битые пути не крутились вечно
  if (failedIds.length > 0) {
    for (const id of failedIds) {
      const row = rows.find((r) => r.id === id)
      await svc
        .from('storage_cleanup_queue')
        .update({
          attempts: (row?.attempts ?? 0) + 1,
          last_error: errorsByBucket[row?.bucket ?? ''] ?? 'Ошибка удаления',
        })
        .eq('id', id)
    }
  }

  const { count: remaining } = await svc
    .from('storage_cleanup_queue')
    .select('id', { count: 'exact', head: true })
    .lt('attempts', MAX_ATTEMPTS)

  return json({
    ok: true,
    removed,
    failed: failedIds.length,
    remaining: remaining ?? 0,
  })
})
