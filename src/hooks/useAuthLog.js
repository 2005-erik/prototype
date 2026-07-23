import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

// ---------------------------------------------------------------------
// useAuthLog — журнал входов (только admin по RLS), пагинация + фильтры.
// filters: { email, action, fromISO, toISO }
// ---------------------------------------------------------------------
export function useAuthLog(filters, page, pageSize = 50) {
  const { email, action, fromISO, toISO } = filters
  const [logs, setLogs] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const mountedRef = useRef(true)

  const buildQuery = useCallback(() => {
    let q = supabase
      .from('auth_log')
      .select('*, profiles(full_name)', { count: 'exact' })
    if (email) q = q.ilike('email', `%${email.replace(/[,()\\]/g, ' ')}%`)
    if (action) q = q.eq('action', action)
    if (fromISO) q = q.gte('created_at', fromISO)
    if (toISO) q = q.lte('created_at', toISO)
    return q.order('created_at', { ascending: false })
  }, [email, action, fromISO, toISO])

  const fetchPage = useCallback(async () => {
    setLoading(true)
    try {
      const start = (page - 1) * pageSize
      const { data, count, error: err } = await buildQuery().range(
        start,
        start + pageSize - 1
      )
      if (err) throw err
      if (mountedRef.current) {
        setLogs(data ?? [])
        setTotal(count ?? 0)
        setError(null)
      }
    } catch (err) {
      if (mountedRef.current) setError(err.message ?? 'Не удалось загрузить журнал')
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [buildQuery, page, pageSize])

  useEffect(() => {
    mountedRef.current = true
    fetchPage()
    return () => {
      mountedRef.current = false
    }
  }, [fetchPage])

  // Все записи по текущим фильтрам (для экспорта), с разумным лимитом
  const fetchAll = useCallback(async () => {
    const { data, error: err } = await buildQuery().limit(5000)
    if (err) return { data: [], error: err.message }
    return { data: data ?? [], error: null }
  }, [buildQuery])

  return { logs, total, loading, error, refetch: fetchPage, fetchAll }
}
