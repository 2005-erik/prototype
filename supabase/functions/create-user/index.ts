import {
  corsHeaders,
  json,
  requireAdmin,
  EMAIL_RE,
  ROLES,
} from '../_shared/utils.ts'

// Создание учётной записи администратором с паролем.
// В отличие от invite-user, письмо-приглашение не отправляется —
// логин и пароль передаёт сотруднику сам администратор.
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Метод не поддерживается' }, 405)
  }

  // Критично: функция создаёт пользователей — только активный admin.
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
  const password = String(body.password ?? '')
  const fullName = String(body.full_name ?? '').trim()
  const position = body.position ? String(body.position) : null
  const department = body.department ? String(body.department) : null
  const role = String(body.role ?? '')
  const projectIds = Array.isArray(body.project_ids)
    ? (body.project_ids as unknown[]).map(String).filter(Boolean)
    : []

  // Серверная валидация (клиентской доверять нельзя)
  if (!EMAIL_RE.test(email)) return json({ error: 'Некорректный email' }, 400)
  if (password.length < 10)
    return json({ error: 'Пароль минимум 10 символов' }, 400)
  if (!fullName) return json({ error: 'Укажите ФИО' }, 400)
  if (!ROLES.includes(role)) return json({ error: 'Недопустимая роль' }, 400)
  // manager/employee вне проектов не видит ни доски, ни задач — такие
  // учётки бесполезны, поэтому минимум один проект обязателен.
  // Администратору проекты не нужны: у него доступ ко всем.
  if (role !== 'admin' && projectIds.length === 0)
    return json({ error: 'Выберите хотя бы один проект для сотрудника' }, 400)

  // Создание учётки. email_confirm: true — иначе учётка повиснет
  // неподтверждённой и вход будет невозможен.
  const { data: created, error: createErr } =
    await svc.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, position, department },
    })

  if (createErr) {
    const msg = String(createErr.message ?? '')
    if (
      createErr.status === 422 ||
      /already been registered|already exists|already registered|email.*exists/i.test(
        msg
      )
    ) {
      return json(
        { error: 'Пользователь с таким email уже существует' },
        409
      )
    }
    return json({ error: 'Не удалось создать пользователя' }, 500)
  }

  const userId = created.user.id

  // Откат: удаляем созданного пользователя, чтобы не осталось сирот
  const rollback = async () => {
    await svc.auth.admin.deleteUser(userId).catch(() => {})
  }

  // Дополняем профиль (upsert на случай гонки с триггером handle_new_user)
  const { error: upErr } = await svc.from('profiles').upsert(
    {
      id: userId,
      full_name: fullName,
      position,
      department,
      role,
      must_change_password: true,
    },
    { onConflict: 'id' }
  )
  if (upErr) {
    await rollback()
    return json({ error: 'Не удалось создать профиль пользователя' }, 500)
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
      await rollback()
      return json({ error: 'Не удалось добавить пользователя в проекты' }, 500)
    }
  }

  // Журнал административного действия
  await svc.from('admin_activity').insert({
    actor_id: callerId,
    action: 'user_created',
    target_user_id: userId,
    details: { email, role },
  })

  // Пароль обратно НЕ возвращаем — он и так есть на клиенте
  return json({ ok: true, email })
})
