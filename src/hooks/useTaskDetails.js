import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const BUCKET = 'task-attachments'

// ---------------------------------------------------------------------
// useEnrichedTask — одна задача из tasks_enriched (для страницы /task/:id).
// ---------------------------------------------------------------------
export function useEnrichedTask(taskId) {
  const [task, setTask] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    if (!taskId) {
      setLoading(false)
      return () => {
        mountedRef.current = false
      }
    }
    setLoading(true)
    const run = async () => {
      try {
        const { data, error: err } = await supabase
          .from('tasks_enriched')
          .select('*')
          .eq('id', taskId)
          .single()
        if (err) throw err
        if (mountedRef.current) {
          setTask(data)
          setError(null)
        }
      } catch (err) {
        if (mountedRef.current) {
          setError(err.message ?? 'Не удалось загрузить задачу')
        }
      } finally {
        if (mountedRef.current) setLoading(false)
      }
    }
    run()
    return () => {
      mountedRef.current = false
    }
  }, [taskId])

  return { task, loading, error }
}

// ---------------------------------------------------------------------
// useTaskDetails — полные данные одной задачи для TaskDrawer:
// задача (enriched), комментарии, чек-лист, вложения, история.
// Realtime: перезагрузка при изменениях связанных таблиц.
// ---------------------------------------------------------------------
export function useTaskDetails(taskId) {
  const { user } = useAuth()

  const [task, setTask] = useState(null)
  const [comments, setComments] = useState([])
  const [checklist, setChecklist] = useState([])
  const [attachments, setAttachments] = useState([])
  const [activity, setActivity] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const mountedRef = useRef(true)

  const fetchAll = useCallback(async () => {
    if (!taskId) {
      if (mountedRef.current) setLoading(false)
      return
    }
    try {
      const [t, c, cl, a, act] = await Promise.all([
        supabase.from('tasks_enriched').select('*').eq('id', taskId).single(),
        supabase
          .from('comments')
          .select('*, profiles(*)')
          .eq('task_id', taskId)
          .order('created_at', { ascending: true }),
        supabase
          .from('checklist_items')
          .select('*')
          .eq('task_id', taskId)
          .order('position', { ascending: true, nullsFirst: false }),
        supabase
          .from('attachments')
          .select('*, profiles(*)')
          .eq('task_id', taskId)
          .order('created_at', { ascending: true }),
        supabase
          .from('task_activity')
          .select('*, profiles(*)')
          .eq('task_id', taskId)
          .order('created_at', { ascending: false }),
      ])

      if (t.error) throw t.error
      if (c.error) throw c.error
      if (cl.error) throw cl.error
      if (a.error) throw a.error
      if (act.error) throw act.error

      if (mountedRef.current) {
        setTask(t.data)
        setComments(c.data ?? [])
        setChecklist(cl.data ?? [])
        setAttachments(a.data ?? [])
        setActivity(act.data ?? [])
        setError(null)
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message ?? 'Не удалось загрузить задачу')
      }
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [taskId])

  useEffect(() => {
    mountedRef.current = true
    setLoading(true)
    fetchAll()
    return () => {
      mountedRef.current = false
    }
  }, [fetchAll])

  // Realtime: любые изменения связанных с задачей таблиц → перезагрузка
  useEffect(() => {
    if (!taskId) return
    const filter = `task_id=eq.${taskId}`
    const channel = supabase
      .channel(`task-details:${taskId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `id=eq.${taskId}` }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments', filter }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checklist_items', filter }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attachments', filter }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_activity', filter }, () => fetchAll())
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [taskId, fetchAll])

  // ---- Задача ----

  const updateTask = useCallback(
    async (data) => {
      try {
        const { error: err } = await supabase
          .from('tasks')
          .update(data)
          .eq('id', taskId)
        if (err) throw err
        await fetchAll()
        return { error: null }
      } catch (err) {
        const message = err.message ?? 'Не удалось обновить задачу'
        if (mountedRef.current) setError(message)
        return { error: message }
      }
    },
    [taskId, fetchAll]
  )

  const changeStatus = useCallback(
    async (statusId, comment = null) => {
      try {
        const { error: err } = await supabase.rpc('change_task_status', {
          p_task_id: taskId,
          p_status_id: statusId,
          p_comment: comment,
        })
        if (err) throw err
        await fetchAll()
        return { error: null }
      } catch (err) {
        const message = err.message ?? 'Не удалось сменить статус'
        if (mountedRef.current) setError(message)
        return { error: message }
      }
    },
    [taskId, fetchAll]
  )

  // ---- Комментарии ----

  const addComment = useCallback(
    async (body) => {
      const text = body?.trim()
      if (!text) return { error: 'Пустой комментарий' }
      try {
        const { error: err } = await supabase
          .from('comments')
          .insert({ task_id: taskId, user_id: user?.id, body: text })
        if (err) throw err
        await fetchAll()
        return { error: null }
      } catch (err) {
        const message = err.message ?? 'Не удалось добавить комментарий'
        if (mountedRef.current) setError(message)
        return { error: message }
      }
    },
    [taskId, user, fetchAll]
  )

  const deleteComment = useCallback(
    async (id) => {
      try {
        const { error: err } = await supabase.from('comments').delete().eq('id', id)
        if (err) throw err
        await fetchAll()
        return { error: null }
      } catch (err) {
        return { error: err.message ?? 'Не удалось удалить комментарий' }
      }
    },
    [fetchAll]
  )

  // ---- Чек-лист ----

  const addChecklistItem = useCallback(
    async (text) => {
      const value = text?.trim()
      if (!value) return { error: 'Пустой пункт' }
      try {
        const nextPos =
          checklist.reduce((max, i) => Math.max(max, i.position ?? 0), 0) + 1
        const { error: err } = await supabase
          .from('checklist_items')
          .insert({ task_id: taskId, text: value, position: nextPos })
        if (err) throw err
        await fetchAll()
        return { error: null }
      } catch (err) {
        return { error: err.message ?? 'Не удалось добавить пункт' }
      }
    },
    [taskId, checklist, fetchAll]
  )

  const toggleChecklistItem = useCallback(
    async (item) => {
      const done = !item.is_done
      try {
        const { error: err } = await supabase
          .from('checklist_items')
          .update({
            is_done: done,
            done_by: done ? user?.id ?? null : null,
            done_at: done ? new Date().toISOString() : null,
          })
          .eq('id', item.id)
        if (err) throw err
        await fetchAll()
        return { error: null }
      } catch (err) {
        return { error: err.message ?? 'Не удалось обновить пункт' }
      }
    },
    [user, fetchAll]
  )

  const deleteChecklistItem = useCallback(
    async (id) => {
      try {
        const { error: err } = await supabase
          .from('checklist_items')
          .delete()
          .eq('id', id)
        if (err) throw err
        await fetchAll()
        return { error: null }
      } catch (err) {
        return { error: err.message ?? 'Не удалось удалить пункт' }
      }
    },
    [fetchAll]
  )

  // ---- Вложения ----

  const uploadAttachment = useCallback(
    async (file) => {
      if (!file || !task) return { error: 'Нет файла' }
      try {
        // Путь строго {project_id}/{task_id}/{uuid_имя} — под RLS storage
        const safeName = file.name.replace(/[^\w.\-а-яА-ЯёЁ]+/g, '_')
        const path = `${task.project_id}/${taskId}/${crypto.randomUUID()}_${safeName}`

        const up = await supabase.storage.from(BUCKET).upload(path, file)
        if (up.error) throw up.error

        const ins = await supabase.from('attachments').insert({
          task_id: taskId,
          user_id: user?.id,
          file_name: file.name,
          file_path: path,
          file_size: file.size,
          mime_type: file.type,
        })
        if (ins.error) throw ins.error

        await fetchAll()
        return { error: null }
      } catch (err) {
        const message = err.message ?? 'Не удалось загрузить файл'
        if (mountedRef.current) setError(message)
        return { error: message }
      }
    },
    [task, taskId, user, fetchAll]
  )

  const getAttachmentUrl = useCallback(async (att) => {
    try {
      const { data, error: err } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(att.file_path, 60, { download: att.file_name })
      if (err) throw err
      return { url: data.signedUrl, error: null }
    } catch (err) {
      return { url: null, error: err.message ?? 'Не удалось получить ссылку' }
    }
  }, [])

  const deleteAttachment = useCallback(
    async (att) => {
      try {
        const rm = await supabase.storage.from(BUCKET).remove([att.file_path])
        if (rm.error) throw rm.error
        const del = await supabase.from('attachments').delete().eq('id', att.id)
        if (del.error) throw del.error
        await fetchAll()
        return { error: null }
      } catch (err) {
        const message = err.message ?? 'Не удалось удалить файл'
        if (mountedRef.current) setError(message)
        return { error: message }
      }
    },
    [fetchAll]
  )

  return {
    task,
    comments,
    checklist,
    attachments,
    activity,
    loading,
    error,
    refetch: fetchAll,
    updateTask,
    changeStatus,
    addComment,
    deleteComment,
    addChecklistItem,
    toggleChecklistItem,
    deleteChecklistItem,
    uploadAttachment,
    getAttachmentUrl,
    deleteAttachment,
  }
}
