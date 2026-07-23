-- =====================================================================
-- Бакет аватаров + логирование неудачных входов.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Бакет avatars: публичный (аватары показываются везде), лимит 2 МБ,
-- только изображения. Запись — только в свою папку {user_id}/...
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars', 'avatars', true, 2097152,  -- 2 МБ
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Запись/изменение/удаление — только своя папка (первый сегмент = uid).
-- Чтение публичного бакета идёт по публичному URL (политика не нужна).
drop policy if exists avatars_insert on storage.objects;
create policy avatars_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists avatars_update on storage.objects;
create policy avatars_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists avatars_delete on storage.objects;
create policy avatars_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------
-- log_failed_login — отдельный путь для неудачного входа (нет сессии,
-- поэтому доступен anon). Пишет только 'failed_login' с email из формы;
-- user_id = null. Не может подделать чужое действие.
-- ---------------------------------------------------------------------
create or replace function public.log_failed_login(
  p_email text,
  p_ip    text default null,
  p_ua    text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.auth_log (user_id, email, action, ip_address, user_agent)
  values (null, p_email, 'failed_login', p_ip, p_ua);
end;
$$;

revoke execute on function public.log_failed_login(text, text, text) from public;
grant execute on function public.log_failed_login(text, text, text) to anon, authenticated;
