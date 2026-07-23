import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

// =====================================================================
// Аналитика: по одному хуку на каждый RPC.
//
// Конвенция вызова (ожидаемые сигнатуры в БД):
//   get_completion_trend(p_project_id uuid, p_period_days int)
//   get_ontime_stats(p_project_id uuid, p_period_days int)
//   get_rework_analysis(p_project_id uuid, p_period_days int)
//   get_cycle_time(p_project_id uuid, p_period_days int)
//   get_status_bottlenecks(p_project_id uuid, p_period_days int)
//   get_employee_stats(p_project_id uuid, p_period_days int)
//
// Кэширование: результаты хранятся в module-level кэше по ключу
// (rpc + projectId + period). При переключении вкладок (размонтирование
// и повторный монтаж) с теми же параметрами повторный запрос НЕ идёт —
// берётся значение из кэша. refetch() принудительно обновляет.
// =====================================================================

const cache = new Map()

const keyOf = (fn, projectId, period) => `${fn}:${projectId}:${period}`

// Общее ядро: вызов RPC с кэшем и принудительным refetch
function useAnalyticsRpc(fn, projectId, period) {
  const k = keyOf(fn, projectId, period)

  const [data, setData] = useState(() => cache.get(k) ?? null)
  const [loading, setLoading] = useState(() => projectId != null && !cache.has(k))
  const [error, setError] = useState(null)
  const mountedRef = useRef(true)

  const run = useCallback(
    async (force) => {
      if (!projectId) {
        setLoading(false)
        return
      }
      // Есть в кэше и не форсим — берём без запроса
      if (!force && cache.has(k)) {
        setData(cache.get(k))
        setLoading(false)
        return
      }
      setLoading(true)
      try {
        const { data: res, error: err } = await supabase.rpc(fn, {
          p_project_id: projectId,
          p_period_days: period,
        })
        if (err) throw err
        cache.set(k, res)
        if (mountedRef.current) {
          setData(res)
          setError(null)
        }
      } catch (err) {
        if (mountedRef.current) {
          setError(err.message ?? 'Не удалось загрузить аналитику')
        }
      } finally {
        if (mountedRef.current) setLoading(false)
      }
    },
    [fn, k, projectId, period]
  )

  useEffect(() => {
    mountedRef.current = true
    if (cache.has(k)) {
      // Кэш-хит — мгновенно, без запроса
      setData(cache.get(k))
      setLoading(false)
    } else {
      setData(null)
      run(false)
    }
    return () => {
      mountedRef.current = false
    }
  }, [k, run])

  const refetch = useCallback(() => run(true), [run])

  return { data, loading, error, refetch }
}

// Сбросить кэш аналитики (например, после массовых изменений)
export function invalidateAnalyticsCache() {
  cache.clear()
}

// ---------------------------------------------------------------------
// useOverviewDeltas — изменение 4 метрик обзора относительно предыдущего
// равного периода. RPC привязаны к «сейчас − N дней» и не дают прошлое
// окно, поэтому дельты считаются на клиенте из tasks. Для «всё время»
// (period = null) дельт нет.
// ---------------------------------------------------------------------
export function useOverviewDeltas(projectId, period) {
  const [deltas, setDeltas] = useState(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    if (!projectId || !period) {
      setDeltas(null)
      return () => {
        mountedRef.current = false
      }
    }

    const run = async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('created_at, completed_at, due_date, rework_count')
        .eq('project_id', projectId)
      if (error || !data) {
        if (mountedRef.current) setDeltas(null)
        return
      }

      const DAY = 86400000
      const now = Date.now()
      const curStart = now - period * DAY
      const prevStart = now - 2 * period * DAY
      const ts = (v) => (v ? new Date(v).getTime() : null)

      const windowMetrics = (start, end) => {
        const completedIn = data.filter((t) => {
          const c = ts(t.completed_at)
          return c != null && c >= start && c < end
        })
        const createdIn = data.filter((t) => {
          const c = ts(t.created_at)
          return c != null && c >= start && c < end
        })
        const withDue = completedIn.filter((t) => t.due_date)
        return {
          completed: completedIn.length,
          avgCompletion: completedIn.length
            ? completedIn.reduce(
                (s, t) => s + (ts(t.completed_at) - ts(t.created_at)) / DAY,
                0
              ) / completedIn.length
            : null,
          onTime: withDue.length
            ? (100 *
                withDue.filter((t) => ts(t.completed_at) <= ts(t.due_date))
                  .length) /
              withDue.length
            : null,
          avgRework: createdIn.length
            ? createdIn.reduce((s, t) => s + (t.rework_count ?? 0), 0) /
              createdIn.length
            : null,
        }
      }

      const cur = windowMetrics(curStart, now)
      const prev = windowMetrics(prevStart, curStart)

      const rel = (c, p) => {
        if (c == null || p == null) return null
        if (p === 0) return c === 0 ? 0 : 100
        return Math.round(((c - p) / p) * 100)
      }

      if (mountedRef.current) {
        setDeltas({
          completed: rel(cur.completed, prev.completed),
          avgCompletion: rel(cur.avgCompletion, prev.avgCompletion),
          onTime: rel(cur.onTime, prev.onTime),
          avgRework: rel(cur.avgRework, prev.avgRework),
        })
      }
    }
    run()

    return () => {
      mountedRef.current = false
    }
  }, [projectId, period])

  return deltas
}

// --- Хуки под каждый RPC ---
export function useCompletionTrend(projectId, period) {
  return useAnalyticsRpc('get_completion_trend', projectId, period)
}

export function useOntimeStats(projectId, period) {
  return useAnalyticsRpc('get_ontime_stats', projectId, period)
}

export function useReworkAnalysis(projectId, period) {
  return useAnalyticsRpc('get_rework_analysis', projectId, period)
}

export function useCycleTime(projectId, period) {
  return useAnalyticsRpc('get_cycle_time', projectId, period)
}

export function useBottlenecks(projectId, period) {
  return useAnalyticsRpc('get_status_bottlenecks', projectId, period)
}

export function useEmployeeStats(projectId, period) {
  return useAnalyticsRpc('get_employee_stats', projectId, period)
}
