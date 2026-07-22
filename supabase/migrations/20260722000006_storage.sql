-- =====================================================================
-- Storage: приватный бакет для вложений задач
-- Путь к файлу: {project_id}/{task_id}/{filename}
--   → (storage.foldername(name))[1] = project_id
--   → (storage.foldername(name))[2] = task_id
-- Доступ определяется членством в проекте (первый сегмент пути).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Бакет task-attachments: приватный, лимит 10 МБ (идемпотентно)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('task-attachments', 'task-attachments', false, 10485760)  -- 10 * 1024 * 1024
on conflict (id) do update
  set public          = excluded.public,
      file_size_limit = excluded.file_size_limit;

-- =====================================================================
-- Политики на storage.objects (RLS уже включён Supabase по умолчанию)
-- =====================================================================

-- Чтение файлов — участник проекта (project_id = первый сегмент пути)
drop policy if exists task_attachments_select on storage.objects;
create policy task_attachments_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'task-attachments'
    and public.is_project_member((storage.foldername(name))[1]::uuid)
  );

-- Загрузка файлов — участник проекта
drop policy if exists task_attachments_insert on storage.objects;
create policy task_attachments_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'task-attachments'
    and public.is_project_member((storage.foldername(name))[1]::uuid)
  );

-- Удаление файлов — автор загрузки (owner) или менеджер проекта
drop policy if exists task_attachments_delete on storage.objects;
create policy task_attachments_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'task-attachments'
    and (
      owner = auth.uid()
      or public.is_project_manager((storage.foldername(name))[1]::uuid)
    )
  );
