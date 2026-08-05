import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Upload,
  FileJson,
  Check,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Info,
  Import,
  Paperclip,
  MessageSquareWarning,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useProjects } from '../hooks/useProjects'
import { useTrelloImport } from '../hooks/useTrelloImport'
import {
  parseTrello,
  summarize,
  sortedLists,
  suggestStatusCode,
} from '../lib/trello'
import Button from '../components/ui/Button'
import Select from '../components/ui/Select'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import { useToast } from '../components/ui/Toast'
import { cn } from '../lib/utils'

// Статусы по умолчанию нового проекта (создаются триггером БД) — по code
const DEFAULT_STATUS_OPTIONS = [
  { value: 'code:new', label: 'Новая' },
  { value: 'code:in_progress', label: 'В работе' },
  { value: 'code:review', label: 'На проверке' },
  { value: 'code:rework', label: 'На доработке' },
  { value: 'code:done', label: 'Выполнено' },
]

const STEPS = [
  { n: 1, label: 'Файл' },
  { n: 2, label: 'Проект' },
  { n: 3, label: 'Статусы' },
  { n: 4, label: 'Участники' },
]

function Stepper({ step }) {
  return (
    <div className="mb-6 flex items-center gap-2">
      {STEPS.map((s, i) => (
        <div key={s.n} className="flex items-center gap-2">
          <div
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold',
              step > s.n
                ? 'bg-accent text-white'
                : step === s.n
                  ? 'bg-accent text-white'
                  : 'border border-line bg-app text-muted'
            )}
          >
            {step > s.n ? <Check className="h-4 w-4" /> : s.n}
          </div>
          <span
            className={cn(
              'text-sm',
              step === s.n ? 'font-medium text-fg' : 'text-muted'
            )}
          >
            {s.label}
          </span>
          {i < STEPS.length - 1 && <div className="mx-1 h-px w-8 bg-line" />}
        </div>
      ))}
    </div>
  )
}

function SummaryRow({ label, value }) {
  return (
    <div className="flex justify-between border-b border-line py-1.5 last:border-0">
      <span className="text-muted">{label}</span>
      <span className="font-medium text-fg">{value}</span>
    </div>
  )
}

export default function TrelloImportPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { projects } = useProjects()
  const { busy, runImport, rollbackImport } = useTrelloImport()

  const [step, setStep] = useState(1)
  const [fileName, setFileName] = useState('')
  const [data, setData] = useState(null)
  const [parseError, setParseError] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef(null)

  // Шаг 2
  const [projectMode, setProjectMode] = useState('new')
  const [existingProjectId, setExistingProjectId] = useState('')

  // Шаг 3/4 контекст назначения
  const [targetStatuses, setTargetStatuses] = useState([]) // [{id,name,code}]
  const [targetProfiles, setTargetProfiles] = useState([]) // [{id,full_name,position}]
  const [statusMap, setStatusMap] = useState({}) // listId -> value
  const [memberMap, setMemberMap] = useState({}) // memberId -> profileId | ''
  const [options, setOptions] = useState({
    import_archived: false,
    import_comments: true,
    import_checklists: true,
  })

  // Результат
  const [report, setReport] = useState(null)
  const [confirmRollback, setConfirmRollback] = useState(false)
  const [rolledBack, setRolledBack] = useState(false)

  const summary = useMemo(() => (data ? summarize(data) : null), [data])
  const lists = useMemo(() => (data ? sortedLists(data) : []), [data])
  const members = useMemo(() => data?.members ?? [], [data])

  // ---- Разбор файла ----
  const handleFile = useCallback(
    async (f) => {
      if (!f) return
      setParseError(null)
      try {
        const text = await f.text()
        const parsed = parseTrello(text)
        setData(parsed)
        setFileName(f.name)
        // сброс зависимых шагов
        setStatusMap({})
        setMemberMap({})
        setReport(null)
        setRolledBack(false)
      } catch (err) {
        setData(null)
        setFileName('')
        setParseError(err.message ?? 'Не удалось разобрать файл')
      }
    },
    []
  )

  const onDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    handleFile(f)
  }

  // ---- Загрузка статусов/профилей проекта назначения (для шагов 3/4) ----
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (projectMode === 'new') {
        setTargetStatuses(
          DEFAULT_STATUS_OPTIONS.map((o) => ({
            id: null,
            code: o.value.slice(5),
            name: o.label,
          }))
        )
        // Для нового проекта назначать можно на любого активного сотрудника
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, full_name, position')
          .eq('is_active', true)
          .order('full_name')
        if (!cancelled) setTargetProfiles(profs ?? [])
        return
      }
      if (!existingProjectId) {
        setTargetStatuses([])
        setTargetProfiles([])
        return
      }
      const [sts, mbrs] = await Promise.all([
        supabase
          .from('statuses')
          .select('id, name, code, position')
          .eq('project_id', existingProjectId)
          .order('position'),
        supabase
          .from('project_members')
          .select('profiles(id, full_name, position)')
          .eq('project_id', existingProjectId),
      ])
      if (cancelled) return
      setTargetStatuses(sts.data ?? [])
      setTargetProfiles((mbrs.data ?? []).map((m) => m.profiles).filter(Boolean))
    }
    load()
    return () => {
      cancelled = true
    }
  }, [projectMode, existingProjectId])

  // ---- Предзаполнение сопоставления статусов ----
  useEffect(() => {
    if (!lists.length || !targetStatuses.length) return
    setStatusMap((prev) => {
      if (Object.keys(prev).length) return prev
      const next = {}
      for (const l of lists) {
        const code = suggestStatusCode(l.name)
        if (projectMode === 'new') {
          next[l.id] = `code:${code}`
        } else {
          const byCode = targetStatuses.find((s) => s.code === code)
          const byName = targetStatuses.find(
            (s) => s.name?.toLowerCase() === String(l.name).toLowerCase()
          )
          const match = byCode ?? byName
          next[l.id] = match ? `id:${match.id}` : '__create__'
        }
      }
      return next
    })
  }, [lists, targetStatuses, projectMode])

  // ---- Предзаполнение сопоставления участников ----
  useEffect(() => {
    if (!members.length || !targetProfiles.length) return
    setMemberMap((prev) => {
      if (Object.keys(prev).length) return prev
      const next = {}
      for (const m of members) {
        const full = String(m.fullName ?? '').toLowerCase()
        const match = targetProfiles.find(
          (p) => full && p.full_name?.toLowerCase() === full
        )
        next[m.id] = match ? match.id : ''
      }
      return next
    })
  }, [members, targetProfiles])

  const statusOptionsFor = useCallback(
    (list) => {
      const base =
        projectMode === 'new'
          ? DEFAULT_STATUS_OPTIONS
          : targetStatuses.map((s) => ({ value: `id:${s.id}`, label: s.name }))
      return [
        ...base,
        { value: '__create__', label: `Создать статус «${list.name}»` },
      ]
    },
    [projectMode, targetStatuses]
  )

  const profileOptions = useMemo(
    () => [
      { value: '', label: 'Не назначать' },
      ...targetProfiles.map((p) => ({
        value: p.id,
        label: p.position ? `${p.full_name} · ${p.position}` : p.full_name,
      })),
    ],
    [targetProfiles]
  )

  // ---- Запуск импорта ----
  const doImport = async () => {
    const outLists = lists.map((l) => {
      const v = statusMap[l.id]
      if (v === '__create__') return { trello_id: l.id, kind: 'create', value: l.name }
      if (v?.startsWith('id:')) return { trello_id: l.id, kind: 'status', value: v.slice(3) }
      if (v?.startsWith('code:')) return { trello_id: l.id, kind: 'code', value: v.slice(5) }
      return { trello_id: l.id, kind: 'create', value: l.name }
    })
    const outMembers = members.map((m) => ({
      trello_id: m.id,
      profile_id: memberMap[m.id] || null,
    }))
    const project =
      projectMode === 'new'
        ? { mode: 'new', name: summary.boardName, desc: summary.boardDesc }
        : { mode: 'existing', id: existingProjectId }

    const { data: rep, error } = await runImport({
      trello: data,
      project,
      lists: outLists,
      members: outMembers,
      options,
    })
    if (error) {
      toast.error(error)
      return
    }
    setReport(rep)
    setStep('result')
    toast.success('Импорт завершён')
  }

  const doRollback = async () => {
    setConfirmRollback(false)
    const { error } = await rollbackImport(report.import_id)
    if (error) {
      toast.error(error)
      return
    }
    setRolledBack(true)
    toast.success('Импорт отменён')
  }

  // ---- Валидация перехода между шагами ----
  const canNext =
    (step === 1 && !!data) ||
    (step === 2 && (projectMode === 'new' || !!existingProjectId)) ||
    (step === 3 && lists.every((l) => statusMap[l.id])) ||
    step === 4

  // =====================================================================
  // Экран результата
  // =====================================================================
  if (step === 'result' && report) {
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <div className="flex items-center gap-2">
          <Import className="h-6 w-6 text-accent" />
          <h2 className="text-xl font-semibold text-fg">Импорт завершён</h2>
        </div>

        {rolledBack ? (
          <div className="rounded-lg border border-line bg-app p-4 text-sm text-muted">
            Импорт отменён — все созданные задачи, чек-пункты и комментарии удалены.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Задач создано', value: report.tasks_created },
                { label: 'Чек-пунктов', value: report.checklists_created },
                { label: 'Комментариев', value: report.comments_created },
              ].map((m) => (
                <div
                  key={m.label}
                  className="rounded-lg border border-line bg-surface p-4 text-center"
                >
                  <div className="text-2xl font-semibold text-fg">{m.value ?? 0}</div>
                  <div className="mt-1 text-xs text-muted">{m.label}</div>
                </div>
              ))}
            </div>

            {/* Предупреждения */}
            <div className="space-y-2">
              {report.warnings?.attachments_manual && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-500">
                  <Paperclip className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    Вложения не переносятся: файлы остались в Trello. Их ссылки
                    добавлены в описание задач — перенесите файлы вручную.
                  </span>
                </div>
              )}
              {report.warnings?.comments_truncated && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-500">
                  <MessageSquareWarning className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    Trello экспортирует только 1000 последних действий —
                    часть старых комментариев могла не попасть в импорт.
                  </span>
                </div>
              )}
            </div>

            {/* Пропущенные */}
            {report.skipped?.length > 0 && (
              <div className="rounded-lg border border-line bg-surface">
                <div className="border-b border-line px-4 py-2.5 text-sm font-medium text-fg">
                  Пропущено: {report.skipped.length}
                  {report.tasks_skipped > 0 &&
                    ` · уже импортированы ранее: ${report.tasks_skipped}`}
                </div>
                <ul className="max-h-56 overflow-y-auto p-3 text-sm">
                  {report.skipped.map((s, i) => (
                    <li key={i} className="flex justify-between gap-3 py-1">
                      <span className="truncate text-fg">{s.name || '—'}</span>
                      <span className="shrink-0 text-muted">{s.reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => setConfirmRollback(true)}
                className="text-red-400"
              >
                Отменить импорт
              </Button>
              <Button onClick={() => navigate(`/board/${report.project_id}`)}>
                Перейти на доску
              </Button>
            </div>
          </>
        )}

        <ConfirmDialog
          open={confirmRollback}
          title="Отменить импорт?"
          message="Все задачи, чек-пункты и комментарии, созданные этим импортом, будут удалены безвозвратно."
          confirmText="Удалить"
          onConfirm={doRollback}
          onCancel={() => setConfirmRollback(false)}
        />
      </div>
    )
  }

  // =====================================================================
  // Мастер
  // =====================================================================
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-5 flex items-center gap-2">
        <Import className="h-6 w-6 text-accent" />
        <h2 className="text-xl font-semibold text-fg">Импорт из Trello</h2>
      </div>

      <Stepper step={step} />

      <div className="rounded-lg border border-line bg-surface p-5">
        {/* -------- Шаг 1: файл -------- */}
        {step === 1 && (
          <div className="space-y-4">
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition',
                dragOver ? 'border-accent bg-accent/5' : 'border-line hover:border-accent/50'
              )}
            >
              <Upload className="h-8 w-8 text-muted" />
              <p className="text-sm text-fg">
                Перетащите JSON-файл экспорта Trello или нажмите для выбора
              </p>
              <p className="text-xs text-muted">
                Доска Trello → Меню → «Ещё» → «Печать и экспорт» → «Экспортировать JSON»
              </p>
              <input
                ref={inputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
            </div>

            {parseError && (
              <div className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-400">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{parseError}</span>
              </div>
            )}

            {summary && (
              <div className="rounded-lg border border-line bg-app p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-fg">
                  <FileJson className="h-4 w-4 text-accent" />
                  {fileName}
                </div>
                <div className="text-sm">
                  <SummaryRow label="Доска" value={summary.boardName} />
                  <SummaryRow label="Списков" value={summary.lists} />
                  <SummaryRow
                    label="Карточек"
                    value={`${summary.cardsActive} активных · ${summary.cardsArchived} архивных`}
                  />
                  <SummaryRow label="Участников" value={summary.members} />
                  <SummaryRow label="Чек-листов" value={summary.checklists} />
                  <SummaryRow label="Комментариев" value={summary.comments} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* -------- Шаг 2: проект -------- */}
        {step === 2 && (
          <div className="space-y-4">
            <label
              className={cn(
                'flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition',
                projectMode === 'new' ? 'border-accent bg-accent/5' : 'border-line hover:bg-line/40'
              )}
            >
              <input
                type="radio"
                name="pmode"
                checked={projectMode === 'new'}
                onChange={() => {
                  setProjectMode('new')
                  setStatusMap({})
                  setMemberMap({})
                }}
                className="mt-0.5 accent-blue-600"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-fg">Создать новый проект</span>
                <span className="block text-xs text-muted">
                  Имя: «{summary?.boardName}»
                  {summary?.boardDesc ? ` · описание из доски` : ''}
                </span>
              </span>
            </label>

            <div
              className={cn(
                'rounded-lg border p-3 transition',
                projectMode === 'existing' ? 'border-accent bg-accent/5' : 'border-line'
              )}
            >
              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="radio"
                  name="pmode"
                  checked={projectMode === 'existing'}
                  onChange={() => {
                    setProjectMode('existing')
                    setStatusMap({})
                    setMemberMap({})
                  }}
                  className="mt-0.5 accent-blue-600"
                />
                <span className="block text-sm font-medium text-fg">
                  Импортировать в существующий проект
                </span>
              </label>
              {projectMode === 'existing' && (
                <Select
                  value={existingProjectId}
                  onChange={(e) => {
                    setExistingProjectId(e.target.value)
                    setStatusMap({})
                    setMemberMap({})
                  }}
                  options={[
                    { value: '', label: '— выберите проект —' },
                    ...projects.map((p) => ({ value: p.id, label: p.name })),
                  ]}
                  className="ml-6 mt-2"
                />
              )}
            </div>
          </div>
        )}

        {/* -------- Шаг 3: статусы -------- */}
        {step === 3 && (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              Сопоставьте списки Trello со статусами системы.
            </p>
            {lists.map((l) => (
              <div key={l.id} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <span className="truncate text-sm text-fg" title={l.name}>
                  {l.name}
                </span>
                <ArrowRight className="h-4 w-4 text-muted" />
                <Select
                  value={statusMap[l.id] ?? ''}
                  onChange={(e) =>
                    setStatusMap((prev) => ({ ...prev, [l.id]: e.target.value }))
                  }
                  options={statusOptionsFor(l)}
                  className="w-full"
                />
              </div>
            ))}
          </div>
        )}

        {/* -------- Шаг 4: участники + опции -------- */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-lg border border-line bg-app p-3 text-xs text-muted">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                В экспорте Trello нет email участников, поэтому сопоставление
                выполняется вручную. Несопоставленные участники не будут
                назначены, а их комментарии сохранятся от вашего имени с пометкой.
              </span>
            </div>

            {members.length === 0 ? (
              <p className="text-sm text-muted">В доске нет участников.</p>
            ) : (
              members.map((m) => (
                <div key={m.id} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-fg">{m.fullName}</span>
                    <span className="block truncate text-xs text-muted">@{m.username}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 text-muted" />
                  <Select
                    value={memberMap[m.id] ?? ''}
                    onChange={(e) =>
                      setMemberMap((prev) => ({ ...prev, [m.id]: e.target.value }))
                    }
                    options={profileOptions}
                    className="w-full"
                  />
                </div>
              ))
            )}

            {/* Опции импорта */}
            <div className="space-y-2 rounded-lg border border-line bg-app p-3">
              <p className="text-xs font-medium uppercase text-muted">Опции</p>
              {[
                { key: 'import_archived', label: `Импортировать архивные карточки (${summary?.cardsArchived ?? 0})` },
                { key: 'import_comments', label: 'Импортировать комментарии' },
                { key: 'import_checklists', label: 'Импортировать чек-листы' },
              ].map((o) => (
                <label key={o.key} className="flex cursor-pointer items-center gap-2 text-sm text-fg">
                  <input
                    type="checkbox"
                    checked={options[o.key]}
                    onChange={(e) =>
                      setOptions((prev) => ({ ...prev, [o.key]: e.target.checked }))
                    }
                    className="accent-blue-600"
                  />
                  {o.label}
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Навигация мастера */}
      <div className="mt-5 flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={() => setStep((s) => Math.max(1, s - 1))}
          disabled={step === 1 || busy}
        >
          <ArrowLeft className="h-4 w-4" />
          Назад
        </Button>

        {step < 4 ? (
          <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
            Далее
            <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={doImport} loading={busy} disabled={!canNext}>
            Импортировать
          </Button>
        )}
      </div>
    </div>
  )
}
