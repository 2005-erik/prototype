import { createClient } from 'npm:@supabase/supabase-js@2'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// JSON-ответ с CORS-заголовками
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Клиент с service_role (обходит RLS — использовать только на сервере)
export function serviceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const ROLES = ['admin', 'manager', 'employee']

// Проверяет JWT вызывающего и что он — АКТИВНЫЙ администратор.
// service_role обходит RLS, поэтому проверка прав обязательна вручную.
export async function requireAdmin(req: Request) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return { error: json({ error: 'Не авторизован' }, 401) }
  }

  const svc = serviceClient()
  const token = authHeader.replace(/^Bearer\s+/i, '')

  const { data: userData, error: userErr } = await svc.auth.getUser(token)
  if (userErr || !userData?.user) {
    return { error: json({ error: 'Недействительный токен' }, 401) }
  }
  const callerId = userData.user.id

  const { data: profile, error: pErr } = await svc
    .from('profiles')
    .select('role, is_active')
    .eq('id', callerId)
    .single()

  if (pErr || !profile) {
    return { error: json({ error: 'Профиль не найден' }, 403) }
  }
  if (!profile.is_active) {
    return { error: json({ error: 'Учётная запись деактивирована' }, 403) }
  }
  if (profile.role !== 'admin') {
    return { error: json({ error: 'Требуются права администратора' }, 403) }
  }

  return { svc, callerId }
}
