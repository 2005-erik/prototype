import Modal from './Modal'
import Button from './Button'

// Диалог подтверждения (управляемый): open / onConfirm / onCancel
export default function ConfirmDialog({
  open,
  title = 'Подтверждение',
  message,
  confirmText = 'Подтвердить',
  cancelText = 'Отмена',
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}) {
  return (
    <Modal
      open={open}
      onClose={loading ? undefined : onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={loading}>
            {cancelText}
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmText}
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted">{message}</p>
    </Modal>
  )
}
