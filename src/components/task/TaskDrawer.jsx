import { useState, useRef } from 'react'
import {
  Pencil,
  Plus,
  Trash2,
  Upload,
  Download,
  Send,
  ChevronDown,
  ChevronRight,
  Image as ImageIcon,
  FileText,
  File as FileIcon,
  ArrowRightLeft,
  UserPlus,
  CalendarClock,
  Flag,
  Circle,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useTaskDetails } from '../../hooks/useTaskDetails'
import { PRIORITY } from '../../lib/constants'
import { formatDateTime, formatRelative, cn } from '../../lib/utils'
import Drawer from '../ui/Drawer'
import Input from '../ui/Input'
import Textarea from '../ui/Textarea'
import Select from '../ui/Select'
import DatePicker from '../ui/DatePicker'
import Avatar from '../ui/Avatar'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import ConfirmDialog from '../ui/ConfirmDialog'
import { SkeletonText } from '../ui/Skeleton'
import { useToast } from '../ui/Toast'

function formatBytes(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`
}

function FileTypeIcon({ mime, className }) {
  if (mime?.startsWith('image/')) return <ImageIcon className={className} />
  if (mime?.includes('pdf') || mime?.startsWith('text/'))
    return <FileText className={className} />
  return <FileIcon className={className} />
}

// Иконка и подпись для записи истории
const ACTIVITY_ICON = {
  created: Plus,
  imported: Download,
  status_changed: ArrowRightLeft,
  assigned: UserPlus,
  due_changed: CalendarClock,
  priority_changed: Flag,
}
const ACTIVITY_LABEL = {
  created: 'создал(а) задачу',
  imported: 'импортировал(а) задачу из Trello',
  assigned: 'сменил(а) исполнителя',
  due_changed: 'изменил(а) срок',
  priority_changed: 'изменил(а) приоритет',
}

export default function TaskDrawer({ task: initial, statuses = [], members = [], onClose }) {
  const { user, isManager } = useAuth()
  const { toast } = useToast()
  const details = useTaskDetails(initial?.id)
  const t = details.task ?? initial

  const fileInputRef = useRef(null)

  // ---- Локальные состояния редактирования ----
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState(t?.title ?? '')
  const [desc, setDesc] = useState(t?.description ?? '')
  const [commentText, setCommentText] = useState('')
  const [newItem, setNewItem] = useState('')
  const [pendingStatusId, setPendingStatusId] = useState(null)
  const [statusComment, setStatusComment] = useState('')
  const [showHistory, setShowHistory] = useState(false)

  // Подтверждение удаления (вложение / пункт чек-листа)
  const [confirm, setConfirm] = useState(null)
  const [confirmBusy, setConfirmBusy] = useState(false)

  if (!t) return null

  // ---- Права ----
  const isAssignee = t.assignee_id === user?.id
  const notOwner = !isManager && !isAssignee // сотрудник и не исполнитель
  const canChangeStatus = isManager || isAssignee
  const canToggleChecklist = isManager || isAssignee // отмечать пункты
  const canEditChecklist = isManager // добавлять/удалять пункты
  const canComment = isManager || isAssignee
  const canUpload = isManager || isAssignee
  const canDeleteAttachment = (att) =>
    isManager || (isAssignee && att.user_id === user?.id)

  const prio = PRIORITY[t.priority]

  // Обёртка: выполнить операцию хука и показать toast
  const notify = async (fn, success) => {
    const res = await fn()
    if (res?.error) toast.error(res.error)
    else if (success) toast.success(success)
    return res
  }

  // ---- Обработчики (вызовы details.* не меняются) ----
  const saveTitle = async () => {
    setEditingTitle(false)
    const v = titleValue.trim()
    if (v && v !== t.title) await notify(() => details.updateTask({ title: v }))
    else setTitleValue(t.title)
  }

  const saveDesc = async () => {
    if (desc !== (t.description ?? '')) {
      await notify(() => details.updateTask({ description: desc || null }))
    }
  }

  const onStatusSelect = async (statusId) => {
    if (!statusId || statusId === t.status_id) return
    const s = statuses.find((x) => x.id === statusId)
    if (s?.requires_comment) {
      setPendingStatusId(statusId)
      setStatusComment('')
    } else {
      await notify(() => details.changeStatus(statusId), 'Статус обновлён')
    }
  }

  const confirmStatus = async () => {
    const v = statusComment.trim()
    if (!v) return
    const { error } = await notify(
      () => details.changeStatus(pendingStatusId, v),
      'Статус обновлён'
    )
    if (!error) {
      setPendingStatusId(null)
      setStatusComment('')
    }
  }

  const sendComment = async () => {
    const v = commentText.trim()
    if (!v) return
    const { error } = await notify(() => details.addComment(v))
    if (!error) setCommentText('')
  }

  const addItem = async () => {
    const v = newItem.trim()
    if (!v) return
    const { error } = await notify(() => details.addChecklistItem(v))
    if (!error) setNewItem('')
  }

  const onPickFile = async (e) => {
    const file = e.target.files?.[0]
    if (file) await notify(() => details.uploadAttachment(file), 'Файл загружен')
    e.target.value = ''
  }

  const download = async (att) => {
    const { url, error } = await details.getAttachmentUrl(att)
    if (error) toast.error(error)
    else if (url) window.open(url, '_blank', 'noopener')
  }

  const doConfirmDelete = async () => {
    if (!confirm) return
    setConfirmBusy(true)
    const res =
      confirm.kind === 'attachment'
        ? await details.deleteAttachment(confirm.item)
        : await details.deleteChecklistItem(confirm.item.id)
    setConfirmBusy(false)
    if (res?.error) toast.error(res.error)
    else {
      toast.success('Удалено')
      setConfirm(null)
    }
  }

  const checklistDone = details.checklist.filter((i) => i.is_done).length
  const checklistTotal = details.checklist.length

  const assigneeOptions = [
    { value: '', label: '— не назначен —' },
    ...members
      .filter((m) => m.profiles)
      .map((m) => ({ value: m.profiles.id, label: m.profiles.full_name })),
  ]

  // Заголовок панели (с inline-редактированием для менеджера)
  const titleNode = (
    <div className="min-w-0 flex-1">
      <span className="text-xs font-normal text-muted">#{t.number}</span>
      {editingTitle ? (
        <input
          autoFocus
          value={titleValue}
          onChange={(e) => setTitleValue(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => {
            if (e.key === 'Enter') saveTitle()
            if (e.key === 'Escape') {
              setTitleValue(t.title)
              setEditingTitle(false)
            }
          }}
          className="mt-0.5 w-full rounded border border-line bg-app px-2 py-1 text-lg font-semibold text-fg outline-none focus:border-accent"
        />
      ) : (
        <div className="mt-0.5 flex items-start gap-2">
          <span className="text-lg font-semibold text-fg">{t.title}</span>
          {isManager && (
            <button
              type="button"
              onClick={() => {
                setTitleValue(t.title)
                setEditingTitle(true)
              }}
              className="mt-1 flex-shrink-0 text-muted transition hover:text-fg"
              aria-label="Редактировать заголовок"
            >
              <Pencil className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
    </div>
  )

  return (
    <>
      <Drawer open onClose={onClose} width={600} title={titleNode}>
        <div className="space-y-6">
          {/* Плашка: задача не назначена этому сотруднику */}
          {notOwner && (
            <div className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-400">
              Вы не являетесь исполнителем этой задачи
            </div>
          )}

          {/* Статус */}
          <section>
            <label className="mb-1.5 block text-xs font-medium uppercase text-muted">
              Статус
            </label>
            {canChangeStatus ? (
              <Select
                value={t.status_id ?? ''}
                onChange={(e) => onStatusSelect(e.target.value)}
                options={statuses.map((s) => ({ value: s.id, label: s.name }))}
              />
            ) : (
              <Badge
                className="text-sm text-white"
                style={{ backgroundColor: t.status_color ?? '#ecc371' }}
              >
                {t.status_name}
              </Badge>
            )}

            {/* Обязательный комментарий при переходе */}
            {pendingStatusId && (
              <div className="mt-2 rounded-lg border border-line bg-app p-3">
                <p className="mb-1.5 text-xs text-muted">
                  Для этого статуса требуется комментарий:
                </p>
                <Textarea
                  autoFocus
                  rows={3}
                  value={statusComment}
                  onChange={(e) => setStatusComment(e.target.value)}
                  placeholder="Причина / пояснение…"
                />
                <div className="mt-2 flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPendingStatusId(null)}
                  >
                    Отмена
                  </Button>
                  <Button
                    size="sm"
                    onClick={confirmStatus}
                    disabled={!statusComment.trim()}
                  >
                    Подтвердить
                  </Button>
                </div>
              </div>
            )}
          </section>

          {/* Метаданные в две колонки */}
          <section className="grid grid-cols-2 gap-4">
            <Meta label="Исполнитель">
              {isManager ? (
                <Select
                  value={t.assignee_id ?? ''}
                  onChange={(e) =>
                    notify(() =>
                      details.updateTask({ assignee_id: e.target.value || null })
                    )
                  }
                  options={assigneeOptions}
                />
              ) : (
                <span className="text-sm text-fg">{t.assignee_name ?? '—'}</span>
              )}
            </Meta>

            <Meta label="Автор">
              <span className="text-sm text-fg">{t.author_name ?? '—'}</span>
            </Meta>

            <Meta label="Приоритет">
              {isManager ? (
                <Select
                  value={t.priority ?? 'medium'}
                  onChange={(e) =>
                    notify(() => details.updateTask({ priority: e.target.value }))
                  }
                  options={Object.entries(PRIORITY).map(([key, val]) => ({
                    value: key,
                    label: val.label,
                  }))}
                />
              ) : (
                <Badge className={cn('text-xs', prio?.badge)}>
                  {prio?.label ?? '—'}
                </Badge>
              )}
            </Meta>

            <Meta label="Срок">
              {isManager ? (
                <DatePicker
                  value={t.due_date}
                  onChange={(iso) =>
                    notify(() => details.updateTask({ due_date: iso }))
                  }
                />
              ) : (
                <span className="text-sm text-fg">
                  {t.due_date ? formatDateTime(t.due_date) : '—'}
                </span>
              )}
            </Meta>

            <Meta label="Создана">
              <span className="text-sm text-muted">
                {formatDateTime(t.created_at)}
              </span>
            </Meta>
            <Meta label="Обновлена">
              <span className="text-sm text-muted">
                {formatDateTime(t.updated_at)}
              </span>
            </Meta>
          </section>

          {/* Описание */}
          <section>
            <label className="mb-1.5 block text-xs font-medium uppercase text-muted">
              Описание
            </label>
            {isManager ? (
              <Textarea
                rows={4}
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                onBlur={saveDesc}
                placeholder="Добавьте описание…"
              />
            ) : (
              <p className="whitespace-pre-wrap text-sm text-fg">
                {t.description || '—'}
              </p>
            )}
          </section>

          {/* Чек-лист */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-medium uppercase text-muted">
                Чек-лист
              </label>
              {checklistTotal > 0 && (
                <span className="text-xs text-muted">
                  {checklistDone} из {checklistTotal}
                </span>
              )}
            </div>
            {checklistTotal > 0 && (
              <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full bg-accent transition-all"
                  style={{ width: `${(checklistDone / checklistTotal) * 100}%` }}
                />
              </div>
            )}
            <ul className="space-y-1">
              {details.checklist.map((item) => (
                <li key={item.id} className="group flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={item.is_done}
                    disabled={!canToggleChecklist}
                    onChange={() => details.toggleChecklistItem(item)}
                    className="accent-[#ecc371] disabled:opacity-50"
                  />
                  <span
                    className={cn(
                      'flex-1 text-sm',
                      item.is_done ? 'text-muted line-through' : 'text-fg'
                    )}
                  >
                    {item.text}
                  </span>
                  {canEditChecklist && (
                    <button
                      type="button"
                      onClick={() =>
                        setConfirm({
                          kind: 'checklist',
                          item,
                          title: 'Удалить пункт?',
                          message: `«${item.text}» будет удалён.`,
                        })
                      }
                      className="text-muted opacity-0 transition hover:text-red-400 group-hover:opacity-100"
                      aria-label="Удалить пункт"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {canEditChecklist && (
              <div className="mt-2 flex items-center gap-2">
                <Input
                  className="flex-1"
                  value={newItem}
                  onChange={(e) => setNewItem(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addItem()}
                  placeholder="Новый пункт…"
                />
                <Button
                  variant="ghost"
                  onClick={addItem}
                  aria-label="Добавить пункт"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            )}
          </section>

          {/* Вложения */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-medium uppercase text-muted">
                Вложения
              </label>
              {canUpload && (
                <>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1 text-xs text-accent transition hover:underline"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Загрузить
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    onChange={onPickFile}
                    className="hidden"
                  />
                </>
              )}
            </div>
            {details.attachments.length === 0 ? (
              <p className="text-sm text-muted/60">Нет вложений</p>
            ) : (
              <ul className="space-y-1">
                {details.attachments.map((att) => (
                  <li
                    key={att.id}
                    className="group flex items-center gap-2 rounded-lg border border-line bg-app px-2.5 py-1.5"
                  >
                    <FileTypeIcon
                      mime={att.mime_type}
                      className="h-4 w-4 flex-shrink-0 text-muted"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm text-fg">
                      {att.file_name}
                    </span>
                    <span className="flex-shrink-0 text-xs text-muted">
                      {formatBytes(att.file_size)}
                    </span>
                    <button
                      type="button"
                      onClick={() => download(att)}
                      className="text-muted transition hover:text-fg"
                      aria-label="Скачать"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                    {canDeleteAttachment(att) && (
                      <button
                        type="button"
                        onClick={() =>
                          setConfirm({
                            kind: 'attachment',
                            item: att,
                            title: 'Удалить файл?',
                            message: `«${att.file_name}» будет удалён безвозвратно.`,
                          })
                        }
                        className="text-muted transition hover:text-red-400"
                        aria-label="Удалить"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Комментарии */}
          <section>
            <label className="mb-2 block text-xs font-medium uppercase text-muted">
              Комментарии
            </label>
            {details.loading && details.comments.length === 0 ? (
              <SkeletonText lines={2} />
            ) : (
              <ul className="space-y-3">
                {details.comments.map((c) => (
                  <li key={c.id} className="flex gap-2.5">
                    <Avatar
                      name={c.profiles?.full_name}
                      size="sm"
                      className="mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-fg">
                          {c.profiles?.full_name ?? 'Пользователь'}
                        </span>
                        <span className="text-xs text-muted">
                          {formatRelative(c.created_at)}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap text-sm text-fg">
                        {c.body}
                      </p>
                    </div>
                  </li>
                ))}
                {details.comments.length === 0 && (
                  <li className="text-sm text-muted/60">
                    Пока нет комментариев
                  </li>
                )}
              </ul>
            )}
            {canComment && (
              <div className="mt-3 flex items-center gap-2">
                <Input
                  className="flex-1"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendComment()}
                  placeholder="Написать комментарий…"
                />
                <Button
                  onClick={sendComment}
                  disabled={!commentText.trim()}
                  aria-label="Отправить"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            )}
          </section>

          {/* История изменений */}
          <section>
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-medium uppercase text-muted transition hover:text-fg"
            >
              {showHistory ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              История изменений ({details.activity.length})
            </button>

            {showHistory && (
              <ul className="mt-3 space-y-3">
                {details.activity.map((a) => {
                  const Icon = ACTIVITY_ICON[a.action] ?? Circle
                  const who = a.profiles?.full_name ?? 'Система'
                  return (
                    <li key={a.id} className="flex gap-2.5">
                      <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-line text-muted">
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-fg">
                          {a.action === 'status_changed' ? (
                            <>
                              <span className="font-medium">{who}</span>:{' '}
                              {a.old_value ?? '—'} → {a.new_value ?? '—'}
                            </>
                          ) : (
                            <>
                              <span className="font-medium">{who}</span>{' '}
                              {ACTIVITY_LABEL[a.action] ?? a.action}
                            </>
                          )}
                        </p>
                        {a.comment && (
                          <p className="mt-0.5 rounded bg-app px-2 py-1 text-xs text-muted">
                            {a.comment}
                          </p>
                        )}
                        <span className="text-xs text-muted">
                          {formatRelative(a.created_at)}
                        </span>
                      </div>
                    </li>
                  )
                })}
                {details.activity.length === 0 && (
                  <li className="text-sm text-muted/60">Нет записей</li>
                )}
              </ul>
            )}
          </section>
        </div>
      </Drawer>

      {/* Подтверждение удаления */}
      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title}
        message={confirm?.message}
        confirmText="Удалить"
        danger
        loading={confirmBusy}
        onConfirm={doConfirmDelete}
        onCancel={() => !confirmBusy && setConfirm(null)}
      />
    </>
  )
}

// Ячейка метаданных
function Meta({ label, children }) {
  return (
    <div>
      <span className="mb-1 block text-xs font-medium uppercase text-muted">
        {label}
      </span>
      {children}
    </div>
  )
}
