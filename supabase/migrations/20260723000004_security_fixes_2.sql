-- =====================================================================
-- Исправления S1–S5 (аудит SECURITY DEFINER, раздел 3).
--   S1 — track_status_duration: закрыть прямой вызов клиентом
--   S2 — check_deadlines: только cron/service_role
--   S3 — get_my_day: игнорировать параметр, всегда auth.uid()
--   S4 — get_employee_stats: ролевой гейт (только менеджер проекта)
--   S5 — аналитические RPC: search_path = public, pg_temp
-- =====================================================================

-- ---------------------------------------------------------------------
-- S1. track_status_duration() нужна только триггерам (SECURITY DEFINER
-- log_task_changes/log_task_created вызывают её как postgres). Клиенту
-- прямой вызов запрещаем — иначе можно писать в task_status_durations
-- для любой задачи в обход RLS.
-- ---------------------------------------------------------------------
revoke execute on function public.track_status_duration(uuid, uuid) from public;
revoke execute on function public.track_status_duration(uuid, uuid) from anon, authenticated;

-- ---------------------------------------------------------------------
-- S2. check_deadlines() — только планировщик (pg_cron/postgres) или
-- service_role. Клиентские роли не должны генерировать рассылку.
-- ---------------------------------------------------------------------
revoke execute on function public.check_deadlines() from public;
revoke execute on function public.check_deadlines() from anon, authenticated;
grant execute on function public.check_deadlines() to service_role;

-- ---------------------------------------------------------------------
-- S3. get_my_day — параметр больше не влияет на выборку: всегда auth.uid().
-- Сигнатура сохранена ради совместимости с клиентом (rpc с p_user_id).
-- ---------------------------------------------------------------------
create or replace function public.get_my_day(p_user_id uuid default auth.uid())
returns json
language sql
stable
set search_path = public, pg_temp
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
     where te.assignee_id = auth.uid()   -- S3: p_user_id намеренно игнорируется
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
-- S4. get_employee_stats — доступно только менеджеру проекта (или admin).
-- Переведена в plpgsql ради ролевого гейта. Остаётся SECURITY INVOKER
-- (RLS применяется к чтению), плюс явная проверка is_project_manager.
-- ---------------------------------------------------------------------
create or replace function public.get_employee_stats(
  p_project_id uuid,
  p_period_days int default 30
)
returns json
language plpgsql
stable
set search_path = public, pg_temp
as $$
begin
  if not public.is_project_manager(p_project_id) then
    raise exception 'Статистика по сотрудникам доступна только менеджеру проекта';
  end if;

  return (
    with members as (
      select pm.user_id, p.full_name, p.avatar_url, p.position, p.max_concurrent_tasks
        from public.project_members pm
        join public.profiles p on p.id = pm.user_id
       where pm.project_id = p_project_id
    ),
    completed as (
      select
        assignee_id,
        count(*) as completed,
        round(avg(extract(epoch from (completed_at - created_at)) / 86400.0)::numeric, 2) as avg_completion_days,
        case
          when count(*) filter (where due_date is not null) = 0 then null
          else round(
            (100.0 * count(*) filter (where due_date is not null and completed_at <= due_date)
            / count(*) filter (where due_date is not null))::numeric, 1)
        end as on_time_percent
      from public.tasks
      where project_id = p_project_id
        and assignee_id is not null
        and completed_at is not null
        and (p_period_days is null
             or completed_at >= now() - make_interval(days => p_period_days))
      group by assignee_id
    ),
    rework as (
      select assignee_id,
             round(coalesce(avg(rework_count), 0)::numeric, 2) as avg_rework
      from public.tasks
      where project_id = p_project_id
        and assignee_id is not null
        and (p_period_days is null
             or created_at >= now() - make_interval(days => p_period_days))
      group by assignee_id
    ),
    active as (
      select
        assignee_id,
        count(*) filter (where completed_at is null) as active_tasks,
        count(*) filter (
          where completed_at is null and due_date is not null and due_date < now()
        ) as overdue_tasks
      from public.tasks
      where project_id = p_project_id and assignee_id is not null
      group by assignee_id
    )
    select coalesce(
      json_agg(
        json_build_object(
          'user_id', m.user_id,
          'full_name', m.full_name,
          'avatar_url', m.avatar_url,
          'position', m.position,
          'completed', coalesce(c.completed, 0),
          'avg_completion_days', c.avg_completion_days,
          'on_time_percent', c.on_time_percent,
          'avg_rework', coalesce(r.avg_rework, 0),
          'active_tasks', coalesce(a.active_tasks, 0),
          'overdue_tasks', coalesce(a.overdue_tasks, 0),
          'max_concurrent_tasks', m.max_concurrent_tasks,
          'load_percent',
            case when coalesce(m.max_concurrent_tasks, 0) = 0 then 0
                 else round((coalesce(a.active_tasks, 0) * 100.0 / m.max_concurrent_tasks)::numeric, 1) end,
          'load_state',
            case
              when coalesce(m.max_concurrent_tasks, 0) = 0 then 'normal'
              when coalesce(a.active_tasks, 0) * 100.0 / m.max_concurrent_tasks < 50 then 'free'
              when coalesce(a.active_tasks, 0) * 100.0 / m.max_concurrent_tasks < 80 then 'normal'
              when coalesce(a.active_tasks, 0) * 100.0 / m.max_concurrent_tasks <= 100 then 'busy'
              else 'overloaded'
            end
        )
        order by m.full_name
      ),
      '[]'::json
    )
    from members m
      left join completed c on c.assignee_id = m.user_id
      left join rework r on r.assignee_id = m.user_id
      left join active a on a.assignee_id = m.user_id
  );
end;
$$;

-- ---------------------------------------------------------------------
-- S5. Аналитические RPC — закрепляем search_path = public, pg_temp.
-- (get_employee_stats уже задан выше; get_my_day — тоже.)
-- ---------------------------------------------------------------------
alter function public.get_completion_trend(uuid, int)  set search_path = public, pg_temp;
alter function public.get_ontime_stats(uuid, int)      set search_path = public, pg_temp;
alter function public.get_rework_analysis(uuid, int)   set search_path = public, pg_temp;
alter function public.get_cycle_time(uuid, int)        set search_path = public, pg_temp;
alter function public.get_status_bottlenecks(uuid, int) set search_path = public, pg_temp;
