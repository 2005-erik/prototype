import { useState } from 'react'
import { RefreshCw, WifiOff, Share } from 'lucide-react'
import { AzimutMark } from '../ui/AzimutLoader'
import Button from '../ui/Button'
import Modal from '../ui/Modal'
import { useOnline, useServiceWorker } from '../../hooks/usePwa'

// Заглушка «нет соединения» поверх интерфейса. Очереди офлайн-правок нет,
// поэтому честно говорим, что работа продолжится со связью.
export function OfflineNotice() {
  const { online, recheck } = useOnline()
  const [checking, setChecking] = useState(false)

  if (online) return null

  const retry = async () => {
    setChecking(true)
    await recheck()
    setChecking(false)
  }

  return (
    <div className="safe-bottom fixed inset-0 z-[70] flex flex-col items-center justify-center gap-5 bg-app/95 px-6 text-center backdrop-blur-sm">
      <AzimutMark size={72} className="opacity-80" />
      <div>
        <p className="flex items-center justify-center gap-2 text-base font-semibold text-fg">
          <WifiOff className="h-4 w-4" />
          Нет соединения
        </p>
        <p className="mt-1.5 max-w-xs text-sm text-muted">
          Задачи появятся, когда связь восстановится.
        </p>
      </div>
      <Button onClick={retry} loading={checking}>
        Повторить
      </Button>
    </div>
  )
}

// Плашка обновления. Сами страницу не перезагружаем — только по кнопке.
export function UpdateBanner() {
  const { updateReady, applyUpdate } = useServiceWorker()
  if (!updateReady) return null

  return (
    <div className="safe-bottom safe-x fixed bottom-0 left-0 right-0 z-[65] flex flex-wrap items-center justify-center gap-3 border-t border-accent/40 bg-surface px-4 py-3 shadow-lg">
      <span className="flex items-center gap-2 text-sm text-fg">
        <RefreshCw className="h-4 w-4 text-accent" />
        Доступно обновление
      </span>
      <Button size="sm" onClick={applyUpdate}>
        Обновить
      </Button>
    </div>
  )
}

// Инструкция для Safari на iPhone: программной установки там нет
export function IosInstallHint({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title="Установить «Азимут»" size="sm">
      <div className="space-y-3 text-sm text-fg">
        <p className="text-muted">
          В Safari приложение добавляется на домашний экран вручную:
        </p>
        <ol className="space-y-2">
          <li className="flex items-start gap-2">
            <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-on-accent">
              1
            </span>
            <span>
              Нажмите{' '}
              <Share className="inline h-4 w-4 align-text-bottom text-accent" />{' '}
              «Поделиться» в нижней панели Safari
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-on-accent">
              2
            </span>
            <span>Выберите «На экран „Домой“»</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-on-accent">
              3
            </span>
            <span>Подтвердите «Добавить»</span>
          </li>
        </ol>
      </div>
    </Modal>
  )
}
