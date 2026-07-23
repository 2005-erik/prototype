import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

// Вызов Edge Function с извлечением понятного сообщения об ошибке
async function invokeFn(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) {
    let msg = error.message ?? 'Ошибка сервера'
    try {
      const ctx = error.context
      if (ctx && typeof ctx.json === 'function') {
        const j = await ctx.json()
        if (j?.error) msg = j.error
      }
    } catch {
      /* оставляем error.message */
    }
    return { error: msg }
  }
  if (data?.error) return { error: data.error }
  return { data }
}

// ---------------------------------------------------------------------
// useUserAdmin — данные и операции управления пользователями (только admin).
// ---------------------------------------------------------------------
export function useUserAdmin() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const mountedRef = useRef(true)

  const fetchUsers = useCallback(async () => {
    try {
      const { data, error: err } = await invokeFn('list-users', {})
      if (err) throw new Error(err)
      if (mountedRef.current) {
        setUsers(data?.users ?? [])
        setError(null)
      }
    } catch (err) {
      if (mountedRef.current) setError(err.message ?? 'Не удалось загрузить пользователей')
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    fetchUsers()
    return () => {
      mountedRef.current = false
    }
  }, [fetchUsers])

  // ---- Операции ----

  // Приглашение (Edge Function)
  const inviteUser = useCallback(
    async (payload) => {
      const res = await invokeFn('invite-user', payload)
      if (!res.error) await fetchUsers()
      return res
    },
    [fetchUsers]
  )

  // Деактивация с переназначением задач (Edge Function)
  const deactivateUser = useCallback(
    async (userId, reassignTo) => {
      const res = await invokeFn('deactivate-user', {
        user_id: userId,
        reassign_to: reassignTo ?? null,
      })
      if (!res.error) await fetchUsers()
      return res
    },
    [fetchUsers]
  )

  // Сброс пароля (Edge Function)
  const resetPassword = useCallback(async (userId, email) => {
    return invokeFn('reset-user-password', { user_id: userId, email })
  }, [])

  // Активация — прямой апдейт (RLS: admin может обновлять profiles)
  const activateUser = useCallback(
    async (userId) => {
      try {
        const { error: err } = await supabase
          .from('profiles')
          .update({ is_active: true, deactivated_at: null })
          .eq('id', userId)
        if (err) throw err
        await fetchUsers()
        return { error: null }
      } catch (err) {
        return { error: err.message ?? 'Не удалось активировать' }
      }
    },
    [fetchUsers]
  )

  // Обновление профиля (роль/ФИО/должность/отдел) — прямой апдейт
  const updateUser = useCallback(
    async (userId, patch) => {
      try {
        const { error: err } = await supabase
          .from('profiles')
          .update(patch)
          .eq('id', userId)
        if (err) throw err
        await fetchUsers()
        return { error: null }
      } catch (err) {
        return { error: err.message ?? 'Не удалось сохранить' }
      }
    },
    [fetchUsers]
  )

  // Синхронизация проектов пользователя (добавить/удалить participation)
  const setUserProjects = useCallback(
    async (userId, projectIds) => {
      try {
        const target = new Set(projectIds)
        const { data: current, error: cErr } = await supabase
          .from('project_members')
          .select('project_id')
          .eq('user_id', userId)
        if (cErr) throw cErr
        const currentSet = new Set((current ?? []).map((m) => m.project_id))

        const toAdd = [...target].filter((id) => !currentSet.has(id))
        const toRemove = [...currentSet].filter((id) => !target.has(id))

        if (toAdd.length) {
          const rows = toAdd.map((pid) => ({
            project_id: pid,
            user_id: userId,
            role: 'member',
          }))
          const { error: aErr } = await supabase
            .from('project_members')
            .upsert(rows, { onConflict: 'project_id,user_id' })
          if (aErr) throw aErr
        }
        for (const pid of toRemove) {
          const { error: rErr } = await supabase
            .from('project_members')
            .delete()
            .eq('project_id', pid)
            .eq('user_id', userId)
          if (rErr) throw rErr
        }
        await fetchUsers()
        return { error: null }
      } catch (err) {
        return { error: err.message ?? 'Не удалось обновить проекты' }
      }
    },
    [fetchUsers]
  )

  // Логирование клиентского действия администратора (RPC, SECURITY DEFINER)
  const logAdminAction = useCallback(async (action, targetId, details) => {
    try {
      await supabase.rpc('log_admin_action', {
        p_action: action,
        p_target: targetId ?? null,
        p_details: details ?? null,
      })
    } catch {
      /* логирование не должно ломать действие */
    }
  }, [])

  // Число активных (незавершённых) задач пользователя — для диалога деактивации
  const countActiveTasks = useCallback(async (userId) => {
    const { count } = await supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('assignee_id', userId)
      .is('completed_at', null)
    return count ?? 0
  }, [])

  return {
    users,
    loading,
    error,
    refetch: fetchUsers,
    inviteUser,
    deactivateUser,
    resetPassword,
    activateUser,
    updateUser,
    setUserProjects,
    countActiveTasks,
    logAdminAction,
  }
}
