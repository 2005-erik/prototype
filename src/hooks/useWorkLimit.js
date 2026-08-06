import { useCallback, useState } from 'react'
import { supabase } from '../lib/supabase'

// Смена лимита одновременных задач сотрудника.
// Права проверяет RPC (админ или руководитель): прямой апдейт profiles
// руководителю не открыт, а RLS не умеет ограничивать отдельные колонки.
export function useWorkLimit() {
  const [saving, setSaving] = useState(false)

  const setWorkLimit = useCallback(async (userId, limit) => {
    setSaving(true)
    try {
      const { error } = await supabase.rpc('set_work_limit', {
        p_user_id: userId,
        p_limit: limit,
      })
      if (error) throw error
      return { error: null }
    } catch (err) {
      return { error: err.message ?? 'Не удалось изменить лимит' }
    } finally {
      setSaving(false)
    }
  }, [])

  return { saving, setWorkLimit }
}
