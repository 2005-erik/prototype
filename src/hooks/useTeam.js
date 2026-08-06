import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import {
  DEFAULT_WORK_LIMIT,
  loadStateFor,
  isInWork,
  isAwaitingReview,
} from '../lib/constants'

const URGENCY = {
  overdue: 0,
  critical: 1,
  warning: 2,
  normal: 3,
  no_deadline: 4,
  completed: 5,
}

function isToday(iso) {
  return iso && new Date(iso).toDateString() === new Date().toDateString()
}

function sortByUrgency(tasks) {
  return [...tasks].sort((a, b) => {
    const ua = URGENCY[a.deadline_state] ?? 3
    const ub = URGENCY[b.deadline_state] ?? 3
    if (ua !== ub) return ua - ub
    if (a.due_date && b.due_date) return new Date(a.due_date) - new Date(b.due_date)
    if (a.due_date) return -1
    if (b.due_date) return 1
    return 0
  })
}

// Метрики загрузки сотрудника.
// Нагружают только задачи в работе; задачи в начальном статусе — очередь,
// она видна отдельным числом и в процент не входит.
function computeLoad(tasks, workLimit, statusById) {
  const inWork = tasks.filter((t) => isInWork(statusById[t.status_id]))
  const review = tasks.filter((t) => isAwaitingReview(statusById[t.status_id]))
  const queued = tasks.length - inWork.length - review.length
  const overdue = tasks.filter((t) => t.deadline_state === 'overdue').length
  const today = tasks.filter(
    (t) => t.deadline_state !== 'overdue' && isToday(t.due_date)
  ).length
  const rework = tasks.filter((t) => t.status_code === 'rework').length
  const noDue = tasks.filter((t) => !t.due_date).length
  const limit = workLimit ?? DEFAULT_WORK_LIMIT
  const percent = limit > 0 ? Math.round((inWork.length * 100) / limit) : 0
  return {
    active: inWork.length,
    review: review.length,
    queued,
    total: tasks.length,
    overdue,
    today,
    rework,
    noDue,
    work_limit: limit,
    load_percent: percent,
    load_state: loadStateFor(percent, limit),
  }
}

// ---------------------------------------------------------------------
// useTeam — оперативная загрузка: участники + их активные задачи.
// projectId = null → все проекты пользователя (RLS ограничит).
// ---------------------------------------------------------------------
export function useTeam(projectId) {
  const [tasks, setTasks] = useState([])
  const [memberList, setMemberList] = useState([]) // { user_id, profile }
  const [statusById, setStatusById] = useState({}) // id → { is_initial, is_final }
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const mountedRef = useRef(true)
  const debounceRef = useRef(null)

  const fetchTeam = useCallback(async () => {
    try {
      let mQuery = supabase
        .from('project_members')
        .select('user_id, profiles(*)')
      if (projectId) mQuery = mQuery.eq('project_id', projectId)

      let tQuery = supabase
        .from('tasks_enriched')
        .select('*')
        .is('completed_at', null)
      if (projectId) tQuery = tQuery.eq('project_id', projectId)

      let sQuery = supabase
        .from('statuses')
        .select('id, is_initial, is_final, loads_assignee')
      if (projectId) sQuery = sQuery.eq('project_id', projectId)

      const [mRes, tRes, sRes] = await Promise.all([mQuery, tQuery, sQuery])
      if (mRes.error) throw mRes.error
      if (tRes.error) throw tRes.error
      if (sRes.error) throw sRes.error

      const statusMap = {}
      for (const st of sRes.data ?? []) statusMap[st.id] = st

      // Уникальные участники по user_id
      const byId = new Map()
      for (const row of mRes.data ?? []) {
        if (row.profiles && !byId.has(row.user_id)) {
          byId.set(row.user_id, { user_id: row.user_id, profile: row.profiles })
        }
      }

      if (mountedRef.current) {
        setMemberList([...byId.values()])
        setStatusById(statusMap)
        setTasks(tRes.data ?? [])
        setError(null)
      }
    } catch (err) {
      if (mountedRef.current) setError(err.message ?? 'Не удалось загрузить команду')
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    mountedRef.current = true
    setLoading(true)
    fetchTeam()

    const channel = supabase
      .channel(`team:${projectId ?? 'all'}`)
      .on(
        'postgres_changes',
        projectId
          ? { event: '*', schema: 'public', table: 'tasks', filter: `project_id=eq.${projectId}` }
          : { event: '*', schema: 'public', table: 'tasks' },
        () => {
          if (debounceRef.current) clearTimeout(debounceRef.current)
          debounceRef.current = setTimeout(fetchTeam, 1000)
        }
      )
      .subscribe()

    return () => {
      mountedRef.current = false
      if (debounceRef.current) clearTimeout(debounceRef.current)
      supabase.removeChannel(channel)
    }
  }, [projectId, fetchTeam])

  // Колонки по сотрудникам (с метриками загрузки)
  const columns = useMemo(() => {
    const arr = memberList.map((m) => {
      const t = tasks.filter((x) => x.assignee_id === m.user_id)
      return {
        ...m,
        tasks: sortByUrgency(t),
        load: computeLoad(t, m.profile?.work_limit, statusById),
      }
    })
    // перегруженные сверху
    return arr.sort((a, b) => b.load.load_percent - a.load.load_percent)
  }, [memberList, tasks, statusById])

  const unassigned = useMemo(
    () => sortByUrgency(tasks.filter((t) => !t.assignee_id)),
    [tasks]
  )

  // Переназначение (оптимистично, откат при ошибке)
  const reassignTask = useCallback(
    async (taskId, newAssigneeId) => {
      const prev = tasks
      const name =
        memberList.find((m) => m.user_id === newAssigneeId)?.profile?.full_name ??
        null
      setTasks((ts) =>
        ts.map((t) =>
          t.id === taskId
            ? { ...t, assignee_id: newAssigneeId, assignee_name: name }
            : t
        )
      )
      const { error: err } = await supabase
        .from('tasks')
        .update({ assignee_id: newAssigneeId })
        .eq('id', taskId)
      if (err) {
        setTasks(prev)
        return { error: err.message }
      }
      return { error: null }
    },
    [tasks, memberList]
  )

  // Правка срока/приоритета из контекстного меню (оптимистично)
  const patchTask = useCallback(
    async (taskId, patch) => {
      const prev = tasks
      setTasks((ts) => ts.map((t) => (t.id === taskId ? { ...t, ...patch } : t)))
      const { error: err } = await supabase
        .from('tasks')
        .update(patch)
        .eq('id', taskId)
      if (err) {
        setTasks(prev)
        return { error: err.message }
      }
      return { error: null }
    },
    [tasks]
  )

  // Массовая правка (смена приоритета у выбранных) — одним запросом
  const patchTasks = useCallback(
    async (taskIds, patch) => {
      if (!taskIds?.length) return { error: null }
      const prev = tasks
      const ids = new Set(taskIds)
      setTasks((ts) => ts.map((t) => (ids.has(t.id) ? { ...t, ...patch } : t)))
      const { error: err } = await supabase
        .from('tasks')
        .update(patch)
        .in('id', taskIds)
      if (err) {
        setTasks(prev)
        return { error: err.message }
      }
      return { error: null }
    },
    [tasks]
  )

  return {
    columns,
    unassigned,
    allTasks: tasks,
    loading,
    error,
    refetch: fetchTeam,
    reassignTask,
    patchTask,
    patchTasks,
  }
}
