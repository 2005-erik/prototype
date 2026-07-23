-- =====================================================================
-- admin_activity — журнал действий администратора (A2 для управления).
-- Запись: service_role (Edge Functions) и log_admin_action (SECURITY
-- DEFINER, для клиентских действий admin). select — только admin.
-- update/delete — политик нет (неизменяемость, как task_activity/auth_log).
-- =====================================================================
create table if not exists public.admin_activity (
  id             bigserial primary key,
  actor_id       uuid references public.profiles (id) on delete set null,
  action         text not null,   -- user_invited | user_deactivated | user_activated
                                   -- | password_reset | role_changed | user_edited
                                   -- | projects_changed
  target_user_id uuid references public.profiles (id) on delete set null,
  details        jsonb,
  created_at     timestamptz default now()
);

comment on table public.admin_activity is 'Журнал административных действий';

create index if not exists idx_admin_activity_created
  on public.admin_activity (created_at desc);
create index if not exists idx_admin_activity_target
  on public.admin_activity (target_user_id, created_at desc);

alter table public.admin_activity enable row level security;

drop policy if exists admin_activity_select on public.admin_activity;
create policy admin_activity_select on public.admin_activity
  for select to authenticated
  using (public.current_user_role() = 'admin');
-- insert/update/delete — политик нет: пишет только service_role (Edge
-- Functions) и log_admin_action (SECURITY DEFINER).

-- ---------------------------------------------------------------------
-- log_admin_action — запись клиентских действий администратора.
-- Проверяет, что вызывающий — активный admin (current_user_role).
-- ---------------------------------------------------------------------
create or replace function public.log_admin_action(
  p_action  text,
  p_target  uuid  default null,
  p_details jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.current_user_role() <> 'admin' then
    raise exception 'Только для администратора';
  end if;
  insert into public.admin_activity (actor_id, action, target_user_id, details)
  values (auth.uid(), p_action, p_target, p_details);
end;
$$;

revoke execute on function public.log_admin_action(text, uuid, jsonb) from public, anon;
grant execute on function public.log_admin_action(text, uuid, jsonb) to authenticated;
