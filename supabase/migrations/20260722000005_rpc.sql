-- =====================================================================
-- RPC-функции для клиента
-- change_task_status — security definer (контролируемая смена статуса).
-- Аналитические функции (2–5) — security invoker: читают через
-- security_invoker-вью и уважают RLS вызывающего.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. change_task_status — безопасная смена статуса сотрудником/менеджером
-- ---------------------------------------------------------------------
create or replace function public.change_task_status(
  p_task_id   uuid,
  p_status_id uuid,
  p_comment   text default null
)
returns public.tasks_enriched
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task   public.tasks%rowtype;
  v_status public.statuses%rowtype;
  v_result public.tasks_enriched%rowtype;
begin
  select * into v_task from public.tasks where id = p_task_id;
  if not found then
    raise exception 'Задача не найдена';
  end if;

  -- права: только исполнитель или менеджер проекта
  if not (v_task.assignee_id = auth.uid() or public.is_project_manager(v_task.project_id)) then
    raise exception 'Недостаточно прав для смены статуса';
  end if;

  -- статус должен принадлежать проекту задачи
  select * into v_status
    from public.statuses
   where id = p_status_id
     and project_id = v_task.project_id;
  if not found then
    raise exception 'Статус не принадлежит проекту задачи';
  end if;

  -- выполняем переход только если статус реально меняется
  if v_task.status_id is distinct from p_status_id then
    -- обязательный комментарий при переходе
    if coalesce(v_status.requires_comment, false)
       and (p_comment is null or btrim(p_comment) = '') then
      raise exception 'Для перевода в этот статус требуется комментарий';
    end if;

    -- смена статуса (триггер log_task_changes запишет activity/длительности/уведомления)
    update public.tasks set status_id = p_status_id where id = p_task_id;

    -- прикрепляем причину/пояснение к последней записи смены статуса
    if p_comment is not null and btrim(p_comment) <> '' then
      update public.task_activity
         set comment = p_comment
       where id = (
         select id
           from public.task_activity
          where task_id = p_task_id
            and action = 'status_changed'
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
-- 2. get_manager_dashboard — сводка по проекту
-- ---------------------------------------------------------------------
create or replace function public.get_manager_dashboard(p_project_id uuid)
returns json
language sql
stable
set search_path = public
as $$
  select json_build_object(
    'total_tasks',
      (select count(*) from public.tasks where project_id = p_project_id),

    'tasks_by_status', (
      select coalesce(json_agg(x order by x.position), '[]'::json)
      from (
        select s.id       as status_id,
               s.name     as status_name,
               s.color    as status_color,
               s.position as position,
               count(t.id) as count
          from public.statuses s
          left join public.tasks t
            on t.status_id = s.id
           and t.project_id = p_project_id
         where s.project_id = p_project_id
         group by s.id, s.name, s.color, s.position
      ) x
    ),

    'overdue_count',
      (select count(*) from public.tasks_enriched
        where project_id = p_project_id and deadline_state = 'overdue'),

    'due_today',
      (select count(*) from public.tasks
        where project_id = p_project_id
          and completed_at is null
          and due_date::date = current_date),

    'due_this_week',
      (select count(*) from public.tasks
        where project_id = p_project_id
          and completed_at is null
          and due_date >= now()
          and due_date < now() + interval '7 days'),

    'stale_tasks',
      (select count(*) from public.tasks_enriched
        where project_id = p_project_id and is_stale),

    'avg_completion_days',
      (select round(avg(extract(epoch from (completed_at - created_at)) / 86400.0)::numeric, 2)
         from public.tasks
        where project_id = p_project_id and completed_at is not null),

    'avg_rework_count',
      (select round(avg(rework_count)::numeric, 2)
         from public.tasks
        where project_id = p_project_id),

    'workload', (
      select coalesce(json_agg(w), '[]'::json)
        from public.employee_workload w
       where w.project_id = p_project_id
    ),

    'top_reworked', (
      select coalesce(json_agg(r), '[]'::json)
      from (
        select id, number, title, rework_count, assignee_id
          from public.tasks
         where project_id = p_project_id
           and rework_count > 0
         order by rework_count desc, number
         limit 5
      ) r
    )
  );
$$;

-- ---------------------------------------------------------------------
-- 3. get_my_day — экран сотрудника: срезы задач с сортировкой
-- ---------------------------------------------------------------------
create or replace function public.get_my_day(p_user_id uuid default auth.uid())
returns json
language sql
stable
set search_path = public
as $$
  with base as (
    select te.*,
           s.is_rework as status_is_rework,
           case te.priority
             when 'critical' then 4
             when 'high'     then 3
             when 'medium'   then 2
             when 'low'      then 1
             else 0
           end as prio_rank
      from public.tasks_enriched te
      left join public.statuses s on s.id = te.status_id
     where te.assignee_id = p_user_id
  )
  select json_build_object(
    'overdue', (
      select coalesce(json_agg(to_json(b) order by b.due_date nulls last, b.prio_rank desc), '[]'::json)
        from base b
       where b.deadline_state = 'overdue'
    ),
    'today', (
      select coalesce(json_agg(to_json(b) order by b.due_date nulls last, b.prio_rank desc), '[]'::json)
        from base b
       where b.completed_at is null
         and b.deadline_state <> 'overdue'
         and b.due_date::date = current_date
    ),
    'soon', (
      select coalesce(json_agg(to_json(b) order by b.due_date nulls last, b.prio_rank desc), '[]'::json)
        from base b
       where b.completed_at is null
         and b.deadline_state <> 'overdue'
         and b.due_date::date > current_date
         and b.due_date <= now() + interval '3 days'
    ),
    'in_progress', (
      select coalesce(json_agg(to_json(b) order by b.due_date nulls last, b.prio_rank desc), '[]'::json)
        from base b
       where b.status_code = 'in_progress'
    ),
    'rework', (
      select coalesce(json_agg(to_json(b) order by b.due_date nulls last, b.prio_rank desc), '[]'::json)
        from base b
       where coalesce(b.status_is_rework, false)
    )
  );
$$;

-- ---------------------------------------------------------------------
-- 4. get_status_bottlenecks — среднее время в статусах (по завершённым)
-- ---------------------------------------------------------------------
create or replace function public.get_status_bottlenecks(p_project_id uuid)
returns json
language sql
stable
set search_path = public
as $$
  select coalesce(json_agg(x order by x.position), '[]'::json)
  from (
    select s.id       as status_id,
           s.name     as status_name,
           s.color    as status_color,
           s.position as position,
           count(d.id) filter (where t.completed_at is not null) as samples,
           round(
             avg(d.duration_seconds) filter (where t.completed_at is not null) / 3600.0, 2
           ) as avg_hours,
           round(
             avg(d.duration_seconds) filter (where t.completed_at is not null) / 86400.0, 2
           ) as avg_days
      from public.statuses s
      left join public.task_status_durations d
        on d.status_id = s.id
       and d.duration_seconds is not null
      left join public.tasks t
        on t.id = d.task_id
     where s.project_id = p_project_id
     group by s.id, s.name, s.color, s.position
  ) x;
$$;

-- ---------------------------------------------------------------------
-- 5. get_employee_stats — статистика сотрудника в проекте
-- ---------------------------------------------------------------------
create or replace function public.get_employee_stats(p_user_id uuid, p_project_id uuid)
returns json
language sql
stable
set search_path = public
as $$
  select json_build_object(
    'completed_count', (
      select count(*)
        from public.tasks
       where project_id = p_project_id
         and assignee_id = p_user_id
         and completed_at is not null
    ),

    'avg_completion_days', (
      select round(avg(extract(epoch from (completed_at - created_at)) / 86400.0)::numeric, 2)
        from public.tasks
       where project_id = p_project_id
         and assignee_id = p_user_id
         and completed_at is not null
    ),

    -- % задач, завершённых в срок (среди завершённых с заданным дедлайном)
    'on_time_percent', (
      select case
               when count(*) filter (where due_date is not null) = 0 then null
               else round(
                 100.0 * count(*) filter (where due_date is not null and completed_at <= due_date)
                 / count(*) filter (where due_date is not null), 1)
             end
        from public.tasks
       where project_id = p_project_id
         and assignee_id = p_user_id
         and completed_at is not null
    ),

    'avg_rework_count', (
      select round(avg(rework_count)::numeric, 2)
        from public.tasks
       where project_id = p_project_id
         and assignee_id = p_user_id
    ),

    'workload', (
      select to_json(w)
        from public.employee_workload w
       where w.project_id = p_project_id
         and w.user_id = p_user_id
    )
  );
$$;
