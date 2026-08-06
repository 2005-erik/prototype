import { useState, useEffect, useCallback, useRef } from 'react'
import { registerSW } from 'virtual:pwa-register'

// ---------------------------------------------------------------------
// useOnline — есть ли сеть. navigator.onLine врёт в одну сторону
// (true при подключении к вайфаю без интернета), поэтому дополнительно
// слушаем события и пробуем достучаться до сервера по кнопке «Повторить».
// ---------------------------------------------------------------------
export function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine)

  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])

  // Проверка связи по запросу: возвращает true, если сервер ответил
  const recheck = useCallback(async () => {
    try {
      await fetch(`${window.location.origin}/manifest.webmanifest`, {
        method: 'HEAD',
        cache: 'no-store',
      })
      setOnline(true)
      return true
    } catch {
      setOnline(false)
      return false
    }
  }, [])

  return { online, recheck }
}

// ---------------------------------------------------------------------
// useServiceWorker — регистрация и ожидание новой версии.
// Страницу сами не перезагружаем: решение за пользователем, иначе
// обновление вырвет из-под рук наполовину заполненную форму.
// ---------------------------------------------------------------------
export function useServiceWorker() {
  const [updateReady, setUpdateReady] = useState(false)
  const updateRef = useRef(null)

  useEffect(() => {
    // В dev service worker выключен — регистрировать нечего
    if (!import.meta.env.PROD) return

    updateRef.current = registerSW({
      immediate: true,
      onNeedRefresh() {
        setUpdateReady(true)
      },
    })
  }, [])

  // Переключает страницу на новую версию (перезагрузка — внутри updateSW)
  const applyUpdate = useCallback(() => {
    updateRef.current?.(true)
  }, [])

  return { updateReady, applyUpdate }
}

// ---------------------------------------------------------------------
// useInstallPrompt — установка приложения.
// Chrome/Android даёт beforeinstallprompt; Safari на iPhone — нет,
// там показываем инструкцию «Поделиться → На экран „Домой“».
// ---------------------------------------------------------------------
export function useInstallPrompt() {
  const [promptEvent, setPromptEvent] = useState(null)
  const [installed, setInstalled] = useState(() => isStandalone())

  useEffect(() => {
    const onBeforeInstall = (e) => {
      e.preventDefault() // иначе Chrome покажет свой баннер
      setPromptEvent(e)
    }
    const onInstalled = () => {
      setInstalled(true)
      setPromptEvent(null)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const install = useCallback(async () => {
    if (!promptEvent) return { outcome: 'unavailable' }
    promptEvent.prompt()
    const { outcome } = await promptEvent.userChoice
    setPromptEvent(null)
    return { outcome }
  }, [promptEvent])

  // На iOS ставится только вручную через меню «Поделиться»
  const iosHint = isIos() && !installed && !promptEvent

  return {
    canInstall: !installed && !!promptEvent,
    iosHint,
    installed,
    install,
  }
}

function isStandalone() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  )
}

function isIos() {
  const ua = window.navigator.userAgent
  return /iPad|iPhone|iPod/.test(ua) && !window.MSStream
}
