-- =====================================================================
-- Row Level Security: хелперы + политики на всех таблицах
-- Хелперы — security definer + stable, чтобы избежать рекурсии политик
-- и лишних пересчётов в рамках запроса.
-- admin трактуется как «полный доступ»: хелперы членства/менеджмента
-- возвращают true для роли admin.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Хелперы
-- ---------------------------------------------------------------------
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_project_member(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.current_user_role() = 'admin'
    or exists (
      select 1
        from public.project_members m
       where m.project_id = p_project_id
         and m.user_id = auth.uid()
    );
$$;

create or replace function public.is_project_manager(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.current_user_role() = 'admin'
    or exists (
      select 1
        from public.project_members m
       where m.project_id = p_project_id
         and m.user_id = auth.uid()
         and m.role in ('owner', 'manager')
    );
$$;

create or replace function public.task_project_id(p_task_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select project_id from public.tasks where id = p_task_id;
$$;

-- =====================================================================
-- Включаем RLS на всех таблицах
-- =====================================================================
alter table public.profiles              enable row level security;
alter table public.projects              enable row level security;
alter table public.project_members       enable row level security;
alter table public.statuses              enable row level security;
alter table public.tasks                 enable row level security;
alter table public.task_status_durations enable row level security;
alter table public.task_activity         enable row level security;
alter table public.comments              enable row level security;
alter table public.attachments           enable row level security;
alter table public.checklist_items       enable row level security;
alter table public.notifications         enable row level security;

-- =====================================================================
-- profiles
-- =====================================================================
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (true);

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.current_user_role() = 'admin')
  with check (id = auth.uid() or public.current_user_role() = 'admin');

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert to authenticated
  with check (public.current_user_role() = 'admin');

drop policy if exists profiles_delete on public.profiles;
create policy profiles_delete on public.profiles
  for delete to authenticated
  using (public.current_user_role() = 'admin');

-- =====================================================================
-- projects
-- =====================================================================
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects
  for select to authenticated
  using (public.is_project_member(id));

drop policy if exists projects_insert on public.projects;
create policy projects_insert on public.projects
  for insert to authenticated
  with check (public.current_user_role() in ('admin', 'manager'));

drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects
  for update to authenticated
  using (public.is_project_manager(id))
  with check (public.is_project_manager(id));

drop policy if exists projects_delete on public.projects;
create policy projects_delete on public.projects
  for delete to authenticated
  using (public.is_project_manager(id));

-- =====================================================================
-- project_members
-- =====================================================================
drop policy if exists project_members_select on public.project_members;
create policy project_members_select on public.project_members
  for select to authenticated
  using (public.is_project_member(project_id));

drop policy if exists project_members_insert on public.project_members;
create policy project_members_insert on public.project_members
  for insert to authenticated
  with check (public.is_project_manager(project_id));

drop policy if exists project_members_update on public.project_members;
create policy project_members_update on public.project_members
  for update to authenticated
  using (public.is_project_manager(project_id))
  with check (public.is_project_manager(project_id));

drop policy if exists project_members_delete on public.project_members;
create policy project_members_delete on public.project_members
  for delete to authenticated
  using (public.is_project_manager(project_id));

-- =====================================================================
-- statuses
-- =====================================================================
drop policy if exists statuses_select on public.statuses;
create policy statuses_select on public.statuses
  for select to authenticated
  using (public.is_project_member(project_id));

drop policy if exists statuses_insert on public.statuses;
create policy statuses_insert on public.statuses
  for insert to authenticated
  with check (public.is_project_manager(project_id));

drop policy if exists statuses_update on public.statuses;
create policy statuses_update on public.statuses
  for update to authenticated
  using (public.is_project_manager(project_id))
  with check (public.is_project_manager(project_id));

drop policy if exists statuses_delete on public.statuses;
create policy statuses_delete on public.statuses
  for delete to authenticated
  using (public.is_project_manager(project_id));

-- =====================================================================
-- tasks
-- =====================================================================
drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks
  for select to authenticated
  using (public.is_project_member(project_id));

drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks
  for insert to authenticated
  with check (public.is_project_manager(project_id));

-- менеджер проекта — любые правки; исполнитель — правки своей задачи
-- (ограничение «только статус» для исполнителя проверяется на уровне приложения)
drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks
  for update to authenticated
  using (public.is_project_manager(project_id) or assignee_id = auth.uid())
  with check (public.is_project_manager(project_id) or assignee_id = auth.uid());

drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete on public.tasks
  for delete to authenticated
  using (public.is_project_manager(project_id));

-- =====================================================================
-- comments
-- =====================================================================
drop policy if exists comments_select on public.comments;
create policy comments_select on public.comments
  for select to authenticated
  using (public.is_project_member(public.task_project_id(task_id)));

drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments
  for insert to authenticated
  with check (
    public.is_project_member(public.task_project_id(task_id))
    and user_id = auth.uid()
  );

drop policy if exists comments_update on public.comments;
create policy comments_update on public.comments
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists comments_delete on public.comments;
create policy comments_delete on public.comments
  for delete to authenticated
  using (user_id = auth.uid());

-- =====================================================================
-- attachments
-- =====================================================================
drop policy if exists attachments_select on public.attachments;
create policy attachments_select on public.attachments
  for select to authenticated
  using (public.is_project_member(public.task_project_id(task_id)));

drop policy if exists attachments_insert on public.attachments;
create policy attachments_insert on public.attachments
  for insert to authenticated
  with check (public.is_project_member(public.task_project_id(task_id)));

drop policy if exists attachments_delete on public.attachments;
create policy attachments_delete on public.attachments
  for delete to authenticated
  using (
    user_id = auth.uid()
    or public.is_project_manager(public.task_project_id(task_id))
  );

-- =====================================================================
-- checklist_items
-- =====================================================================
drop policy if exists checklist_items_select on public.checklist_items;
create policy checklist_items_select on public.checklist_items
  for select to authenticated
  using (public.is_project_member(public.task_project_id(task_id)));

drop policy if exists checklist_items_insert on public.checklist_items;
create policy checklist_items_insert on public.checklist_items
  for insert to authenticated
  with check (public.is_project_member(public.task_project_id(task_id)));

drop policy if exists checklist_items_update on public.checklist_items;
create policy checklist_items_update on public.checklist_items
  for update to authenticated
  using (public.is_project_member(public.task_project_id(task_id)))
  with check (public.is_project_member(public.task_project_id(task_id)));

drop policy if exists checklist_items_delete on public.checklist_items;
create policy checklist_items_delete on public.checklist_items
  for delete to authenticated
  using (public.is_project_member(public.task_project_id(task_id)));

-- =====================================================================
-- task_activity  (пишут триггеры; клиент может только читать/вставлять)
-- =====================================================================
drop policy if exists task_activity_select on public.task_activity;
create policy task_activity_select on public.task_activity
  for select to authenticated
  using (public.is_project_member(public.task_project_id(task_id)));

drop policy if exists task_activity_insert on public.task_activity;
create policy task_activity_insert on public.task_activity
  for insert to authenticated
  with check (true);
-- update/delete — политик нет (запрещено)

-- =====================================================================
-- task_status_durations  (только чтение участником)
-- =====================================================================
drop policy if exists task_status_durations_select on public.task_status_durations;
create policy task_status_durations_select on public.task_status_durations
  for select to authenticated
  using (public.is_project_member(public.task_project_id(task_id)));
-- insert/update/delete — политик нет (пишут триггеры через security definer)

-- =====================================================================
-- notifications  (только свои)
-- =====================================================================
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists notifications_delete on public.notifications;
create policy notifications_delete on public.notifications
  for delete to authenticated
  using (user_id = auth.uid());
-- insert — политик нет (уведомления создают триггеры через security definer)
