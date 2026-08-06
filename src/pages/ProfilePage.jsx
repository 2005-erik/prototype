import { useState, useRef, useMemo } from 'react'
import { Camera, Check, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { DEFAULT_WORK_LIMIT } from '../lib/constants'
import Input from '../components/ui/Input'
import Button from '../components/ui/Button'
import Avatar from '../components/ui/Avatar'
import { useToast } from '../components/ui/Toast'
import { cn } from '../lib/utils'

const AVATAR_MIME = ['image/png', 'image/jpeg', 'image/webp']
const AVATAR_MAX = 2 * 1024 * 1024

function pwChecks(pw) {
  return {
    length: pw.length >= 10,
    lower: /[a-zа-яё]/.test(pw),
    upper: /[A-ZА-ЯЁ]/.test(pw),
    digit: /\d/.test(pw),
  }
}
const PW_REQS = [
  { key: 'length', label: 'Минимум 10 символов' },
  { key: 'lower', label: 'Строчная буква' },
  { key: 'upper', label: 'Заглавная буква' },
  { key: 'digit', label: 'Цифра' },
]

export default function ProfilePage() {
  const { user, profile, updateProfile, isEmployee, logAuth } = useAuth()
  const { toast } = useToast()
  const fileRef = useRef(null)

  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [position, setPosition] = useState(profile?.position ?? '')
  const [department, setDepartment] = useState(profile?.department ?? '')
  const [savingProfile, setSavingProfile] = useState(false)
  const [uploading, setUploading] = useState(false)

  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [savingPw, setSavingPw] = useState(false)

  const c = useMemo(() => pwChecks(pw), [pw])
  const pwValid = Object.values(c).every(Boolean) && pw === pw2

  const onPickAvatar = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!AVATAR_MIME.includes(file.type))
      return toast.error('Только PNG, JPEG или WEBP')
    if (file.size > AVATAR_MAX) return toast.error('Файл больше 2 МБ')

    setUploading(true)
    try {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase()
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true })
      if (upErr) throw upErr
      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      const { error: pErr } = await updateProfile({ avatar_url: data.publicUrl })
      if (pErr) throw new Error(pErr)
      toast.success('Аватар обновлён')
    } catch (err) {
      toast.error(err.message ?? 'Не удалось загрузить аватар')
    } finally {
      setUploading(false)
    }
  }

  const saveProfile = async () => {
    if (!fullName.trim()) return toast.error('ФИО не может быть пустым')
    const patch = { full_name: fullName.trim() }
    if (!isEmployee) {
      patch.position = position.trim() || null
      patch.department = department.trim() || null
    }
    setSavingProfile(true)
    const { error } = await updateProfile(patch)
    setSavingProfile(false)
    if (error) toast.error(error)
    else toast.success('Профиль сохранён')
  }

  const changePassword = async () => {
    if (!pwValid) return toast.error('Пароль не соответствует требованиям')
    setSavingPw(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: pw })
      if (error) throw error
      if (user?.id) {
        await supabase
          .from('profiles')
          .update({ must_change_password: false })
          .eq('id', user.id)
      }
      await logAuth('password_changed')
      setPw('')
      setPw2('')
      toast.success('Пароль изменён')
    } catch (err) {
      toast.error(err.message ?? 'Не удалось сменить пароль')
    } finally {
      setSavingPw(false)
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-8">
      {/* Профиль */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-fg">Профиль</h2>

        {/* Аватар */}
        <div className="flex items-center gap-4">
          <div className="relative">
            <Avatar
              name={profile?.full_name}
              src={profile?.avatar_url}
              size="lg"
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="absolute -bottom-1 -right-1 rounded-full border border-line bg-surface p-1.5 text-muted transition hover:text-fg disabled:opacity-50"
              aria-label="Загрузить аватар"
            >
              <Camera className="h-4 w-4" />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={onPickAvatar}
              className="hidden"
            />
          </div>
          <p className="text-xs text-muted">
            PNG / JPEG / WEBP, до 2 МБ
            {uploading && ' · загрузка…'}
          </p>
        </div>

        <Input
          label="ФИО"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />

        <div className="grid grid-cols-2 gap-3">
          {isEmployee ? (
            <div>
              <span className="mb-1 block text-xs font-medium uppercase text-muted">
                Должность
              </span>
              <p className="text-sm text-fg">{profile?.position ?? '—'}</p>
            </div>
          ) : (
            <Input
              label="Должность"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
            />
          )}
          {isEmployee ? (
            <div>
              <span className="mb-1 block text-xs font-medium uppercase text-muted">
                Отдел
              </span>
              <p className="text-sm text-fg">{profile?.department ?? '—'}</p>
            </div>
          ) : (
            <Input
              label="Отдел"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            />
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="mb-1 block text-xs font-medium uppercase text-muted">
              Email
            </span>
            <p className="text-sm text-muted">{user?.email ?? '—'}</p>
          </div>
          <div>
            <span className="mb-1 block text-xs font-medium uppercase text-muted">
              Лимит одновременных задач
            </span>
            <p className="text-sm text-muted">
              {profile?.work_limit ?? DEFAULT_WORK_LIMIT}{' '}
              <span className="text-xs">(задаёт руководитель)</span>
            </p>
          </div>
        </div>

        <Button onClick={saveProfile} loading={savingProfile}>
          Сохранить
        </Button>
      </section>

      {/* Смена пароля */}
      <section className="space-y-4 border-t border-line pt-6">
        <h2 className="text-lg font-semibold text-fg">Смена пароля</h2>
        <Input
          label="Новый пароль"
          type="password"
          autoComplete="new-password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
        />
        <Input
          label="Повторите пароль"
          type="password"
          autoComplete="new-password"
          value={pw2}
          onChange={(e) => setPw2(e.target.value)}
          error={pw2 && pw !== pw2 ? 'Пароли не совпадают' : undefined}
        />
        {pw.length > 0 && (
          <ul className="space-y-1">
            {PW_REQS.map((r) => (
              <li
                key={r.key}
                className={cn(
                  'flex items-center gap-1.5 text-xs',
                  c[r.key] ? 'text-green-400' : 'text-muted'
                )}
              >
                {c[r.key] ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <X className="h-3.5 w-3.5" />
                )}
                {r.label}
              </li>
            ))}
          </ul>
        )}
        <Button onClick={changePassword} loading={savingPw} disabled={!pwValid}>
          Сменить пароль
        </Button>
      </section>
    </div>
  )
}
