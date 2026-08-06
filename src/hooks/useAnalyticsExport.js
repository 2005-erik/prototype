import { useState, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { LOAD_STATE } from '../lib/constants'

// Дата ДД.ММ.ГГГГ
function ru(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`
}

// ISO 'YYYY-MM-DD' → ДД.ММ.ГГГГ
function ruDay(s) {
  return s ? `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}` : ''
}

const fmtDays = (v) => (v == null ? '' : Number(v).toFixed(1))
const fmtPct = (v) => (v == null ? '' : Math.round(Number(v)))

function safeName(name) {
  return (name ?? 'проект').replace(/[\\/:*?"<>|]+/g, '_').trim()
}

function daysInWork(t) {
  if (!t.created_at) return 0
  const end = t.completed_at ? new Date(t.completed_at) : new Date()
  return (end.getTime() - new Date(t.created_at).getTime()) / 86400000
}

// ---------------------------------------------------------------------
// useAnalyticsExport — формирует .xlsx-книгу аналитики (4 листа).
// ---------------------------------------------------------------------
export function useAnalyticsExport() {
  const [exporting, setExporting] = useState(false)

  const exportAnalytics = useCallback(
    async ({ project, period, periodLabel = '', tasks = [] }) => {
      if (!project?.id) return { error: 'Проект не выбран' }
      setExporting(true)
      try {
        const p = { p_project_id: project.id, p_period_days: period }
        const [cycle, ontime, rework, trend, bott, emp] = await Promise.all([
          supabase.rpc('get_cycle_time', p),
          supabase.rpc('get_ontime_stats', p),
          supabase.rpc('get_rework_analysis', p),
          supabase.rpc('get_completion_trend', p),
          supabase.rpc('get_status_bottlenecks', p),
          supabase.rpc('get_employee_stats', p),
        ])
        for (const r of [cycle, ontime, rework, trend, bott, emp]) {
          if (r.error) throw r.error
        }

        const wb = XLSX.utils.book_new()

        // --- Лист «Обзор»: метрики + динамика ---
        const cyc = cycle.data ?? {}
        const ot = ontime.data ?? {}
        const rw = rework.data ?? {}
        const ws1 = XLSX.utils.aoa_to_sheet([
          ['Метрика', 'Значение'],
          ['Среднее время выполнения, дней', fmtDays(cyc.avg_days)],
          ['% в срок', ot.on_time_percent == null ? '—' : fmtPct(ot.on_time_percent)],
          ['Средний возврат', rw.avg_rework ?? 0],
          ['Завершено за период', ot.completed ?? 0],
          [],
          ['Динамика по дням'],
        ])
        XLSX.utils.sheet_add_json(
          ws1,
          (trend.data ?? []).map((d) => ({
            Дата: ruDay(d.date),
            Создано: d.created,
            Завершено: d.completed,
            'Открыто всего': d.open_total,
          })),
          { origin: -1 }
        )
        XLSX.utils.book_append_sheet(wb, ws1, 'Обзор')

        // --- Лист «Узкие места» ---
        const bottRows = (bott.data ?? []).map((r) => ({
          Статус: r.status_name,
          'Среднее, дн': fmtDays(r.avg_days),
          'Медиана, дн': fmtDays(r.median_days),
          'Максимум, дн': fmtDays(r.max_days),
          'Задач прошло': r.tasks_count,
        }))
        XLSX.utils.book_append_sheet(
          wb,
          XLSX.utils.json_to_sheet(
            bottRows.length ? bottRows : [{ Статус: 'Нет данных' }]
          ),
          'Узкие места'
        )

        // --- Лист «Сотрудники» ---
        const empRows = (emp.data ?? []).map((e) => ({
          ФИО: e.full_name,
          Завершено: e.completed,
          'Ср. время, дн': fmtDays(e.avg_completion_days),
          '% в срок': e.on_time_percent == null ? '—' : fmtPct(e.on_time_percent),
          'Ср. возврат': e.avg_rework,
          'В работе': e.active_tasks,
          'На проверке': e.review_tasks,
          'В очереди': e.queued_tasks,
          Просрочено: e.overdue_tasks,
          'Загрузка, %': fmtPct(e.load_percent),
          Состояние: LOAD_STATE[e.load_state]?.label ?? e.load_state ?? '',
        }))
        XLSX.utils.book_append_sheet(
          wb,
          XLSX.utils.json_to_sheet(
            empRows.length ? empRows : [{ ФИО: 'Нет участников' }]
          ),
          'Сотрудники'
        )

        // --- Лист «Проблемные задачи» ---
        const topRework = [...tasks]
          .filter((t) => (t.rework_count ?? 0) > 0)
          .sort((a, b) => (b.rework_count ?? 0) - (a.rework_count ?? 0))
          .slice(0, 10)
        const topLongest = [...tasks]
          .sort((a, b) => daysInWork(b) - daysInWork(a))
          .slice(0, 10)
        const overdue = [...tasks]
          .filter((t) => t.deadline_state === 'overdue')
          .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))

        const problemRows = []
        const push = (cat, t, metric) =>
          problemRows.push({
            Категория: cat,
            Номер: t.number,
            Заголовок: t.title,
            Исполнитель: t.assignee_name ?? '',
            Статус: t.status_name ?? '',
            Показатель: metric,
          })
        topRework.forEach((t) => push('Возвраты', t, `${t.rework_count} возвр.`))
        topLongest.forEach((t) =>
          push('Долгие', t, `${fmtDays(daysInWork(t))} дн`)
        )
        overdue.forEach((t) => push('Просрочено', t, `срок ${ru(t.due_date)}`))

        XLSX.utils.book_append_sheet(
          wb,
          XLSX.utils.json_to_sheet(
            problemRows.length ? problemRows : [{ Категория: 'Нет проблем' }]
          ),
          'Проблемные задачи'
        )

        const label = (periodLabel || '').replace(/\s+/g, '')
        const filename = `Аналитика_${safeName(project.name)}_${label}_${ru(
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

  return { exporting, exportAnalytics }
}
