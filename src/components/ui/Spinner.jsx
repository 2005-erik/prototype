import { cn } from '../../lib/utils'

// Небольшой индикатор загрузки (наследует цвет текста родителя)
export default function Spinner({ size = 16, className }) {
  return (
    <span
      role="status"
      aria-label="Загрузка"
      className={cn(
        'inline-block animate-spin rounded-full border-2 border-current border-t-transparent',
        className
      )}
      style={{ width: size, height: size }}
    />
  )
}
