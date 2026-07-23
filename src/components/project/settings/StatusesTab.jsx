import { useState, useEffect } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Trash2, Plus, AlertTriangle } from 'lucide-react'
import Button from '../../ui/Button'
import Tooltip from '../../ui/Tooltip'
import { useToast } from '../../ui/Toast'

const COLORS = [
  '#94a3b8',
  '#3b82f6',
  '#f59e0b',
  '#ef4444',
  '#22c55e',
  '#7c3aed',
  '#db2777',
  '#0891b2',
]

const FLAGS = [
  { key: 'is_initial', label: 'Начальный', hint: 'Сюда попадают новые задачи' },
  { key: 'is_final', label: 'Финальный', hint: 'Задача считается выполненной' },
  { key: 'is_rework', label: 'Доработка', hint: 'Увеличивает счётчик возвратов' },
  {
    key: 'requires_comment',
    label: 'Требует комментарий',
    hint: 'Нельзя перевести без пояснения',
  },
]

function StatusRow({ status, onUpdate, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: status.id })
  const [name, setName] = useState(status.name)
  const [paletteOpen, setPaletteOpen] = useState(false)

  useEffect(() => setName(status.name), [status.name])

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const saveName = () => {
    const v = name.trim()
    if (v && v !== status.name) onUpdate(status, { name: v })
    else setName(status.name)
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className="flex items-center gap-3 rounded-lg border border-line bg-app p-2.5"
    >
      {/* Ручка перетаскивания */}
      <button
        type="button"
        className="cursor-grab text-muted transition hover:text-fg active:cursor-grabbing"
        aria-label="Перетащить"
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {/* Цвет */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setPaletteOpen((v) => !v)}
          className="h-5 w-5 flex-shrink-0 rounded-full ring-1 ring-line"
          style={{ backgroundColor: status.color ?? '#64748b' }}
          aria-label="Цвет статуса"
        />
        {paletteOpen && (
          <div
            className="absolute left-0 top-7 z-20 grid grid-cols-4 gap-1.5 rounded-lg border border-line bg-surface p-2 shadow-lg"
            onMouseLeave={() => setPaletteOpen(false)}
          >
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  onUpdate(status, { color: c })
                  setPaletteOpen(false)
                }}
                className="h-5 w-5 rounded-full"
                style={{ backgroundColor: c }}
                aria-label={c}
              />
            ))}
          </div>
        )}
      </div>

      {/* Название */}
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={saveName}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        className="w-40 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm text-fg outline-none hover:border-line focus:border-accent"
      />

      {/* Код */}
      <span className="w-24 flex-shrink-0 truncate text-xs text-muted">
        {status.code}
      </span>

      {/* Флаги */}
      <div className="flex flex-1 flex-wrap items-center justify-end gap-3">
        {FLAGS.map((f) => (
          <Tooltip key={f.key} content={f.hint}>
            <label className="flex cursor-pointer items-center gap-1 text-xs text-muted">
              <input
                type="checkbox"
                checked={!!status[f.key]}
                onChange={() => onUpdate(status, { flag: f.key })}
                className="accent-blue-600"
              />
              {f.label}
            </label>
          </Tooltip>
        ))}
      </div>

      {/* Удаление */}
      <button
        type="button"
        onClick={() => onDelete(status)}
        className="flex-shrink-0 text-muted transition hover:text-red-400"
        aria-label="Удалить статус"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  )
}

export default function StatusesTab({ settings }) {
  const { statuses, addStatus, updateStatus, deleteStatus, reorderStatuses } =
    settings
  const { toast } = useToast()
  const [items, setItems] = useState(statuses)

  useEffect(() => setItems(statuses), [statuses])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  const initialCount = items.filter((s) => s.is_initial).length
  const finalCount = items.filter((s) => s.is_final).length

  const handleDragEnd = async (event) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = items.findIndex((s) => s.id === active.id)
    const newIndex = items.findIndex((s) => s.id === over.id)
    const next = arrayMove(items, oldIndex, newIndex)
    setItems(next)
    const { error } = await reorderStatuses(next.map((s) => s.id))
    if (error) toast.error(error)
  }

  // Обновление статуса с учётом правил по флагам
  const onUpdate = async (status, patch) => {
    // Смена флага
    if (patch.flag) {
      const key = patch.flag
      if (key === 'is_initial') {
        if (status.is_initial) {
          toast.error('Должен быть ровно один начальный статус')
          return
        }
        // делаем этот начальным, снимаем у остальных
        const prev = items.find((s) => s.is_initial && s.id !== status.id)
        const r1 = await updateStatus(status.id, { is_initial: true })
        if (r1.error) return toast.error(r1.error)
        if (prev) await updateStatus(prev.id, { is_initial: false })
        return
      }
      if (key === 'is_final') {
        if (status.is_final && finalCount === 1) {
          toast.error('Нужен хотя бы один финальный статус')
          return
        }
        const r = await updateStatus(status.id, { is_final: !status.is_final })
        if (r.error) toast.error(r.error)
        return
      }
      const r = await updateStatus(status.id, { [key]: !status[key] })
      if (r.error) toast.error(r.error)
      return
    }
    // Обычное поле (имя, цвет)
    const r = await updateStatus(status.id, patch)
    if (r.error) toast.error(r.error)
  }

  const onDelete = async (status) => {
    if (status.is_initial) {
      toast.error('Нельзя удалить начальный статус — назначьте другой')
      return
    }
    if (status.is_final && finalCount === 1) {
      toast.error('Нельзя удалить единственный финальный статус')
      return
    }
    const { error } = await deleteStatus(status.id)
    if (error) toast.error(error)
    else toast.success('Статус удалён')
  }

  const onAdd = async () => {
    const { error } = await addStatus()
    if (error) toast.error(error)
  }

  return (
    <div className="max-w-3xl space-y-3">
      {/* Предупреждения валидации */}
      {(initialCount !== 1 || finalCount < 1) && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-400">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {initialCount !== 1
            ? 'Должен быть ровно один начальный статус.'
            : 'Нужен хотя бы один финальный статус.'}
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={items.map((s) => s.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {items.map((status) => (
              <StatusRow
                key={status.id}
                status={status}
                onUpdate={onUpdate}
                onDelete={onDelete}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <Button variant="secondary" size="sm" onClick={onAdd}>
        <Plus className="h-4 w-4" />
        Добавить статус
      </Button>
    </div>
  )
}
