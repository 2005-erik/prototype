-- =====================================================================
-- Денормализация project_id в task_activity:
--  - позволяет фильтровать ленту активности по проекту без джойна;
--  - даёт realtime-фильтр канала (postgres_changes) по project_id;
--  - упрощает RLS select до is_project_member(project_id).
-- =====================================================================

-- 1. Колонка project_id (сначала nullable — для обратного заполнения)
alter table public.task_activity
  add column if not exists project_id uuid
    references public.projects (id) on delete cascade;

-- 2. Обратное заполнение из tasks
update public.task_activity ta
   set project_id = t.project_id
  from public.tasks t
 where t.id = ta.task_id
   and ta.project_id is null;

-- 3. После заполнения — делаем обязательной
alter table public.task_activity
  alter column project_id set not null;

-- 4. Индекс для ленты активности по проекту
create index if not exists idx_task_activity_project_created
  on public.task_activity (project_id, created_at desc);

-- Старый индекс task_activity(task_id, created_at desc) НЕ удаляем:
-- он по-прежнему используется историей конкретной задачи (TaskDrawer,
-- useTaskDetails фильтрует по task_id).

-- =====================================================================
-- 5. Обновляем триггерные функции — заполняют project_id из new.project_id
-- =====================================================================

-- log_task_changes — журнал изменений задачи (before update)
create or replace function public.log_task_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_status public.statuses%rowtype;
  v_new_status public.statuses%rowtype;
  v_actor      uuid := auth.uid();
begin
  new.updated_at := now();

  -- ---- смена статуса ----
  if new.status_id is distinct from old.status_id then
    select * into v_old_status from public.statuses where id = old.status_id;
    select * into v_new_status from public.statuses where id = new.status_id;

    insert into public.task_activity
      (task_id, project_id, user_id, action, field, old_value, new_value)
    values (new.id, new.project_id, v_actor, 'status_changed', 'status_id',
            v_old_status.name, v_new_status.name);

    if coalesce(v_new_status.is_rework, false) then
      new.rework_count := coalesce(new.rework_count, 0) + 1;
    end if;

    if coalesce(v_new_status.is_final, false) then
      new.completed_at := now();
      if new.first_completed_at is null then
        new.first_completed_at := now();
      end if;
    else
      new.completed_at := null;
    end if;

    if v_new_status.code = 'in_progress' and new.started_at is null then
      new.started_at := now();
    end if;

    perform public.track_status_duration(new.id, new.status_id);

    if new.author_id is not null and new.author_id is distinct from v_actor then
      insert into public.notifications (user_id, task_id, type, message)
      values (new.author_id, new.id, 'status_changed',
        'Статус задачи «' || new.title || '» изменён на «' ||
        coalesce(v_new_status.name, '—') || '»');
    end if;
  end if;

  -- ---- смена исполнителя ----
  if new.assignee_id is distinct from old.assignee_id then
    insert into public.task_activity
      (task_id, project_id, user_id, action, field, old_value, new_value)
    values (new.id, new.project_id, v_actor, 'assigned', 'assignee_id',
            old.assignee_id::text, new.assignee_id::text);

    if new.assignee_id is not null and new.assignee_id is distinct from v_actor then
      insert into public.notifications (user_id, task_id, type, message)
      values (new.assignee_id, new.id, 'assigned',
        'Вам назначена задача «' || new.title || '»');
    end if;
  end if;

  -- ---- смена срока ----
  if new.due_date is distinct from old.due_date then
    insert into public.task_activity
      (task_id, project_id, user_id, action, field, old_value, new_value)
    values (new.id, new.project_id, v_actor, 'due_changed', 'due_date',
            old.due_date::text, new.due_date::text);

    if new.assignee_id is not null and new.assignee_id is distinct from v_actor then
      insert into public.notifications (user_id, task_id, type, message)
      values (new.assignee_id, new.id, 'due_changed',
        'Изменён срок задачи «' || new.title || '»');
    end if;
  end if;

  -- ---- смена приоритета ----
  if new.priority is distinct from old.priority then
    insert into public.task_activity
      (task_id, project_id, user_id, action, field, old_value, new_value)
    values (new.id, new.project_id, v_actor, 'priority_changed', 'priority',
            old.priority, new.priority);
  end if;

  return new;
end;
$$;

-- log_task_created — журнал создания задачи (after insert)
create or replace function public.log_task_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := coalesce(auth.uid(), new.author_id);
begin
  insert into public.task_activity (task_id, project_id, user_id, action)
  values (new.id, new.project_id, v_actor, 'created');

  if new.status_id is not null then
    insert into public.task_status_durations (task_id, status_id, entered_at)
    values (new.id, new.status_id, now());
  end if;

  if new.assignee_id is not null and new.assignee_id is distinct from v_actor then
    insert into public.notifications (user_id, task_id, type, message)
    values (new.assignee_id, new.id, 'assigned',
      'Вам назначена задача «' || new.title || '»');
  end if;

  return new;
end;
$$;

-- =====================================================================
-- 6. Упрощаем RLS select на task_activity — прямо по project_id
-- =====================================================================
drop policy if exists task_activity_select on public.task_activity;
create policy task_activity_select on public.task_activity
  for select to authenticated
  using (public.is_project_member(project_id));
