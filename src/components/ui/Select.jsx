import { useId } from 'react'
import { cn } from '../../lib/utils'

// options — массив { value, label } (необязательно; можно передать children)
export default function Select({
  label,
  error,
  hint,
  options,
  className,
  id,
  children,
  ...rest
}) {
  const autoId = useId()
  const inputId = id ?? autoId
  return (
    <div className={className}>
      {label && (
        <label
          htmlFor={inputId}
          className="mb-1 block text-xs font-medium uppercase text-muted"
        >
          {label}
        </label>
      )}
      <select
        id={inputId}
        className={cn(
          'w-full rounded-lg border bg-app px-3 py-2 text-sm text-fg outline-none transition focus:border-accent',
          error ? 'border-red-500' : 'border-line'
        )}
        {...rest}
      >
        {options
          ? options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))
          : children}
      </select>
      {error ? (
        <p className="mt-1 text-xs text-red-400">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  )
}
