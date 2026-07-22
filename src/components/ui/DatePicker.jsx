import { cn } from '../../lib/utils'

// ISO → значение input datetime-local / date
function toInput(iso, withTime) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  return withTime ? `${date}T${pad(d.getHours())}:${pad(d.getMinutes())}` : date
}

// Относительный срок (на 18:00) для быстрых кнопок
function quickDue(offsetDays) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  d.setHours(18, 0, 0, 0)
  return d.toISOString()
}

const PRESETS = [
  { label: 'Сегодня', days: 0 },
  { label: 'Завтра', days: 1 },
  { label: 'Через неделю', days: 7 },
]

// value/onChange работают с ISO-строкой (или null)
export default function DatePicker({
  value,
  onChange,
  withTime = true,
  presets = false,
  className,
}) {
  const handle = (e) => {
    const v = e.target.value
    onChange?.(v ? new Date(v).toISOString() : null)
  }

  return (
    <div className={className}>
      <input
        type={withTime ? 'datetime-local' : 'date'}
        value={toInput(value, withTime)}
        onChange={handle}
        className="w-full rounded-lg border border-line bg-app px-3 py-2 text-sm text-fg outline-none transition focus:border-accent"
      />
      {presets && (
        <div className="mt-1.5 flex gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.days}
              type="button"
              onClick={() => onChange?.(quickDue(p.days))}
              className={cn(
                'rounded-lg border border-line px-2 py-1 text-xs text-muted transition hover:border-accent hover:text-fg'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
