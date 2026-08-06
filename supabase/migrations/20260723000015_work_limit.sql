-- =====================================================================
-- Честный расчёт загрузки сотрудников.
--
-- Что было: employee_workload считал активными ВСЕ незавершённые задачи
-- (count(*) filter (where status_is_final = false)), включая бэклог.
-- В итоге у людей выходило 103/10 и почти все были «Перегружен» —
-- красный цвет перестал что-либо означать.
--
-- Что стало:
--   в работе  — задача не в начальном статусе, не в финальном,
--               не завершена и не в архиве;
--   в очереди — задача в начальном статусе («Новая») или без статуса.
--
-- Считаем по флагам statuses.is_initial / is_final, а не по кодам
-- 'in_progress'/'review'/'rework': статусы настраиваемые, у импортированных
-- из Trello проектов коды произвольные, и по кодам такие задачи
-- не попали бы никуда. Для набора статусов по умолчанию правило
-- совпадает с «В работе + На проверке + На доработке».
--
-- Лимит: profiles.work_limit, при пустом — projects.default_work_limit,
-- при пустом — 15.
-- Уровни: ≤100% «В норме», ≤150% «Высокая загрузка», выше «Перегружен».
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Лимиты
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists work_limit int default 15
    check (work_limit is null or work_limit > 0);

comment on column public.profiles.work_limit is
  'Сколько задач сотрудник тянет одновременно; null — берём лимит проекта';

alter table public.projects
  add column if not exists default_work_limit int not null default 15
    check (default_work_limit > 0);

comment on column public.projects.default_work_limit is
  'Лимит одновременных задач по умолчанию для участников проекта';

-- Всем существующим — 15 (колонка могла появиться раньше без значения)
update public.profiles set work_limit = 15 where work_limit is null;
update public.projects set default_work_limit = 15 where default_work_limit is null;

-- ---------------------------------------------------------------------
-- 2. employee_workload — пересобираем целиком (меняется состав колонок)
-- ---------------------------------------------------------------------
drop view if exists public.employee_workload;

create view public.employee_workload
with (security_invoker = on) as
select
  w.user_id,
  w.full_name,
  w.project_id,

  w.active_tasks,   -- в работе: и есть загрузка
  w.queued_tasks,   -- в очереди: ждут, человека не нагружают
  w.overdue_tasks,
  w.critical_tasks,
  w.work_limit,

  -- процент считаем ТОЛЬКО от задач в работе
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
        and coalesce(s.is_initial, false) = false
        and coalesce(s.is_final, false) = false
        and s.id is not null
    ) as active_tasks,

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
  'Загрузка сотрудников по проектам: в работе (нагружает), в очереди, просрочки и уровень загрузки';

-- ---------------------------------------------------------------------
-- 3. Смена лимита — админ и руководитель.
--    RLS не умеет ограничивать отдельные колонки, поэтому не открываем
--    profiles на запись руководителю, а даём узкую функцию.
-- ---------------------------------------------------------------------
create or replace function public.set_work_limit(p_user_id uuid, p_limit int)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text := public.current_user_role();
begin
  if not public.is_active_user() then
    raise exception 'Учётная запись деактивирована';
  end if;
  if v_role not in ('admin', 'manager') then
    raise exception 'Менять лимит может администратор или руководитель';
  end if;
  if p_limit is not null and p_limit <= 0 then
    raise exception 'Лимит должен быть больше нуля';
  end if;

  update public.profiles
     set work_limit = p_limit
   where id = p_user_id;

  if not found then
    raise exception 'Сотрудник не найден';
  end if;
end;
$$;

revoke all on function public.set_work_limit(uuid, int) from public, anon;
grant execute on function public.set_work_limit(uuid, int) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4. get_employee_stats — тот же расчёт, что и в employee_workload.
--    Иначе вкладка «Сотрудники» в аналитике продолжила бы показывать
--    «Перегружен» у всех, пока страница «Сотрудники» показывает норму.
--    Тело функции сохранено дословно, изменены только блок active
--    и вычисление загрузки.
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
      -- в работе нагружают только задачи вне начального и финального статуса
      select
        t.assignee_id,
        count(*) filter (
          where t.completed_at is null
            and coalesce(t.is_archived, false) = false
            and s.id is not null
            and coalesce(s.is_initial, false) = false
            and coalesce(s.is_final, false) = false
        ) as active_tasks,
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
