-- =====================================================================
-- Представления (VIEW) с вычисляемыми полями
-- security_invoker = on — представления уважают RLS запрашивающего
-- =====================================================================

-- ---------------------------------------------------------------------
-- tasks_enriched — задачи с вычисляемыми полями (светофор, застой, счётчики)
-- ---------------------------------------------------------------------
create or replace view public.tasks_enriched
with (security_invoker = on) as
select
  t.*,

  -- статус (join statuses)
  s.name      as status_name,
  s.code      as status_code,
  s.color     as status_color,
  s.is_final  as status_is_final,

  -- люди (join profiles)
  asg.full_name  as assignee_name,
  asg.avatar_url as assignee_avatar,
  aut.full_name  as author_name,

  -- часов до срока (отрицательное значение = просрочка)
  case
    when t.due_date is null then null
    else extract(epoch from (t.due_date - now())) / 3600.0
  end as hours_left,

  -- светофор дедлайна (порядок проверок важен)
  case
    when t.due_date is null                       then 'no_deadline'
    when t.completed_at is not null               then 'completed'
    when now() > t.due_date                        then 'overdue'
    when t.due_date - now() < interval '24 hours'  then 'critical'
    when t.due_date - now() < interval '72 hours'  then 'warning'
    else 'normal'
  end as deadline_state,

  -- дней в текущем статусе (от входа в текущий статус, с запасным вариантом)
  extract(
    epoch from (now() - coalesce(cur.entered_at, t.updated_at, t.created_at))
  ) / 86400.0 as days_in_current_status,

  -- застой: > 7 дней в текущем статусе и статус не финальный
  (
    coalesce(s.is_final, false) = false
    and extract(
      epoch from (now() - coalesce(cur.entered_at, t.updated_at, t.created_at))
    ) / 86400.0 > 7
  ) as is_stale,

  -- чек-лист
  coalesce(cl.total, 0) as checklist_total,
  coalesce(cl.done, 0)  as checklist_done,

  -- счётчики
  coalesce(cm.cnt, 0)  as comments_count,
  coalesce(att.cnt, 0) as attachments_count

from public.tasks t
  left join public.statuses s   on s.id   = t.status_id
  left join public.profiles asg on asg.id = t.assignee_id
  left join public.profiles aut on aut.id = t.author_id

  -- момент входа в текущий (не закрытый) статус
  left join lateral (
    select d.entered_at
    from public.task_status_durations d
    where d.task_id = t.id
      and d.left_at is null
    order by d.entered_at desc
    limit 1
  ) cur on true

  -- итоги чек-листа
  left join lateral (
    select
      count(*)                            as total,
      count(*) filter (where ci.is_done)  as done
    from public.checklist_items ci
    where ci.task_id = t.id
  ) cl on true

  -- число комментариев
  left join lateral (
    select count(*) as cnt
    from public.comments c
    where c.task_id = t.id
  ) cm on true

  -- число вложений
  left join lateral (
    select count(*) as cnt
    from public.attachments a
    where a.task_id = t.id
  ) att on true;

comment on view public.tasks_enriched is
  'Задачи с вычисляемыми полями: светофор дедлайна, застой, счётчики чек-листа/комментариев/вложений';

-- ---------------------------------------------------------------------
-- employee_workload — загрузка сотрудников по проектам
-- ---------------------------------------------------------------------
create or replace view public.employee_workload
with (security_invoker = on) as
select
  w.user_id,
  w.full_name,
  w.project_id,
  w.active_tasks,
  w.overdue_tasks,
  w.critical_tasks,
  w.max_concurrent_tasks,

  -- процент загрузки (защита от деления на ноль)
  round(w.active_tasks * 100.0 / nullif(w.max_concurrent_tasks, 0), 1) as load_percent,

  -- состояние загрузки
  case
    when coalesce(w.max_concurrent_tasks, 0) = 0                        then 'normal'
    when w.active_tasks * 100.0 / w.max_concurrent_tasks < 50           then 'free'
    when w.active_tasks * 100.0 / w.max_concurrent_tasks < 80           then 'normal'
    when w.active_tasks * 100.0 / w.max_concurrent_tasks <= 100         then 'busy'
    else 'overloaded'
  end as load_state

from (
  select
    te.assignee_id          as user_id,
    p.full_name             as full_name,
    te.project_id           as project_id,
    p.max_concurrent_tasks  as max_concurrent_tasks,
    count(*) filter (where coalesce(te.status_is_final, false) = false) as active_tasks,
    count(*) filter (where te.deadline_state = 'overdue')              as overdue_tasks,
    count(*) filter (where te.deadline_state = 'critical')             as critical_tasks
  from public.tasks_enriched te
    join public.profiles p on p.id = te.assignee_id
  where te.assignee_id is not null
  group by te.assignee_id, p.full_name, te.project_id, p.max_concurrent_tasks
) w;

comment on view public.employee_workload is
  'Загрузка сотрудников по проектам: активные/просроченные/критичные задачи и уровень загрузки';
