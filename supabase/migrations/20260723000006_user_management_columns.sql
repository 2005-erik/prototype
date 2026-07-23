-- =====================================================================
-- Колонки для управления пользователями (Edge Functions invite/deactivate/reset).
-- =====================================================================
alter table public.profiles
  add column if not exists invited_at           timestamptz,
  add column if not exists deactivated_at        timestamptz,
  add column if not exists must_change_password  boolean default false;

comment on column public.profiles.invited_at is 'Когда пользователь приглашён';
comment on column public.profiles.deactivated_at is 'Когда деактивирован';
comment on column public.profiles.must_change_password is 'Требуется сменить пароль при следующем входе';
