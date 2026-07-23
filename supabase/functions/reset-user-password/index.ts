import { corsHeaders, json, requireAdmin, EMAIL_RE } from '../_shared/utils.ts'

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
  const email = String(body.email ?? '').trim().toLowerCase()

  if (!userId) return json({ error: 'Не указан пользователь' }, 400)
  if (!EMAIL_RE.test(email)) return json({ error: 'Некорректный email' }, 400)

  const siteUrl = Deno.env.get('SITE_URL') ?? ''

  // Письмо сброса пароля (через настроенный SMTP проекта)
  const { error: resetErr } = await svc.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/set-password`,
  })
  if (resetErr) {
    return json({ error: 'Не удалось отправить письмо сброса' }, 500)
  }

  // Требуем сменить пароль при следующем входе
  const { error: profErr } = await svc
    .from('profiles')
    .update({ must_change_password: true })
    .eq('id', userId)
  // Журнал административного действия
  await svc.from('admin_activity').insert({
    actor_id: callerId,
    action: 'password_reset',
    target_user_id: userId,
    details: { email },
  })

  if (profErr) {
    return json(
      { success: true, warning: 'Письмо отправлено, флаг не выставлен' },
      200
    )
  }

  return json({ success: true })
})
