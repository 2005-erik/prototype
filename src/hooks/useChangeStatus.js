import { useCallback } from 'react'
import { supabase } from '../lib/supabase'

// Универсальная смена статуса задачи через RPC change_task_status.
// Возвращает функцию changeStatus(taskId, statusId, comment) → { error }.
export function useChangeStatus() {
  return useCallback(async (taskId, statusId, comment = null) => {
    try {
      const { error } = await supabase.rpc('change_task_status', {
        p_task_id: taskId,
        p_status_id: statusId,
        p_comment: comment,
      })
      if (error) throw error
      return { error: null }
    } catch (err) {
      return { error: err.message ?? 'Не удалось сменить статус' }
    }
  }, [])
}
