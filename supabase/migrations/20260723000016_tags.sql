-- =====================================================================
-- Теги задач — классификация по направлениям работы.
--
-- Метки Trello при импорте уезжали текстом в конец описания
-- («Метки Trello: КУИ, Перевод»), поэтому фильтровать по направлению
-- было нечем: на тысяче задач это единственный разрез, который
-- отвечает на вопрос «что у нас по провизиям».
--
-- Права — как у задач: смотрит участник проекта, правит менеджер
-- проекта либо исполнитель самой задачи (и только активный).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Таблицы
-- ---------------------------------------------------------------------
create table if not exists public.tags (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  name        text not null,
  color       text,
  created_at  timestamptz not null default now(),
  unique (project_id, name)
);

comment on table public.tags is 'Теги (направления работы) в пределах проекта';

create table if not exists public.task_tags (
  task_id uuid not null references public.tasks (id) on delete cascade,
  tag_id  uuid not null references public.tags (id) on delete cascade,
  primary key (task_id, tag_id)
);

comment on table public.task_tags is 'Связь задач и тегов';

-- Обратный поиск «все задачи тега» — для разрезов в аналитике
create index if not exists idx_task_tags_tag on public.task_tags (tag_id);
create index if not exists idx_tags_project on public.tags (project_id);

-- ---------------------------------------------------------------------
-- 2. RLS
-- ---------------------------------------------------------------------
alter table public.tags enable row level security;
alter table public.task_tags enable row level security;

-- tags: видит участник, заводит и правит менеджер проекта
drop policy if exists tags_select on public.tags;
create policy tags_select on public.tags
  for select to authenticated
  using (public.is_project_member(project_id));

drop policy if exists tags_insert on public.tags;
create policy tags_insert on public.tags
  for insert to authenticated
  with check (public.is_active_user() and public.is_project_manager(project_id));

drop policy if exists tags_update on public.tags;
create policy tags_update on public.tags
  for update to authenticated
  using (public.is_active_user() and public.is_project_manager(project_id))
  with check (public.is_active_user() and public.is_project_manager(project_id));

drop policy if exists tags_delete on public.tags;
create policy tags_delete on public.tags
  for delete to authenticated
  using (public.is_active_user() and public.is_project_manager(project_id));

-- task_tags: те же правила, что на правку самой задачи —
-- менеджер проекта или исполнитель задачи, обязательно активный
drop policy if exists task_tags_select on public.task_tags;
create policy task_tags_select on public.task_tags
  for select to authenticated
  using (public.is_project_member(public.task_project_id(task_id)));

drop policy if exists task_tags_insert on public.task_tags;
create policy task_tags_insert on public.task_tags
  for insert to authenticated
  with check (
    public.is_active_user()
    and (
      public.is_project_manager(public.task_project_id(task_id))
      or exists (
        select 1 from public.tasks t
         where t.id = task_id and t.assignee_id = auth.uid()
      )
    )
  );

drop policy if exists task_tags_delete on public.task_tags;
create policy task_tags_delete on public.task_tags
  for delete to authenticated
  using (
    public.is_active_user()
    and (
      public.is_project_manager(public.task_project_id(task_id))
      or exists (
        select 1 from public.tasks t
         where t.id = task_id and t.assignee_id = auth.uid()
      )
    )
  );

-- ---------------------------------------------------------------------
-- 3. Разрез по тегам для аналитики.
--    «В работе» — по тому же правилу, что и загрузка сотрудников:
--    не начальный статус (это очередь), не финальный, не архив.
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
      ) as in_work,
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

grant execute on function public.get_tag_stats(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4. import_trello — тот же импорт, плюс метки Trello становятся тегами.
--    Тело сохранено дословно, добавлены только стадии «tags» и «task_tags»
--    и счётчик связей в отчёте.
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
  v_tags        int := 0;
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

  -- ---- Метки Trello → теги проекта ----
  -- Единственная классификация по направлениям, поэтому заводим их
  -- до задач: связи проставим сразу после вставки.
  v_stage := 'tags';
  create temp table _label_tag (trello_id text primary key, tag_id uuid) on commit drop;

  insert into public.tags (project_id, name, color)
  select v_project_id, l->>'name', l->>'color'
    from jsonb_array_elements(coalesce(p_payload->'labels', '[]'::jsonb)) l
   where coalesce(nullif(btrim(l->>'name'), ''), '') <> ''
  on conflict (project_id, name) do nothing;

  insert into _label_tag (trello_id, tag_id)
  select l->>'trello_id', g.id
    from jsonb_array_elements(coalesce(p_payload->'labels', '[]'::jsonb)) l
    join public.tags g
      on g.project_id = v_project_id and g.name = l->>'name'
   where coalesce(nullif(btrim(l->>'name'), ''), '') <> ''
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

  -- ---- Связи задача ↔ тег ----
  v_stage := 'task_tags';
  insert into public.task_tags (task_id, tag_id)
  select tm.task_id, lt.tag_id
    from jsonb_array_elements(coalesce(p_payload->'tasks', '[]'::jsonb)) c
    join _task_map tm on tm.trello_card_id = c->>'trello_card_id'
    cross join lateral jsonb_array_elements_text(
      coalesce(c->'tag_trello_ids', '[]'::jsonb)
    ) as lbl(trello_id)
    join _label_tag lt on lt.trello_id = lbl.trello_id
  on conflict (task_id, tag_id) do nothing;

  get diagnostics v_tags = row_count;

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
    'comments_created', v_comments,
    'tags_linked', v_tags
  );
exception
  when others then
    -- транзакция откатывается целиком; сообщаем стадию сбоя
    raise exception 'Импорт прерван на этапе «%»: %', v_stage, sqlerrm;
end;
$$;
