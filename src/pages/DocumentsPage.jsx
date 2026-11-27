import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Plus, Search, FileText, FolderKanban } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useProjectNav } from '../contexts/ProjectNavContext'
import { useProjects, useProject } from '../hooks/useProjects'
import { useDocuments } from '../hooks/useDocuments'
import ProjectSelector from '../components/board/ProjectSelector'
import DocumentCard from '../components/document/DocumentCard'
import CreateDocumentModal from '../components/document/CreateDocumentModal'
import Button from '../components/ui/Button'
import Skeleton from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import { useToast } from '../components/ui/Toast'
import { DOC_TYPE, DOC_STATUS } from '../lib/documents'
import { cn } from '../lib/utils'

export default function DocumentsPage() {
  const { projectId: paramId } = useParams()
  const navigate = useNavigate()
  const { user, isAdmin, isManager } = useAuth()
  const { toast } = useToast()

  const { lastProjectId, setLastProjectId } = useProjectNav()
  const { projects, loading: projectsLoading } = useProjects()
  const activeProjectId = paramId ?? lastProjectId ?? projects[0]?.id ?? null

  useEffect(() => {
    if (paramId) setLastProjectId(paramId)
  }, [paramId, setLastProjectId])

  // Заход на /documents без проекта — открываем последний или первый
  useEffect(() => {
    if (!paramId && activeProjectId) {
      navigate(`/documents/${activeProjectId}`, { replace: true })
    }
  }, [paramId, activeProjectId, navigate])

  const { members } = useProject(activeProjectId)
  const { documents, loading, error, createDocument, deleteDocument } =
    useDocuments(activeProjectId)

  const [search, setSearch] = useState('')
  const [type, setType] = useState(null)
  const [status, setStatus] = useState(null)
  const [creating, setCreating] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const [deleting, setDeleting] = useState(false)

  // Руководитель проекта удаляет любой документ, остальные — свои
  const myRole = members.find((m) => m.user_id === user?.id)?.role
  const canManageProject =
    isAdmin || myRole === 'owner' || myRole === 'manager'

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return documents.filter((doc) => {
      if (type && doc.type !== type) return false
      if (status && doc.status !== status) return false
      if (term && !(doc.title ?? '').toLowerCase().includes(term)) return false
      return true
    })
  }, [documents, search, type, status])

  const onCreate = async (payload) => {
    const { data, error: err } = await createDocument(payload)
    if (err) return { error: err }
    navigate(`/document/${data.id}`)
    return { error: null }
  }

  const onDelete = async () => {
    setDeleting(true)
    const { error: err } = await deleteDocument(confirm.id)
    setDeleting(false)
    setConfirm(null)
    if (err) {
      toast.error(err)
      return
    }
    toast.success('Документ удалён')
  }

  if (projectsLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-64" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
      </div>
    )
  }

  if (projects.length === 0) {
    return (
      <EmptyState
        icon={FolderKanban}
        title="Нет доступных проектов"
        description="Документы живут внутри проекта. Попросите руководителя добавить вас в проект."
      />
    )
  }

  // Кнопка фильтра-переключателя
  const chip = (active, onClick, label, key) => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-lg border px-2.5 py-1 text-xs font-medium transition',
        active
          ? 'border-accent bg-accent/10 text-accent'
          : 'border-line text-muted hover:border-accent/50 hover:text-fg'
      )}
    >
      {label}
    </button>
  )

  return (
    <div className="space-y-4">
      {/* Проект + поиск + создание */}
      <div className="flex flex-wrap items-center gap-2">
        <ProjectSelector
          projects={projects}
          activeProjectId={activeProjectId}
          isManager={isManager}
          basePath="/documents"
        />

        <div className="relative min-w-40 flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по названию"
            className="w-full rounded-lg border border-line bg-surface py-1.5 pl-8 pr-3 text-sm text-fg placeholder-muted outline-none transition focus:border-accent"
          />
        </div>

        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" />
          Новый документ
        </Button>
      </div>

      {/* Фильтры по типу и состоянию */}
      <div className="flex flex-wrap items-center gap-1.5">
        {chip(!type, () => setType(null), 'Все типы', 'type-all')}
        {Object.entries(DOC_TYPE).map(([key, meta]) =>
          chip(type === key, () => setType(key), meta.label, `type-${key}`)
        )}
        <span className="mx-1 hidden h-4 w-px bg-line sm:block" />
        {chip(!status, () => setStatus(null), 'Любое состояние', 'status-all')}
        {Object.entries(DOC_STATUS).map(([key, meta]) =>
          chip(status === key, () => setStatus(key), meta.label, `status-${key}`)
        )}
      </div>

      {error && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={
            documents.length === 0
              ? 'В проекте пока нет документов'
              : 'Ничего не нашлось'
          }
          description={
            documents.length === 0
              ? 'ТЗ, спецификации, протоколы и регламенты — рядом с задачами проекта.'
              : 'Попробуйте изменить фильтры или поисковый запрос.'
          }
          action={
            documents.length === 0 ? (
              <Button size="sm" onClick={() => setCreating(true)}>
                <Plus className="h-4 w-4" />
                Новый документ
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((doc) => (
            <DocumentCard
              key={doc.id}
              doc={doc}
              canDelete={canManageProject || doc.author_id === user?.id}
              onDelete={setConfirm}
            />
          ))}
        </div>
      )}

      <CreateDocumentModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreate={onCreate}
      />

      <ConfirmDialog
        open={Boolean(confirm)}
        title="Удалить документ?"
        message={
          confirm
            ? `«${confirm.title}» удалится вместе с разделами, комментариями и историей версий.`
            : ''
        }
        confirmText="Удалить"
        danger
        loading={deleting}
        onConfirm={onDelete}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}
