-- =====================================================================
-- Колонки профиля + журнал входов (A3 из аудита).
-- =====================================================================
alter table public.profiles add column if not exists must_change_password boolean default false;
alter table public.profiles add column if not exists invited_at timestamptz;
alter table public.profiles add column if not exists last_login_at timestamptz;
alter table public.profiles add column if not exists deactivated_at timestamptz;

-- ---------------------------------------------------------------------
-- auth_log — журнал событий аутентификации.
-- ---------------------------------------------------------------------
create table if not exists public.auth_log (
  id          bigserial primary key,
  user_id     uuid references public.profiles (id) on delete set null,
  email       text,
  action      text,   -- 'login' | 'logout' | 'failed_login' | 'password_changed'
  ip_address  text,
  user_agent  text,
  created_at  timestamptz default now()
);

comment on table public.auth_log is 'Журнал событий входа/выхода/сброса пароля';

create index if not exists idx_auth_log_user_created
  on public.auth_log (user_id, created_at desc);
create index if not exists idx_auth_log_created
  on public.auth_log (created_at desc);

-- ---------------------------------------------------------------------
-- RLS: select только admin; insert — только через security definer
-- функцию log_auth_event; update/delete — политик нет (запрещено),
-- как защита task_activity в M1.
-- ---------------------------------------------------------------------
alter table public.auth_log enable row level security;

drop policy if exists auth_log_select on public.auth_log;
create policy auth_log_select on public.auth_log
  for select to authenticated
  using (public.current_user_role() = 'admin');
-- insert/update/delete — политик нет: клиент писать/менять не может,
-- запись идёт только через log_auth_event (SECURITY DEFINER).

-- ---------------------------------------------------------------------
-- log_auth_event — единственный путь записи в auth_log.
-- user_id/email берутся из auth.uid() (нельзя выдать себя за другого).
-- Для action='login' обновляет profiles.last_login_at.
-- ---------------------------------------------------------------------
create or replace function public.log_auth_event(
  p_action text,
  p_ip     text default null,
  p_ua     text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
begin
  if p_action not in ('login', 'logout', 'failed_login', 'password_changed') then
    raise exception 'Недопустимое событие аутентификации: %', p_action;
  end if;

  select email into v_email from auth.users where id = v_uid;

  insert into public.auth_log (user_id, email, action, ip_address, user_agent)
  values (v_uid, v_email, p_action, p_ip, p_ua);

  if p_action = 'login' and v_uid is not null then
    update public.profiles set last_login_at = now() where id = v_uid;
  end if;
end;
$$;

-- Вызывать может только authenticated (своё событие) и service_role
-- (серверные хуки, напр. failed_login). Публичный/anon доступ закрыт.
revoke execute on function public.log_auth_event(text, text, text) from public, anon;
grant execute on function public.log_auth_event(text, text, text) to authenticated, service_role;
