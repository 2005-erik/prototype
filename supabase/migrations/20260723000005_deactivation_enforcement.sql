-- =====================================================================
-- A1 — деактивация пользователя enforced на сервере.
--   1) is_active_user() — гейт по profiles.is_active (SECURITY DEFINER)
--   2) helpers is_project_member/manager + current_user_role — учитывают is_active
--   3) identity-политики (= auth.uid()) — добавлен is_active_user()
--   4) change_task_status — гард на деактивацию
--   5) триггер отзыва сессий при is_active → false
-- Данные деактивированного (задачи/история/комментарии) остаются в БД:
-- гейт режет доступ ТОЛЬКО самому деактивированному; для остальных
-- активных пользователей его задачи/история видны как прежде.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Активен ли текущий пользователь
-- ---------------------------------------------------------------------
create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select is_active from public.profiles where id = auth.uid()), false);
$$;

-- ---------------------------------------------------------------------
-- 2. Хелперы учитывают активность.
-- current_user_role → NULL для деактивированного (роль-проверки провалятся).
-- is_project_member/manager → false, если пользователь неактивен.
-- ---------------------------------------------------------------------
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role from public.profiles where id = auth.uid() and is_active;
$$;

create or replace function public.is_project_member(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_active_user() and (
    public.current_user_role() = 'admin'
    or exists (
      select 1 from public.project_members m
       where m.project_id = p_project_id and m.user_id = auth.uid()
    )
  );
$$;

create or replace function public.is_project_manager(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_active_user() and (
    public.current_user_role() = 'admin'
    or exists (
      select 1 from public.project_members m
       where m.project_id = p_project_id
         and m.user_id = auth.uid()
         and m.role in ('owner', 'manager')
    )
  );
$$;

-- ---------------------------------------------------------------------
-- 3. Identity-политики (доступ по = auth.uid()) — добавлен гейт активности.
-- Остальные политики идут через is_project_member/manager (уже с гейтом).
-- ---------------------------------------------------------------------

-- profiles: активный видит все профили; деактивированный — ТОЛЬКО свой
-- (чтобы клиент распознал деактивацию и показал сообщение).
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (public.is_active_user() or id = auth.uid());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (public.is_active_user() and (id = auth.uid() or public.current_user_role() = 'admin'))
  with check (public.is_active_user() and (id = auth.uid() or public.current_user_role() = 'admin'));

-- tasks: менеджер ИЛИ исполнитель — но обязательно активный
drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks
  for update to authenticated
  using (public.is_active_user() and (public.is_project_manager(project_id) or assignee_id = auth.uid()))
  with check (public.is_active_user() and (public.is_project_manager(project_id) or assignee_id = auth.uid()));

-- comments: свои — только активному
drop policy if exists comments_update on public.comments;
create policy comments_update on public.comments
  for update to authenticated
  using (public.is_active_user() and user_id = auth.uid())
  with check (public.is_active_user() and user_id = auth.uid());

drop policy if exists comments_delete on public.comments;
create policy comments_delete on public.comments
  for delete to authenticated
  using (public.is_active_user() and user_id = auth.uid());

-- notifications: свои — только активному
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select to authenticated
  using (public.is_active_user() and user_id = auth.uid());

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications
  for update to authenticated
  using (public.is_active_user() and user_id = auth.uid())
  with check (public.is_active_user() and user_id = auth.uid());

drop policy if exists notifications_delete on public.notifications;
create policy notifications_delete on public.notifications
  for delete to authenticated
  using (public.is_active_user() and user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 4. change_task_status — гард: деактивированный не может сменить статус
-- (ветка assignee_id = auth.uid() иначе прошла бы). Также покрывает
-- вызов RPC напрямую. Пересоздаём с search_path = public, pg_temp.
-- ---------------------------------------------------------------------
create or replace function public.change_task_status(
  p_task_id   uuid,
  p_status_id uuid,
  p_comment   text default null
)
returns public.tasks_enriched
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_task   public.tasks%rowtype;
  v_status public.statuses%rowtype;
  v_result public.tasks_enriched%rowtype;
begin
  -- A1: деактивированный аккаунт не действует
  if not public.is_active_user() then
    raise exception 'Учётная запись деактивирована';
  end if;

  select * into v_task from public.tasks where id = p_task_id;
  if not found then
    raise exception 'Задача не найдена';
  end if;

  if not (v_task.assignee_id = auth.uid() or public.is_project_manager(v_task.project_id)) then
    raise exception 'Недостаточно прав для смены статуса';
  end if;

  select * into v_status
    from public.statuses
   where id = p_status_id
     and project_id = v_task.project_id;
  if not found then
    raise exception 'Статус не принадлежит проекту задачи';
  end if;

  if v_task.status_id is distinct from p_status_id then
    if coalesce(v_status.requires_comment, false)
       and (p_comment is null or btrim(p_comment) = '') then
      raise exception 'Для перевода в этот статус требуется комментарий';
    end if;

    update public.tasks set status_id = p_status_id where id = p_task_id;

    if p_comment is not null and btrim(p_comment) <> '' then
      update public.task_activity
         set comment = p_comment
       where id = (
         select id from public.task_activity
          where task_id = p_task_id and action = 'status_changed'
          order by created_at desc, id desc
          limit 1
       );
    end if;
  end if;

  select * into v_result from public.tasks_enriched where id = p_task_id;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Отзыв активных сессий при деактивации (is_active → false).
-- Удаление auth.sessions каскадно снимает refresh-токены — новый
-- access-токен получить нельзя, а действующий обесценен RLS-гейтом.
-- ---------------------------------------------------------------------
create or replace function public.revoke_sessions_on_deactivation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.is_active = true and new.is_active = false then
    delete from auth.sessions where user_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_revoke_sessions on public.profiles;
create trigger trg_revoke_sessions
  after update of is_active on public.profiles
  for each row execute function public.revoke_sessions_on_deactivation();
