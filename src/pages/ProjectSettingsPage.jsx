import { useState } from 'react'
import { useParams, useNavigate, Navigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useProjectSettings } from '../hooks/useProjectSettings'
import Skeleton from '../components/ui/Skeleton'
import { cn } from '../lib/utils'
import GeneralTab from '../components/project/settings/GeneralTab'
import StatusesTab from '../components/project/settings/StatusesTab'
import MembersTab from '../components/project/settings/MembersTab'

const TABS = [
  { key: 'general', label: 'Общие' },
  { key: 'statuses', label: 'Статусы' },
  { key: 'members', label: 'Участники' },
]

export default function ProjectSettingsPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, isAdmin } = useAuth()
  const settings = useProjectSettings(id)
  const [tab, setTab] = useState('general')

  if (settings.loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-64 w-full max-w-xl" />
      </div>
    )
  }

  // Доступ: только owner/manager проекта (или admin) — иначе редирект
  const myRole = settings.members.find((m) => m.user_id === user?.id)?.role
  const canManage = isAdmin || myRole === 'owner' || myRole === 'manager'
  if (!settings.project || !canManage) {
    return <Navigate to="/projects" replace />
  }

  return (
    <div>
      {/* Заголовок */}
      <div className="mb-5 flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/projects')}
          className="rounded-lg p-1.5 text-muted transition hover:bg-line hover:text-fg"
          aria-label="Назад к проектам"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h2 className="text-lg font-semibold text-fg">
          Настройки · {settings.project.name}
        </h2>
      </div>

      {/* Вкладки */}
      <div className="mb-6 flex gap-1 border-b border-line">
        {TABS.map((tItem) => (
          <button
            key={tItem.key}
            type="button"
            onClick={() => setTab(tItem.key)}
            className={cn(
              '-mb-px border-b-2 px-4 py-2 text-sm font-medium transition',
              tab === tItem.key
                ? 'border-accent text-fg'
                : 'border-transparent text-muted hover:text-fg'
            )}
          >
            {tItem.label}
          </button>
        ))}
      </div>

      {tab === 'general' && (
        <GeneralTab settings={settings} onDeleted={() => navigate('/projects')} />
      )}
      {tab === 'statuses' && <StatusesTab settings={settings} />}
      {tab === 'members' && (
        <MembersTab settings={settings} currentUserId={user?.id} />
      )}
    </div>
  )
}
