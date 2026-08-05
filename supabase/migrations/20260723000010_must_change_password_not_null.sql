-- =====================================================================
-- must_change_password: гарантируем наличие колонки и ограничение NOT NULL.
-- Колонка могла быть добавлена ранее как nullable (миграции 6/7) —
-- приводим к NOT NULL DEFAULT false, предварительно backfill'я NULL.
-- =====================================================================
alter table public.profiles
  add column if not exists must_change_password boolean not null default false;

-- На случай, если колонка уже существовала без ограничения NOT NULL
update public.profiles
  set must_change_password = false
  where must_change_password is null;

alter table public.profiles
  alter column must_change_password set default false;

alter table public.profiles
  alter column must_change_password set not null;

comment on column public.profiles.must_change_password is
  'Требуется сменить пароль при следующем входе';
