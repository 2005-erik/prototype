-- =====================================================================
-- Исправления безопасности по SECURITY_AUDIT.md
--   H1 — барьер: исполнитель (не менеджер) меняет только status_id/position
--   M1 — защита журнала аудита (только триггеры/SECURITY DEFINER)
--   M3 — ограничение типов файлов в бакете task-attachments
-- =====================================================================

-- ---------------------------------------------------------------------
-- H1. Триггер-барьер на tasks.
-- Если вызывающий — исполнитель задачи и НЕ менеджер проекта, разрешаем
-- менять только status_id и position; правка прочих полей → exception.
-- Менеджеры/админы не затронуты (is_project_manager возвращает true).
-- ---------------------------------------------------------------------
create or replace function public.enforce_task_field_lock()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() = old.assignee_id
     and not public.is_project_manager(old.project_id) then
    if new.title          is distinct from old.title
       or new.description is distinct from old.description
       or new.due_date    is distinct from old.due_date
       or new.assignee_id is distinct from old.assignee_id
       or new.priority    is distinct from old.priority
       or new.estimate_hours is distinct from old.estimate_hours
       or new.author_id   is distinct from old.author_id
       or new.project_id  is distinct from old.project_id then
      raise exception 'Недостаточно прав для изменения этого поля';
    end if;
  end if;
  return new;
end;
$$;

-- Имя trg_enforce_* сортируется раньше trg_log_task_changes, поэтому
-- барьер срабатывает ПЕРВЫМ и сравнивает клиентский NEW (до того, как
-- log_task_changes проставит completed_at/updated_at и т.п.).
drop trigger if exists trg_enforce_task_field_lock on public.tasks;
create trigger trg_enforce_task_field_lock
  before update on public.tasks
  for each row execute function public.enforce_task_field_lock();

-- ---------------------------------------------------------------------
-- M1. Защита журнала аудита.
-- Убираем открытую клиентскую вставку в task_activity — писать могут
-- только триггеры/функции через SECURITY DEFINER (владелец с BYPASSRLS)
-- и роль service_role (обходит RLS). Для task_status_durations
-- клиентских insert/update/delete-политик и так нет.
-- ---------------------------------------------------------------------
drop policy if exists task_activity_insert on public.task_activity;

-- Закрепляем search_path = public, pg_temp у всех SECURITY DEFINER
-- функций (защита от подмены search_path).
alter function public.handle_new_user()                       set search_path = public, pg_temp;
alter function public.create_default_statuses()               set search_path = public, pg_temp;
alter function public.track_status_duration(uuid, uuid)       set search_path = public, pg_temp;
alter function public.log_task_changes()                      set search_path = public, pg_temp;
alter function public.log_task_created()                      set search_path = public, pg_temp;
alter function public.notify_on_comment()                     set search_path = public, pg_temp;
alter function public.check_deadlines()                       set search_path = public, pg_temp;
alter function public.change_task_status(uuid, uuid, text)    set search_path = public, pg_temp;
alter function public.current_user_role()                     set search_path = public, pg_temp;
alter function public.is_project_member(uuid)                 set search_path = public, pg_temp;
alter function public.is_project_manager(uuid)                set search_path = public, pg_temp;
alter function public.task_project_id(uuid)                   set search_path = public, pg_temp;

-- ---------------------------------------------------------------------
-- M3. Ограничение типов файлов бакета task-attachments.
-- ---------------------------------------------------------------------
update storage.buckets
   set allowed_mime_types = array[
     'application/pdf',
     'application/vnd.openxmlformats-officedocument.wordprocessingml.document',   -- docx
     'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',         -- xlsx
     'application/vnd.openxmlformats-officedocument.presentationml.presentation', -- pptx
     'image/png',
     'image/jpeg',
     'text/plain',
     'text/csv',
     'application/zip',
     'application/x-zip-compressed'
   ]
 where id = 'task-attachments';
