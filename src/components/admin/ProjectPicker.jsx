import { cn } from '../../lib/utils'

// Проекты обязательны для всех ролей, кроме администратора: у admin доступ
// ко всем проектам, а manager/employee вне проектов не видит ни доски,
// ни задач и не попадает в списки исполнителей.
export function projectsRequiredFor(role) {
  return role !== 'admin'
}

// Подсказка под блоком проектов — объясняет, почему выбор обязателен
function hintFor({ required, empty, noProjects }) {
  if (!required)
    return {
      text: 'Администратору проекты не обязательны — у него доступ ко всем. Отметьте, только если нужно добавить его в состав участников.',
      tone: 'muted',
    }
  if (noProjects)
    return {
      text: 'Нет ни одного проекта. Сначала создайте проект — иначе сотрудника некуда добавить.',
      tone: 'warn',
    }
  if (empty)
    return {
      text: 'Отметьте хотя бы один проект. Сотрудник без проекта не увидит ни доски, ни задач и не появится в списках исполнителей.',
      tone: 'warn',
    }
  return { text: 'Сотрудник получит доступ к отмеченным проектам.', tone: 'muted' }
}

// Список проектов с чекбоксами + пояснение об обязательности.
// selected — Set с id проектов.
export default function ProjectPicker({
  projects = [],
  selected,
  onToggle,
  role = 'employee',
  label = 'Проекты',
}) {
  const required = projectsRequiredFor(role)
  const empty = selected.size === 0
  const invalid = required && empty
  const hint = hintFor({ required, empty, noProjects: projects.length === 0 })

  return (
    <div>
      <label className="mb-1 block text-xs font-medium uppercase text-muted">
        {label}
        {required && <span className="ml-1 text-red-400">*</span>}
      </label>

      {projects.length === 0 ? (
        <p className="text-sm text-muted/60">Нет проектов</p>
      ) : (
        <div
          className={cn(
            'max-h-40 space-y-1 overflow-y-auto rounded-lg border bg-app p-2',
            invalid ? 'border-red-500/60' : 'border-line'
          )}
        >
          {projects.map((p) => (
            <label
              key={p.id}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm text-fg hover:bg-line"
            >
              <input
                type="checkbox"
                checked={selected.has(p.id)}
                onChange={() => onToggle(p.id)}
                className="accent-blue-600"
              />
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: p.color ?? '#2563eb' }}
              />
              {p.name}
            </label>
          ))}
        </div>
      )}

      <p
        className={cn(
          'mt-1.5 text-xs',
          hint.tone === 'warn' ? 'text-amber-500' : 'text-muted'
        )}
      >
        {hint.text}
      </p>
    </div>
  )
}
