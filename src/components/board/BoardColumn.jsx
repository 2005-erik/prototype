import { useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Plus, X } from 'lucide-react'
import TaskCard from './TaskCard'
import Button from '../ui/Button'
import ShowMore from '../ui/ShowMore'
import { useIncrementalList } from '../../hooks/useCollapse'
import { cn } from '../../lib/utils'

// Колонка статуса канбан-доски (ширина 320px).
export default function BoardColumn({
  status,
  tasks,
  canManage,
  adding,
  onStartAdd,
  onCancelAdd,
  onSubmitAdd,
  onOpenTask,
  onTaskContextMenu,
  tagsByTask = {},
}) {
  const [title, setTitle] = useState('')

  // Длинные колонки не рендерим целиком: первые 20, дальше по кнопке.
  // Ограничивает и число узлов в DOM, и высоту колонки.
  const { visible, hidden, showMore, showAll, step } = useIncrementalList(tasks, 20)

  // Вся колонка — зона сброса для drag&drop
  const { setNodeRef, isOver } = useDroppable({
    id: `col:${status.id}`,
    data: { type: 'column', statusId: status.id },
  })

  const submit = () => {
    const value = title.trim()
    if (!value) {
      onCancelAdd()
      return
    }
    onSubmitAdd(status.id, value)
    setTitle('')
  }

  return (
    <div className="flex max-h-full w-[85vw] max-w-80 flex-shrink-0 snap-start flex-col sm:w-80">
      {/* Шапка колонки — остаётся на месте при прокрутке списка */}
      <div className="sticky top-0 z-10 mb-2 flex flex-shrink-0 items-center gap-2 bg-app px-1 py-1">
        <span
          className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
          style={{ backgroundColor: status.color ?? '#94a3b8' }}
        />
        <span className="truncate text-sm font-medium text-fg">
          {status.name}
        </span>
        <span className="rounded-full bg-line px-1.5 text-xs text-muted">
          {tasks.length}
        </span>
        {canManage && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onStartAdd(status.id)}
            className="ml-auto !px-1 !py-1"
            aria-label="Добавить задачу"
          >
            <Plus className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Тело колонки — список карточек, зона сброса */}
      <div
        ref={setNodeRef}
        className={cn(
          'flex flex-1 flex-col gap-2 rounded-lg border border-transparent bg-surface p-2 transition',
          'min-h-24 overflow-y-auto',
          isOver && 'border-accent'
        )}
      >
        {/* Быстрое добавление задачи */}
        {adding && (
          <div className="rounded-lg border border-line bg-app p-2">
            <textarea
              autoFocus
              rows={2}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  submit()
                } else if (e.key === 'Escape') {
                  setTitle('')
                  onCancelAdd()
                }
              }}
              placeholder="Название задачи…"
              className="w-full resize-none rounded bg-transparent text-sm text-fg placeholder-muted outline-none"
            />
            <div className="mt-1.5 flex items-center gap-2">
              <Button size="sm" onClick={submit}>
                Добавить
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setTitle('')
                  onCancelAdd()
                }}
                aria-label="Отмена"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        <SortableContext
          items={visible.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {visible.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              tags={tagsByTask[task.id] ?? []}
              onOpen={onOpenTask}
              onContextMenu={onTaskContextMenu}
            />
          ))}
        </SortableContext>

        <ShowMore hidden={hidden} step={step} onMore={showMore} onAll={showAll} />

        {tasks.length === 0 && !adding && (
          <p className="py-6 text-center text-sm text-muted/60">Нет задач</p>
        )}
      </div>
    </div>
  )
}
