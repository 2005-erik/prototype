import { useParams, useNavigate } from 'react-router-dom'
import { FileQuestion } from 'lucide-react'
import { useEnrichedTask } from '../hooks/useTaskDetails'
import {
  useProjectStatusesMap,
  useManagedProjectMembers,
} from '../hooks/useProjects'
import Skeleton from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'
import Button from '../components/ui/Button'
import TaskDrawer from '../components/task/TaskDrawer'

export default function TaskPage() {
  const { taskId } = useParams()
  const navigate = useNavigate()

  const { task, loading } = useEnrichedTask(taskId)
  const statusesByProject = useProjectStatusesMap(
    task?.project_id ? [task.project_id] : []
  )
  const members = useManagedProjectMembers(task?.project_id ?? null)

  const back = () => {
    // Возврат назад, либо на список, если истории нет
    if (window.history.length > 1) navigate(-1)
    else navigate('/my-tasks')
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (!task) {
    return (
      <EmptyState
        icon={FileQuestion}
        title="Задача не найдена"
        description="Возможно, она была удалена или у вас нет доступа."
        action={
          <Button size="sm" onClick={() => navigate('/my-tasks')}>
            К моим задачам
          </Button>
        }
      />
    )
  }

  // Deep-link открывает деталь задачи как сфокусированную панель
  return (
    <TaskDrawer
      task={task}
      statuses={statusesByProject[task.project_id] ?? []}
      members={members}
      onClose={back}
    />
  )
}
