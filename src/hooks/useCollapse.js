import { useState, useEffect, useCallback, useMemo } from 'react'

const PREFIX = 'azimut.collapse.'

// Состояние сворачиваемой секции с запоминанием в localStorage.
// key — устойчивый идентификатор секции (не завязывать на индекс).
export function usePersistedCollapse(key, defaultOpen = true) {
  const storageKey = PREFIX + key

  const [open, setOpen] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      return saved === null ? defaultOpen : saved === '1'
    } catch {
      // приватный режим / отключённое хранилище — работаем без запоминания
      return defaultOpen
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, open ? '1' : '0')
    } catch {
      /* не критично */
    }
  }, [storageKey, open])

  const toggle = useCallback(() => setOpen((v) => !v), [])

  return [open, toggle, setOpen]
}

// Постепенный показ длинного списка: сначала step элементов, дальше по кнопке.
// Ограничивает и число узлов в DOM, и высоту страницы.
export function useIncrementalList(items = [], step = 20) {
  const [limit, setLimit] = useState(step)

  // Опустевший набор (другой проект, фильтр) — снова показываем первую порцию
  const total = items.length
  const isEmpty = total === 0
  useEffect(() => {
    setLimit(step)
  }, [step, isEmpty])

  const visible = useMemo(() => items.slice(0, limit), [items, limit])
  const hidden = Math.max(0, total - visible.length)

  const showMore = useCallback(() => setLimit((n) => n + step), [step])
  const showAll = useCallback(() => setLimit(Number.MAX_SAFE_INTEGER), [])
  const reset = useCallback(() => setLimit(step), [step])

  return { visible, hidden, total, showMore, showAll, reset, step }
}
