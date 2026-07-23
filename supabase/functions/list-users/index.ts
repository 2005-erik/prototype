import { corsHeaders, json, requireAdmin } from '../_shared/utils.ts'

// Список пользователей с email (email не хранится в profiles и недоступен
// клиенту — отдаём только администратору через service_role).
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST' && req.method !== 'GET') {
    return json({ error: 'Метод не поддерживается' }, 405)
  }

  const auth = await requireAdmin(req)
  if (auth.error) return auth.error
  const { svc } = auth

  // Профили
  const { data: profiles, error: pErr } = await svc
    .from('profiles')
    .select('*')
    .order('full_name', { ascending: true })
  if (pErr) return json({ error: 'Не удалось загрузить профили' }, 500)

  // Email по id (постранично через admin API)
  const emailById: Record<string, string | null> = {}
  let page = 1
  for (;;) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) break
    for (const u of data.users) emailById[u.id] = u.email ?? null
    if (data.users.length < 1000) break
    page++
  }

  // Участие в проектах
  const { data: members } = await svc
    .from('project_members')
    .select('user_id, project_id, projects(name)')
  const projectsByUser: Record<string, { id: string; name: string }[]> = {}
  for (const m of members ?? []) {
    ;(projectsByUser[m.user_id] ??= []).push({
      id: m.project_id,
      // deno-lint-ignore no-explicit-any
      name: (m as any).projects?.name ?? '',
    })
  }

  const users = (profiles ?? []).map((p) => ({
    ...p,
    email: emailById[p.id] ?? null,
    projects: projectsByUser[p.id] ?? [],
  }))

  return json({ users })
})
