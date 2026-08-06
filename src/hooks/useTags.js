import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { supabase } from '../lib/supabase'

// ---------------------------------------------------------------------
// useProjectTags — теги проекта (справочник направлений).
// ---------------------------------------------------------------------
export function useProjectTags(projectId) {
  const [tags, setTags] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const mountedRef = useRef(true)

  const fetchTags = useCallback(async () => {
    if (!projectId) {
      setTags([])
      setLoading(false)
      return
    }
    try {
      const { data, error: err } = await supabase
        .from('tags')
        .select('id, name, color')
        .eq('project_id', projectId)
        .order('name')
      if (err) throw err
      if (mountedRef.current) {
        setTags(data ?? [])
        setError(null)
      }
    } catch (err) {
      if (mountedRef.current) setError(err.message ?? 'Не удалось загрузить теги')
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    mountedRef.current = true
    setLoading(true)
    fetchTags()
    return () => {
      mountedRef.current = false
    }
  }, [fetchTags])

  // Создание тега на лету — из карточки задачи
  const createTag = useCallback(
    async (name, color = '#2bbaac') => {
      try {
        const clean = String(name).trim()
        if (!clean) return { data: null, error: 'Пустое название' }
        const { data, error: err } = await supabase
          .from('tags')
          .insert({ project_id: projectId, name: clean, color })
          .select('id, name, color')
          .single()
        if (err) throw err
        await fetchTags()
        return { data, error: null }
      } catch (err) {
        const message = /duplicate key/i.test(err.message ?? '')
          ? 'Такой тег уже есть'
          : (err.message ?? 'Не удалось создать тег')
        return { data: null, error: message }
      }
    },
    [projectId, fetchTags]
  )

  return { tags, loading, error, refetch: fetchTags, createTag }
}

// ---------------------------------------------------------------------
// useTaskTagsMap — теги всех задач проекта: task_id → [{id,name,color}].
// Одним запросом на проект, чтобы не дёргать связь на каждую карточку.
// ---------------------------------------------------------------------
export function useTaskTagsMap(projectId, deps = null) {
  const [rows, setRows] = useState([])
  const mountedRef = useRef(true)

  const fetchMap = useCallback(async () => {
    if (!projectId) {
      setRows([])
      return
    }
    try {
      const { data, error } = await supabase
        .from('task_tags')
        .select('task_id, tags!inner(id, name, color, project_id)')
        .eq('tags.project_id', projectId)
      if (error) throw error
      if (mountedRef.current) setRows(data ?? [])
    } catch {
      /* теги — украшение списка, молча пропускаем */
    }
  }, [projectId])

  useEffect(() => {
    mountedRef.current = true
    fetchMap()
    return () => {
      mountedRef.current = false
    }
  }, [fetchMap, deps])

  const byTask = useMemo(() => {
    const map = {}
    for (const r of rows) {
      if (!r.tags) continue
      ;(map[r.task_id] ??= []).push(r.tags)
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => a.name.localeCompare(b.name, 'ru'))
    }
    return map
  }, [rows])

  return { tagsByTask: byTask, refetch: fetchMap }
}

// ---------------------------------------------------------------------
// useTaskTags — теги одной задачи с добавлением и снятием.
// ---------------------------------------------------------------------
export function useTaskTags(taskId) {
  const [tags, setTags] = useState([])
  const [loading, setLoading] = useState(true)
  const mountedRef = useRef(true)

  const fetchTags = useCallback(async () => {
    if (!taskId) {
      setTags([])
      setLoading(false)
      return
    }
    try {
      const { data, error } = await supabase
        .from('task_tags')
        .select('tags(id, name, color)')
        .eq('task_id', taskId)
      if (error) throw error
      if (mountedRef.current) {
        setTags((data ?? []).map((r) => r.tags).filter(Boolean))
      }
    } catch {
      /* молча: без тегов карточка всё равно работает */
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [taskId])

  useEffect(() => {
    mountedRef.current = true
    setLoading(true)
    fetchTags()
    return () => {
      mountedRef.current = false
    }
  }, [fetchTags])

  const addTag = useCallback(
    async (tag) => {
      try {
        const { error } = await supabase
          .from('task_tags')
          .insert({ task_id: taskId, tag_id: tag.id })
        if (error && !/duplicate key/i.test(error.message ?? '')) throw error
        await fetchTags()
        return { error: null }
      } catch (err) {
        return { error: err.message ?? 'Не удалось добавить тег' }
      }
    },
    [taskId, fetchTags]
  )

  const removeTag = useCallback(
    async (tag) => {
      try {
        const { error } = await supabase
          .from('task_tags')
          .delete()
          .eq('task_id', taskId)
          .eq('tag_id', tag.id)
        if (error) throw error
        await fetchTags()
        return { error: null }
      } catch (err) {
        return { error: err.message ?? 'Не удалось снять тег' }
      }
    },
    [taskId, fetchTags]
  )

  return { tags, loading, addTag, removeTag, refetch: fetchTags }
}

// ---------------------------------------------------------------------
// useTagStats — разрез по направлениям для аналитики (RPC).
// ---------------------------------------------------------------------
export function useTagStats(projectId) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    const run = async () => {
      if (!projectId) {
        setData([])
        setLoading(false)
        return
      }
      setLoading(true)
      try {
        const { data: res, error } = await supabase.rpc('get_tag_stats', {
          p_project_id: projectId,
        })
        if (error) throw error
        if (mountedRef.current) setData(res ?? [])
      } catch {
        if (mountedRef.current) setData([])
      } finally {
        if (mountedRef.current) setLoading(false)
      }
    }
    run()
    return () => {
      mountedRef.current = false
    }
  }, [projectId])

  return { data, loading }
}
