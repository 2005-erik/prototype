import { useState } from 'react'
import { Users } from 'lucide-react'
import { useEmployeeStats } from '../../hooks/useAnalytics'
import Skeleton from '../ui/Skeleton'
import EmptyState from '../ui/EmptyState'
import EmployeeTable from './EmployeeTable'
import ComparisonRadar from './ComparisonRadar'

export default function EmployeesTab({ projectId, period }) {
  const { data, loading } = useEmployeeStats(projectId, period)
  const [selected, setSelected] = useState(() => new Set())

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else if (next.size < 4) next.add(id)
      return next
    })
  }

  if (loading && !data) {
    return <Skeleton className="h-72 w-full" />
  }

  const rows = data ?? []
  if (rows.length === 0) {
    return <EmptyState icon={Users} title="Нет участников" />
  }

  const selectedRows = rows.filter((e) => selected.has(e.user_id))

  return (
    <div className="space-y-5">
      {/* Плашка: метрики о процессе, не о людях */}
      <p className="rounded-lg bg-line/40 px-3 py-2 text-xs text-muted">
        Метрики отражают процесс, а не производительность людей. Задачи
        различаются по сложности — используйте данные для поиска проблем в
        процессе, а не для оценки сотрудников.
      </p>

      <EmployeeTable
        rows={rows}
        selected={selected}
        onToggleSelect={toggleSelect}
      />

      {/* Радар сравнения */}
      <section className="rounded-lg border border-line bg-surface p-4">
        <h3 className="mb-1 text-sm font-semibold text-fg">Сравнение</h3>
        <p className="mb-3 text-xs text-muted">
          Отметьте до 4 сотрудников в таблице. Значения нормированы 0–100
          относительно выбранных.
        </p>
        <ComparisonRadar employees={selectedRows} />
      </section>
    </div>
  )
}
