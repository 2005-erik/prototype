import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { sanitizeSearchTerm } from '../lib/utils'

// ---------------------------------------------------------------------
// useMyDay — экран «Мой день» через RPC get_my_day(auth.uid()).
// Группы: overdue, today, soon, in_progress, rework.
// Realtime по своим задачам (дебаунс 1с) + автообновление раз в 5 минут.
// ---------------------------------------------------------------------
export function useMyDay() {
  const { user } = useAuth()
  const userId = user?.id ?? null

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const mountedRef = useRef(true)
  const debounceRef = useRef(null)

  const fetchMyDay = useCallback(async () => {
    if (!userId) {
      if (mountedRef.current) setLoading(false)
      return
    }
    try {
      const { data: res, error: err } = await supabase.rpc('get_my_day', {
        p_user_id: userId,
      })
      if (err) throw err
      if (mountedRef.current) {
        setData(res)
        setError(null)
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message ?? 'Не удалось загрузить задачи дня')
      }
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    mountedRef.current = true
    if (!userId) {
      setLoading(false)
      return
    }
    setLoading(true)
    fetchMyDay()

    // Автообновление раз в 5 минут
    const interval = setInterval(fetchMyDay, 5 * 60 * 1000)

    // Realtime: изменения своих задач → refetch с дебаунсом 1с
    const channel = supabase
      .channel(`my-day:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `assignee_id=eq.${userId}`,
        },
        () => {
          if (debounceRef.current) clearTimeout(debounceRef.current)
          debounceRef.current = setTimeout(fetchMyDay, 1000)
        }
      )
      .subscribe()

    return () => {
      mountedRef.current = false
      clearInterval(interval)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      supabase.removeChannel(channel)
    }
  }, [userId, fetchMyDay])

  return { data, loading, error, refetch: fetchMyDay }
}

// ---------------------------------------------------------------------
// useMyTasks — все задачи текущего пользователя из tasks_enriched
// по всем проектам. filters: { projectId, statusCode, priority,
// deadlineState, search, showCompleted }.
// ---------------------------------------------------------------------
export function useMyTasks(filters = {}) {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const { projectId, statusCode, priority, deadlineState, search, showCompleted } =
    filters

  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const mountedRef = useRef(true)

  const fetchTasks = useCallback(async () => {
    if (!userId) {
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
        .eq('assignee_id', userId)

      if (projectId) query = query.eq('project_id', projectId)
      if (statusCode) query = query.eq('status_code', statusCode)
      if (priority) query = query.eq('priority', priority)
      if (deadlineState) query = query.eq('deadline_state', deadlineState)
      if (!showCompleted) query = query.is('completed_at', null)

      const safe = sanitizeSearchTerm(search)
      if (safe) {
        query = query.or(`title.ilike.%${safe}%,description.ilike.%${safe}%`)
      }

      query = query
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false })

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
  }, [userId, projectId, statusCode, priority, deadlineState, search, showCompleted])

  useEffect(() => {
    mountedRef.current = true
    setLoading(true)
    fetchTasks()
    return () => {
      mountedRef.current = false
    }
  }, [fetchTasks])

  // Realtime: изменения своих задач → refetch
  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel(`my-tasks:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `assignee_id=eq.${userId}`,
        },
        () => fetchTasks()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId, fetchTasks])

  return { tasks, loading, error, refetch: fetchTasks }
}

// ---------------------------------------------------------------------
// useMyTasksSummary — сводка по всем задачам пользователя:
// всего / активных / просрочено / выполнено за месяц.
// ---------------------------------------------------------------------
export function useMyTasksSummary() {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const [summary, setSummary] = useState({
    total: 0,
    active: 0,
    overdue: 0,
    completedMonth: 0,
  })
  const mountedRef = useRef(true)

  const fetchSummary = useCallback(async () => {
    if (!userId) return
    try {
      const { data, error } = await supabase
        .from('tasks_enriched')
        .select('completed_at, deadline_state')
        .eq('assignee_id', userId)
      if (error) throw error

      const monthAgo = Date.now() - 30 * 86400000
      let total = 0
      let active = 0
      let overdue = 0
      let completedMonth = 0
      for (const t of data ?? []) {
        total += 1
        if (!t.completed_at) active += 1
        if (t.deadline_state === 'overdue') overdue += 1
        if (t.completed_at && new Date(t.completed_at).getTime() >= monthAgo) {
          completedMonth += 1
        }
      }
      if (mountedRef.current) {
        setSummary({ total, active, overdue, completedMonth })
      }
    } catch {
      /* тихо игнорируем — сводка не критична */
    }
  }, [userId])

  useEffect(() => {
    mountedRef.current = true
    fetchSummary()
    if (!userId) return () => (mountedRef.current = false)

    const channel = supabase
      .channel(`my-summary:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `assignee_id=eq.${userId}`,
        },
        () => fetchSummary()
      )
      .subscribe()

    return () => {
      mountedRef.current = false
      supabase.removeChannel(channel)
    }
  }, [userId, fetchSummary])

  return { summary, refetch: fetchSummary }
}

// ---------------------------------------------------------------------
// useReworkReasons — последний комментарий возврата для набора задач:
// task_activity where action='status_changed' с непустым comment.
// Возвращает map: task_id → текст причины.
// ---------------------------------------------------------------------
export function useReworkReasons(taskIds) {
  const [reasons, setReasons] = useState({})
  const mountedRef = useRef(true)
  const idsKey = (taskIds ?? []).slice().sort().join(',')

  useEffect(() => {
    mountedRef.current = true
    const ids = idsKey ? idsKey.split(',') : []
    if (ids.length === 0) {
      setReasons({})
      return () => {
        mountedRef.current = false
      }
    }

    const run = async () => {
      try {
        const { data, error } = await supabase
          .from('task_activity')
          .select('task_id, comment, created_at')
          .in('task_id', ids)
          .eq('action', 'status_changed')
          .not('comment', 'is', null)
          .order('created_at', { ascending: false })
        if (error) throw error
        const map = {}
        for (const row of data ?? []) {
          // первый (самый свежий) по каждой задаче
          if (!map[row.task_id]) map[row.task_id] = row.comment
        }
        if (mountedRef.current) setReasons(map)
      } catch {
        if (mountedRef.current) setReasons({})
      }
    }
    run()

    return () => {
      mountedRef.current = false
    }
  }, [idsKey])

  return reasons
}
