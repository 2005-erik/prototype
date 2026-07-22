import { useState, useEffect, useRef } from 'react'
import {
  X,
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
import { PRIORITY, DEADLINE_STATE } from '../../lib/constants'
import { formatDateTime, formatRelative, getInitials, cn } from '../../lib/utils'

// Формат для input datetime-local из ISO
function toLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`
}

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
  status_changed: ArrowRightLeft,
  assigned: UserPlus,
  due_changed: CalendarClock,
  priority_changed: Flag,
}
const ACTIVITY_LABEL = {
  created: 'создал(а) задачу',
  assigned: 'сменил(а) исполнителя',
  due_changed: 'изменил(а) срок',
  priority_changed: 'изменил(а) приоритет',
}

export default function TaskDrawer({ task: initial, statuses = [], members = [], onClose }) {
  const { user, isManager } = useAuth()
  const details = useTaskDetails(initial?.id)
  const t = details.task ?? initial

  const fileInputRef = useRef(null)

  // Закрытие по Esc
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // ---- Локальные состояния редактирования ----
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState(t?.title ?? '')
  const [desc, setDesc] = useState(t?.description ?? '')
  const [commentText, setCommentText] = useState('')
  const [newItem, setNewItem] = useState('')
  const [pendingStatusId, setPendingStatusId] = useState(null)
  const [statusComment, setStatusComment] = useState('')
  const [showHistory, setShowHistory] = useState(false)

  if (!t) return null

  const canChangeStatus = isManager || t.assignee_id === user?.id
  const prio = PRIORITY[t.priority]
  const deadline = DEADLINE_STATE[t.deadline_state]

  // ---- Обработчики ----
  const saveTitle = async () => {
    setEditingTitle(false)
    const v = titleValue.trim()
    if (v && v !== t.title) await details.updateTask({ title: v })
    else setTitleValue(t.title)
  }

  const saveDesc = async () => {
    if (desc !== (t.description ?? '')) {
      await details.updateTask({ description: desc || null })
    }
  }

  const onStatusSelect = async (statusId) => {
    if (!statusId || statusId === t.status_id) return
    const s = statuses.find((x) => x.id === statusId)
    if (s?.requires_comment) {
      setPendingStatusId(statusId)
      setStatusComment('')
    } else {
      await details.changeStatus(statusId)
    }
  }

  const confirmStatus = async () => {
    const v = statusComment.trim()
    if (!v) return
    await details.changeStatus(pendingStatusId, v)
    setPendingStatusId(null)
    setStatusComment('')
  }

  const sendComment = async () => {
    const v = commentText.trim()
    if (!v) return
    const { error } = await details.addComment(v)
    if (!error) setCommentText('')
  }

  const addItem = async () => {
    const v = newItem.trim()
    if (!v) return
    const { error } = await details.addChecklistItem(v)
    if (!error) setNewItem('')
  }

  const onPickFile = async (e) => {
    const file = e.target.files?.[0]
    if (file) await details.uploadAttachment(file)
    e.target.value = ''
  }

  const download = async (att) => {
    const { url } = await details.getAttachmentUrl(att)
    if (url) window.open(url, '_blank', 'noopener')
  }

  const checklistDone = details.checklist.filter((i) => i.is_done).length
  const checklistTotal = details.checklist.length

  return (
    <>
      {/* Затемнение */}
      <div
        className="fixed inset-0 z-30 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Панель 600px */}
      <aside
        className="fixed right-0 top-0 z-40 flex h-full w-full max-w-[600px] flex-col border-l border-line bg-surface shadow-xl"
        role="dialog"
        aria-label={`Задача #${t.number}`}
        style={{ borderLeftColor: deadline?.color ?? undefined }}
      >
        {/* Шапка */}
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-3">
          <div className="min-w-0 flex-1">
            <span className="text-xs text-muted">#{t.number}</span>
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
                <h2 className="text-lg font-semibold text-fg">{t.title}</h2>
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
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted transition hover:bg-line hover:text-fg"
            aria-label="Закрыть"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-5">
          {/* Статус */}
          <section>
            <label className="mb-1.5 block text-xs font-medium uppercase text-muted">
              Статус
            </label>
            {canChangeStatus ? (
              <select
                value={t.status_id ?? ''}
                onChange={(e) => onStatusSelect(e.target.value)}
                className="w-full rounded-lg border border-line bg-app px-3 py-2 text-sm text-fg outline-none focus:border-accent"
              >
                {statuses.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            ) : (
              <span
                className="inline-block rounded px-2 py-1 text-sm text-white"
                style={{ backgroundColor: t.status_color ?? '#3b82f6' }}
              >
                {t.status_name}
              </span>
            )}

            {/* Обязательный комментарий при переходе */}
            {pendingStatusId && (
              <div className="mt-2 rounded-lg border border-line bg-app p-3">
                <p className="mb-1.5 text-xs text-muted">
                  Для этого статуса требуется комментарий:
                </p>
                <textarea
                  autoFocus
                  rows={3}
                  value={statusComment}
                  onChange={(e) => setStatusComment(e.target.value)}
                  className="w-full resize-none rounded border border-line bg-surface p-2 text-sm text-fg outline-none focus:border-accent"
                  placeholder="Причина / пояснение…"
                />
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setPendingStatusId(null)}
                    className="rounded px-2.5 py-1 text-xs text-muted transition hover:text-fg"
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    onClick={confirmStatus}
                    disabled={!statusComment.trim()}
                    className="rounded bg-accent px-2.5 py-1 text-xs font-medium text-white transition hover:bg-accent-hover disabled:opacity-50"
                  >
                    Подтвердить
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Метаданные в две колонки */}
          <section className="grid grid-cols-2 gap-4">
            {/* Исполнитель */}
            <Meta label="Исполнитель">
              {isManager ? (
                <select
                  value={t.assignee_id ?? ''}
                  onChange={(e) =>
                    details.updateTask({ assignee_id: e.target.value || null })
                  }
                  className="w-full rounded border border-line bg-app px-2 py-1 text-sm text-fg outline-none focus:border-accent"
                >
                  <option value="">— не назначен —</option>
                  {members.map((m) =>
                    m.profiles ? (
                      <option key={m.profiles.id} value={m.profiles.id}>
                        {m.profiles.full_name}
                      </option>
                    ) : null
                  )}
                </select>
              ) : (
                <span className="text-sm text-fg">
                  {t.assignee_name ?? '—'}
                </span>
              )}
            </Meta>

            {/* Автор */}
            <Meta label="Автор">
              <span className="text-sm text-fg">{t.author_name ?? '—'}</span>
            </Meta>

            {/* Приоритет */}
            <Meta label="Приоритет">
              {isManager ? (
                <select
                  value={t.priority ?? 'medium'}
                  onChange={(e) =>
                    details.updateTask({ priority: e.target.value })
                  }
                  className="w-full rounded border border-line bg-app px-2 py-1 text-sm text-fg outline-none focus:border-accent"
                >
                  {Object.entries(PRIORITY).map(([key, val]) => (
                    <option key={key} value={key}>
                      {val.label}
                    </option>
                  ))}
                </select>
              ) : (
                <span
                  className={cn(
                    'inline-block rounded px-2 py-0.5 text-xs font-medium',
                    prio?.badge
                  )}
                >
                  {prio?.label ?? '—'}
                </span>
              )}
            </Meta>

            {/* Срок */}
            <Meta label="Срок">
              {isManager ? (
                <input
                  type="datetime-local"
                  value={toLocalInput(t.due_date)}
                  onChange={(e) =>
                    details.updateTask({
                      due_date: e.target.value
                        ? new Date(e.target.value).toISOString()
                        : null,
                    })
                  }
                  className="w-full rounded border border-line bg-app px-2 py-1 text-sm text-fg outline-none focus:border-accent"
                />
              ) : (
                <span className="text-sm text-fg">
                  {t.due_date ? formatDateTime(t.due_date) : '—'}
                </span>
              )}
            </Meta>

            {/* Создана / Обновлена */}
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
              <textarea
                rows={4}
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                onBlur={saveDesc}
                placeholder="Добавьте описание…"
                className="w-full resize-y rounded-lg border border-line bg-app p-2.5 text-sm text-fg placeholder-muted outline-none focus:border-accent"
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
                  style={{
                    width: `${(checklistDone / checklistTotal) * 100}%`,
                  }}
                />
              </div>
            )}
            <ul className="space-y-1">
              {details.checklist.map((item) => (
                <li key={item.id} className="group flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={item.is_done}
                    onChange={() => details.toggleChecklistItem(item)}
                    className="accent-blue-600"
                  />
                  <span
                    className={cn(
                      'flex-1 text-sm',
                      item.is_done ? 'text-muted line-through' : 'text-fg'
                    )}
                  >
                    {item.text}
                  </span>
                  <button
                    type="button"
                    onClick={() => details.deleteChecklistItem(item.id)}
                    className="text-muted opacity-0 transition hover:text-red-400 group-hover:opacity-100"
                    aria-label="Удалить пункт"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex items-center gap-2">
              <input
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addItem()}
                placeholder="Новый пункт…"
                className="flex-1 rounded border border-line bg-app px-2 py-1 text-sm text-fg placeholder-muted outline-none focus:border-accent"
              />
              <button
                type="button"
                onClick={addItem}
                className="rounded p-1.5 text-muted transition hover:bg-line hover:text-fg"
                aria-label="Добавить пункт"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </section>

          {/* Вложения */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-medium uppercase text-muted">
                Вложения
              </label>
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
                    {(att.user_id === user?.id || isManager) && (
                      <button
                        type="button"
                        onClick={() => details.deleteAttachment(att)}
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
            <ul className="space-y-3">
              {details.comments.map((c) => (
                <li key={c.id} className="flex gap-2.5">
                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-white">
                    {getInitials(c.profiles?.full_name)}
                  </span>
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
                <li className="text-sm text-muted/60">Пока нет комментариев</li>
              )}
            </ul>
            <div className="mt-3 flex items-center gap-2">
              <input
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendComment()}
                placeholder="Написать комментарий…"
                className="flex-1 rounded-lg border border-line bg-app px-3 py-2 text-sm text-fg placeholder-muted outline-none focus:border-accent"
              />
              <button
                type="button"
                onClick={sendComment}
                disabled={!commentText.trim()}
                className="rounded-lg bg-accent p-2 text-white transition hover:bg-accent-hover disabled:opacity-50"
                aria-label="Отправить"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
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
      </aside>
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
