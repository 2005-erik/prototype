-- =====================================================================
-- Проверки RLS и исправлений безопасности.
-- Запуск: подключиться к БД (напр. `supabase db execute -f verify_rls.sql`
-- или в SQL-редакторе дашборда) от роли postgres.
-- Схемные ассерты падают с EXCEPTION, если фикс отсутствует.
-- Поведенческие тесты для H1 — в конце (ручные, требуют реальных id).
-- =====================================================================

-- ---- Общая гигиена RLS: включён на всех таблицах приложения ----
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','projects','project_members','statuses','tasks',
    'task_status_durations','task_activity','comments','attachments',
    'checklist_items','notifications'
  ] loop
    if not (select relrowsecurity from pg_class
            where oid = ('public.'||t)::regclass) then
      raise exception 'FAIL: RLS выключен на public.%', t;
    end if;
  end loop;
  raise notice 'OK: RLS включён на всех таблицах';
end $$;

-- ---- H1: барьер полей задачи существует и срабатывает первым ----
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'trg_enforce_task_field_lock' and not tgisinternal
  ) then
    raise exception 'FAIL H1: нет триггера trg_enforce_task_field_lock';
  end if;
  -- Барьер должен идти раньше журналирования (сравнение по имени)
  if 'trg_enforce_task_field_lock' >= 'trg_log_task_changes' then
    raise exception 'FAIL H1: барьер не срабатывает раньше log_task_changes';
  end if;
  raise notice 'OK H1: триггер-барьер существует и приоритетен';
end $$;

-- ---- M1: нет клиентской insert-политики на task_activity ----
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'task_activity' and cmd = 'INSERT'
  ) then
    raise exception 'FAIL M1: осталась insert-политика на task_activity';
  end if;
  raise notice 'OK M1: клиентская вставка в task_activity закрыта';
end $$;

-- ---- M1: у task_status_durations нет клиентских insert/update/delete ----
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'task_status_durations'
      and cmd in ('INSERT','UPDATE','DELETE')
  ) then
    raise exception 'FAIL M1: есть клиентская запись в task_status_durations';
  end if;
  raise notice 'OK M1: task_status_durations пишут только триггеры';
end $$;

-- ---- M1: SECURITY DEFINER функции имеют search_path с pg_temp ----
do $$
declare fn text;
begin
  foreach fn in array array[
    'log_task_changes','log_task_created','track_status_duration',
    'change_task_status','notify_on_comment','check_deadlines',
    'handle_new_user','create_default_statuses','enforce_task_field_lock',
    'is_project_member','is_project_manager','current_user_role','task_project_id'
  ] loop
    if not exists (
      select 1
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = fn
         and p.prosecdef                                  -- security definer
         and array_to_string(p.proconfig, ',') like '%search_path=%pg_temp%'
    ) then
      raise exception 'FAIL M1: у функции %() нет security definer + search_path pg_temp', fn;
    end if;
  end loop;
  raise notice 'OK M1: security definer + search_path закреплены';
end $$;

-- ---- M3: типы файлов бакета ограничены ----
do $$
begin
  if not exists (
    select 1 from storage.buckets
    where id = 'task-attachments'
      and allowed_mime_types is not null
      and 'application/pdf' = any(allowed_mime_types)
      and array_length(allowed_mime_types, 1) between 8 and 12
  ) then
    raise exception 'FAIL M3: allowed_mime_types не заданы для task-attachments';
  end if;
  raise notice 'OK M3: типы файлов бакета ограничены';
end $$;

-- ---- Приватность бакета ----
do $$
begin
  if exists (select 1 from storage.buckets where id='task-attachments' and public) then
    raise exception 'FAIL: бакет task-attachments публичный';
  end if;
  raise notice 'OK: бакет task-attachments приватный';
end $$;

-- ---- VIEW: security_invoker (наследуют RLS базовых таблиц) ----
-- Если бы вью были security_definer (по умолчанию), они бы читали
-- базовые таблицы в обход RLS — классическая дыра. Проверяем, что нет.
do $$
declare v text;
begin
  foreach v in array array['tasks_enriched','employee_workload'] loop
    if coalesce(array_to_string(
         (select reloptions from pg_class where relname = v and relkind = 'v'), ','
       ), '') not like '%security_invoker=true%' then
      raise exception 'FAIL: view % НЕ security_invoker — обходит RLS базовых таблиц!', v;
    end if;
  end loop;
  raise notice 'OK: tasks_enriched/employee_workload — security_invoker (уважают RLS)';
end $$;

-- ---- Поиск политик с using(true) без реальной проверки ----
do $$
declare r record;
begin
  for r in
    select tablename, cmd, qual
      from pg_policies
     where schemaname = 'public' and qual = 'true'
  loop
    raise warning 'ВНИМАНИЕ: %.% использует using(true) без проверки', r.tablename, r.cmd;
  end loop;
  -- Ожидаемо срабатывает только для profiles.SELECT (внутренний справочник, см. L6).
  raise notice 'Проверка using(true) завершена (ожидается только profiles.SELECT)';
end $$;

-- ---- SECURITY DEFINER: функции без проверки прав не должны быть
--      вызываемы клиентом напрямую (должны звать только триггеры/cron) ----
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    if has_function_privilege('authenticated',
         'public.track_status_duration(uuid,uuid)', 'execute') then
      raise exception 'FAIL S1: authenticated может вызывать track_status_duration() (должен быть REVOKE)';
    end if;
    if has_function_privilege('authenticated',
         'public.check_deadlines()', 'execute') then
      raise exception 'FAIL S2: authenticated может вызывать check_deadlines() (должен быть REVOKE)';
    end if;
    if has_function_privilege('anon',
         'public.track_status_duration(uuid,uuid)', 'execute') then
      raise exception 'FAIL S1: anon может вызывать track_status_duration()';
    end if;
  end if;
  raise notice 'OK S1/S2: прямой вызов track_status_duration/check_deadlines клиентом закрыт';
end $$;

-- ---- A1: деактивация enforced на сервере ----
do $$
begin
  -- хелпер is_active_user()
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname='is_active_user' and p.prosecdef
  ) then
    raise exception 'FAIL A1: нет is_active_user() SECURITY DEFINER';
  end if;
  -- гейт активности встроен в helpers доступа
  if not exists (select 1 from pg_proc where proname='is_project_member' and prosrc like '%is_active_user%') then
    raise exception 'FAIL A1: is_project_member не учитывает is_active_user';
  end if;
  if not exists (select 1 from pg_proc where proname='is_project_manager' and prosrc like '%is_active_user%') then
    raise exception 'FAIL A1: is_project_manager не учитывает is_active_user';
  end if;
  -- change_task_status содержит гард
  if not exists (select 1 from pg_proc where proname='change_task_status' and prosrc like '%is_active_user%') then
    raise exception 'FAIL A1: change_task_status без гарда деактивации';
  end if;
  -- триггер отзыва сессий
  if not exists (select 1 from pg_trigger where tgname='trg_revoke_sessions' and not tgisinternal) then
    raise exception 'FAIL A1: нет триггера отзыва сессий';
  end if;
  raise notice 'OK A1: is_active-гейт, гард RPC и отзыв сессий на месте';
end $$;

-- ---- auth_log: RLS, select только admin, нет клиентской записи ----
do $$
begin
  if not (select relrowsecurity from pg_class where oid='public.auth_log'::regclass) then
    raise exception 'FAIL A3: RLS выключен на auth_log';
  end if;
  if exists (select 1 from pg_policies
             where schemaname='public' and tablename='auth_log'
               and cmd in ('INSERT','UPDATE','DELETE')) then
    raise exception 'FAIL A3: у auth_log есть клиентская политика записи/изменения';
  end if;
  if not exists (select 1 from pg_policies
                 where schemaname='public' and tablename='auth_log' and cmd='SELECT') then
    raise exception 'FAIL A3: нет select-политики на auth_log';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                 where n.nspname='public' and p.proname='log_auth_event' and p.prosecdef) then
    raise exception 'FAIL A3: нет log_auth_event() SECURITY DEFINER';
  end if;
  if exists (select 1 from pg_roles where rolname='anon')
     and has_function_privilege('anon','public.log_auth_event(text,text,text)','execute') then
    raise exception 'FAIL A3: anon может вызывать log_auth_event';
  end if;
  raise notice 'OK A3: auth_log защищён (admin-select, запись только через log_auth_event)';
end $$;

-- ---- admin_activity: RLS, select только admin, нет клиентской записи ----
do $$
begin
  if not (select relrowsecurity from pg_class where oid='public.admin_activity'::regclass) then
    raise exception 'FAIL: RLS выключен на admin_activity';
  end if;
  if exists (select 1 from pg_policies
             where schemaname='public' and tablename='admin_activity'
               and cmd in ('INSERT','UPDATE','DELETE')) then
    raise exception 'FAIL: у admin_activity есть клиентская политика записи';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                 where n.nspname='public' and p.proname='log_admin_action' and p.prosecdef) then
    raise exception 'FAIL: нет log_admin_action() SECURITY DEFINER';
  end if;
  if exists (select 1 from pg_roles where rolname='anon')
     and has_function_privilege('anon','public.log_admin_action(text,uuid,jsonb)','execute') then
    raise exception 'FAIL: anon может вызывать log_admin_action';
  end if;
  raise notice 'OK: admin_activity защищён (admin-select, запись через service_role/log_admin_action)';
end $$;

-- ---- Отсутствие клиентской записи в защищённые таблицы ----
do $$
declare t text;
begin
  -- Полностью write-protected для клиента (пишут только триггеры):
  foreach t in array array['task_activity','task_status_durations'] loop
    if exists (
      select 1 from pg_policies
      where schemaname='public' and tablename=t and cmd in ('INSERT','UPDATE','DELETE')
    ) then
      raise exception 'FAIL: у % есть клиентская политика записи (должны писать только триггеры)', t;
    end if;
  end loop;
  -- notifications: insert запрещён (триггеры), update/delete — только свои (легитимно):
  if exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='notifications' and cmd='INSERT'
  ) then
    raise exception 'FAIL: у notifications есть клиентская insert-политика';
  end if;
  raise notice 'OK: task_activity/task_status_durations без клиентской записи; notifications без insert';
end $$;

-- =====================================================================
-- Поведенческие тесты H1 (ручные): подставьте реальные UUID.
-- Проверяют, что исполнитель-не-менеджер НЕ может менять чужие поля,
-- но МОЖЕТ менять статус; и что менеджер не затронут.
-- =====================================================================
/*
-- Подготовка: значения из вашей БД
--   :emp   — user_id сотрудника (исполнитель задачи, НЕ менеджер проекта)
--   :mgr   — user_id менеджера проекта
--   :task  — id задачи, где assignee = :emp
--   :status_in_progress, :status_review — id статусов проекта задачи

-- 1) Сотрудник меняет ПРИОРИТЕТ своей задачи → ожидаем ошибку
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":":emp","role":"authenticated"}';
  -- ОЖИДАЕТСЯ: ERROR «Недостаточно прав для изменения этого поля»
  update public.tasks set priority = 'critical' where id = ':task';
rollback;

-- 2) Сотрудник меняет СТАТУС+ПОЗИЦИЮ своей задачи → должно пройти
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":":emp","role":"authenticated"}';
  update public.tasks set status_id = ':status_in_progress', position = 100 where id = ':task';
  -- (ошибки быть не должно)
rollback;

-- 3) Сотрудник меняет статус через RPC (обязательный путь) → проходит
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":":emp","role":"authenticated"}';
  select public.change_task_status(':task', ':status_review', 'готово');
rollback;

-- 4) Менеджер меняет приоритет той же задачи → должно пройти (барьер не для него)
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":":mgr","role":"authenticated"}';
  update public.tasks set priority = 'high' where id = ':task';
rollback;

-- 5) Прямая вставка в журнал аудита от имени пользователя → должно быть запрещено (M1)
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":":emp","role":"authenticated"}';
  -- ОЖИДАЕТСЯ: ошибка RLS (нет insert-политики)
  insert into public.task_activity(task_id, project_id, user_id, action)
  values (':task', ':project', ':emp', 'fake');
rollback;
*/


-- =====================================================================
-- Раздел 2 — сценарные тесты доступа (ручные, реальные UUID).
-- Замените токены find-replace:
--   :userA           — пользователь, НЕ состоящий в проекте :foreignProject
--   :foreignProject  — проект, где :userA не участник
--   :foreignTask     — задача из :foreignProject
--   :emp             — сотрудник-исполнитель (не менеджер) задачи :task
--   :task            — задача, где assignee = :emp
--   :otherProfile    — user_id профиля из ДРУГОГО отдела
-- Каждый блок в транзакции с rollback — данные не меняются.
-- =====================================================================
/*
-- (A) Может ли пользователь A прочитать задачи проекта, где он НЕ состоит? → 0 строк
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":":userA","role":"authenticated"}';
  do $$
  declare n int;
  begin
    select count(*) into n from public.tasks where project_id = ':foreignProject';
    if n <> 0 then
      raise exception 'FAIL A: не-участник видит % задач чужого проекта', n;
    end if;
    -- то же через enriched-вью (security_invoker → тоже 0)
    select count(*) into n from public.tasks_enriched where project_id = ':foreignProject';
    if n <> 0 then
      raise exception 'FAIL A: tasks_enriched показал % чужих задач (вью обходит RLS!)', n;
    end if;
    raise notice 'OK A: не-участник не видит задачи/enriched чужого проекта';
  end $$;
rollback;

-- (B) Может ли employee изменить due_date / assignee_id напрямую? → ошибка (H1)
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":":emp","role":"authenticated"}';
  -- ОЖИДАЕТСЯ: ERROR «Недостаточно прав для изменения этого поля»
  update public.tasks set due_date = now() + interval '5 days' where id = ':task';
rollback;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":":emp","role":"authenticated"}';
  -- ОЖИДАЕТСЯ: ERROR «Недостаточно прав для изменения этого поля»
  update public.tasks set assignee_id = null where id = ':task';
rollback;

-- (C) Может ли employee прочитать профиль чужого отдела? → СЕЙЧАС ДА (using(true), см. L6)
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":":emp","role":"authenticated"}';
  do $$
  declare n int;
  begin
    select count(*) into n from public.profiles where id = ':otherProfile';
    if n > 0 then
      raise warning 'ВНИМАНИЕ C: employee читает чужой профиль (using(true) — внутренний справочник, L6)';
    else
      raise notice 'OK C: чужой профиль недоступен';
    end if;
  end $$;
rollback;

-- (D) Может ли не-участник читать комментарии и вложения чужой задачи? → 0 строк
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":":userA","role":"authenticated"}';
  do $$
  declare nc int; na int;
  begin
    select count(*) into nc from public.comments    where task_id = ':foreignTask';
    select count(*) into na from public.attachments where task_id = ':foreignTask';
    if nc <> 0 or na <> 0 then
      raise exception 'FAIL D: не-участник видит % комментариев и % вложений чужой задачи', nc, na;
    end if;
    raise notice 'OK D: комментарии/вложения чужой задачи недоступны';
  end $$;
rollback;

-- (E, A1) Деактивированный пользователь: доступ отрезан на сервере.
--   :deact — user_id пользователя с profiles.is_active = false
--   :deactTask — задача, где assignee = :deact (в проекте, где он состоял)
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":":deact","role":"authenticated"}';
  do $$
  declare np int; nt int; nn int; nself int;
  begin
    select count(*) into np from public.projects;          -- ожидается 0
    select count(*) into nt from public.tasks;             -- ожидается 0
    select count(*) into nn from public.notifications;     -- ожидается 0
    select count(*) into nself from public.profiles where id = ':deact'; -- ожидается 1 (свой профиль)
    if np <> 0 or nt <> 0 or nn <> 0 then
      raise exception 'FAIL A1: деактивированный видит projects=% tasks=% notif=%', np, nt, nn;
    end if;
    if nself <> 1 then
      raise exception 'FAIL A1: деактивированный не видит даже свой профиль (сломает UX)';
    end if;
    raise notice 'OK A1: деактивированный видит только свой профиль, данных приложения — 0';
  end $$;
rollback;

-- (F, A1) Деактивированный не может сменить статус даже своей задачи
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":":deact","role":"authenticated"}';
  -- ОЖИДАЕТСЯ: ERROR «Учётная запись деактивирована»
  select public.change_task_status(':deactTask',
    (select status_id from public.tasks where id=':deactTask'), null);
rollback;
*/
