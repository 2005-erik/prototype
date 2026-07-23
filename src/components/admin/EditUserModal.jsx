import { useState } from 'react'
import Modal from '../ui/Modal'
import Input from '../ui/Input'
import Button from '../ui/Button'
import { useToast } from '../ui/Toast'

export default function EditUserModal({ user, onSave, onClose }) {
  const { toast } = useToast()
  const [fullName, setFullName] = useState(user.full_name ?? '')
  const [position, setPosition] = useState(user.position ?? '')
  const [department, setDepartment] = useState(user.department ?? '')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!fullName.trim()) return toast.error('ФИО не может быть пустым')
    setBusy(true)
    const { error } = await onSave({
      full_name: fullName.trim(),
      position: position.trim() || null,
      department: department.trim() || null,
    })
    setBusy(false)
    if (error) toast.error(error)
    else {
      toast.success('Сохранено')
      onClose()
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Редактировать · ${user.full_name}`}
      size="sm"
      closeOnOverlay={!busy}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Отмена
          </Button>
          <Button onClick={submit} loading={busy}>
            Сохранить
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          autoFocus
          label="ФИО"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
        <Input
          label="Должность"
          value={position}
          onChange={(e) => setPosition(e.target.value)}
        />
        <Input
          label="Отдел"
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
        />
      </div>
    </Modal>
  )
}
