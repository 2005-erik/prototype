import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, FolderKanban } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import {
  useProjects,
  useProjectsOverview,
} from '../hooks/useProjects'
import Button from '../components/ui/Button'
import Skeleton from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import { useToast } from '../components/ui/Toast'
import ProjectCard from '../components/project/ProjectCard'
import CreateProjectModal from '../components/project/CreateProjectModal'

export default function ProjectsPage() {
  const navigate = useNavigate()
  const { user, isManager, isAdmin } = useAuth()
  const { toast } = useToast()

  const {
    projects,
    loading,
    error,
    createProject,
    updateProject,
    archiveProject,
    deleteProject,
    replaceStatuses,
  } = useProjects({ includeArchived: true })

  const [showArchived, setShowArchived] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [toDelete, setToDelete] = useState(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  useEffect(() => {
    if (error) toast.error(error)
  }, [error, toast])

  const visibleProjects = useMemo(
    () => (showArchived ? projects : projects.filter((p) => !p.is_archived)),
    [projects, showArchived]
  )

  const ids = useMemo(() => projects.map((p) => p.id), [projects])
  const { metrics, members } = useProjectsOverview(ids)

  // Может ли пользователь управлять проектом (для меню карточки)
  const canManage = (project) => {
    if (isAdmin) return true
    const my = (members[project.id] ?? []).find(
      (mem) => mem.profiles?.id === user?.id
    )
    return my?.role === 'owner' || my?.role === 'manager'
  }

  const handleCreate = async ({ name, description, color, statuses }) => {
    const { data, error: err } = await createProject(name, description, color)
    if (err) return { error: err }
    if (statuses) {
      const { error: sErr } = await replaceStatuses(data.id, statuses)
      if (sErr) toast.error(`Проект создан, но статусы не заданы: ${sErr}`)
    }
    toast.success('Проект создан')
    navigate(`/board/${data.id}`)
    return { data }
  }

  const handleArchive = async (project) => {
    const res = project.is_archived
      ? await updateProject(project.id, { is_archived: false })
      : await archiveProject(project.id)
    if (res.error) toast.error(res.error)
    else toast.success(project.is_archived ? 'Возвращён из архива' : 'Проект в архиве')
  }

  const confirmDelete = async () => {
    if (!toDelete) return
    setDeleteBusy(true)
    const { error: err } = await deleteProject(toDelete.id)
    setDeleteBusy(false)
    if (err) toast.error(err)
    else {
      toast.success('Проект удалён')
      setToDelete(null)
    }
  }

  const canCreate = isAdmin || isManager

  return (
    <div>
      {/* Шапка */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-sm text-muted">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="accent-[#ecc371]"
          />
          Показать архивные
        </label>
        {canCreate && (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Новый проект
          </Button>
        )}
      </div>

      {/* Сетка карточек */}
      {loading && projects.length === 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : visibleProjects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="Проектов пока нет"
          description={
            canCreate
              ? 'Создайте первый проект, чтобы начать работу.'
              : 'Проекты, в которых вы участвуете, появятся здесь.'
          }
          action={
            canCreate ? (
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" />
                Новый проект
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {visibleProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              metrics={metrics[project.id]}
              members={members[project.id] ?? []}
              canManage={canManage(project)}
              onOpen={(p) => navigate(`/board/${p.id}`)}
              onSettings={(p) => navigate(`/projects/${p.id}/settings`)}
              onArchive={handleArchive}
              onDelete={setToDelete}
            />
          ))}
        </div>
      )}

      {/* Создание проекта */}
      {createOpen && (
        <CreateProjectModal
          onCreate={handleCreate}
          onClose={() => setCreateOpen(false)}
        />
      )}

      {/* Подтверждение удаления */}
      <ConfirmDialog
        open={!!toDelete}
        title="Удалить проект?"
        message={
          toDelete
            ? `«${toDelete.name}» и все его задачи будут удалены безвозвратно.`
            : ''
        }
        confirmText="Удалить"
        danger
        loading={deleteBusy}
        onConfirm={confirmDelete}
        onCancel={() => !deleteBusy && setToDelete(null)}
      />
    </div>
  )
}
