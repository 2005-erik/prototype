import { useState } from 'react'
import { History, RotateCcw } from 'lucide-react'
import Drawer from '../ui/Drawer'
import Button from '../ui/Button'
import ConfirmDialog from '../ui/ConfirmDialog'
import EmptyState from '../ui/EmptyState'
import { SkeletonText } from '../ui/Skeleton'
import { useToast } from '../ui/Toast'
import { useSectionVersions } from '../../hooks/useDocuments'
import { docToPlainText } from '../../lib/documents'
import { formatDateTime, formatRelative } from '../../lib/utils'

const PREVIEW_LIMIT = 260

// ---------------------------------------------------------------------
// История версий раздела. Снимки склеиваются по сеансу правки (это делает
// БД), поэтому в списке — осмысленные шаги, а не каждое автосохранение.
// ---------------------------------------------------------------------
export default function VersionHistoryDrawer({
  open,
  onClose,
  section,
  canRestore = false,
  onRestored,
}) {
  const { toast } = useToast()
  const { versions, loading, error, restore } = useSectionVersions(
    open ? section?.id : null
  )

  const [confirm, setConfirm] = useState(null)
  const [restoring, setRestoring] = useState(false)

  const runRestore = async () => {
    setRestoring(true)
    const { error: err } = await restore(confirm.id)
    setRestoring(false)
    setConfirm(null)
    if (err) {
      toast.error(err)
      return
    }
    toast.success('Раздел восстановлен')
    onRestored?.()
  }

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        width={560}
        title={
          <>
            История раздела
            <span className="mt-0.5 block truncate text-xs font-normal text-muted">
              {section?.title}
            </span>
          </>
        }
      >
        {loading ? (
          <SkeletonText lines={4} />
        ) : error ? (
          <p className="py-6 text-center text-sm text-red-400">{error}</p>
        ) : versions.length === 0 ? (
          <EmptyState
            icon={History}
            title="История пуста"
            description="Снимки появятся после первого сохранения раздела."
          />
        ) : (
          <ul className="space-y-2">
            {versions.map((version, index) => {
              const text = docToPlainText(version.content)
              const current = index === 0
              return (
                <li
                  key={version.id}
                  className="rounded-lg border border-line bg-app p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-fg">
                      {version.author?.full_name ?? 'Кто-то'}
                    </span>
                    <span
                      className="text-xs text-muted"
                      title={formatDateTime(version.created_at)}
                    >
                      {formatRelative(version.created_at)}
                    </span>
                    {current && (
                      <span className="rounded bg-line px-1.5 py-0.5 text-[11px] text-muted">
                        текущая
                      </span>
                    )}
                    {canRestore && !current && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="ml-auto"
                        onClick={() => setConfirm(version)}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Восстановить
                      </Button>
                    )}
                  </div>

                  {version.title && version.title !== section?.title && (
                    <p className="mt-1 text-xs text-accent">
                      Заголовок: {version.title}
                    </p>
                  )}

                  <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-muted">
                    {text
                      ? text.length > PREVIEW_LIMIT
                        ? `${text.slice(0, PREVIEW_LIMIT)}…`
                        : text
                      : 'Пустой раздел'}
                  </p>
                </li>
              )
            })}
          </ul>
        )}
      </Drawer>

      <ConfirmDialog
        open={Boolean(confirm)}
        title="Восстановить версию?"
        message={
          confirm
            ? `Текст раздела вернётся к состоянию от ${formatDateTime(confirm.created_at)}. Текущая версия сохранится в истории — откат можно отменить.`
            : ''
        }
        confirmText="Восстановить"
        loading={restoring}
        onConfirm={runRestore}
        onCancel={() => setConfirm(null)}
      />
    </>
  )
}
