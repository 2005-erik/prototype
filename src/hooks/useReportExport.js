import { useState, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { PRIORITY, LOAD_STATE } from '../lib/constants'

// Дата в формате ДД.ММ.ГГГГ
function ru(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`
}

// Дней от создания до завершения (или до сейчас)
function daysInWork(task) {
  if (!task.created_at) return ''
  const end = task.completed_at ? new Date(task.completed_at) : new Date()
  const days = (end.getTime() - new Date(task.created_at).getTime()) / 86400000
  return Math.max(0, Math.round(days))
}

const ACTION_LABEL = {
  created: 'Создание',
  status_changed: 'Смена статуса',
  assigned: 'Назначение',
  due_changed: 'Смена срока',
  priority_changed: 'Смена приоритета',
}

// Безопасное имя файла
function safeName(name) {
  return (name ?? 'проект').replace(/[\\/:*?"<>|]+/g, '_').trim()
}

// ---------------------------------------------------------------------
// useReportExport — формирует .xlsx-отчёт по проекту (4 листа).
// ---------------------------------------------------------------------
export function useReportExport() {
  const [exporting, setExporting] = useState(false)

  const exportReport = useCallback(
    async ({ project, tasks = [], workload = [], metrics = {}, avg = {}, period = 30 }) => {
      if (!project?.id) return { error: 'Проект не выбран' }
      setExporting(true)
      try {
        // Активность за период
        const since = new Date(Date.now() - period * 86400000).toISOString()
        const { data: activity, error } = await supabase
          .from('task_activity')
          .select(
            'created_at, action, field, old_value, new_value, comment, profiles(full_name), tasks(number)'
          )
          .eq('project_id', project.id)
          .gte('created_at', since)
          .order('created_at', { ascending: false })
        if (error) throw error

        const wb = XLSX.utils.book_new()

        // Лист «Сводка»
        const summary = [
          { Показатель: 'Дата выгрузки', Значение: ru(new Date().toISOString()) },
          { Показатель: 'Период (дней)', Значение: period },
          { Показатель: 'Активных задач', Значение: metrics.active ?? '' },
          { Показатель: 'Просрочено', Значение: metrics.overdue ?? '' },
          { Показатель: 'Срок сегодня', Значение: metrics.dueToday ?? '' },
          { Показатель: 'Застряли > 7 дней', Значение: metrics.stale ?? '' },
          {
            Показатель: 'Средний срок выполнения (дней)',
            Значение: avg.avg_completion_days ?? '',
          },
          {
            Показатель: 'Среднее число возвратов',
            Значение: avg.avg_rework_count ?? '',
          },
        ]
        XLSX.utils.book_append_sheet(
          wb,
          XLSX.utils.json_to_sheet(summary),
          'Сводка'
        )

        // Лист «Задачи»
        const taskRows = tasks.map((t) => ({
          Номер: t.number,
          Заголовок: t.title,
          Статус: t.status_name ?? '',
          Приоритет: PRIORITY[t.priority]?.label ?? t.priority ?? '',
          Исполнитель: t.assignee_name ?? '',
          Автор: t.author_name ?? '',
          Срок: ru(t.due_date),
          Создана: ru(t.created_at),
          Завершена: ru(t.completed_at),
          'Дней в работе': daysInWork(t),
          Возвратов: t.rework_count ?? 0,
        }))
        XLSX.utils.book_append_sheet(
          wb,
          XLSX.utils.json_to_sheet(taskRows),
          'Задачи'
        )

        // Лист «Загрузка»
        const workRows = workload.map((w) => ({
          Сотрудник: w.full_name,
          'В работе': w.active_tasks,
          'В очереди': w.queued_tasks,
          Лимит: w.work_limit,
          Просрочено: w.overdue_tasks,
          Критичных: w.critical_tasks,
          'Загрузка, %': w.load_percent,
          Состояние: LOAD_STATE[w.load_state]?.label ?? w.load_state ?? '',
        }))
        XLSX.utils.book_append_sheet(
          wb,
          XLSX.utils.json_to_sheet(
            workRows.length ? workRows : [{ Сотрудник: 'Нет данных' }]
          ),
          'Загрузка'
        )

        // Лист «Активность»
        const actRows = (activity ?? []).map((a) => ({
          Дата: ru(a.created_at),
          Сотрудник: a.profiles?.full_name ?? '',
          Действие: ACTION_LABEL[a.action] ?? a.action,
          Задача: a.tasks?.number != null ? `#${a.tasks.number}` : '',
          Поле: a.field ?? '',
          Было: a.old_value ?? '',
          Стало: a.new_value ?? '',
          Комментарий: a.comment ?? '',
        }))
        XLSX.utils.book_append_sheet(
          wb,
          XLSX.utils.json_to_sheet(
            actRows.length ? actRows : [{ Дата: 'Нет записей' }]
          ),
          'Активность'
        )

        const filename = `Отчёт_${safeName(project.name)}_${ru(
          new Date().toISOString()
        )}.xlsx`
        XLSX.writeFile(wb, filename)

        return { error: null }
      } catch (err) {
        return { error: err.message ?? 'Не удалось сформировать отчёт' }
      } finally {
        setExporting(false)
      }
    },
    []
  )

  return { exporting, exportReport }
}
