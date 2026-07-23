import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

// ---------------------------------------------------------------------
// useProjectSettings — данные и мутации для страницы настроек проекта:
// проект, статусы, участники (с профилями), загрузка сотрудников.
// ---------------------------------------------------------------------
export function useProjectSettings(projectId) {
  const [project, setProject] = useState(null)
  const [statuses, setStatuses] = useState([])
  const [members, setMembers] = useState([])
  const [workload, setWorkload] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const mountedRef = useRef(true)

  const fetchAll = useCallback(async () => {
    if (!projectId) {
      if (mountedRef.current) setLoading(false)
      return
    }
    try {
      const [proj, sts, mbrs, wl] = await Promise.all([
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
        supabase.from('employee_workload').select('*').eq('project_id', projectId),
      ])

      if (proj.error) throw proj.error
      if (sts.error) throw sts.error
      if (mbrs.error) throw mbrs.error
      if (wl.error) throw wl.error

      const wlMap = {}
      for (const row of wl.data ?? []) wlMap[row.user_id] = row

      if (mountedRef.current) {
        setProject(proj.data)
        setStatuses(sts.data ?? [])
        setMembers(mbrs.data ?? [])
        setWorkload(wlMap)
        setError(null)
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message ?? 'Не удалось загрузить настройки проекта')
      }
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    mountedRef.current = true
    setLoading(true)
    fetchAll()
    return () => {
      mountedRef.current = false
    }
  }, [fetchAll])

  // ---- Проект ----
  const updateProject = useCallback(
    async (data) => {
      try {
        const { error: err } = await supabase
          .from('projects')
          .update(data)
          .eq('id', projectId)
        if (err) throw err
        await fetchAll()
        return { error: null }
      } catch (err) {
        return { error: err.message ?? 'Не удалось сохранить проект' }
      }
    },
    [projectId, fetchAll]
  )

  const deleteProject = useCallback(async () => {
    try {
      const { error: err } = await supabase
        .from('projects')
        .delete()
        .eq('id', projectId)
      if (err) throw err
      return { error: null }
    } catch (err) {
      return { error: err.message ?? 'Не удалось удалить проект' }
    }
  }, [projectId])

  // ---- Статусы ----
  const addStatus = useCallback(async () => {
    try {
      const nextPos =
        statuses.reduce((max, s) => Math.max(max, s.position ?? 0), 0) + 1
      const code = `custom_${crypto.randomUUID().slice(0, 8)}`
      const { error: err } = await supabase.from('statuses').insert({
        project_id: projectId,
        name: 'Новый статус',
        code,
        color: '#64748b',
        position: nextPos,
      })
      if (err) throw err
      await fetchAll()
      return { error: null }
    } catch (err) {
      return { error: err.message ?? 'Не удалось добавить статус' }
    }
  }, [projectId, statuses, fetchAll])

  const updateStatus = useCallback(
    async (id, patch) => {
      try {
        const { error: err } = await supabase
          .from('statuses')
          .update(patch)
          .eq('id', id)
        if (err) throw err
        await fetchAll()
        return { error: null }
      } catch (err) {
        return { error: err.message ?? 'Не удалось обновить статус' }
      }
    },
    [fetchAll]
  )

  // Удаление статуса запрещено, если в нём есть задачи
  const deleteStatus = useCallback(
    async (id) => {
      try {
        const { count, error: cErr } = await supabase
          .from('tasks')
          .select('id', { count: 'exact', head: true })
          .eq('status_id', id)
        if (cErr) throw cErr
        if ((count ?? 0) > 0) {
          return {
            error: `В статусе ${count} задач(и), сначала переместите их`,
            count,
          }
        }
        const { error: err } = await supabase
          .from('statuses')
          .delete()
          .eq('id', id)
        if (err) throw err
        await fetchAll()
        return { error: null }
      } catch (err) {
        return { error: err.message ?? 'Не удалось удалить статус' }
      }
    },
    [fetchAll]
  )

  // Массовое обновление позиций (после drag&drop)
  const reorderStatuses = useCallback(
    async (orderedIds) => {
      try {
        await Promise.all(
          orderedIds.map((id, i) =>
            supabase.from('statuses').update({ position: i + 1 }).eq('id', id)
          )
        )
        await fetchAll()
        return { error: null }
      } catch (err) {
        return { error: err.message ?? 'Не удалось изменить порядок' }
      }
    },
    [fetchAll]
  )

  // ---- Участники ----
  const addMember = useCallback(
    async (userId, role = 'member') => {
      try {
        const { error: err } = await supabase
          .from('project_members')
          .insert({ project_id: projectId, user_id: userId, role })
        if (err) throw err
        await fetchAll()
        return { error: null }
      } catch (err) {
        return { error: err.message ?? 'Не удалось добавить участника' }
      }
    },
    [projectId, fetchAll]
  )

  const updateMemberRole = useCallback(
    async (userId, role) => {
      try {
        const { error: err } = await supabase
          .from('project_members')
          .update({ role })
          .eq('project_id', projectId)
          .eq('user_id', userId)
        if (err) throw err
        await fetchAll()
        return { error: null }
      } catch (err) {
        return { error: err.message ?? 'Не удалось изменить роль' }
      }
    },
    [projectId, fetchAll]
  )

  const removeMember = useCallback(
    async (userId) => {
      try {
        const { error: err } = await supabase
          .from('project_members')
          .delete()
          .eq('project_id', projectId)
          .eq('user_id', userId)
        if (err) throw err
        await fetchAll()
        return { error: null }
      } catch (err) {
        return { error: err.message ?? 'Не удалось удалить участника' }
      }
    },
    [projectId, fetchAll]
  )

  // Активные пользователи, которых ещё нет в проекте
  const getAvailableProfiles = useCallback(async () => {
    try {
      const { data, error: err } = await supabase
        .from('profiles')
        .select('id, full_name, position, avatar_url')
        .eq('is_active', true)
        .order('full_name', { ascending: true })
      if (err) throw err
      const memberIds = new Set(members.map((m) => m.user_id))
      return { data: (data ?? []).filter((p) => !memberIds.has(p.id)), error: null }
    } catch (err) {
      return { data: [], error: err.message ?? 'Не удалось загрузить список' }
    }
  }, [members])

  return {
    project,
    statuses,
    members,
    workload,
    loading,
    error,
    refetch: fetchAll,
    updateProject,
    deleteProject,
    addStatus,
    updateStatus,
    deleteStatus,
    reorderStatuses,
    addMember,
    updateMemberRole,
    removeMember,
    getAvailableProfiles,
  }
}
