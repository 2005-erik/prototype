import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

// ---------------------------------------------------------------------
// useProjects — список проектов текущего пользователя
// (RLS уже ограничивает выборку проектами, где он участник)
// ---------------------------------------------------------------------
export function useProjects() {
  const { user } = useAuth()
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const mountedRef = useRef(true)

  const fetchProjects = useCallback(async () => {
    try {
      const { data, error: err } = await supabase
        .from('projects')
        .select('*')
        .eq('is_archived', false)
        .order('created_at', { ascending: false })

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
  }, [])

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

  return {
    projects,
    loading,
    error,
    createProject,
    updateProject,
    archiveProject,
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
