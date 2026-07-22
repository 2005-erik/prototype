-- =====================================================================
-- Функции и триггеры: профили, нумерация, статусы, журнал, уведомления
-- Функции с побочными записями в защищённые таблицы — security definer,
-- чтобы обходить RLS (добавляется в следующей миграции).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. handle_new_user — создание профиля при регистрации в auth.users
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email, 'Пользователь'),
    'employee'
  );
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. set_task_number — сквозная нумерация задач в рамках проекта
-- ---------------------------------------------------------------------
create or replace function public.set_task_number()
returns trigger
language plpgsql
as $$
begin
  if new.number is null then
    select coalesce(max(number), 0) + 1
      into new.number
      from public.tasks
     where project_id = new.project_id;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. create_default_statuses — набор статусов по умолчанию + владелец
-- ---------------------------------------------------------------------
create or replace function public.create_default_statuses()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.statuses
    (project_id, name, code, color, position, is_initial, is_rework, requires_comment, is_final)
  values
    (new.id, 'Новая',        'new',         '#94a3b8', 1, true,  false, false, false),
    (new.id, 'В работе',     'in_progress', '#3b82f6', 2, false, false, false, false),
    (new.id, 'На проверке',  'review',      '#f59e0b', 3, false, false, false, false),
    (new.id, 'На доработке', 'rework',      '#ef4444', 4, false, true,  true,  false),
    (new.id, 'Выполнено',    'done',        '#22c55e', 5, false, false, false, true);

  -- владелец проекта — участник с ролью owner
  if new.owner_id is not null then
    insert into public.project_members (project_id, user_id, role)
    values (new.id, new.owner_id, 'owner')
    on conflict (project_id, user_id) do nothing;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. track_status_duration — учёт времени в статусах (helper)
--    Закрывает открытую запись и открывает новую для нового статуса.
-- ---------------------------------------------------------------------
create or replace function public.track_status_duration(p_task_id uuid, p_new_status uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- закрыть предыдущую открытую запись
  update public.task_status_durations
     set left_at = now(),
         duration_seconds = extract(epoch from (now() - entered_at))::bigint
   where task_id = p_task_id
     and left_at is null;

  -- открыть новую
  insert into public.task_status_durations (task_id, status_id, entered_at)
  values (p_task_id, p_new_status, now());
end;
$$;

-- ---------------------------------------------------------------------
-- 5. log_task_changes — журнал изменений задачи (before update)
-- ---------------------------------------------------------------------
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

    insert into public.task_activity (task_id, user_id, action, field, old_value, new_value)
    values (new.id, v_actor, 'status_changed', 'status_id',
            v_old_status.name, v_new_status.name);

    -- возврат на доработку
    if coalesce(v_new_status.is_rework, false) then
      new.rework_count := coalesce(new.rework_count, 0) + 1;
    end if;

    -- финальный статус — фиксируем завершение
    if coalesce(v_new_status.is_final, false) then
      new.completed_at := now();
      if new.first_completed_at is null then
        new.first_completed_at := now();
      end if;
    else
      -- вышли из финала — снимаем отметку завершения
      new.completed_at := null;
    end if;

    -- начало работы
    if v_new_status.code = 'in_progress' and new.started_at is null then
      new.started_at := now();
    end if;

    -- учёт времени в статусах
    perform public.track_status_duration(new.id, new.status_id);

    -- уведомление автору задачи
    if new.author_id is not null and new.author_id is distinct from v_actor then
      insert into public.notifications (user_id, task_id, type, message)
      values (new.author_id, new.id, 'status_changed',
        'Статус задачи «' || new.title || '» изменён на «' ||
        coalesce(v_new_status.name, '—') || '»');
    end if;
  end if;

  -- ---- смена исполнителя ----
  if new.assignee_id is distinct from old.assignee_id then
    insert into public.task_activity (task_id, user_id, action, field, old_value, new_value)
    values (new.id, v_actor, 'assigned', 'assignee_id',
            old.assignee_id::text, new.assignee_id::text);

    if new.assignee_id is not null and new.assignee_id is distinct from v_actor then
      insert into public.notifications (user_id, task_id, type, message)
      values (new.assignee_id, new.id, 'assigned',
        'Вам назначена задача «' || new.title || '»');
    end if;
  end if;

  -- ---- смена срока ----
  if new.due_date is distinct from old.due_date then
    insert into public.task_activity (task_id, user_id, action, field, old_value, new_value)
    values (new.id, v_actor, 'due_changed', 'due_date',
            old.due_date::text, new.due_date::text);

    if new.assignee_id is not null and new.assignee_id is distinct from v_actor then
      insert into public.notifications (user_id, task_id, type, message)
      values (new.assignee_id, new.id, 'due_changed',
        'Изменён срок задачи «' || new.title || '»');
    end if;
  end if;

  -- ---- смена приоритета ----
  if new.priority is distinct from old.priority then
    insert into public.task_activity (task_id, user_id, action, field, old_value, new_value)
    values (new.id, v_actor, 'priority_changed', 'priority',
            old.priority, new.priority);
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. log_task_created — журнал создания задачи (after insert)
-- ---------------------------------------------------------------------
create or replace function public.log_task_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := coalesce(auth.uid(), new.author_id);
begin
  insert into public.task_activity (task_id, user_id, action)
  values (new.id, v_actor, 'created');

  -- первая запись учёта статуса
  if new.status_id is not null then
    insert into public.task_status_durations (task_id, status_id, entered_at)
    values (new.id, new.status_id, now());
  end if;

  -- уведомление исполнителю
  if new.assignee_id is not null and new.assignee_id is distinct from v_actor then
    insert into public.notifications (user_id, task_id, type, message)
    values (new.assignee_id, new.id, 'assigned',
      'Вам назначена задача «' || new.title || '»');
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 7. notify_on_comment — уведомление автора и исполнителя о комментарии
-- ---------------------------------------------------------------------
create or replace function public.notify_on_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.tasks%rowtype;
begin
  select * into v_task from public.tasks where id = new.task_id;
  if not found then
    return new;
  end if;

  -- автору задачи (если не он комментатор)
  if v_task.author_id is not null and v_task.author_id is distinct from new.user_id then
    insert into public.notifications (user_id, task_id, type, message)
    values (v_task.author_id, new.task_id, 'comment',
      'Новый комментарий к задаче «' || v_task.title || '»');
  end if;

  -- исполнителю (если не он комментатор и это не автор — чтобы не задвоить)
  if v_task.assignee_id is not null
     and v_task.assignee_id is distinct from new.user_id
     and v_task.assignee_id is distinct from v_task.author_id then
    insert into public.notifications (user_id, task_id, type, message)
    values (v_task.assignee_id, new.task_id, 'comment',
      'Новый комментарий к задаче «' || v_task.title || '»');
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 8. check_deadlines — уведомления о сроках (для планировщика)
--    Дедуп: не создаём того же типа, если было за последние 12 часов.
-- ---------------------------------------------------------------------
create or replace function public.check_deadlines()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- приближается срок (в ближайшие 24 часа), задача не завершена
  insert into public.notifications (user_id, task_id, type, message)
  select t.assignee_id, t.id, 'due_soon',
         'Приближается срок задачи «' || t.title || '»'
    from public.tasks t
   where t.assignee_id is not null
     and t.completed_at is null
     and t.due_date is not null
     and t.due_date > now()
     and t.due_date <= now() + interval '24 hours'
     and not exists (
       select 1 from public.notifications n
        where n.task_id = t.id
          and n.user_id = t.assignee_id
          and n.type = 'due_soon'
          and n.created_at > now() - interval '12 hours'
     );

  -- просрочено
  insert into public.notifications (user_id, task_id, type, message)
  select t.assignee_id, t.id, 'overdue',
         'Просрочена задача «' || t.title || '»'
    from public.tasks t
   where t.assignee_id is not null
     and t.completed_at is null
     and t.due_date is not null
     and t.due_date < now()
     and not exists (
       select 1 from public.notifications n
        where n.task_id = t.id
          and n.user_id = t.assignee_id
          and n.type = 'overdue'
          and n.created_at > now() - interval '12 hours'
     );
end;
$$;

-- =====================================================================
-- Триггеры
-- =====================================================================

-- auth.users → создание профиля
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- projects → статусы по умолчанию + владелец
drop trigger if exists trg_create_default_statuses on public.projects;
create trigger trg_create_default_statuses
  after insert on public.projects
  for each row execute function public.create_default_statuses();

-- tasks → нумерация (before insert)
drop trigger if exists trg_set_task_number on public.tasks;
create trigger trg_set_task_number
  before insert on public.tasks
  for each row execute function public.set_task_number();

-- tasks → журнал создания (after insert)
drop trigger if exists trg_log_task_created on public.tasks;
create trigger trg_log_task_created
  after insert on public.tasks
  for each row execute function public.log_task_created();

-- tasks → журнал изменений (before update)
drop trigger if exists trg_log_task_changes on public.tasks;
create trigger trg_log_task_changes
  before update on public.tasks
  for each row execute function public.log_task_changes();

-- comments → уведомления
drop trigger if exists trg_notify_on_comment on public.comments;
create trigger trg_notify_on_comment
  after insert on public.comments
  for each row execute function public.notify_on_comment();
