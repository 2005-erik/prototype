import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Pencil,
  Check,
  Lock,
  History,
  MessageSquare,
  Trash2,
  ChevronUp,
  ChevronDown,
  Loader2,
} from 'lucide-react'
import RichTextEditor from './RichTextEditor'
import Avatar from '../ui/Avatar'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import Select from '../ui/Select'
import { useToast } from '../ui/Toast'
import {
  SECTION_STATUS,
  AUTOSAVE_DELAY_MS,
  LOCK_TTL_MS,
  isLockActive,
} from '../../lib/documents'
import { cn, formatRelative } from '../../lib/utils'

// Продление блокировки: заметно чаще, чем её время жизни (5 минут),
// чтобы раздел не «отпустило» посреди работы
const HEARTBEAT_MS = 60 * 1000

export default function SectionCard({
  section,
  members = [],
  currentUserId,
  canManageDoc = false,
  commentsCount = 0,
  searchTasks,
  onSave,
  onAcquireLock,
  onReleaseLock,
  onUpdateSection,
  onDelete,
  onMove,
  canMoveUp = false,
  canMoveDown = false,
  onOpenTask,
  onMentionAction,
  onOpenHistory,
  onOpenComments,
}) {
  const { toast } = useToast()

  const [editing, setEditing] = useState(false)
  const [saveState, setSaveState] = useState('idle') // idle | saving | saved
  const [savedAt, setSavedAt] = useState(null)
  const [titleDraft, setTitleDraft] = useState(section.title)
  const [editingTitle, setEditingTitle] = useState(false)

  const contentRef = useRef(null)
  const timerRef = useRef(null)
  const editingRef = useRef(false)

  const status = SECTION_STATUS[section.status] ?? SECTION_STATUS.not_started
  const canEdit = canManageDoc || section.assignee_id === currentUserId

  // Чужая живая блокировка: раздел открывается только на чтение
  const holderId = section.locked_by
  const lockedByOther =
    holderId && holderId !== currentUserId && isLockActive(section.locked_at)
  const holderName = section.holder?.full_name ?? 'Другой участник'

  // ---- Сохранение ----

  const flush = useCallback(async () => {
    if (!contentRef.current) return
    const payload = contentRef.current
    contentRef.current = null
    setSaveState('saving')
    const { error } = await onSave(section.id, payload)
    if (error) {
      setSaveState('idle')
      toast.error(error)
      return
    }
    setSaveState('saved')
    setSavedAt(new Date())
  }, [onSave, section.id, toast])

  // Автосохранение: правки уходят сами через несколько секунд после
  // последнего нажатия — кнопки «Сохранить» в документе нет
  const onChange = (json) => {
    contentRef.current = json
    setSaveState('saving')
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(flush, AUTOSAVE_DELAY_MS)
  }

  const startEdit = async () => {
    const { data, error } = await onAcquireLock(section.id)
    if (error) return toast.error(error)
    if (!data?.ok) {
      return toast.error(
        `Раздел редактирует ${data?.holder_name ?? 'другой участник'}`
      )
    }
    editingRef.current = true
    setEditing(true)
  }

  const stopEdit = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    await flush()
    await onReleaseLock(section.id)
    editingRef.current = false
    setEditing(false)
  }, [flush, onReleaseLock, section.id])

  // Пока раздел открыт на правку — продлеваем блокировку
  useEffect(() => {
    if (!editing) return
    const id = setInterval(() => {
      onAcquireLock(section.id)
    }, HEARTBEAT_MS)
    return () => clearInterval(id)
  }, [editing, onAcquireLock, section.id])

  // Ушли со страницы, не нажав «Готово» — дописываем и отпускаем раздел
  useEffect(
    () => () => {
      if (!editingRef.current) return
      if (timerRef.current) clearTimeout(timerRef.current)
      if (contentRef.current) {
        onSave(section.id, contentRef.current)
      }
      onReleaseLock(section.id)
    },
    [onSave, onReleaseLock, section.id]
  )

  // ---- Заголовок раздела ----

  const saveTitle = async () => {
    setEditingTitle(false)
    const value = titleDraft.trim()
    if (!value || value === section.title) {
      setTitleDraft(section.title)
      return
    }
    const { error } = await onUpdateSection(section.id, { title: value })
    if (error) {
      setTitleDraft(section.title)
      toast.error(error)
    }
  }

  const changeStatus = async (value) => {
    const { error } = await onUpdateSection(section.id, { status: value })
    if (error) toast.error(error)
  }

  const changeAssignee = async (value) => {
    const { error } = await onUpdateSection(section.id, {
      assignee_id: value || null,
    })
    if (error) toast.error(error)
  }

  const assigneeOptions = [
    { value: '', label: '— не назначен —' },
    ...members.map((m) => ({ value: m.id, label: m.full_name })),
  ]

  return (
    <section
      className={cn(
        'rounded-lg border bg-surface transition',
        editing ? 'border-accent/50' : 'border-line'
      )}
    >
      {/* Шапка раздела */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
        {canManageDoc && (
          <div className="flex flex-col">
            <button
              type="button"
              onClick={() => onMove(section.id, 'up')}
              disabled={!canMoveUp}
              className="text-muted transition hover:text-fg disabled:opacity-30"
              aria-label="Поднять раздел"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onMove(section.id, 'down')}
              disabled={!canMoveDown}
              className="text-muted transition hover:text-fg disabled:opacity-30"
              aria-label="Опустить раздел"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <span
          className="h-2 w-2 flex-shrink-0 rounded-full"
          style={{ backgroundColor: status.dot }}
          title={status.label}
        />

        {editingTitle ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveTitle()
              if (e.key === 'Escape') {
                setTitleDraft(section.title)
                setEditingTitle(false)
              }
            }}
            className="min-w-0 flex-1 rounded border border-line bg-app px-2 py-1 text-sm font-semibold text-fg outline-none focus:border-accent"
          />
        ) : (
          <h3 className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-semibold text-fg">
            <span className="truncate">{section.title}</span>
            {canEdit && (
              <button
                type="button"
                onClick={() => {
                  setTitleDraft(section.title)
                  setEditingTitle(true)
                }}
                className="flex-shrink-0 text-muted transition hover:text-fg"
                aria-label="Переименовать раздел"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
          </h3>
        )}

        {/* Кто отвечает за раздел */}
        {section.assignee ? (
          <Avatar
            name={section.assignee.full_name}
            src={section.assignee.avatar_url}
            size="xs"
            title={`Ответственный: ${section.assignee.full_name}`}
          />
        ) : (
          <span className="text-xs text-muted/60">без ответственного</span>
        )}

        <Badge className={status.badge}>{status.label}</Badge>

        {/* Комментарии раздела */}
        <button
          type="button"
          onClick={() => onOpenComments(section)}
          className="flex items-center gap-1 rounded px-1.5 py-1 text-xs text-muted transition hover:bg-line hover:text-fg"
          title="Комментарии раздела"
        >
          <MessageSquare className="h-3.5 w-3.5" />
          {commentsCount > 0 && commentsCount}
        </button>

        <button
          type="button"
          onClick={() => onOpenHistory(section)}
          className="rounded px-1.5 py-1 text-muted transition hover:bg-line hover:text-fg"
          title="История версий"
        >
          <History className="h-3.5 w-3.5" />
        </button>

        {canManageDoc && (
          <button
            type="button"
            onClick={() => onDelete(section)}
            className="rounded px-1.5 py-1 text-muted transition hover:text-red-400"
            title="Удалить раздел"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Правка: занятый раздел открывается только на чтение */}
        {canEdit &&
          (editing ? (
            <Button size="sm" variant="secondary" onClick={stopEdit}>
              <Check className="h-3.5 w-3.5" />
              Готово
            </Button>
          ) : lockedByOther ? (
            <span
              className="flex items-center gap-1 rounded-lg bg-line px-2 py-1 text-xs text-muted"
              title={`Блокировка снимется через ${Math.round(LOCK_TTL_MS / 60000)} мин без активности`}
            >
              <Lock className="h-3.5 w-3.5" />
              {holderName} редактирует
            </span>
          ) : (
            <Button size="sm" variant="ghost" onClick={startEdit}>
              <Pencil className="h-3.5 w-3.5" />
              Редактировать
            </Button>
          ))}
      </div>

      {/* Управление разделом — только когда он открыт на правку */}
      {editing && (
        <div className="flex flex-wrap items-end gap-3 border-b border-line px-4 py-2.5">
          <Select
            label="Статус раздела"
            className="w-44"
            value={section.status}
            onChange={(e) => changeStatus(e.target.value)}
            options={Object.entries(SECTION_STATUS).map(([value, val]) => ({
              value,
              label: val.label,
            }))}
          />
          {canManageDoc && (
            <Select
              label="Ответственный"
              className="w-56"
              value={section.assignee_id ?? ''}
              onChange={(e) => changeAssignee(e.target.value)}
              options={assigneeOptions}
            />
          )}
          <span className="ml-auto pb-2 text-xs text-muted">
            {saveState === 'saving' ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Сохранение…
              </span>
            ) : savedAt ? (
              `Сохранено ${savedAt.toLocaleTimeString('ru-RU', {
                hour: '2-digit',
                minute: '2-digit',
              })}`
            ) : (
              'Изменения сохраняются сами'
            )}
          </span>
        </div>
      )}

      {/* Текст раздела */}
      <div className="px-4 py-3">
        <RichTextEditor
          content={section.content}
          editable={editing}
          onChange={onChange}
          members={members}
          searchTasks={searchTasks}
          onOpenTask={onOpenTask}
          onMentionClick={(payload) =>
            onMentionAction({ ...payload, sectionId: section.id })
          }
          externalRevision={editing ? null : section.updated_at}
          placeholder="Текст раздела. @ — упоминание, # — ссылка на задачу"
        />
      </div>

      {/* Кто и когда последний раз правил */}
      {section.updated_by && (
        <div className="border-t border-line px-4 py-1.5 text-xs text-muted">
          {section.editor?.full_name ?? 'Кто-то'} · {formatRelative(section.updated_at)}
        </div>
      )}
    </section>
  )
}
