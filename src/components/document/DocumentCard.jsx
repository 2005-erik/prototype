import { Link } from 'react-router-dom'
import { MessageSquare, Link2, Trash2 } from 'lucide-react'
import Badge from '../ui/Badge'
import { DOC_TYPE, DOC_STATUS } from '../../lib/documents'
import { formatRelative, plural } from '../../lib/utils'

// Карточка документа в списке: тип, состояние, прогресс по разделам.
export default function DocumentCard({ doc, canDelete = false, onDelete }) {
  const type = DOC_TYPE[doc.type] ?? DOC_TYPE.note
  const status = DOC_STATUS[doc.status] ?? DOC_STATUS.draft
  const Icon = type.icon

  const total = doc.sections_total ?? 0
  const ready = doc.sections_ready ?? 0
  const progress = doc.progress ?? 0

  return (
    <div className="group relative rounded-lg border border-line bg-surface transition hover:border-accent/50">
      <Link to={`/document/${doc.id}`} className="block p-4">
        <div className="flex items-start gap-2.5">
          <Icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-fg">{doc.title}</p>
            <p className="mt-0.5 truncate text-xs text-muted">
              {type.label} · {doc.author_name ?? 'Автор неизвестен'}
            </p>
          </div>
          {/* Место под кнопку удаления, чтобы бейдж не прыгал при наведении */}
          <Badge className={`${status.badge} flex-shrink-0 ${canDelete ? 'mr-6' : ''}`}>
            {status.label}
          </Badge>
        </div>

        {/* Прогресс по разделам */}
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-xs text-muted">
            <span>
              {total === 0
                ? 'Без разделов'
                : `${ready} из ${total} ${plural(total, 'раздела', 'разделов', 'разделов')} готово`}
            </span>
            <span>{progress}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-accent transition-[width]"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted">
          {doc.open_comments > 0 && (
            <span className="flex items-center gap-1">
              <MessageSquare className="h-3.5 w-3.5" />
              {doc.open_comments}
            </span>
          )}
          {doc.tasks_count > 0 && (
            <span className="flex items-center gap-1">
              <Link2 className="h-3.5 w-3.5" />
              {doc.tasks_count}
            </span>
          )}
          <span className="ml-auto">{formatRelative(doc.updated_at)}</span>
        </div>
      </Link>

      {canDelete && (
        <button
          type="button"
          onClick={() => onDelete(doc)}
          className="absolute right-3 top-3 rounded p-1 text-muted opacity-0 transition hover:text-red-400 focus:opacity-100 group-hover:opacity-100"
          aria-label="Удалить документ"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
