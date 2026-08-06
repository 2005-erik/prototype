import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { purgeStorageSoon } from '../lib/storageCleanup'
import { sanitizeSearchTerm } from '../lib/utils'

// ---------------------------------------------------------------------
// useTasks — задачи проекта из представления tasks_enriched
// filters: { assigneeId, priority, deadlineState, search, showCompleted }
// Realtime: перезагрузка при любых изменениях tasks этого проекта.
// ---------------------------------------------------------------------
export function useTasks(projectId, filters = {}) {
  const { user } = useAuth()
  const { assigneeId, priority, deadlineState, search, showCompleted } = filters

  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const mountedRef = useRef(true)

  const fetchTasks = useCallback(async () => {
    if (!projectId) {
      if (mountedRef.current) {
        setTasks([])
        setLoading(false)
      }
      return
    }

    try {
      let query = supabase
        .from('tasks_enriched')
        .select('*')
        .eq('project_id', projectId)

      if (assigneeId) query = query.eq('assignee_id', assigneeId)
      if (priority) query = query.eq('priority', priority)
      if (deadlineState) query = query.eq('deadline_state', deadlineState)
      if (!showCompleted) query = query.is('completed_at', null)

      const safe = sanitizeSearchTerm(search)
      if (safe) {
        query = query.or(`title.ilike.%${safe}%,description.ilike.%${safe}%`)
      }

      query = query
        .order('position', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true })

      const { data, error: err } = await query
      if (err) throw err

      if (mountedRef.current) {
        setTasks(data ?? [])
        setError(null)
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message ?? 'Не удалось загрузить задачи')
      }
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [projectId, assigneeId, priority, deadlineState, search, showCompleted])

  // Первичная загрузка + перезагрузка при смене фильтров
  useEffect(() => {
    mountedRef.current = true
    setLoading(true)
    fetchTasks()
    return () => {
      mountedRef.current = false
    }
  }, [fetchTasks])

  // Realtime-подписка на задачи проекта
  useEffect(() => {
    if (!projectId) return

    const channel = supabase
      .channel(`tasks:${projectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `project_id=eq.${projectId}`,
        },
        () => fetchTasks()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [projectId, fetchTasks])

  // ---- Мутации ----

  // Создание задачи (project_id и author_id подставляются по умолчанию).
  // Необязательный checklist — массив строк, создаётся вместе с задачей.
  const createTask = useCallback(
    async (data, checklist = []) => {
      try {
        const payload = {
          project_id: projectId,
          author_id: user?.id ?? null,
          ...data,
        }
        const { data: created, error: err } = await supabase
          .from('tasks')
          .insert(payload)
          .select()
          .single()

        if (err) throw err

        // Пункты чек-листа, если переданы
        const items = checklist
          .map((text) => text.trim())
          .filter(Boolean)
          .map((text, i) => ({ task_id: created.id, text, position: i + 1 }))

        if (items.length > 0) {
          const { error: clErr } = await supabase
            .from('checklist_items')
            .insert(items)
          if (clErr) throw clErr
        }

        await fetchTasks()
        return { data: created, error: null }
      } catch (err) {
        const message = err.message ?? 'Не удалось создать задачу'
        if (mountedRef.current) setError(message)
        return { data: null, error: message }
      }
    },
    [projectId, user, fetchTasks]
  )

  // Обновление задачи (для менеджера — любые поля)
  const updateTask = useCallback(
    async (id, data) => {
      try {
        const { data: updated, error: err } = await supabase
          .from('tasks')
          .update(data)
          .eq('id', id)
          .select()
          .single()

        if (err) throw err
        await fetchTasks()
        return { data: updated, error: null }
      } catch (err) {
        const message = err.message ?? 'Не удалось обновить задачу'
        if (mountedRef.current) setError(message)
        return { data: null, error: message }
      }
    },
    [fetchTasks]
  )

  // Смена статуса через RPC (контроль прав и обязательного комментария)
  const changeStatus = useCallback(
    async (taskId, statusId, comment = null) => {
      try {
        const { data, error: err } = await supabase.rpc('change_task_status', {
          p_task_id: taskId,
          p_status_id: statusId,
          p_comment: comment,
        })

        if (err) throw err
        await fetchTasks()
        return { data, error: null }
      } catch (err) {
        const message = err.message ?? 'Не удалось сменить статус'
        if (mountedRef.current) setError(message)
        return { data: null, error: message }
      }
    },
    [fetchTasks]
  )

  // Перемещение при drag&drop: смена статуса + позиции.
  // Триггер log_task_changes запишет смену статуса в журнал.
  const moveTask = useCallback(
    async (taskId, statusId, newPosition) => {
      // Оптимистичное обновление — доска не «прыгает» до ответа сервера
      if (mountedRef.current) {
        setTasks((prev) =>
          prev.map((t) =>
            t.id === taskId
              ? { ...t, status_id: statusId, position: newPosition }
              : t
          )
        )
      }

      try {
        const { error: err } = await supabase
          .from('tasks')
          .update({ status_id: statusId, position: newPosition })
          .eq('id', taskId)

        if (err) throw err
        await fetchTasks()
        return { error: null }
      } catch (err) {
        const message = err.message ?? 'Не удалось переместить задачу'
        // Откат оптимистичного изменения
        await fetchTasks()
        if (mountedRef.current) setError(message)
        return { error: message }
      }
    },
    [fetchTasks]
  )

  const deleteTask = useCallback(
    async (id) => {
      try {
        const { error: err } = await supabase.from('tasks').delete().eq('id', id)
        if (err) throw err
        // Файлы задачи остаются в Storage — просим сервер их убрать
        purgeStorageSoon()
        await fetchTasks()
        return { error: null }
      } catch (err) {
        const message = err.message ?? 'Не удалось удалить задачу'
        if (mountedRef.current) setError(message)
        return { error: message }
      }
    },
    [fetchTasks]
  )

  return {
    tasks,
    loading,
    error,
    refetch: fetchTasks,
    createTask,
    updateTask,
    changeStatus,
    moveTask,
    deleteTask,
  }
}
