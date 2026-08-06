import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { purgeStorageSoon } from '../lib/storageCleanup'
import { DEFAULT_WORK_LIMIT, loadStateFor } from '../lib/constants'

// ---------------------------------------------------------------------
// useProjects — список проектов текущего пользователя
// (RLS уже ограничивает выборку проектами, где он участник)
// ---------------------------------------------------------------------
export function useProjects({ includeArchived = false } = {}) {
  const { user } = useAuth()
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const mountedRef = useRef(true)

  const fetchProjects = useCallback(async () => {
    try {
      let query = supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false })

      if (!includeArchived) query = query.eq('is_archived', false)

      const { data, error: err } = await query

      if (err) throw err
      if (mountedRef.current) {
        setProjects(data ?? [])
        setError(null)
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message ?? 'Не удалось загрузить проекты')
      }
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [includeArchived])

  useEffect(() => {
    mountedRef.current = true
    fetchProjects()
    return () => {
      mountedRef.current = false
    }
  }, [fetchProjects])

  // Создание проекта. Триггер в БД добавит статусы по умолчанию
  // и запишет владельца в участники.
  const createProject = useCallback(
    async (name, description, color) => {
      try {
        const { data, error: err } = await supabase
          .from('projects')
          .insert({
            name,
            description: description ?? null,
            color: color ?? undefined,
            owner_id: user?.id ?? null,
          })
          .select()
          .single()

        if (err) throw err
        await fetchProjects()
        return { data, error: null }
      } catch (err) {
        const message = err.message ?? 'Не удалось создать проект'
        if (mountedRef.current) setError(message)
        return { data: null, error: message }
      }
    },
    [user, fetchProjects]
  )

  const updateProject = useCallback(
    async (id, data) => {
      try {
        const { data: updated, error: err } = await supabase
          .from('projects')
          .update(data)
          .eq('id', id)
          .select()
          .single()

        if (err) throw err
        await fetchProjects()
        return { data: updated, error: null }
      } catch (err) {
        const message = err.message ?? 'Не удалось обновить проект'
        if (mountedRef.current) setError(message)
        return { data: null, error: message }
      }
    },
    [fetchProjects]
  )

  const archiveProject = useCallback(
    async (id) => {
      try {
        const { error: err } = await supabase
          .from('projects')
          .update({ is_archived: true })
          .eq('id', id)

        if (err) throw err
        await fetchProjects()
        return { error: null }
      } catch (err) {
        const message = err.message ?? 'Не удалось архивировать проект'
        if (mountedRef.current) setError(message)
        return { error: message }
      }
    },
    [fetchProjects]
  )

  // Удаление проекта (каскад в БД снимает задачи/статусы/участников)
  const deleteProject = useCallback(
    async (id) => {
      try {
        const { error: err } = await supabase
          .from('projects')
          .delete()
          .eq('id', id)

        if (err) throw err
        // Вложения всех задач проекта — из Storage вдогонку
        purgeStorageSoon()
        await fetchProjects()
        return { error: null }
      } catch (err) {
        const message = err.message ?? 'Не удалось удалить проект'
        if (mountedRef.current) setError(message)
        return { error: message }
      }
    },
    [fetchProjects]
  )

  // Заменить автосозданные статусы своими (для кастомного набора при создании).
  // statuses — массив { name, color }; порядок = position; первый — стартовый,
  // последний — финальный.
  const replaceStatuses = useCallback(async (projectId, statuses) => {
    try {
      const clean = statuses
        .map((s) => ({ name: s.name?.trim(), color: s.color }))
        .filter((s) => s.name)
      if (clean.length === 0) return { error: null }

      const del = await supabase
        .from('statuses')
        .delete()
        .eq('project_id', projectId)
      if (del.error) throw del.error

      const rows = clean.map((s, i) => ({
        project_id: projectId,
        name: s.name,
        code: `custom_${i + 1}`,
        color: s.color ?? null,
        position: i + 1,
        is_initial: i === 0,
        is_final: i === clean.length - 1,
      }))
      const ins = await supabase.from('statuses').insert(rows)
      if (ins.error) throw ins.error

      return { error: null }
    } catch (err) {
      return { error: err.message ?? 'Не удалось задать статусы' }
    }
  }, [])

  return {
    projects,
    loading,
    error,
    createProject,
    updateProject,
    archiveProject,
    deleteProject,
    replaceStatuses,
    refetch: fetchProjects,
  }
}

// ---------------------------------------------------------------------
// useProject — один проект + его статусы + участники с профилями
// ---------------------------------------------------------------------
export function useProject(projectId) {
  const [project, setProject] = useState(null)
  const [statuses, setStatuses] = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const mountedRef = useRef(true)

  const fetchProject = useCallback(async () => {
    if (!projectId) {
      if (mountedRef.current) {
        setProject(null)
        setStatuses([])
        setMembers([])
        setLoading(false)
      }
      return
    }

    if (mountedRef.current) setLoading(true)
    try {
      const [proj, sts, mbrs] = await Promise.all([
        supabase.from('projects').select('*').eq('id', projectId).single(),
        supabase
          .from('statuses')
          .select('*')
          .eq('project_id', projectId)
          .order('position', { ascending: true }),
        supabase
          .from('project_members')
          .select('*, profiles(*)')
          .eq('project_id', projectId),
      ])

      if (proj.error) throw proj.error
      if (sts.error) throw sts.error
      if (mbrs.error) throw mbrs.error

      if (mountedRef.current) {
        setProject(proj.data)
        setStatuses(sts.data ?? [])
        setMembers(mbrs.data ?? [])
        setError(null)
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message ?? 'Не удалось загрузить проект')
      }
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    mountedRef.current = true
    fetchProject()
    return () => {
      mountedRef.current = false
    }
  }, [fetchProject])

  return {
    project,
    statuses,
    members,
    loading,
    error,
    refetch: fetchProject,
  }
}

// ---------------------------------------------------------------------
// useWorkload — загрузка сотрудников по проекту (из employee_workload).
// Возвращает map: user_id → строка загрузки.
// ---------------------------------------------------------------------
export function useWorkload(projectId) {
  const [workload, setWorkload] = useState({})
  const [loading, setLoading] = useState(true)
  const mountedRef = useRef(true)

  const fetchWorkload = useCallback(async () => {
    if (!projectId) {
      if (mountedRef.current) {
        setWorkload({})
        setLoading(false)
      }
      return
    }
    try {
      const { data, error: err } = await supabase
        .from('employee_workload')
        .select('*')
        .eq('project_id', projectId)

      if (err) throw err
      const map = {}
      for (const row of data ?? []) map[row.user_id] = row
      if (mountedRef.current) setWorkload(map)
    } catch {
      if (mountedRef.current) setWorkload({})
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    mountedRef.current = true
    fetchWorkload()
    return () => {
      mountedRef.current = false
    }
  }, [fetchWorkload])

  return { workload, loading, refetch: fetchWorkload }
}

// ---------------------------------------------------------------------
// useProjectsOverview — метрики задач (одним запросом) + участники
// для набора проектов. Возвращает maps по project_id.
// ---------------------------------------------------------------------
export function useProjectsOverview(projectIds) {
  const [metrics, setMetrics] = useState({})
  const [members, setMembers] = useState({})
  const [loading, setLoading] = useState(true)
  const mountedRef = useRef(true)

  // стабильный ключ для зависимостей
  const idsKey = (projectIds ?? []).slice().sort().join(',')

  const fetchOverview = useCallback(async () => {
    const ids = idsKey ? idsKey.split(',') : []
    if (ids.length === 0) {
      if (mountedRef.current) {
        setMetrics({})
        setMembers({})
        setLoading(false)
      }
      return
    }

    try {
      // Метрики — один запрос по всем проектам
      const [tasksRes, membersRes] = await Promise.all([
        supabase
          .from('tasks_enriched')
          .select('project_id, completed_at, deadline_state')
          .in('project_id', ids),
        supabase
          .from('project_members')
          .select('project_id, role, profiles(id, full_name, avatar_url)')
          .in('project_id', ids),
      ])

      if (tasksRes.error) throw tasksRes.error
      if (membersRes.error) throw membersRes.error

      const m = {}
      for (const id of ids) m[id] = { total: 0, overdue: 0, completed: 0 }
      for (const row of tasksRes.data ?? []) {
        const bucket = m[row.project_id]
        if (!bucket) continue
        bucket.total += 1
        if (row.completed_at) bucket.completed += 1
        if (row.deadline_state === 'overdue') bucket.overdue += 1
      }

      const mem = {}
      for (const id of ids) mem[id] = []
      for (const row of membersRes.data ?? []) {
        if (!mem[row.project_id]) mem[row.project_id] = []
        mem[row.project_id].push(row)
      }

      if (mountedRef.current) {
        setMetrics(m)
        setMembers(mem)
      }
    } catch {
      if (mountedRef.current) {
        setMetrics({})
        setMembers({})
      }
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [idsKey])

  useEffect(() => {
    mountedRef.current = true
    setLoading(true)
    fetchOverview()
    return () => {
      mountedRef.current = false
    }
  }, [fetchOverview])

  return { metrics, members, loading, refetch: fetchOverview }
}

// ---------------------------------------------------------------------
// useProjectStatusesMap — статусы для набора проектов одним запросом.
// Возвращает map: project_id → массив статусов (по position).
// ---------------------------------------------------------------------
export function useProjectStatusesMap(projectIds) {
  const [statusesByProject, setStatusesByProject] = useState({})
  const mountedRef = useRef(true)
  const idsKey = (projectIds ?? []).slice().sort().join(',')

  useEffect(() => {
    mountedRef.current = true
    const ids = idsKey ? idsKey.split(',') : []
    if (ids.length === 0) {
      setStatusesByProject({})
      return () => {
        mountedRef.current = false
      }
    }

    const run = async () => {
      try {
        const { data, error } = await supabase
          .from('statuses')
          .select('*')
          .in('project_id', ids)
          .order('position', { ascending: true })
        if (error) throw error
        const map = {}
        for (const s of data ?? []) {
          if (!map[s.project_id]) map[s.project_id] = []
          map[s.project_id].push(s)
        }
        if (mountedRef.current) setStatusesByProject(map)
      } catch {
        if (mountedRef.current) setStatusesByProject({})
      }
    }
    run()

    return () => {
      mountedRef.current = false
    }
  }, [idsKey])

  return statusesByProject
}

// Состояние личной загрузки по проценту


// ---------------------------------------------------------------------
// usePersonalWorkload — суммарная загрузка текущего пользователя
// по всем проектам (из employee_workload). Realtime по своим задачам.
// ---------------------------------------------------------------------
export function usePersonalWorkload() {
  const { user, profile } = useAuth()
  const userId = user?.id ?? null
  const max = profile?.work_limit ?? DEFAULT_WORK_LIMIT

  const [totals, setTotals] = useState({ active: 0, queued: 0, overdue: 0 })
  const mountedRef = useRef(true)

  const fetchWorkload = useCallback(async () => {
    if (!userId) return
    try {
      const { data, error } = await supabase
        .from('employee_workload')
        .select('active_tasks, queued_tasks, overdue_tasks')
        .eq('user_id', userId)
      if (error) throw error
      let active = 0
      let queued = 0
      let overdue = 0
      for (const r of data ?? []) {
        active += r.active_tasks ?? 0
        queued += r.queued_tasks ?? 0
        overdue += r.overdue_tasks ?? 0
      }
      if (mountedRef.current) setTotals({ active, queued, overdue })
    } catch {
      /* тихо игнорируем — виджет не критичен */
    }
  }, [userId])

  useEffect(() => {
    mountedRef.current = true
    fetchWorkload()
    if (!userId) return () => (mountedRef.current = false)

    const channel = supabase
      .channel(`personal-workload:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `assignee_id=eq.${userId}`,
        },
        () => fetchWorkload()
      )
      .subscribe()

    return () => {
      mountedRef.current = false
      supabase.removeChannel(channel)
    }
  }, [userId, fetchWorkload])

  const percent = max > 0 ? Math.round((totals.active * 100) / max) : 0
  const loadState = loadStateFor(percent, max)

  return {
    active: totals.active,
    queued: totals.queued,
    overdue: totals.overdue,
    max,
    percent,
    loadState,
  }
}

// ---------------------------------------------------------------------
// useManagedProjectMembers — участники проекта, но только если текущий
// пользователь может ими управлять (admin, либо owner/manager проекта).
// Иначе возвращает пустой массив (смена исполнителя недоступна).
// ---------------------------------------------------------------------
export function useManagedProjectMembers(projectId) {
  const { user, isAdmin } = useAuth()
  const [members, setMembers] = useState([])
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    if (!projectId) {
      setMembers([])
      return () => {
        mountedRef.current = false
      }
    }

    const run = async () => {
      try {
        const { data, error } = await supabase
          .from('project_members')
          .select('*, profiles(*)')
          .eq('project_id', projectId)
        if (error) throw error
        const rows = data ?? []
        const myRole = rows.find((m) => m.user_id === user?.id)?.role
        const canManage =
          isAdmin || myRole === 'owner' || myRole === 'manager'
        if (mountedRef.current) setMembers(canManage ? rows : [])
      } catch {
        if (mountedRef.current) setMembers([])
      }
    }
    run()

    return () => {
      mountedRef.current = false
    }
  }, [projectId, user, isAdmin])

  return members
}
