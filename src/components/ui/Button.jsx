import { cn } from '../../lib/utils'
import { AzimutSpinner } from './AzimutLoader'

const VARIANTS = {
  primary: 'bg-accent text-on-accent hover:bg-accent-hover',
  secondary: 'border border-line bg-surface text-fg hover:border-accent',
  ghost: 'text-muted hover:bg-line hover:text-fg',
  danger: 'bg-red-600 text-white hover:bg-red-500',
}

// max-md:min-h-11 — 44px тач-цель на телефоне; на десктопе кнопки
// остаются компактными, там курсор точный
const SIZES = {
  sm: 'gap-1 px-2.5 py-1 text-xs max-md:min-h-9',
  md: 'gap-1.5 px-3.5 py-2 text-sm max-md:min-h-11',
  lg: 'gap-2 px-5 py-2.5 text-base max-md:min-h-11',
}

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  className,
  children,
  ...rest
}) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-60',
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...rest}
    >
      {loading && <AzimutSpinner size={18} />}
      {children}
    </button>
  )
}
