import { useState, useMemo, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft,
  Plus,
  MessageSquare,
  Trash2,
  Pencil,
  FileQuestion,
  Check,
  X,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useProject } from '../hooks/useProjects'
import {
  useDocument,
  useTaskRefSearch,
  useDocumentTaskCreator,
} from '../hooks/useDocuments'
import SectionCard from '../components/document/SectionCard'
import RelatedTasks from '../components/document/RelatedTasks'
import CommentsDrawer from '../components/document/CommentsDrawer'
import VersionHistoryDrawer from '../components/document/VersionHistoryDrawer'
import MentionMenu from '../components/document/MentionMenu'
import TaskFromMentionModal from '../components/document/TaskFromMentionModal'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import Select from '../components/ui/Select'
import Skeleton from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import { useToast } from '../components/ui/Toast'
import { DOC_TYPE, DOC_STATUS } from '../lib/documents'
import { formatRelative, plural } from '../lib/utils'

export default function DocumentPage() {
  const { documentId } = useParams()
  const navigate = useNavigate()
  const { user, isAdmin } = useAuth()
  const { toast } = useToast()

  const {
    doc,
    sections,
    comments,
    links,
    loading,
    error,
    refetch,
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
  } = useDocument(documentId)

  const projectId = doc?.project_id ?? null
  const { project, statuses, members: projectMembers } = useProject(projectId)
  const searchTasks = useTaskRefSearch(projectId)
  const createTask = useDocumentTaskCreator(projectId, documentId)

  // Участники проекта в виде профилей — упоминания и назначение
  // на раздел работают с людьми, а не со строками участия
  const members = useMemo(
    () => projectMembers.map((m) => m.profiles).filter(Boolean),
    [projectMembers]
  )

  const myRole = projectMembers.find((m) => m.user_id === user?.id)?.role
  const canManageDoc =
    isAdmin ||
    doc?.author_id === user?.id ||
    myRole === 'owner' ||
    myRole === 'manager'

  // ---- Локальное состояние экрана ----
  const [titleDraft, setTitleDraft] = useState('')
  const [editingTitle, setEditingTitle] = useState(false)
  const [newSection, setNewSection] = useState(null) // null | строка
  const [commentsFor, setCommentsFor] = useState(null) // null | { section } | { document: true }
  const [historyFor, setHistoryFor] = useState(null)
  const [mentionTarget, setMentionTarget] = useState(null)
  const [taskMention, setTaskMention] = useState(null)
  const [commentMention, setCommentMention] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [busy, setBusy] = useState(false)

  const sectionTitles = useMemo(
    () => Object.fromEntries(sections.map((s) => [s.id, s.title])),
    [sections]
  )

  const openComments = useMemo(
    () => comments.filter((c) => !c.resolved).length,
    [comments]
  )

  const onOpenTask = useCallback((taskId) => navigate(`/task/${taskId}`), [navigate])

  // ---- Действия ----

  const saveTitle = async () => {
    setEditingTitle(false)
    const value = titleDraft.trim()
    if (!value || value === doc.title) return
    const { error: err } = await updateDocument({ title: value })
    if (err) toast.error(err)
  }

  const changeStatus = async (value) => {
    const { error: err } = await updateDocument({ status: value })
    if (err) toast.error(err)
  }

  const submitSection = async () => {
    const value = (newSection ?? '').trim()
    if (!value) {
      setNewSection(null)
      return
    }
    const { error: err } = await addSection(value)
    if (err) {
      toast.error(err)
      return
    }
    // Разделы обычно заводят пачкой — оставляем поле открытым
    setNewSection('')
  }

  const runConfirm = async () => {
    setBusy(true)
    const { error: err } =
      confirm.kind === 'document'
        ? await deleteDocument()
        : await deleteSection(confirm.item.id)
    setBusy(false)
    if (err) {
      toast.error(err)
      setConfirm(null)
      return
    }
    if (confirm.kind === 'document') {
      toast.success('Документ удалён')
      navigate(projectId ? `/documents/${projectId}` : '/documents')
      return
    }
    setConfirm(null)
    toast.success('Раздел удалён')
  }

  const onMentionAction = useCallback((payload) => setMentionTarget(payload), [])

  const onMove = useCallback(
    async (id, direction) => {
      const { error: err } = await moveSection(id, direction)
      if (err) toast.error(err)
    },
    [moveSection, toast]
  )

  // ---- Экраны загрузки и ошибок ----

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (!doc) {
    return (
      <EmptyState
        icon={FileQuestion}
        title="Документ не найден"
        description={error ?? 'Возможно, он был удалён или у вас нет доступа.'}
        action={
          <Button size="sm" onClick={() => navigate('/documents')}>
            К документам
          </Button>
        }
      />
    )
  }

  const type = DOC_TYPE[doc.type] ?? DOC_TYPE.note
  const status = DOC_STATUS[doc.status] ?? DOC_STATUS.draft
  const TypeIcon = type.icon

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      {/* Шапка документа */}
      <div className="rounded-lg border border-line bg-surface p-4">
        <div className="mb-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              navigate(projectId ? `/documents/${projectId}` : '/documents')
            }
            className="flex items-center gap-1 text-xs text-muted transition hover:text-fg"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Документы
          </button>
          {project && (
            <>
              <span className="text-muted/40">/</span>
              <Link
                to={`/board/${projectId}`}
                className="truncate text-xs text-muted transition hover:text-fg"
              >
                {project.name}
              </Link>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-start gap-2">
          <TypeIcon className="mt-1 h-5 w-5 flex-shrink-0 text-muted" />

          {editingTitle ? (
            <input
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveTitle()
                if (e.key === 'Escape') setEditingTitle(false)
              }}
              className="min-w-0 flex-1 rounded-lg border border-line bg-app px-2 py-1 text-lg font-semibold text-fg outline-none focus:border-accent"
            />
          ) : (
            <h1 className="flex min-w-0 flex-1 items-center gap-2 text-lg font-semibold text-fg">
              <span className="min-w-0 break-words">{doc.title}</span>
              {canManageDoc && (
                <button
                  type="button"
                  onClick={() => {
                    setTitleDraft(doc.title)
                    setEditingTitle(true)
                  }}
                  className="flex-shrink-0 text-muted transition hover:text-fg"
                  aria-label="Переименовать документ"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              )}
            </h1>
          )}

          {canManageDoc ? (
            <Select
              className="w-44"
              value={doc.status}
              onChange={(e) => changeStatus(e.target.value)}
              options={Object.entries(DOC_STATUS).map(([value, meta]) => ({
                value,
                label: meta.label,
              }))}
            />
          ) : (
            <Badge className={status.badge}>{status.label}</Badge>
          )}
        </div>

        {/* Прогресс по разделам */}
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-xs text-muted">
            <span>
              {doc.sections_total === 0
                ? 'Разделов пока нет'
                : `${doc.sections_ready} из ${doc.sections_total} ${plural(
                    doc.sections_total,
                    'раздела',
                    'разделов',
                    'разделов'
                  )} готово`}
            </span>
            <span>{doc.progress ?? 0}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-accent transition-[width]"
              style={{ width: `${doc.progress ?? 0}%` }}
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
          <span>{type.label}</span>
          <span className="text-muted/40">·</span>
          <span>{doc.author_name ?? 'Автор неизвестен'}</span>
          <span className="text-muted/40">·</span>
          <span>изменён {formatRelative(doc.updated_at)}</span>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setCommentsFor({ document: true })}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Комментарии
              {openComments > 0 && (
                <span className="ml-1 rounded-full bg-line px-1.5 text-[11px]">
                  {openComments}
                </span>
              )}
            </Button>
            {canManageDoc && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirm({ kind: 'document' })}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Удалить
              </Button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}

      {/* Разделы */}
      {sections.length === 0 ? (
        <EmptyState
          icon={TypeIcon}
          title="В документе нет разделов"
          description="Раздел — это отдельный кусок работы со своим ответственным и статусом."
          action={
            canManageDoc ? (
              <Button size="sm" onClick={() => setNewSection('')}>
                <Plus className="h-4 w-4" />
                Добавить раздел
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="space-y-3">
          {sections.map((section, index) => (
            <SectionCard
              key={section.id}
              section={section}
              members={members}
              currentUserId={user?.id}
              canManageDoc={canManageDoc}
              commentsCount={
                comments.filter((c) => c.section_id === section.id && !c.resolved)
                  .length
              }
              searchTasks={searchTasks}
              onSave={saveSection}
              onAcquireLock={acquireLock}
              onReleaseLock={releaseLock}
              onUpdateSection={updateSection}
              onDelete={(item) => setConfirm({ kind: 'section', item })}
              onMove={onMove}
              canMoveUp={index > 0}
              canMoveDown={index < sections.length - 1}
              onOpenTask={onOpenTask}
              onMentionAction={onMentionAction}
              onOpenHistory={setHistoryFor}
              onOpenComments={(item) => setCommentsFor({ section: item })}
            />
          ))}
        </div>
      )}

      {/* Добавление раздела */}
      {canManageDoc &&
        (newSection === null ? (
          sections.length > 0 && (
            <Button size="sm" variant="secondary" onClick={() => setNewSection('')}>
              <Plus className="h-4 w-4" />
              Добавить раздел
            </Button>
          )
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-line bg-surface p-3">
            <input
              autoFocus
              value={newSection}
              onChange={(e) => setNewSection(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitSection()
                if (e.key === 'Escape') setNewSection(null)
              }}
              placeholder="Название раздела"
              className="min-w-0 flex-1 rounded-lg border border-line bg-app px-3 py-1.5 text-sm text-fg placeholder-muted outline-none transition focus:border-accent"
            />
            <Button size="sm" onClick={submitSection}>
              <Check className="h-3.5 w-3.5" />
              Добавить
            </Button>
            <button
              type="button"
              onClick={() => setNewSection(null)}
              className="rounded p-1 text-muted transition hover:text-fg"
              aria-label="Отменить"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}

      <RelatedTasks
        links={links}
        sectionTitles={sectionTitles}
        canEdit={canManageDoc}
        searchTasks={searchTasks}
        onLink={linkTask}
        onUnlink={unlinkTask}
      />

      {/* Панель комментариев: документа целиком или одного раздела */}
      <CommentsDrawer
        open={Boolean(commentsFor)}
        onClose={() => {
          setCommentsFor(null)
          setCommentMention(null)
        }}
        section={commentsFor?.section ?? null}
        documentTitle={doc.title}
        comments={
          commentsFor?.section
            ? comments.filter((c) => c.section_id === commentsFor.section.id)
            : comments
        }
        sectionTitles={sectionTitles}
        members={members}
        currentUserId={user?.id}
        canManageDoc={canManageDoc}
        initialMention={commentMention}
        onAdd={addComment}
        onToggleResolved={toggleResolved}
        onDelete={(comment) => deleteComment(comment.id)}
      />

      <VersionHistoryDrawer
        open={Boolean(historyFor)}
        onClose={() => setHistoryFor(null)}
        section={historyFor}
        canRestore={
          canManageDoc || historyFor?.assignee_id === user?.id
        }
        onRestored={refetch}
      />

      {/* Клик по «@имя» в тексте */}
      <MentionMenu
        target={mentionTarget}
        onClose={() => setMentionTarget(null)}
        onCreateTask={() => {
          setTaskMention(mentionTarget)
          setMentionTarget(null)
        }}
        onComment={() => {
          const section = sections.find((s) => s.id === mentionTarget.sectionId)
          setCommentMention({
            id: mentionTarget.id,
            label: mentionTarget.label,
          })
          setCommentsFor(section ? { section } : { document: true })
          setMentionTarget(null)
        }}
      />

      <TaskFromMentionModal
        open={Boolean(taskMention)}
        onClose={() => setTaskMention(null)}
        mention={taskMention}
        statuses={statuses}
        sectionTitle={sectionTitles[taskMention?.sectionId] ?? ''}
        onCreate={createTask}
        onCreated={refetch}
      />

      <ConfirmDialog
        open={Boolean(confirm)}
        title={
          confirm?.kind === 'document' ? 'Удалить документ?' : 'Удалить раздел?'
        }
        message={
          confirm?.kind === 'document'
            ? `«${doc.title}» удалится вместе с разделами, комментариями и историей версий.`
            : confirm
              ? `«${confirm.item.title}» удалится вместе с текстом, комментариями и историей версий.`
              : ''
        }
        confirmText="Удалить"
        danger
        loading={busy}
        onConfirm={runConfirm}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}
