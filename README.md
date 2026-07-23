# Прототип — корпоративный таск-менеджер

React 19 + Vite + Supabase (Postgres + Auth + Realtime + Storage + Edge Functions).

## Запуск фронтенда

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # прод-сборка
npm run lint
```

Переменные окружения — в `.env.local` (не коммитится):

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...      # publishable/anon ключ (публичный)
```

> `service_role` ключ на фронтенде НЕ используется и не должен туда попадать.
> Все привилегированные операции — только в Edge Functions.

## Миграции БД

```bash
supabase db push
```

Проверка RLS/безопасности после применения:

```bash
supabase db execute -f verify_rls.sql   # ассерты падают, если фикс не применён
```

Аудит безопасности и статус находок — в `SECURITY_AUDIT.md`.

## Edge Functions (деплоятся отдельно)

Функции в `supabase/functions/`:

| Функция | Назначение |
|---|---|
| `invite-user` | Приглашение сотрудника (admin) |
| `deactivate-user` | Деактивация + переназначение задач + отзыв сессий (admin) |
| `reset-user-password` | Письмо сброса пароля + флаг must_change_password (admin) |
| `list-users` | Список пользователей с email (admin) |

Все проверяют JWT вызывающего и роль `admin` вручную (`_shared/utils.ts`), т.к.
`service_role` обходит RLS.

### Деплой

```bash
# один раз: залогиниться и связать проект
supabase login
supabase link --project-ref <PROJECT_REF>

# задать секрет (боевой домен для redirectTo в письмах)
supabase secrets set SITE_URL=https://your-app.example.com
# SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY инжектятся автоматически

# деплой всех функций
supabase functions deploy invite-user
supabase functions deploy deactivate-user
supabase functions deploy reset-user-password
supabase functions deploy list-users
```

Для отправки писем (приглашение/сброс) в проекте должен быть настроен **SMTP**
(Dashboard → Authentication → Emails). Прод-настройки auth — см. чек-лист в
`SECURITY_AUDIT.md` (раздел M2).

### Локальный запуск функций

```bash
supabase functions serve --env-file supabase/.env.local
```
