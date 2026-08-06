-- =====================================================================
-- Очистка файлов в Storage при удалении задач и проектов.
--
-- Проблема: attachments удаляются каскадом (задача → проект → импорт
-- Trello откатили), а сами файлы в бакете task-attachments остаются
-- навсегда — каскада между Postgres и объектным хранилищем нет.
-- Удалять строки из storage.objects напрямую нельзя: пропадёт только
-- метаданные, файл в бэкенде хранилища останется висеть.
--
-- Решение: триггер на attachments складывает пути удалённых файлов
-- в очередь, а Edge Function purge-storage разбирает её через Storage API
-- (service_role). Очередь переживает падение сети и перезапуск: пока
-- строка не удалена, файл считается неубранным.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Очередь на удаление
-- ---------------------------------------------------------------------
create table if not exists public.storage_cleanup_queue (
  id          bigserial primary key,
  bucket      text not null default 'task-attachments',
  path        text not null,
  task_id     uuid,                       -- для диагностики, без FK: задачи уже нет
  enqueued_at timestamptz not null default now(),
  attempts    int not null default 0,
  last_error  text,
  unique (bucket, path)
);

comment on table public.storage_cleanup_queue is
  'Файлы, удалённые вместе с задачей, но ещё не убранные из Storage';
comment on column public.storage_cleanup_queue.attempts is
  'Число неудачных попыток удаления — растёт, если Storage недоступен';

create index if not exists idx_storage_cleanup_pending
  on public.storage_cleanup_queue (enqueued_at)
  where attempts < 5;

-- Очередь — служебная: клиенту не видна и не нужна.
-- RLS включён без единой политики → доступ только у service_role.
alter table public.storage_cleanup_queue enable row level security;
revoke all on public.storage_cleanup_queue from anon, authenticated;
revoke all on sequence public.storage_cleanup_queue_id_seq from anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Триггер: удалили вложение — путь в очередь.
--    Срабатывает и на каскадных удалениях (задача, проект, откат импорта).
-- ---------------------------------------------------------------------
create or replace function public.enqueue_attachment_cleanup()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.file_path is null or btrim(old.file_path) = '' then
    return old;
  end if;

  insert into public.storage_cleanup_queue (path, task_id)
  values (old.file_path, old.task_id)
  on conflict (bucket, path) do nothing;

  return old;
end;
$$;

drop trigger if exists trg_enqueue_attachment_cleanup on public.attachments;
create trigger trg_enqueue_attachment_cleanup
  after delete on public.attachments
  for each row execute function public.enqueue_attachment_cleanup();

-- ---------------------------------------------------------------------
-- 3. Разовое наполнение очереди: файлы, осиротевшие до этой миграции.
--    Берём объекты бакета, для которых больше нет строки в attachments.
--    storage.objects.name — это и есть путь внутри бакета.
-- ---------------------------------------------------------------------
insert into public.storage_cleanup_queue (bucket, path)
select o.bucket_id, o.name
  from storage.objects o
 where o.bucket_id = 'task-attachments'
   and not exists (
     select 1 from public.attachments a where a.file_path = o.name
   )
on conflict (bucket, path) do nothing;
