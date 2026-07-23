import {
  corsHeaders,
  json,
  requireAdmin,
  EMAIL_RE,
  ROLES,
} from '../_shared/utils.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Метод не поддерживается' }, 405)
  }

  // Проверка прав администратора
  const auth = await requireAdmin(req)
  if (auth.error) return auth.error
  const { svc, callerId } = auth

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Некорректный запрос' }, 400)
  }

  const email = String(body.email ?? '').trim().toLowerCase()
  const fullName = String(body.full_name ?? '').trim()
  const position = body.position ? String(body.position) : null
  const department = body.department ? String(body.department) : null
  const role = String(body.role ?? '')
  const projectIds = Array.isArray(body.project_ids)
    ? (body.project_ids as unknown[]).map(String).filter(Boolean)
    : []

  // Валидация
  if (!EMAIL_RE.test(email)) return json({ error: 'Некорректный email' }, 400)
  if (!fullName) return json({ error: 'Укажите ФИО' }, 400)
  if (!ROLES.includes(role)) return json({ error: 'Недопустимая роль' }, 400)

  const siteUrl = Deno.env.get('SITE_URL') ?? ''

  // Приглашение (создаёт auth.users; триггер handle_new_user создаёт profiles)
  const { data: invited, error: invErr } =
    await svc.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName },
      redirectTo: `${siteUrl}/set-password`,
    })

  if (invErr) {
    const msg = String(invErr.message ?? '')
    if (
      invErr.status === 422 ||
      /already been registered|already exists|email.*exists/i.test(msg)
    ) {
      return json({ error: 'Пользователь уже зарегистрирован' }, 409)
    }
    return json({ error: 'Не удалось пригласить пользователя' }, 500)
  }

  const userId = invited.user.id

  // Дополняем профиль (upsert на случай гонки с триггером)
  const { error: upErr } = await svc.from('profiles').upsert(
    {
      id: userId,
      full_name: fullName,
      position,
      department,
      role,
      invited_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  )
  if (upErr) {
    return json(
      { error: 'Приглашение отправлено, но профиль не обновлён' },
      500
    )
  }

  // Добавляем в проекты как участника
  if (projectIds.length > 0) {
    const rows = projectIds.map((pid) => ({
      project_id: pid,
      user_id: userId,
      role: 'member',
    }))
    const { error: pmErr } = await svc
      .from('project_members')
      .upsert(rows, { onConflict: 'project_id,user_id' })
    if (pmErr) {
      return json(
        { success: true, user_id: userId, warning: 'Не добавлен в часть проектов' },
        200
      )
    }
  }

  // Журнал административного действия
  await svc.from('admin_activity').insert({
    actor_id: callerId,
    action: 'user_invited',
    target_user_id: userId,
    details: { email, role },
  })

  return json({ success: true, user_id: userId })
})
