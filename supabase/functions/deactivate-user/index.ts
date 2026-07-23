import { corsHeaders, json, requireAdmin } from '../_shared/utils.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Метод не поддерживается' }, 405)
  }

  const auth = await requireAdmin(req)
  if (auth.error) return auth.error
  const { svc, callerId } = auth

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Некорректный запрос' }, 400)
  }

  const userId = String(body.user_id ?? '')
  // reassign_to: uuid → переназначить активные задачи; null → снять исполнителя
  const reassignTo = body.reassign_to ? String(body.reassign_to) : null

  if (!userId) return json({ error: 'Не указан пользователь' }, 400)
  if (userId === callerId) {
    return json({ error: 'Нельзя деактивировать самого себя' }, 400)
  }

  // Переназначение активных (незавершённых) задач деактивируемого
  const { data: moved, error: taskErr } = await svc
    .from('tasks')
    .update({ assignee_id: reassignTo })
    .eq('assignee_id', userId)
    .is('completed_at', null)
    .select('id')
  if (taskErr) {
    return json({ error: 'Не удалось переназначить задачи' }, 500)
  }
  const reassigned = moved?.length ?? 0

  // Деактивация. update запускает A1-триггер trg_revoke_sessions
  // (delete auth.sessions), а RLS-гейт is_active_user() режет доступ.
  const { error: profErr } = await svc
    .from('profiles')
    .update({ is_active: false, deactivated_at: new Date().toISOString() })
    .eq('id', userId)
  if (profErr) {
    return json({ error: 'Не удалось деактивировать пользователя' }, 500)
  }

  // Явный отзыв сессий (официальный путь; A1-триггер уже снял их — defense-in-depth)
  await svc.auth.admin.signOut(userId, 'global').catch(() => {})

  // Пользователь НЕ удаляется — задачи, история и активность сохраняются.
  return json({ success: true, reassigned })
})
