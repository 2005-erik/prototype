import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { supabase } from '../lib/supabase'

// Состояние загрузки по проценту (как в employee_workload)
function loadState(percent, max) {
  if (!max) return 'normal'
  if (percent < 50) return 'free'
  if (percent < 80) return 'normal'
  if (percent <= 100) return 'busy'
  return 'overloaded'
}

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

// Метрики загрузки сотрудника из его активных задач
function computeLoad(tasks, maxConcurrent) {
  const active = tasks.length
  const overdue = tasks.filter((t) => t.deadline_state === 'overdue').length
  const today = tasks.filter(
    (t) => t.deadline_state !== 'overdue' && isToday(t.due_date)
  ).length
  const rework = tasks.filter((t) => t.status_code === 'rework').length
  const noDue = tasks.filter((t) => !t.due_date).length
  const max = maxConcurrent ?? 10
  const percent = max > 0 ? Math.round((active * 100) / max) : 0
  return {
    active,
    overdue,
    today,
    rework,
    noDue,
    max_concurrent_tasks: max,
    load_percent: percent,
    load_state: loadState(percent, max),
  }
}

// ---------------------------------------------------------------------
// useTeam — оперативная загрузка: участники + их активные задачи.
// projectId = null → все проекты пользователя (RLS ограничит).
// ---------------------------------------------------------------------
export function useTeam(projectId) {
  const [tasks, setTasks] = useState([])
  const [memberList, setMemberList] = useState([]) // { user_id, profile }
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

      const [mRes, tRes] = await Promise.all([mQuery, tQuery])
      if (mRes.error) throw mRes.error
      if (tRes.error) throw tRes.error

      // Уникальные участники по user_id
      const byId = new Map()
      for (const row of mRes.data ?? []) {
        if (row.profiles && !byId.has(row.user_id)) {
          byId.set(row.user_id, { user_id: row.user_id, profile: row.profiles })
        }
      }

      if (mountedRef.current) {
        setMemberList([...byId.values()])
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
        load: computeLoad(t, m.profile?.max_concurrent_tasks),
      }
    })
    // перегруженные сверху
    return arr.sort((a, b) => b.load.load_percent - a.load.load_percent)
  }, [memberList, tasks])

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

  return {
    columns,
    unassigned,
    allTasks: tasks,
    loading,
    error,
    refetch: fetchTeam,
    reassignTask,
    patchTask,
  }
}
