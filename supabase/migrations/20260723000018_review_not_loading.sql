-- =====================================================================
-- «На проверке» не нагружает исполнителя.
--
-- По факту на боевых данных: у одного сотрудника 86 задач «На проверке»
-- из 103 незакрытых. Работа сдана, мяч на стороне проверяющего —
-- считать это загрузкой исполнителя неверно, иначе цифра снова
-- перестаёт отвечать на вопрос «сколько человек реально тянет».
--
-- Делаем флагом статуса, а не проверкой code = 'review': статусы
-- настраиваемые, у импортированных из Trello досок коды произвольные,
-- и у команды может появиться своя колонка ожидания («Ждём клиента»).
--
--   loads_assignee = false → статус ожидания: в загрузку не входит,
--                            показывается отдельным числом.
-- =====================================================================

alter table public.statuses
  add column if not exists loads_assignee boolean not null default true;

comment on column public.statuses.loads_assignee is
  'Нагружает ли статус исполнителя. false — задача ждёт другого (проверка)';

-- Существующие статусы проверки — перестают нагружать
update public.statuses
   set loads_assignee = false
 where code = 'review'
   and loads_assignee;

-- Набор статусов по умолчанию для новых проектов: «На проверке» — ожидание
create or replace function public.create_default_statuses()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.statuses
    (project_id, name, code, color, position, is_initial, is_rework,
     requires_comment, is_final, loads_assignee)
  values
    (new.id, 'Новая',        'new',         '#94a3b8', 1, true,  false, false, false, true),
    (new.id, 'В работе',     'in_progress', '#3b82f6', 2, false, false, false, false, true),
    (new.id, 'На проверке',  'review',      '#f59e0b', 3, false, false, false, false, false),
    (new.id, 'На доработке', 'rework',      '#ef4444', 4, false, true,  true,  false, true),
    (new.id, 'Выполнено',    'done',        '#22c55e', 5, false, false, false, true,  true);

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
-- employee_workload: «в работе» без статусов ожидания, проверка — отдельно
-- ---------------------------------------------------------------------
drop view if exists public.employee_workload;

create view public.employee_workload
with (security_invoker = on) as
select
  w.user_id,
  w.full_name,
  w.project_id,

  w.active_tasks,   -- нагружают: не очередь, не ожидание, не финал
  w.review_tasks,   -- сдано и ждёт проверяющего
  w.queued_tasks,   -- очередь
  w.overdue_tasks,
  w.critical_tasks,
  w.work_limit,

  round(w.active_tasks * 100.0 / nullif(w.work_limit, 0), 1) as load_percent,

  case
    when coalesce(w.work_limit, 0) = 0                          then 'normal'
    when w.active_tasks * 100.0 / w.work_limit <= 100           then 'normal'
    when w.active_tasks * 100.0 / w.work_limit <= 150           then 'high'
    else 'overloaded'
  end as load_state

from (
  select
    t.assignee_id as user_id,
    p.full_name   as full_name,
    t.project_id  as project_id,
    coalesce(p.work_limit, pr.default_work_limit, 15) as work_limit,

    count(*) filter (
      where t.completed_at is null
        and coalesce(t.is_archived, false) = false
        and s.id is not null
        and coalesce(s.is_initial, false) = false
        and coalesce(s.is_final, false) = false
        and coalesce(s.loads_assignee, true)
    ) as active_tasks,

    count(*) filter (
      where t.completed_at is null
        and coalesce(t.is_archived, false) = false
        and s.id is not null
        and coalesce(s.is_initial, false) = false
        and coalesce(s.is_final, false) = false
        and coalesce(s.loads_assignee, true) = false
    ) as review_tasks,

    count(*) filter (
      where t.completed_at is null
        and coalesce(t.is_archived, false) = false
        and (s.id is null or coalesce(s.is_initial, false))
    ) as queued_tasks,

    count(*) filter (
      where t.completed_at is null
        and coalesce(t.is_archived, false) = false
        and t.due_date is not null
        and t.due_date < now()
    ) as overdue_tasks,

    count(*) filter (
      where t.completed_at is null
        and coalesce(t.is_archived, false) = false
        and t.due_date is not null
        and t.due_date >= now()
        and t.due_date - now() < interval '24 hours'
    ) as critical_tasks

  from public.tasks t
    join public.profiles p  on p.id = t.assignee_id
    join public.projects pr on pr.id = t.project_id
    left join public.statuses s on s.id = t.status_id
  where t.assignee_id is not null
  group by t.assignee_id, p.full_name, t.project_id,
           coalesce(p.work_limit, pr.default_work_limit, 15)
) w;

comment on view public.employee_workload is
  'Загрузка: в работе (нагружает), на проверке (ждёт другого), в очереди, просрочки';

-- ---------------------------------------------------------------------
-- get_employee_stats — то же правило в аналитике
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
      select pm.user_id, p.full_name, p.avatar_url, p.position,
             coalesce(p.work_limit, pr.default_work_limit, 15) as work_limit
        from public.project_members pm
        join public.profiles p on p.id = pm.user_id
        join public.projects pr on pr.id = pm.project_id
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
        t.assignee_id,
        count(*) filter (
          where t.completed_at is null
            and coalesce(t.is_archived, false) = false
            and s.id is not null
            and coalesce(s.is_initial, false) = false
            and coalesce(s.is_final, false) = false
            and coalesce(s.loads_assignee, true)
        ) as active_tasks,
        count(*) filter (
          where t.completed_at is null
            and coalesce(t.is_archived, false) = false
            and s.id is not null
            and coalesce(s.is_initial, false) = false
            and coalesce(s.is_final, false) = false
            and coalesce(s.loads_assignee, true) = false
        ) as review_tasks,
        count(*) filter (
          where t.completed_at is null
            and coalesce(t.is_archived, false) = false
            and (s.id is null or coalesce(s.is_initial, false))
        ) as queued_tasks,
        count(*) filter (
          where t.completed_at is null
            and coalesce(t.is_archived, false) = false
            and t.due_date is not null and t.due_date < now()
        ) as overdue_tasks
      from public.tasks t
        left join public.statuses s on s.id = t.status_id
      where t.project_id = p_project_id and t.assignee_id is not null
      group by t.assignee_id
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
          'review_tasks', coalesce(a.review_tasks, 0),
          'queued_tasks', coalesce(a.queued_tasks, 0),
          'overdue_tasks', coalesce(a.overdue_tasks, 0),
          'work_limit', m.work_limit,
          'load_percent',
            case when coalesce(m.work_limit, 0) = 0 then 0
                 else round((coalesce(a.active_tasks, 0) * 100.0 / m.work_limit)::numeric, 1) end,
          'load_state',
            case
              when coalesce(m.work_limit, 0) = 0 then 'normal'
              when coalesce(a.active_tasks, 0) * 100.0 / m.work_limit <= 100 then 'normal'
              when coalesce(a.active_tasks, 0) * 100.0 / m.work_limit <= 150 then 'high'
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
-- get_tag_stats — «в работе» по тому же правилу
-- ---------------------------------------------------------------------
create or replace function public.get_tag_stats(p_project_id uuid)
returns json
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(
    json_agg(
      json_build_object(
        'tag_id', x.id,
        'name', x.name,
        'color', x.color,
        'in_work', x.in_work,
        'review', x.review,
        'queued', x.queued,
        'completed', x.completed,
        'total', x.total
      )
      order by x.in_work desc, x.name
    ),
    '[]'::json
  )
  from (
    select
      g.id, g.name, g.color,
      count(t.id) filter (
        where t.completed_at is null
          and coalesce(t.is_archived, false) = false
          and s.id is not null
          and coalesce(s.is_initial, false) = false
          and coalesce(s.is_final, false) = false
          and coalesce(s.loads_assignee, true)
      ) as in_work,
      count(t.id) filter (
        where t.completed_at is null
          and coalesce(t.is_archived, false) = false
          and s.id is not null
          and coalesce(s.is_initial, false) = false
          and coalesce(s.is_final, false) = false
          and coalesce(s.loads_assignee, true) = false
      ) as review,
      count(t.id) filter (
        where t.completed_at is null
          and coalesce(t.is_archived, false) = false
          and (s.id is null or coalesce(s.is_initial, false))
      ) as queued,
      count(t.id) filter (where t.completed_at is not null) as completed,
      count(t.id) as total
    from public.tags g
      left join public.task_tags tt on tt.tag_id = g.id
      left join public.tasks t on t.id = tt.task_id
      left join public.statuses s on s.id = t.status_id
    where g.project_id = p_project_id
      and public.is_project_member(p_project_id)
    group by g.id, g.name, g.color
  ) x;
$$;
