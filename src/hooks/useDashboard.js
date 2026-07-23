import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

// ---------------------------------------------------------------------
// useDashboard — сводка по проекту через RPC get_manager_dashboard.
// Автообновление раз в 60с + realtime по tasks (refetch с дебаунсом 2с).
// ---------------------------------------------------------------------
export function useDashboard(projectId) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const mountedRef = useRef(true)
  const debounceRef = useRef(null)

  const fetchDashboard = useCallback(async () => {
    if (!projectId) {
      if (mountedRef.current) setLoading(false)
      return
    }
    try {
      const { data: res, error: err } = await supabase.rpc(
        'get_manager_dashboard',
        { p_project_id: projectId }
      )
      if (err) throw err
      if (mountedRef.current) {
        setData(res)
        setError(null)
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message ?? 'Не удалось загрузить дашборд')
      }
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    mountedRef.current = true
    if (!projectId) {
      setLoading(false)
      return
    }
    setLoading(true)
    fetchDashboard()

    // Автообновление раз в 60 секунд
    const interval = setInterval(fetchDashboard, 60000)

    // Realtime: изменения задач проекта → refetch с дебаунсом 2с
    const channel = supabase
      .channel(`dashboard:${projectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `project_id=eq.${projectId}`,
        },
        () => {
          if (debounceRef.current) clearTimeout(debounceRef.current)
          debounceRef.current = setTimeout(fetchDashboard, 2000)
        }
      )
      .subscribe()

    return () => {
      mountedRef.current = false
      clearInterval(interval)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      supabase.removeChannel(channel)
    }
  }, [projectId, fetchDashboard])

  return { data, loading, error, refetch: fetchDashboard }
}

// ---------------------------------------------------------------------
// useActivityFeed — лента task_activity проекта с профилями и задачами.
// Сортировка по created_at desc, realtime-подписка на INSERT.
// ---------------------------------------------------------------------
export function useActivityFeed(projectId, limit = 20) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const mountedRef = useRef(true)
  const debounceRef = useRef(null)

  const fetchFeed = useCallback(async () => {
    if (!projectId) {
      if (mountedRef.current) {
        setItems([])
        setLoading(false)
      }
      return
    }
    try {
      const { data, error: err } = await supabase
        .from('task_activity')
        .select(
          `id, action, field, old_value, new_value, comment, created_at,
           user_id, task_id,
           profiles ( full_name, avatar_url ),
           tasks ( number, title )`
        )
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (err) throw err
      if (mountedRef.current) {
        setItems(data ?? [])
        setError(null)
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message ?? 'Не удалось загрузить ленту')
      }
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [projectId, limit])

  useEffect(() => {
    mountedRef.current = true
    setLoading(true)
    fetchFeed()

    // Realtime: новые записи активности этого проекта → refetch (дебаунс).
    // Теперь фильтр канала — прямо по project_id (денормализован).
    const channel = supabase
      .channel(`activity-feed:${projectId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'task_activity',
          filter: `project_id=eq.${projectId}`,
        },
        () => {
          if (debounceRef.current) clearTimeout(debounceRef.current)
          debounceRef.current = setTimeout(fetchFeed, 800)
        }
      )
      .subscribe()

    return () => {
      mountedRef.current = false
      if (debounceRef.current) clearTimeout(debounceRef.current)
      supabase.removeChannel(channel)
    }
  }, [projectId, fetchFeed])

  return { items, loading, error, refetch: fetchFeed }
}
