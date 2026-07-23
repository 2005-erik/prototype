-- =====================================================================
-- RPC аналитики. Все функции: security invoker (уважают RLS),
-- сигнатура (p_project_id uuid, p_period_days int default 30).
-- p_period_days = NULL → «всё время».
--
-- Возвращаемые JSON-структуры зафиксированы как контракт
-- (см. docs/analytics-contract.md).
-- =====================================================================

-- Старые версии с другой сигнатурой удаляем (иначе появится перегрузка)
drop function if exists public.get_status_bottlenecks(uuid);
drop function if exists public.get_employee_stats(uuid, uuid);

-- ---------------------------------------------------------------------
-- get_completion_trend — динамика по дням: создано / завершено /
-- всего открытых на конец дня.
-- ---------------------------------------------------------------------
create or replace function public.get_completion_trend(
  p_project_id uuid,
  p_period_days int default 30
)
returns json
language sql
stable
set search_path = public
as $$
  with bounds as (
    select
      case
        when p_period_days is null then
          coalesce(
            (select min(created_at)::date from public.tasks where project_id = p_project_id),
            current_date
          )
        else current_date - (p_period_days - 1)
      end as start_date,
      current_date as end_date
  ),
  days as (
    select generate_series(
      (select start_date from bounds),
      (select end_date from bounds),
      interval '1 day'
    )::date as d
  ),
  created as (
    select created_at::date as d, count(*) as c
      from public.tasks
     where project_id = p_project_id
     group by created_at::date
  ),
  completed as (
    select completed_at::date as d, count(*) as c
      from public.tasks
     where project_id = p_project_id and completed_at is not null
     group by completed_at::date
  )
  select coalesce(
    json_agg(
      json_build_object(
        'date', to_char(days.d, 'YYYY-MM-DD'),
        'created', coalesce(cr.c, 0),
        'completed', coalesce(cm.c, 0),
        'open_total', (
          select count(*)
            from public.tasks t
           where t.project_id = p_project_id
             and t.created_at::date <= days.d
             and (t.completed_at is null or t.completed_at::date > days.d)
        )
      )
      order by days.d
    ),
    '[]'::json
  )
  from days
    left join created cr on cr.d = days.d
    left join completed cm on cm.d = days.d;
$$;

-- ---------------------------------------------------------------------
-- get_ontime_stats — соблюдение сроков по завершённым за период.
-- ---------------------------------------------------------------------
create or replace function public.get_ontime_stats(
  p_project_id uuid,
  p_period_days int default 30
)
returns json
language sql
stable
set search_path = public
as $$
  with v as (
    select due_date, completed_at
      from public.tasks
     where project_id = p_project_id
       and completed_at is not null
       and (p_period_days is null
            or completed_at >= now() - make_interval(days => p_period_days))
  )
  select json_build_object(
    'completed', (select count(*) from v),
    'on_time', (select count(*) from v where due_date is not null and completed_at <= due_date),
    'late', (select count(*) from v where due_date is not null and completed_at > due_date),
    'no_due_date', (select count(*) from v where due_date is null),
    'on_time_percent', (
      select case
               when count(*) filter (where due_date is not null) = 0 then null
               else round(
                 (100.0 * count(*) filter (where due_date is not null and completed_at <= due_date)
                 / count(*) filter (where due_date is not null))::numeric, 1)
             end
      from v
    )
  );
$$;

-- ---------------------------------------------------------------------
-- get_rework_analysis — распределение по числу возвратов
-- (для задач, созданных за период).
-- ---------------------------------------------------------------------
create or replace function public.get_rework_analysis(
  p_project_id uuid,
  p_period_days int default 30
)
returns json
language sql
stable
set search_path = public
as $$
  with v as (
    select coalesce(rework_count, 0) as rc
      from public.tasks
     where project_id = p_project_id
       and (p_period_days is null
            or created_at >= now() - make_interval(days => p_period_days))
  )
  select json_build_object(
    'total', (select count(*) from v),
    'avg_rework', (select round(coalesce(avg(rc), 0)::numeric, 2) from v),
    'reworked_percent', (
      select case when count(*) = 0 then 0
             else round((100.0 * count(*) filter (where rc > 0) / count(*))::numeric, 1) end
      from v
    ),
    'distribution', json_build_array(
      json_build_object('bucket', '0',     'label', '0 возвратов',   'count', (select count(*) from v where rc = 0)),
      json_build_object('bucket', '1',     'label', '1 возврат',     'count', (select count(*) from v where rc = 1)),
      json_build_object('bucket', '2',     'label', '2 возврата',    'count', (select count(*) from v where rc = 2)),
      json_build_object('bucket', '3plus', 'label', '3+ возвратов',  'count', (select count(*) from v where rc >= 3))
    )
  );
$$;

-- ---------------------------------------------------------------------
-- get_cycle_time — время цикла по завершённым за период.
-- total_days: от создания до завершения; work_days: от взятия в работу.
-- ---------------------------------------------------------------------
create or replace function public.get_cycle_time(
  p_project_id uuid,
  p_period_days int default 30
)
returns json
language sql
stable
set search_path = public
as $$
  with d as (
    select
      extract(epoch from (completed_at - created_at)) / 86400.0 as total_days,
      case when started_at is not null
           then extract(epoch from (completed_at - started_at)) / 86400.0 end as work_days
      from public.tasks
     where project_id = p_project_id
       and completed_at is not null
       and (p_period_days is null
            or completed_at >= now() - make_interval(days => p_period_days))
  )
  select json_build_object(
    'completed', (select count(*) from d),
    'avg_days', (select round(avg(total_days)::numeric, 2) from d),
    'median_days', (
      select round(percentile_cont(0.5) within group (order by total_days)::numeric, 2) from d
    ),
    'min_days', (select round(min(total_days)::numeric, 2) from d),
    'max_days', (select round(max(total_days)::numeric, 2) from d),
    'avg_work_days', (
      select round(avg(work_days)::numeric, 2) from d where work_days is not null
    )
  );
$$;

-- ---------------------------------------------------------------------
-- get_status_bottlenecks — среднее/медиана/макс время в каждом статусе
-- по закрытым интервалам (task_status_durations) за период.
-- ---------------------------------------------------------------------
create or replace function public.get_status_bottlenecks(
  p_project_id uuid,
  p_period_days int default 30
)
returns json
language sql
stable
set search_path = public
as $$
  select coalesce(json_agg(x order by x.position), '[]'::json)
  from (
    select
      s.id                        as status_id,
      s.name                      as status_name,
      s.color                     as status_color,
      s.position                  as position,
      count(d.id)                 as samples,
      count(distinct d.task_id)   as tasks_count,
      round((coalesce(avg(d.duration_seconds), 0) / 3600.0)::numeric, 2)  as avg_hours,
      round((coalesce(avg(d.duration_seconds), 0) / 86400.0)::numeric, 2) as avg_days,
      round(
        (coalesce(percentile_cont(0.5) within group (order by d.duration_seconds), 0) / 86400.0)::numeric,
        2
      ) as median_days,
      round((coalesce(max(d.duration_seconds), 0) / 86400.0)::numeric, 2) as max_days
    from public.statuses s
      left join public.task_status_durations d
        on d.status_id = s.id
       and d.duration_seconds is not null
       and (p_period_days is null
            or d.left_at >= now() - make_interval(days => p_period_days))
    where s.project_id = p_project_id
    group by s.id, s.name, s.color, s.position
  ) x;
$$;

-- ---------------------------------------------------------------------
-- get_employee_stats — статистика по КАЖДОМУ участнику проекта за период.
-- Возвращает массив (строка на участника).
-- ---------------------------------------------------------------------
create or replace function public.get_employee_stats(
  p_project_id uuid,
  p_period_days int default 30
)
returns json
language sql
stable
set search_path = public
as $$
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
    left join active a on a.assignee_id = m.user_id;
$$;
