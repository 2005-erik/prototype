import { useId } from 'react'
import { cn } from '../../lib/utils'

export default function Textarea({
  label,
  error,
  hint,
  className,
  id,
  rows = 3,
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
      <textarea
        id={inputId}
        rows={rows}
        className={cn(
          'w-full resize-y rounded-lg border bg-app p-2.5 text-sm text-fg placeholder-muted outline-none transition focus:border-accent',
          error ? 'border-red-500' : 'border-line'
        )}
        {...rest}
      />
      {error ? (
        <p className="mt-1 text-xs text-red-400">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  )
}
