import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { purgeStorageSoon } from '../lib/storageCleanup'

// Извлечение понятного сообщения из ошибки Edge Function
async function readError(error) {
  let msg = error.message ?? 'Ошибка сервера'
  try {
    const ctx = error.context
    if (ctx && typeof ctx.json === 'function') {
      const j = await ctx.json()
      if (j?.error) msg = j.error
    }
  } catch {
    /* оставляем error.message */
  }
  return msg
}

// ---------------------------------------------------------------------
// useTrelloImport — запуск импорта (Edge Function) и откат сессии (RPC).
// ---------------------------------------------------------------------
export function useTrelloImport() {
  const [busy, setBusy] = useState(false)

  // Запуск импорта. payload: { trello, project, lists, members, options }
  const runImport = useCallback(async (payload) => {
    setBusy(true)
    try {
      const { data, error } = await supabase.functions.invoke('import-trello', {
        body: payload,
      })
      if (error) return { error: await readError(error) }
      if (data?.error) return { error: data.error }
      return { data: data?.report ?? data }
    } catch (err) {
      return { error: err.message ?? 'Не удалось выполнить импорт' }
    } finally {
      setBusy(false)
    }
  }, [])

  // Откат: удалить всё, что создала сессия импорта
  const rollbackImport = useCallback(async (importId) => {
    try {
      const { data, error } = await supabase.rpc('import_trello_rollback', {
        p_import_id: importId,
      })
      if (error) throw error
      purgeStorageSoon()
      return { data }
    } catch (err) {
      return { error: err.message ?? 'Не удалось отменить импорт' }
    }
  }, [])

  return { busy, runImport, rollbackImport }
}
