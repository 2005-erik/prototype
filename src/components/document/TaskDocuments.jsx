import { Link } from 'react-router-dom'
import Badge from '../ui/Badge'
import { SkeletonText } from '../ui/Skeleton'
import { useTaskDocuments } from '../../hooks/useDocuments'
import { DOC_TYPE, DOC_STATUS } from '../../lib/documents'

// Документы, где эта задача упомянута ссылкой #номер или привязана руками.
// Показывает, откуда задача взялась: требование в ТЗ, пункт протокола.
export default function TaskDocuments({ taskId }) {
  const { documents, loading } = useTaskDocuments(taskId)

  if (loading) return <SkeletonText lines={1} />

  if (documents.length === 0) {
    return <p className="text-sm text-muted/60">Задача не связана с документами</p>
  }

  return (
    <ul className="space-y-1">
      {documents.map((row) => {
        const doc = row.documents
        const type = DOC_TYPE[doc.type] ?? DOC_TYPE.note
        const status = DOC_STATUS[doc.status] ?? DOC_STATUS.draft
        const Icon = type.icon
        return (
          <li key={row.document_id}>
            <Link
              to={`/document/${doc.id}`}
              className="flex items-center gap-2 rounded-lg border border-line bg-app px-2.5 py-1.5 transition hover:border-accent/50"
            >
              <Icon className="h-4 w-4 flex-shrink-0 text-muted" />
              <span className="min-w-0 flex-1 truncate text-sm text-fg">
                {doc.title}
              </span>
              {row.auto && (
                <span
                  className="hidden flex-shrink-0 text-xs text-muted/60 sm:block"
                  title="Связь появилась из ссылки #номер в тексте документа"
                >
                  из текста
                </span>
              )}
              <Badge className={`${status.badge} flex-shrink-0`}>
                {status.label}
              </Badge>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
