import { X } from 'lucide-react'
import { cn } from '../../lib/utils'

const FALLBACK = '#2bbaac'

// Цветной чип тега. Цвет приходит из тега (метки Trello), поэтому
// фон делаем полупрозрачным, а текст — самим цветом: так читается
// на тёмном фоне при любой палитре.
export default function TagChip({ tag, size = 'sm', onRemove, className }) {
  if (!tag) return null
  const color = tag.color || FALLBACK

  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded font-medium',
        size === 'xs' ? 'px-1 py-0 text-[10px]' : 'px-1.5 py-0.5 text-xs',
        className
      )}
      style={{ backgroundColor: `${color}26`, color }}
      title={tag.name}
    >
      <span className="truncate">{tag.name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRemove(tag)
          }}
          className="flex-shrink-0 opacity-70 transition hover:opacity-100"
          aria-label={`Снять тег ${tag.name}`}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  )
}
