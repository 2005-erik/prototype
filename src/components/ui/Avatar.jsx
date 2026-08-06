import { getInitials, cn } from '../../lib/utils'

const SIZES = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-7 w-7 text-[11px]',
  md: 'h-9 w-9 text-sm',
  lg: 'h-12 w-12 text-base',
}

export default function Avatar({ name, src, size = 'md', className, title }) {
  const cls = SIZES[size] ?? SIZES.md
  if (src) {
    return (
      <img
        src={src}
        alt={name ?? ''}
        title={title ?? name}
        className={cn('flex-shrink-0 rounded-full object-cover', cls, className)}
      />
    )
  }
  return (
    <span
      title={title ?? name}
      className={cn(
        'flex flex-shrink-0 items-center justify-center rounded-full bg-accent font-semibold text-on-accent',
        cls,
        className
      )}
    >
      {getInitials(name)}
    </span>
  )
}
