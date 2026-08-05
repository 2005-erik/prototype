-- =====================================================================
-- Импорт задач из Trello.
--   1) колонки tasks: trello_card_id, trello_url, trello_import_id, is_archived
--   2) уникальный индекс (project_id, trello_card_id) — защита от повторного
--      импорта того же файла
--   3) триггеры log_task_created / notify_on_comment учитывают флаг импорта
--      app.trello_import: пишут ОДНУ сводную запись «Импортировано из Trello»
--      на задачу и НЕ засоряют ленту уведомлениями
--   4) import_trello(jsonb) — атомарный импорт (SECURITY DEFINER → обходит RLS,
--      set-based вставки вместо построчных)
--   5) import_trello_rollback(uuid) — откат импортированной сессии
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Колонки Trello в tasks
-- ---------------------------------------------------------------------
alter table public.tasks
  add column if not exists trello_card_id   text,
  add column if not exists trello_url       text,
  add column if not exists trello_import_id uuid,
  add column if not exists is_archived      boolean not null default false;

comment on column public.tasks.trello_card_id is 'ID карточки Trello (сверка / защита от повторного импорта)';
comment on column public.tasks.trello_url is 'shortUrl карточки Trello для сверки';
comment on column public.tasks.trello_import_id is 'Метка сессии импорта — для отката';
comment on column public.tasks.is_archived is 'Архивная задача (импорт закрытой карточки Trello)';

-- Защита от повторного импорта одной и той же карточки в проект
create unique index if not exists idx_tasks_trello_card
  on public.tasks (project_id, trello_card_id)
  where trello_card_id is not null;

-- Быстрый откат по метке импорта
create index if not exists idx_tasks_trello_import
  on public.tasks (trello_import_id)
  where trello_import_id is not null;

-- ---------------------------------------------------------------------
-- 2. log_task_created — при импорте одна сводная запись, без уведомлений
--    (поведение вне импорта не меняется)
-- ---------------------------------------------------------------------
create or replace function public.log_task_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor     uuid := coalesce(auth.uid(), new.author_id);
  v_importing boolean := coalesce(current_setting('app.trello_import', true), '') <> '';
begin
  if v_importing then
    -- одна сводная запись на задачу вместо «created»
    insert into public.task_activity (task_id, user_id, action, comment, created_at)
    values (new.id, v_actor, 'imported', 'Импортировано из Trello',
            coalesce(new.created_at, now()));
  else
    insert into public.task_activity (task_id, user_id, action)
    values (new.id, v_actor, 'created');
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
-- 3. notify_on_comment — при импорте не рассылать уведомления
-- ---------------------------------------------------------------------
create or replace function public.notify_on_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.tasks%rowtype;
begin
  -- при массовом импорте комментариев уведомления не создаём
  if coalesce(current_setting('app.trello_import', true), '') <> '' then
    return new;
  end if;

  select * into v_task from public.tasks where id = new.task_id;
  if not found then
    return new;
  end if;

  if v_task.author_id is not null and v_task.author_id is distinct from new.user_id then
    insert into public.notifications (user_id, task_id, type, message)
    values (v_task.author_id, new.task_id, 'comment',
      'Новый комментарий к задаче «' || v_task.title || '»');
  end if;

  if v_task.assignee_id is not null
     and v_task.assignee_id is distinct from new.user_id
     and v_task.assignee_id is distinct from v_task.author_id then
    insert into public.notifications (user_id, task_id, type, message)
    values (v_task.assignee_id, new.task_id, 'comment',
      'Новый комментарий к задаче «' || v_task.title || '»');
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. import_trello — атомарный импорт всей доски.
--    SECURITY DEFINER → выполняется от владельца, обходит RLS и барьеры
--    (импорт идёт от админа, но политики employee не должны мешать).
--    Все вставки set-based (батчами), не построчно. Любое исключение
--    откатывает транзакцию целиком. Стадия ошибки — в тексте исключения.
-- ---------------------------------------------------------------------
create or replace function public.import_trello(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor       uuid := (p_payload->>'actor_id')::uuid;
  v_import_id   uuid := (p_payload->>'import_id')::uuid;
  v_opts        jsonb := coalesce(p_payload->'options', '{}'::jsonb);
  v_project_id  uuid;
  v_list        jsonb;
  v_sid         uuid;
  v_pos         int;
  v_task_total  int := jsonb_array_length(coalesce(p_payload->'tasks', '[]'::jsonb));
  v_tasks       int := 0;
  v_checklists  int := 0;
  v_comments    int := 0;
  v_stage       text := 'init';
begin
  -- Гард: импорт разрешён только администратору
  if v_actor is null
     or (select role from public.profiles where id = v_actor and is_active) is distinct from 'admin' then
    raise exception 'Требуются права администратора';
  end if;
  if v_import_id is null then
    raise exception 'Не передана метка импорта';
  end if;

  -- Флаг импорта (транзакционный) — читается триггерами задач/комментариев
  perform set_config('app.trello_import', v_import_id::text, true);

  -- ---- Проект ----
  v_stage := 'project';
  if (p_payload->'project'->>'mode') = 'new' then
    insert into public.projects (name, description, owner_id)
    values (
      coalesce(nullif(btrim(p_payload->'project'->>'name'), ''), 'Импорт из Trello'),
      p_payload->'project'->>'desc',
      v_actor
    )
    returning id into v_project_id;
    -- триггер создаёт статусы по умолчанию и владельца-участника
  else
    v_project_id := (p_payload->'project'->>'id')::uuid;
    if not exists (select 1 from public.projects where id = v_project_id) then
      raise exception 'Проект не найден';
    end if;
  end if;

  -- ---- Сопоставление списков со статусами ----
  v_stage := 'statuses';
  create temp table _list_status (trello_id text primary key, status_id uuid) on commit drop;

  for v_list in select * from jsonb_array_elements(coalesce(p_payload->'lists', '[]'::jsonb))
  loop
    if coalesce(v_list->>'status_id', '') <> '' then
      v_sid := (v_list->>'status_id')::uuid;
      if not exists (select 1 from public.statuses where id = v_sid and project_id = v_project_id) then
        raise exception 'Статус % не принадлежит проекту', v_sid;
      end if;
    elsif coalesce(v_list->>'create_name', '') <> '' then
      select coalesce(max(position), 0) + 1 into v_pos
        from public.statuses where project_id = v_project_id;
      insert into public.statuses (project_id, name, code, color, position)
      values (
        v_project_id,
        v_list->>'create_name',
        coalesce(nullif(regexp_replace(lower(v_list->>'create_name'), '[^a-z0-9]+', '_', 'g'), ''), 'imported'),
        '#94a3b8',
        v_pos
      )
      returning id into v_sid;
    elsif coalesce(v_list->>'status_code', '') <> '' then
      select id into v_sid from public.statuses
       where project_id = v_project_id and code = v_list->>'status_code'
       order by position limit 1;
      if v_sid is null then
        select id into v_sid from public.statuses
         where project_id = v_project_id and is_initial order by position limit 1;
      end if;
    else
      select id into v_sid from public.statuses
       where project_id = v_project_id and is_initial order by position limit 1;
    end if;

    insert into _list_status (trello_id, status_id) values (v_list->>'trello_id', v_sid)
    on conflict (trello_id) do update set status_id = excluded.status_id;
  end loop;

  -- ---- Сопоставление участников ----
  v_stage := 'members';
  create temp table _member_map (trello_id text primary key, profile_id uuid) on commit drop;
  insert into _member_map (trello_id, profile_id)
  select m->>'trello_id', nullif(m->>'profile_id', '')::uuid
    from jsonb_array_elements(coalesce(p_payload->'members', '[]'::jsonb)) m
   where coalesce(m->>'trello_id', '') <> ''
  on conflict (trello_id) do nothing;

  -- ---- Задачи (set-based, с защитой от повтора) ----
  v_stage := 'tasks';
  insert into public.tasks (
    project_id, title, description, status_id, priority,
    author_id, assignee_id, due_date, completed_at,
    position, created_at, updated_at,
    trello_card_id, trello_url, trello_import_id, is_archived
  )
  select
    v_project_id,
    coalesce(nullif(btrim(c->>'title'), ''), 'Без названия'),
    c->>'description',
    ls.status_id,
    'medium',
    v_actor,
    mm.profile_id,
    nullif(c->>'due_date', '')::timestamptz,
    case
      when coalesce((c->>'due_complete')::boolean, false)
        or coalesce(st.is_final, false)
        or st.code = 'done'
      then coalesce(nullif(c->>'due_date', '')::timestamptz, now())
      else null
    end,
    nullif(c->>'position', '')::numeric,
    coalesce(nullif(c->>'created_at', '')::timestamptz, now()),
    coalesce(nullif(c->>'created_at', '')::timestamptz, now()),
    c->>'trello_card_id',
    c->>'trello_url',
    v_import_id,
    coalesce((c->>'archived')::boolean, false)
  from jsonb_array_elements(coalesce(p_payload->'tasks', '[]'::jsonb)) c
  left join _list_status ls on ls.trello_id = c->>'list_trello_id'
  left join public.statuses st on st.id = ls.status_id
  left join _member_map mm on mm.trello_id = nullif(c->>'assignee_trello_id', '')
  on conflict (project_id, trello_card_id) where trello_card_id is not null do nothing;

  get diagnostics v_tasks = row_count;

  -- карта trello_card_id → task_id для дочерних сущностей (только текущий импорт)
  create temp table _task_map (trello_card_id text primary key, task_id uuid) on commit drop;
  insert into _task_map (trello_card_id, task_id)
  select trello_card_id, id from public.tasks
   where trello_import_id = v_import_id and trello_card_id is not null
  on conflict (trello_card_id) do nothing;

  -- ---- Чек-листы ----
  if coalesce((v_opts->>'import_checklists')::boolean, true) then
    v_stage := 'checklists';
    insert into public.checklist_items (task_id, text, is_done, position)
    select tm.task_id,
           coalesce(nullif(btrim(ch->>'title'), ''), '—'),
           coalesce((ch->>'is_done')::boolean, false),
           (nullif(ch->>'position', '')::numeric)::int
      from jsonb_array_elements(coalesce(p_payload->'checklists', '[]'::jsonb)) ch
      join _task_map tm on tm.trello_card_id = ch->>'trello_card_id';
    get diagnostics v_checklists = row_count;
  end if;

  -- ---- Комментарии ----
  if coalesce((v_opts->>'import_comments')::boolean, true) then
    v_stage := 'comments';
    insert into public.comments (task_id, user_id, body, created_at, updated_at)
    select tm.task_id,
           coalesce(mm.profile_id, v_actor),
           case
             when mm.profile_id is null
             then '[Trello, @' || coalesce(nullif(cm->>'username', ''), 'trello') || '] ' ||
                  coalesce(cm->>'text', '')
             else coalesce(cm->>'text', '')
           end,
           coalesce(nullif(cm->>'created_at', '')::timestamptz, now()),
           coalesce(nullif(cm->>'created_at', '')::timestamptz, now())
      from jsonb_array_elements(coalesce(p_payload->'comments', '[]'::jsonb)) cm
      join _task_map tm on tm.trello_card_id = cm->>'trello_card_id'
      left join _member_map mm on mm.trello_id = nullif(cm->>'author_trello_id', '')
     where coalesce(nullif(btrim(cm->>'text'), ''), '') <> '';
    get diagnostics v_comments = row_count;
  end if;

  return jsonb_build_object(
    'ok', true,
    'project_id', v_project_id,
    'import_id', v_import_id,
    'tasks_created', v_tasks,
    'tasks_skipped', greatest(v_task_total - v_tasks, 0),
    'checklists_created', v_checklists,
    'comments_created', v_comments
  );
exception
  when others then
    -- транзакция откатывается целиком; сообщаем стадию сбоя
    raise exception 'Импорт прерван на этапе «%»: %', v_stage, sqlerrm;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. import_trello_rollback — удалить всё, созданное сессией импорта.
--    Каскад по tasks снимает activity/comments/checklist_items/durations.
--    Вызывается клиентом → проверяем admin по auth.uid().
-- ---------------------------------------------------------------------
create or replace function public.import_trello_rollback(p_import_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted int := 0;
begin
  if public.current_user_role() <> 'admin' then
    raise exception 'Требуются права администратора';
  end if;
  if p_import_id is null then
    raise exception 'Не указана метка импорта';
  end if;

  delete from public.tasks where trello_import_id = p_import_id;
  get diagnostics v_deleted = row_count;

  return jsonb_build_object('ok', true, 'deleted', v_deleted);
end;
$$;

-- Импорт вызывается через Edge Function (service_role); откат — клиентом-админом
grant execute on function public.import_trello(jsonb) to authenticated, service_role;
grant execute on function public.import_trello_rollback(uuid) to authenticated, service_role;
