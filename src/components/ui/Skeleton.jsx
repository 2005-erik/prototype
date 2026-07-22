import { cn } from '../../lib/utils'

// Блок-скелетон загрузки
export default function Skeleton({ className }) {
  return <div className={cn('animate-pulse rounded bg-line', className)} />
}

// Несколько строк-заглушек текста
export function SkeletonText({ lines = 3, className }) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'h-3 animate-pulse rounded bg-line',
            i === lines - 1 && 'w-2/3'
          )}
        />
      ))}
    </div>
  )
}
