import { useState, useEffect } from 'react'
import { Search, UserPlus } from 'lucide-react'
import Modal from '../../ui/Modal'
import Avatar from '../../ui/Avatar'
import Button from '../../ui/Button'
import { SkeletonText } from '../../ui/Skeleton'
import { useToast } from '../../ui/Toast'

export default function AddMemberModal({ settings, onClose }) {
  const { getAvailableProfiles, addMember } = settings
  const { toast } = useToast()
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [addingId, setAddingId] = useState(null)

  const load = async () => {
    setLoading(true)
    const { data, error } = await getAvailableProfiles()
    setLoading(false)
    if (error) toast.error(error)
    else setList(data)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = list.filter((p) =>
    p.full_name?.toLowerCase().includes(search.trim().toLowerCase())
  )

  const add = async (profile) => {
    setAddingId(profile.id)
    const { error } = await addMember(profile.id, 'member')
    setAddingId(null)
    if (error) {
      toast.error(error)
      return
    }
    toast.success(`${profile.full_name} добавлен(а)`)
    // убираем из локального списка, оставляем модалку открытой
    setList((l) => l.filter((p) => p.id !== profile.id))
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Добавить участника"
      size="md"
      footer={
        <Button variant="ghost" onClick={onClose}>
          Готово
        </Button>
      }
    >
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по имени…"
          className="w-full rounded-lg border border-line bg-app py-2 pl-8 pr-3 text-sm text-fg placeholder-muted outline-none focus:border-accent"
        />
      </div>

      {loading ? (
        <SkeletonText lines={4} />
      ) : filtered.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">
          {list.length === 0
            ? 'Все активные сотрудники уже в проекте'
            : 'Никого не найдено'}
        </p>
      ) : (
        <ul className="max-h-80 space-y-1 overflow-y-auto">
          {filtered.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-line"
            >
              <Avatar name={p.full_name} src={p.avatar_url} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-fg">{p.full_name}</p>
                {p.position && (
                  <p className="truncate text-xs text-muted">{p.position}</p>
                )}
              </div>
              <Button
                size="sm"
                variant="secondary"
                loading={addingId === p.id}
                onClick={() => add(p)}
              >
                <UserPlus className="h-4 w-4" />
                Добавить
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
