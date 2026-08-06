-- =====================================================================
-- Починка NOT NULL task_activity.project_id при вставке задач.
--
-- Причина сбоя импорта («null value in column "project_id" of relation
-- "task_activity"»): миграция 20260723000011_trello_import пересоздала
-- log_task_created от РАННЕЙ редакции функции (до 20260723000001), где
-- денормализованное поле project_id ещё не заполнялось. С тех пор любая
-- вставка задачи — и импорт, и создание через UI — падает на NOT NULL.
--
-- Ограничение NOT NULL корректно и остаётся: чиним триггер.
--   1. log_task_created — берёт project_id из new.project_id (ветка импорта
--      с одной сводной записью «Импортировано из Trello» сохранена);
--   2. страховочный триггер на самой task_activity — доставляет project_id
--      из tasks, если какой-то путь вставки его не передал. Дешевле, чем
--      ловить повторение этой же регрессии в проде.
--
-- log_task_changes (before update) трогать не нужно: 20260723000001 —
-- последняя его редакция, project_id там проставляется во всех четырёх
-- ветках. notify_on_comment в task_activity не пишет вовсе (только
-- notifications), change_task_status — не вставляет, а обновляет comment
-- у уже созданной триггером строки.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. log_task_created — журнал создания задачи (after insert)
-- ---------------------------------------------------------------------
create or replace function public.log_task_created()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor     uuid := coalesce(auth.uid(), new.author_id);
  v_importing boolean := coalesce(current_setting('app.trello_import', true), '') <> '';
begin
  if v_importing then
    -- одна сводная запись на задачу вместо «created»
    insert into public.task_activity
      (task_id, project_id, user_id, action, comment, created_at)
    values (new.id, new.project_id, v_actor, 'imported', 'Импортировано из Trello',
            coalesce(new.created_at, now()));
  else
    insert into public.task_activity (task_id, project_id, user_id, action)
    values (new.id, new.project_id, v_actor, 'created');
  end if;

  -- первая запись учёта статуса
  if new.status_id is not null then
    insert into public.task_status_durations (task_id, status_id, entered_at)
    values (new.id, new.status_id, coalesce(new.created_at, now()));
  end if;

  -- уведомление исполнителю — только вне импорта (иначе тысячи уведомлений)
  if not v_importing
     and new.assignee_id is not null
     and new.assignee_id is distinct from v_actor then
    insert into public.notifications (user_id, task_id, type, message)
    values (new.assignee_id, new.id, 'assigned',
      'Вам назначена задача «' || new.title || '»');
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Страховка на уровне самой task_activity: project_id — производное
--    от task_id поле, поэтому достраиваем его, если вставка его не дала.
--    NOT NULL остаётся: триггер заполняет значение, а не разрешает NULL.
-- ---------------------------------------------------------------------
create or replace function public.fill_activity_project_id()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.project_id is null then
    select t.project_id into new.project_id
      from public.tasks t
     where t.id = new.task_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_fill_activity_project_id on public.task_activity;
create trigger trg_fill_activity_project_id
  before insert on public.task_activity
  for each row execute function public.fill_activity_project_id();
