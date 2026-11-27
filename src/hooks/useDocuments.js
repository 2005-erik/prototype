import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { sanitizeSearchTerm } from '../lib/utils'
import { emptyDoc, SECTION_TEMPLATES } from '../lib/documents'

const SECTION_STEP = 1000

// ---------------------------------------------------------------------
// useDocuments — документы проекта из documents_enriched (с прогрессом).
// ---------------------------------------------------------------------
export function useDocuments(projectId) {
  const { user } = useAuth()
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const mountedRef = useRef(true)

  const fetchDocuments = useCallback(async () => {
    if (!projectId) {
      if (mountedRef.current) {
        setDocuments([])
        setLoading(false)
      }
      return
    }
    try {
      const { data, error: err } = await supabase
        .from('documents_enriched')
        .select('*')
        .eq('project_id', projectId)
        .order('updated_at', { ascending: false })
      if (err) throw err
      if (mountedRef.current) {
        setDocuments(data ?? [])
        setError(null)
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message ?? 'Не удалось загрузить документы')
      }
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    mountedRef.current = true
    setLoading(true)
    fetchDocuments()
    return () => {
      mountedRef.current = false
    }
  }, [fetchDocuments])

  // Создание документа вместе с разделами: пустой документ без структуры
  // никто не заполняет, поэтому по умолчанию берём заготовку под тип.
  const createDocument = useCallback(
    async ({ title, type = 'note', sectionTitles = null }) => {
      const clean = String(title ?? '').trim()
      if (!clean) return { data: null, error: 'Введите название документа' }
      try {
        const { data: doc, error: err } = await supabase
          .from('documents')
          .insert({
            project_id: projectId,
            title: clean,
            type,
            author_id: user?.id ?? null,
          })
          .select()
          .single()
        if (err) throw err

        const titles = (sectionTitles ?? SECTION_TEMPLATES[type] ?? [])
          .map((t) => String(t).trim())
          .filter(Boolean)

        if (titles.length > 0) {
          const rows = titles.map((t, i) => ({
            document_id: doc.id,
            title: t,
            position: (i + 1) * SECTION_STEP,
            content: emptyDoc(),
          }))
          const { error: secErr } = await supabase
            .from('document_sections')
            .insert(rows)
          if (secErr) throw secErr
        }

        await fetchDocuments()
        return { data: doc, error: null }
      } catch (err) {
        const message = err.message ?? 'Не удалось создать документ'
        if (mountedRef.current) setError(message)
        return { data: null, error: message }
      }
    },
    [projectId, user, fetchDocuments]
  )

  const updateDocument = useCallback(
    async (id, data) => {
      try {
        const { error: err } = await supabase
          .from('documents')
          .update(data)
          .eq('id', id)
        if (err) throw err
        await fetchDocuments()
        return { error: null }
      } catch (err) {
        return { error: err.message ?? 'Не удалось обновить документ' }
      }
    },
    [fetchDocuments]
  )

  const deleteDocument = useCallback(
    async (id) => {
      try {
        const { error: err } = await supabase
          .from('documents')
          .delete()
          .eq('id', id)
        if (err) throw err
        await fetchDocuments()
        return { error: null }
      } catch (err) {
        return { error: err.message ?? 'Не удалось удалить документ' }
      }
    },
    [fetchDocuments]
  )

  return {
    documents,
    loading,
    error,
    refetch: fetchDocuments,
    createDocument,
    updateDocument,
    deleteDocument,
  }
}

// ---------------------------------------------------------------------
// useDocument — один документ: разделы, комментарии, связанные задачи.
// Realtime по разделам нужен ради мягкой блокировки: соседи должны
// увидеть «Кайрат редактирует» без перезагрузки страницы.
// ---------------------------------------------------------------------
export function useDocument(documentId) {
  const { user } = useAuth()

  const [doc, setDoc] = useState(null)
  const [sections, setSections] = useState([])
  const [comments, setComments] = useState([])
  const [links, setLinks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const mountedRef = useRef(true)

  const fetchDoc = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('documents_enriched')
      .select('*')
      .eq('id', documentId)
      .single()
    if (err) throw err
    if (mountedRef.current) setDoc(data)
  }, [documentId])

  const fetchSections = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('document_sections')
      .select(
        '*, assignee:assignee_id(id, full_name, avatar_url), holder:locked_by(id, full_name), editor:updated_by(id, full_name)'
      )
      .eq('document_id', documentId)
      .order('position', { ascending: true })
    if (err) throw err
    if (mountedRef.current) setSections(data ?? [])
  }, [documentId])

  const fetchComments = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('document_comments')
      .select('*, author:author_id(id, full_name, avatar_url)')
      .eq('document_id', documentId)
      .order('created_at', { ascending: true })
    if (err) throw err
    if (mountedRef.current) setComments(data ?? [])
  }, [documentId])

  const fetchLinks = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('document_tasks')
      .select(
        'task_id, section_id, auto, tasks(id, number, title, due_date, completed_at, assignee_id, statuses(name, color))'
      )
      .eq('document_id', documentId)
    if (err) throw err
    if (mountedRef.current) setLinks((data ?? []).filter((r) => r.tasks))
  }, [documentId])

  const fetchAll = useCallback(async () => {
    if (!documentId) {
      if (mountedRef.current) {
        setDoc(null)
        setSections([])
        setComments([])
        setLinks([])
        setLoading(false)
      }
      return
    }
    try {
      await Promise.all([fetchDoc(), fetchSections(), fetchComments(), fetchLinks()])
      if (mountedRef.current) setError(null)
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message ?? 'Не удалось загрузить документ')
      }
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [documentId, fetchDoc, fetchSections, fetchComments, fetchLinks])

  useEffect(() => {
    mountedRef.current = true
    setLoading(true)
    fetchAll()
    return () => {
      mountedRef.current = false
    }
  }, [fetchAll])

  // Тихая перезагрузка части данных — без спиннера и без ошибок наружу
  const quiet = useCallback((fn) => {
    fn().catch(() => {
      /* фоновая синхронизация не должна ломать экран */
    })
  }, [])

  useEffect(() => {
    if (!documentId) return
    const filter = `document_id=eq.${documentId}`
    const channel = supabase
      .channel(`document:${documentId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'documents', filter: `id=eq.${documentId}` },
        () => quiet(fetchDoc)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'document_sections', filter },
        () => quiet(fetchSections)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'document_comments', filter },
        () => quiet(fetchComments)
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [documentId, fetchDoc, fetchSections, fetchComments, quiet])

  // ---- Документ ----

  const updateDocument = useCallback(
    async (data) => {
      try {
        const { error: err } = await supabase
          .from('documents')
          .update(data)
          .eq('id', documentId)
        if (err) throw err
        await fetchDoc()
        return { error: null }
      } catch (err) {
        return { error: err.message ?? 'Не удалось обновить документ' }
      }
    },
    [documentId, fetchDoc]
  )

  const deleteDocument = useCallback(async () => {
    try {
      const { error: err } = await supabase
        .from('documents')
        .delete()
        .eq('id', documentId)
      if (err) throw err
      return { error: null }
    } catch (err) {
      return { error: err.message ?? 'Не удалось удалить документ' }
    }
  }, [documentId])

  // ---- Разделы ----

  const addSection = useCallback(
    async (title) => {
      const clean = String(title ?? '').trim()
      if (!clean) return { error: 'Введите название раздела' }
      try {
        const nextPos =
          sections.reduce((max, s) => Math.max(max, Number(s.position) || 0), 0) +
          SECTION_STEP
        const { data, error: err } = await supabase
          .from('document_sections')
          .insert({
            document_id: documentId,
            title: clean,
            position: nextPos,
            content: emptyDoc(),
          })
          .select()
          .single()
        if (err) throw err
        await fetchSections()
        return { data, error: null }
      } catch (err) {
        return { data: null, error: err.message ?? 'Не удалось добавить раздел' }
      }
    },
    [documentId, sections, fetchSections]
  )

  const updateSection = useCallback(
    async (id, data) => {
      try {
        const { error: err } = await supabase
          .from('document_sections')
          .update(data)
          .eq('id', id)
        if (err) throw err
        await fetchSections()
        return { error: null }
      } catch (err) {
        return { error: err.message ?? 'Не удалось обновить раздел' }
      }
    },
    [fetchSections]
  )

  const deleteSection = useCallback(
    async (id) => {
      try {
        const { error: err } = await supabase
          .from('document_sections')
          .delete()
          .eq('id', id)
        if (err) throw err
        await fetchSections()
        return { error: null }
      } catch (err) {
        return { error: err.message ?? 'Не удалось удалить раздел' }
      }
    },
    [fetchSections]
  )

  // Перестановка раздела на одну позицию вверх/вниз
  const moveSection = useCallback(
    async (id, direction) => {
      const index = sections.findIndex((s) => s.id === id)
      const target = index + (direction === 'up' ? -1 : 1)
      if (index < 0 || target < 0 || target >= sections.length) return { error: null }
      try {
        const a = sections[index]
        const b = sections[target]
        const [pa, pb] = [Number(a.position), Number(b.position)]
        const updates = await Promise.all([
          supabase.from('document_sections').update({ position: pb }).eq('id', a.id),
          supabase.from('document_sections').update({ position: pa }).eq('id', b.id),
        ])
        const failed = updates.find((r) => r.error)
        if (failed) throw failed.error
        await fetchSections()
        return { error: null }
      } catch (err) {
        return { error: err.message ?? 'Не удалось изменить порядок' }
      }
    },
    [sections, fetchSections]
  )

  // Автосохранение раздела: RPC пишет версию, разбирает упоминания
  // и синхронизирует ссылки #142 со списком связанных задач.
  const saveSection = useCallback(
    async (id, content, title = null) => {
      try {
        const { data, error: err } = await supabase.rpc('save_document_section', {
          p_section_id: id,
          p_content: content,
          p_title: title,
        })
        if (err) throw err
        quiet(fetchLinks)
        return { data, error: null }
      } catch (err) {
        return { data: null, error: err.message ?? 'Не удалось сохранить раздел' }
      }
    },
    [fetchLinks, quiet]
  )

  const acquireLock = useCallback(async (id) => {
    try {
      const { data, error: err } = await supabase.rpc(
        'acquire_document_section_lock',
        { p_section_id: id }
      )
      if (err) throw err
      return { data, error: null }
    } catch (err) {
      return { data: null, error: err.message ?? 'Не удалось занять раздел' }
    }
  }, [])

  const releaseLock = useCallback(async (id) => {
    try {
      const { error: err } = await supabase.rpc('release_document_section_lock', {
        p_section_id: id,
      })
      if (err) throw err
      return { error: null }
    } catch (err) {
      return { error: err.message ?? 'Не удалось освободить раздел' }
    }
  }, [])

  // ---- Комментарии ----

  const addComment = useCallback(
    async ({ body, sectionId = null, mentions = [] }) => {
      const text = String(body ?? '').trim()
      if (!text) return { error: 'Пустой комментарий' }
      try {
        const { error: err } = await supabase.from('document_comments').insert({
          document_id: documentId,
          section_id: sectionId,
          author_id: user?.id ?? null,
          body: text,
          mentions,
        })
        if (err) throw err
        await fetchComments()
        return { error: null }
      } catch (err) {
        return { error: err.message ?? 'Не удалось добавить комментарий' }
      }
    },
    [documentId, user, fetchComments]
  )

  const toggleResolved = useCallback(
    async (comment) => {
      try {
        const resolved = !comment.resolved
        const { error: err } = await supabase
          .from('document_comments')
          .update({
            resolved,
            resolved_by: resolved ? user?.id ?? null : null,
            resolved_at: resolved ? new Date().toISOString() : null,
          })
          .eq('id', comment.id)
        if (err) throw err
        await fetchComments()
        return { error: null }
      } catch (err) {
        return { error: err.message ?? 'Не удалось обновить комментарий' }
      }
    },
    [user, fetchComments]
  )

  const deleteComment = useCallback(
    async (id) => {
      try {
        const { error: err } = await supabase
          .from('document_comments')
          .delete()
          .eq('id', id)
        if (err) throw err
        await fetchComments()
        return { error: null }
      } catch (err) {
        return { error: err.message ?? 'Не удалось удалить комментарий' }
      }
    },
    [fetchComments]
  )

  // ---- Связанные задачи ----

  const linkTask = useCallback(
    async (taskId, sectionId = null) => {
      try {
        const { error: err } = await supabase.from('document_tasks').insert({
          document_id: documentId,
          task_id: taskId,
          section_id: sectionId,
          auto: false,
          created_by: user?.id ?? null,
        })
        if (err && !/duplicate key/i.test(err.message ?? '')) throw err
        await fetchLinks()
        return { error: null }
      } catch (err) {
        return { error: err.message ?? 'Не удалось привязать задачу' }
      }
    },
    [documentId, user, fetchLinks]
  )

  const unlinkTask = useCallback(
    async (taskId) => {
      try {
        const { error: err } = await supabase
          .from('document_tasks')
          .delete()
          .eq('document_id', documentId)
          .eq('task_id', taskId)
        if (err) throw err
        await fetchLinks()
        return { error: null }
      } catch (err) {
        return { error: err.message ?? 'Не удалось отвязать задачу' }
      }
    },
    [documentId, fetchLinks]
  )

  return {
    doc,
    sections,
    comments,
    links,
    loading,
    error,
    refetch: fetchAll,
    refetchLinks: fetchLinks,
    updateDocument,
    deleteDocument,
    addSection,
    updateSection,
    deleteSection,
    moveSection,
    saveSection,
    acquireLock,
    releaseLock,
    addComment,
    toggleResolved,
    deleteComment,
    linkTask,
    unlinkTask,
  }
}

// ---------------------------------------------------------------------
// useSectionVersions — история раздела: кто, когда, что было. И откат.
// ---------------------------------------------------------------------
export function useSectionVersions(sectionId) {
  const [versions, setVersions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const mountedRef = useRef(true)

  const fetchVersions = useCallback(async () => {
    if (!sectionId) {
      if (mountedRef.current) {
        setVersions([])
        setLoading(false)
      }
      return
    }
    try {
      const { data, error: err } = await supabase
        .from('document_versions')
        .select('*, author:author_id(id, full_name)')
        .eq('section_id', sectionId)
        .order('created_at', { ascending: false })
        .limit(50)
      if (err) throw err
      if (mountedRef.current) {
        setVersions(data ?? [])
        setError(null)
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message ?? 'Не удалось загрузить историю')
      }
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [sectionId])

  useEffect(() => {
    mountedRef.current = true
    setLoading(true)
    fetchVersions()
    return () => {
      mountedRef.current = false
    }
  }, [fetchVersions])

  const restore = useCallback(
    async (versionId) => {
      try {
        const { error: err } = await supabase.rpc('restore_document_version', {
          p_version_id: versionId,
        })
        if (err) throw err
        await fetchVersions()
        return { error: null }
      } catch (err) {
        return { error: err.message ?? 'Не удалось восстановить версию' }
      }
    },
    [fetchVersions]
  )

  return { versions, loading, error, refetch: fetchVersions, restore }
}

// ---------------------------------------------------------------------
// useTaskDocuments — документы, связанные с задачей (вкладка в задаче).
// ---------------------------------------------------------------------
export function useTaskDocuments(taskId) {
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const mountedRef = useRef(true)

  const fetchDocuments = useCallback(async () => {
    if (!taskId) {
      if (mountedRef.current) {
        setDocuments([])
        setLoading(false)
      }
      return
    }
    try {
      const { data, error } = await supabase
        .from('document_tasks')
        .select('document_id, section_id, auto, documents(id, title, type, status)')
        .eq('task_id', taskId)
      if (error) throw error
      if (mountedRef.current) {
        setDocuments((data ?? []).filter((r) => r.documents))
      }
    } catch {
      if (mountedRef.current) setDocuments([])
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [taskId])

  useEffect(() => {
    mountedRef.current = true
    setLoading(true)
    fetchDocuments()
    return () => {
      mountedRef.current = false
    }
  }, [fetchDocuments])

  return { documents, loading, refetch: fetchDocuments }
}

// ---------------------------------------------------------------------
// useDocumentTaskCreator — задача из упоминания: заводим её на доске
// и сразу связываем с документом, чтобы ссылка работала в обе стороны.
// ---------------------------------------------------------------------
export function useDocumentTaskCreator(projectId, documentId) {
  const { user } = useAuth()

  return useCallback(
    async ({ title, assigneeId = null, statusId = null, dueDate = null, sectionId = null, description = null }) => {
      const clean = String(title ?? '').trim()
      if (!clean) return { data: null, error: 'Введите название задачи' }
      try {
        const { data: task, error: err } = await supabase
          .from('tasks')
          .insert({
            project_id: projectId,
            title: clean,
            description,
            status_id: statusId,
            assignee_id: assigneeId,
            due_date: dueDate,
            author_id: user?.id ?? null,
          })
          .select('id, number, title')
          .single()
        if (err) throw err

        const { error: linkErr } = await supabase.from('document_tasks').insert({
          document_id: documentId,
          task_id: task.id,
          section_id: sectionId,
          auto: false,
          created_by: user?.id ?? null,
        })
        if (linkErr) throw linkErr

        return { data: task, error: null }
      } catch (err) {
        return { data: null, error: err.message ?? 'Не удалось создать задачу' }
      }
    },
    [projectId, documentId, user]
  )
}

// ---------------------------------------------------------------------
// useTaskRefSearch — поиск задач проекта для ссылок #142 в редакторе.
// Возвращает стабильную функцию: TipTap дёргает её на каждый символ.
// ---------------------------------------------------------------------
export function useTaskRefSearch(projectId) {
  return useCallback(
    async (query) => {
      if (!projectId) return []
      const term = sanitizeSearchTerm(query)
      try {
        let request = supabase
          .from('tasks')
          .select('id, number, title, completed_at')
          .eq('project_id', projectId)
          .order('number', { ascending: false })
          .limit(8)

        if (term) {
          const asNumber = Number.parseInt(term, 10)
          request = Number.isNaN(asNumber)
            ? request.ilike('title', `%${term}%`)
            : request.or(`number.eq.${asNumber},title.ilike.%${term}%`)
        }

        const { data, error } = await request
        if (error) throw error
        return data ?? []
      } catch {
        return []
      }
    },
    [projectId]
  )
}
