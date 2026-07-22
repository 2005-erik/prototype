// Заглушка «пусто» с иконкой, текстом и опциональным действием
export default function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {Icon && <Icon className="mb-3 h-10 w-10 text-muted/50" />}
      {title && <p className="text-sm font-medium text-fg">{title}</p>}
      {description && (
        <p className="mt-1 max-w-xs text-sm text-muted">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
