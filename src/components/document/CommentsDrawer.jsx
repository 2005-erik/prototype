import { useState, useRef, useEffect, useMemo } from 'react'
import { Check, RotateCcw, Trash2, Send, AtSign } from 'lucide-react'
import Drawer from '../ui/Drawer'
import Avatar from '../ui/Avatar'
import Button from '../ui/Button'
import { useToast } from '../ui/Toast'
import { cn, formatRelative } from '../../lib/utils'

// Что уже набрано после «@» перед курсором. null — подсказку не показываем.
function mentionQueryAt(text, caret) {
  const before = text.slice(0, caret)
  const at = before.lastIndexOf('@')
  if (at < 0) return null
  // «@» должен начинать слово, иначе это почта или середина слова
  if (at > 0 && !/\s/.test(before[at - 1])) return null
  const typed = before.slice(at + 1)
  // Имя и фамилия — максимум один пробел внутри запроса
  if (!/^[^\n]{0,40}$/.test(typed) || (typed.match(/\s/g) ?? []).length > 1) {
    return null
  }
  return { start: at, query: typed }
}

// ---------------------------------------------------------------------
// Комментарии документа или отдельного раздела.
// Упоминания хранятся списком id: разбирать «@Имя Фамилия» текстом
// ненадёжно — тёзки и правки текста ломают разбор.
// ---------------------------------------------------------------------
export default function CommentsDrawer({
  open,
  onClose,
  section = null,
  documentTitle = '',
  comments = [],
  sectionTitles = {},
  members = [],
  currentUserId,
  canManageDoc = false,
  initialMention = null,
  onAdd,
  onToggleResolved,
  onDelete,
}) {
  const { toast } = useToast()

  const [body, setBody] = useState('')
  const [mentioned, setMentioned] = useState([])
  const [suggest, setSuggest] = useState(null) // { start, query }
  const [picked, setPicked] = useState(0)
  const [sending, setSending] = useState(false)
  const [showResolved, setShowResolved] = useState(false)

  const areaRef = useRef(null)

  // Пришли из меню упоминания — подставляем «@Имя» в поле ввода
  useEffect(() => {
    if (!open) return
    if (initialMention?.id) {
      setBody(`@${initialMention.label} `)
      setMentioned([initialMention.id])
    } else {
      setBody('')
      setMentioned([])
    }
    setSuggest(null)
    setShowResolved(false)
  }, [open, initialMention])

  const unresolved = comments.filter((c) => !c.resolved)
  const resolved = comments.filter((c) => c.resolved)

  const matches = useMemo(() => {
    if (!suggest) return []
    const term = suggest.query.trim().toLowerCase()
    return members
      .filter((m) => !term || (m.full_name ?? '').toLowerCase().includes(term))
      .slice(0, 6)
  }, [suggest, members])

  const onType = (e) => {
    const value = e.target.value
    setBody(value)
    setSuggest(mentionQueryAt(value, e.target.selectionStart ?? value.length))
    setPicked(0)
  }

  const insertMention = (member) => {
    if (!suggest) return
    const caret = areaRef.current?.selectionStart ?? body.length
    const next = `${body.slice(0, suggest.start)}@${member.full_name} ${body.slice(caret)}`
    setBody(next)
    setMentioned((prev) => (prev.includes(member.id) ? prev : [...prev, member.id]))
    setSuggest(null)
    // Курсор должен встать сразу после вставленного имени
    const position = suggest.start + member.full_name.length + 2
    requestAnimationFrame(() => {
      areaRef.current?.focus()
      areaRef.current?.setSelectionRange(position, position)
    })
  }

  const onKeyDown = (e) => {
    if (suggest && matches.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setPicked((p) => (p + 1) % matches.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setPicked((p) => (p - 1 + matches.length) % matches.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        insertMention(matches[picked])
        return
      }
      if (e.key === 'Escape') {
        setSuggest(null)
        return
      }
    }
    // Ctrl/Cmd+Enter отправляет: обычный Enter нужен для переносов строк
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send()
  }

  const send = async () => {
    const text = body.trim()
    if (!text || sending) return
    setSending(true)
    // Упоминание могли стереть из текста — уведомляем только тех,
    // чьё имя в комментарии осталось
    const kept = mentioned.filter((id) => {
      const member = members.find((m) => m.id === id)
      return member && text.includes(`@${member.full_name}`)
    })
    const { error } = await onAdd({
      body: text,
      sectionId: section?.id ?? null,
      mentions: kept,
    })
    setSending(false)
    if (error) {
      toast.error(error)
      return
    }
    setBody('')
    setMentioned([])
    setSuggest(null)
  }

  const canResolve = (comment) =>
    canManageDoc ||
    comment.author_id === currentUserId ||
    (section && section.assignee_id === currentUserId)

  const canRemove = (comment) =>
    canManageDoc || comment.author_id === currentUserId

  const renderComment = (comment) => (
    <li
      key={comment.id}
      className={cn(
        'rounded-lg border border-line bg-app p-3 transition',
        comment.resolved && 'opacity-60'
      )}
    >
      <div className="flex items-center gap-2">
        <Avatar
          name={comment.author?.full_name}
          src={comment.author?.avatar_url}
          size="xs"
        />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">
          {comment.author?.full_name ?? 'Пользователь'}
        </span>
        <span className="flex-shrink-0 text-xs text-muted">
          {formatRelative(comment.created_at)}
        </span>

        {canResolve(comment) && (
          <button
            type="button"
            onClick={() => onToggleResolved(comment)}
            className="flex-shrink-0 rounded p-1 text-muted transition hover:text-fg"
            title={comment.resolved ? 'Вернуть в работу' : 'Пометить решённым'}
            aria-label={comment.resolved ? 'Вернуть в работу' : 'Пометить решённым'}
          >
            {comment.resolved ? (
              <RotateCcw className="h-3.5 w-3.5" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
          </button>
        )}
        {canRemove(comment) && (
          <button
            type="button"
            onClick={() => onDelete(comment)}
            className="flex-shrink-0 rounded p-1 text-muted transition hover:text-red-400"
            aria-label="Удалить комментарий"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Комментарий ко всему документу показывает, к какому он разделу */}
      {!section && comment.section_id && (
        <p className="mt-1.5 text-xs text-accent">
          {sectionTitles[comment.section_id] ?? 'Раздел'}
        </p>
      )}

      <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-fg">
        {comment.body}
      </p>
    </li>
  )

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={520}
      title={
        section ? (
          <>
            Комментарии к разделу
            <span className="mt-0.5 block truncate text-xs font-normal text-muted">
              {section.title}
            </span>
          </>
        ) : (
          <>
            Комментарии
            <span className="mt-0.5 block truncate text-xs font-normal text-muted">
              {documentTitle}
            </span>
          </>
        )
      }
      footer={
        // Ввод живёт в подвале панели: список комментариев прокручивается,
        // а поле ответа всегда на виду
        <div className="relative w-full">
          {suggest && matches.length > 0 && (
            <div className="absolute bottom-full left-0 right-0 mb-1 overflow-hidden rounded-lg border border-line bg-surface shadow-lg">
              {matches.map((member, index) => (
                <button
                  key={member.id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    insertMention(member)
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition',
                    index === picked ? 'bg-line text-fg' : 'text-muted hover:bg-line'
                  )}
                >
                  <Avatar name={member.full_name} src={member.avatar_url} size="xs" />
                  <span className="min-w-0 flex-1 truncate">{member.full_name}</span>
                  {member.position && (
                    <span className="flex-shrink-0 text-xs text-muted/70">
                      {member.position}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          <textarea
            ref={areaRef}
            rows={3}
            value={body}
            onChange={onType}
            onKeyDown={onKeyDown}
            placeholder="Комментарий. @ — упомянуть участника"
            className="w-full resize-y rounded-lg border border-line bg-app p-2.5 text-sm text-fg placeholder-muted outline-none transition focus:border-accent"
          />
          <div className="mt-2 flex items-center gap-2">
            <span className="flex items-center gap-1 text-xs text-muted">
              <AtSign className="h-3.5 w-3.5" />
              упоминание уведомит участника
            </span>
            <Button
              size="sm"
              className="ml-auto"
              onClick={send}
              loading={sending}
              disabled={!body.trim()}
            >
              <Send className="h-3.5 w-3.5" />
              Отправить
            </Button>
          </div>
        </div>
      }
    >
      {unresolved.length === 0 && resolved.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted/60">
          Пока нет комментариев
        </p>
      ) : (
        <ul className="space-y-2">{unresolved.map(renderComment)}</ul>
      )}

      {resolved.length > 0 && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowResolved((v) => !v)}
            className="text-xs font-medium text-accent transition hover:underline"
          >
            {showResolved
              ? 'Скрыть решённые'
              : `Показать решённые (${resolved.length})`}
          </button>
          {showResolved && (
            <ul className="mt-2 space-y-2">{resolved.map(renderComment)}</ul>
          )}
        </div>
      )}
    </Drawer>
  )
}
