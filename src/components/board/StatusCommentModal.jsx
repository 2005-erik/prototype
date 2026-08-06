import { useState } from 'react'
import { X } from 'lucide-react'

// Модалка обязательного комментария при переходе в статус,
// требующий пояснения (statuses.requires_comment = true).
export default function StatusCommentModal({ pending, onConfirm, onCancel }) {
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)

  if (!pending) return null

  const submit = async () => {
    const value = comment.trim()
    if (!value || busy) return
    setBusy(true)
    await onConfirm(value)
    // Закрытие/сброс делает родитель (размонтирует по key)
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={busy ? undefined : onCancel}
        aria-hidden="true"
      />
      <div
        className="safe-x fixed left-1/2 top-1/2 z-50 w-[calc(100vw-1.5rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-line bg-surface p-4 shadow-xl sm:w-full sm:p-5"
        role="dialog"
        aria-label="Комментарий к смене статуса"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h3 className="text-base font-semibold text-fg">
            Переход в «{pending.statusName}»
          </h3>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg p-1 text-muted transition hover:bg-line hover:text-fg disabled:opacity-50"
            aria-label="Отмена"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mb-2 text-sm text-muted">
          Для этого статуса требуется комментарий.
        </p>

        <textarea
          autoFocus
          rows={4}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
          }}
          placeholder="Причина или пояснение…"
          className="w-full resize-none rounded-lg border border-line bg-app p-2.5 text-sm text-fg placeholder-muted outline-none focus:border-accent"
        />

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg px-3 py-1.5 text-sm text-muted transition hover:text-fg disabled:opacity-50"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!comment.trim() || busy}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-on-accent transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Сохранение…' : 'Подтвердить'}
          </button>
        </div>
      </div>
    </>
  )
}
