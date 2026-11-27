-- =====================================================================
-- Документы проекта — ТЗ, спецификации, протоколы, регламенты, заметки.
--
-- Документ состоит из разделов: у каждого свой ответственный и свой
-- статус, поэтому три аналитика пишут три раздела одного ТЗ, не мешая
-- друг другу. Прогресс документа = доля готовых разделов.
--
-- Одновременное редактирование одного раздела заменено мягкой
-- блокировкой: пока раздел правят, остальные видят «Кайрат редактирует»
-- и открывают его на чтение. Через 5 минут без активности блокировка
-- снимается сама. Это закрывает почти все реальные сценарии и не тянет
-- за собой CRDT.
--
-- Права: читают участники проекта; раздел правят автор документа,
-- руководитель проекта и назначенный на раздел.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Таблицы
-- ---------------------------------------------------------------------
create table if not exists public.documents (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  title       text not null,
  type        text not null default 'note'
                check (type in ('tz', 'spec', 'protocol', 'regulation', 'note')),
  status      text not null default 'draft'
                check (status in ('draft', 'review', 'approved')),
  author_id   uuid not null references public.profiles (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.documents is 'Документы проекта (ТЗ, спецификация, протокол, регламент, заметка)';
comment on column public.documents.status is 'draft — черновик, review — на согласовании, approved — утверждён';

create table if not exists public.document_sections (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null references public.documents (id) on delete cascade,
  title        text not null,
  content      jsonb not null default '{"type":"doc","content":[]}'::jsonb,
  position     numeric not null default 1000,
  assignee_id  uuid references public.profiles (id) on delete set null,
  status       text not null default 'not_started'
                 check (status in ('not_started', 'in_progress', 'ready')),
  -- мягкая блокировка: кто держит раздел и когда в последний раз касался
  locked_by    uuid references public.profiles (id) on delete set null,
  locked_at    timestamptz,
  updated_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.document_sections is 'Разделы документа: свой ответственный и свой статус';
comment on column public.document_sections.content is 'Документ ProseMirror/TipTap в виде JSON';
comment on column public.document_sections.locked_at is 'Последняя активность держателя блокировки; через 5 минут блокировка протухает';

create table if not exists public.document_comments (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null references public.documents (id) on delete cascade,
  section_id   uuid references public.document_sections (id) on delete cascade,
  author_id    uuid not null references public.profiles (id),
  body         text not null,
  -- явный список упомянутых: разбирать «@Имя Фамилия» текстом ненадёжно
  mentions     uuid[] not null default '{}',
  resolved     boolean not null default false,
  resolved_by  uuid references public.profiles (id) on delete set null,
  resolved_at  timestamptz,
  created_at   timestamptz not null default now()
);

comment on table public.document_comments is 'Комментарии к документу или к отдельному разделу';

create table if not exists public.document_versions (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null references public.documents (id) on delete cascade,
  section_id   uuid references public.document_sections (id) on delete cascade,
  title        text,
  content      jsonb not null,
  author_id    uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);

comment on table public.document_versions is 'Снимки разделов: просмотр и откат';
comment on column public.document_versions.title is 'Заголовок раздела на момент снимка';

create table if not exists public.document_tasks (
  document_id  uuid not null references public.documents (id) on delete cascade,
  task_id      uuid not null references public.tasks (id) on delete cascade,
  section_id   uuid references public.document_sections (id) on delete set null,
  -- auto = связь появилась из ссылки #142 в тексте; такие связи
  -- снимаются сами, когда ссылка исчезает из раздела
  auto         boolean not null default false,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  primary key (document_id, task_id)
);

comment on table public.document_tasks is 'Связь документов и задач (ссылки #142 и ручные привязки)';

-- Уведомления научились указывать на документ, а не только на задачу
alter table public.notifications
  add column if not exists document_id uuid references public.documents (id) on delete cascade;
alter table public.notifications
  add column if not exists section_id uuid references public.document_sections (id) on delete cascade;

-- ---------------------------------------------------------------------
-- 2. Индексы
-- ---------------------------------------------------------------------
create index if not exists idx_documents_project on public.documents (project_id);
create index if not exists idx_document_sections_document
  on public.document_sections (document_id, position);
create index if not exists idx_document_sections_assignee
  on public.document_sections (assignee_id);
create index if not exists idx_document_comments_document
  on public.document_comments (document_id, created_at);
create index if not exists idx_document_versions_section
  on public.document_versions (section_id, created_at desc);
create index if not exists idx_document_tasks_task on public.document_tasks (task_id);

-- ---------------------------------------------------------------------
-- 3. Хелперы прав
-- ---------------------------------------------------------------------

-- Проект документа — как task_project_id для задач
create or replace function public.document_project_id(p_document_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select project_id from public.documents where id = p_document_id;
$$;

create or replace function public.section_document_id(p_section_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select document_id from public.document_sections where id = p_section_id;
$$;

-- Правка самого документа (заголовок, тип, статус, состав разделов):
-- автор документа или руководитель проекта (admin считается руководителем)
create or replace function public.can_edit_document(p_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    public.is_active_user()
    and exists (
      select 1
        from public.documents d
       where d.id = p_document_id
         and (
           d.author_id = auth.uid()
           or public.is_project_manager(d.project_id)
         )
    );
$$;

-- Правка раздела: автор документа, руководитель проекта, ответственный
create or replace function public.can_edit_document_section(p_section_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    public.is_active_user()
    and exists (
      select 1
        from public.document_sections s
        join public.documents d on d.id = s.document_id
       where s.id = p_section_id
         and (
           s.assignee_id = auth.uid()
           or d.author_id = auth.uid()
           or public.is_project_manager(d.project_id)
         )
    );
$$;

-- Время жизни мягкой блокировки. Одно место на БД и на клиент (RPC-ответ).
create or replace function public.document_lock_ttl()
returns interval
language sql
immutable
as $$
  select interval '5 minutes';
$$;

-- ---------------------------------------------------------------------
-- 4. Разбор содержимого: упоминания @имя и ссылки на задачи #142.
--    Оба вида — узлы TipTap с id в attrs, поэтому достаём их jsonpath-ом.
-- ---------------------------------------------------------------------
create or replace function public.document_mention_ids(p_content jsonb)
returns uuid[]
language sql
immutable
as $$
  select coalesce(array_agg(distinct (n->'attrs'->>'id')::uuid), '{}'::uuid[])
    from jsonb_path_query(
           coalesce(p_content, '{}'::jsonb),
           '$.** ? (@.type == "mention")'
         ) n
   where n->'attrs'->>'id' ~ '^[0-9a-fA-F-]{36}$';
$$;

create or replace function public.document_task_ref_ids(p_content jsonb)
returns uuid[]
language sql
immutable
as $$
  select coalesce(array_agg(distinct (n->'attrs'->>'id')::uuid), '{}'::uuid[])
    from jsonb_path_query(
           coalesce(p_content, '{}'::jsonb),
           '$.** ? (@.type == "taskRef")'
         ) n
   where n->'attrs'->>'id' ~ '^[0-9a-fA-F-]{36}$';
$$;

-- ---------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------
alter table public.documents         enable row level security;
alter table public.document_sections enable row level security;
alter table public.document_comments enable row level security;
alter table public.document_versions enable row level security;
alter table public.document_tasks    enable row level security;

-- ---- documents ----
drop policy if exists documents_select on public.documents;
create policy documents_select on public.documents
  for select to authenticated
  using (public.is_project_member(project_id));

-- заводит документ любой активный участник проекта — от своего имени
drop policy if exists documents_insert on public.documents;
create policy documents_insert on public.documents
  for insert to authenticated
  with check (
    public.is_active_user()
    and public.is_project_member(project_id)
    and author_id = auth.uid()
  );

drop policy if exists documents_update on public.documents;
create policy documents_update on public.documents
  for update to authenticated
  using (public.can_edit_document(id))
  with check (public.can_edit_document(id));

drop policy if exists documents_delete on public.documents;
create policy documents_delete on public.documents
  for delete to authenticated
  using (public.can_edit_document(id));

-- ---- document_sections ----
drop policy if exists document_sections_select on public.document_sections;
create policy document_sections_select on public.document_sections
  for select to authenticated
  using (public.is_project_member(public.document_project_id(document_id)));

-- состав разделов меняет автор документа или руководитель
drop policy if exists document_sections_insert on public.document_sections;
create policy document_sections_insert on public.document_sections
  for insert to authenticated
  with check (public.can_edit_document(document_id));

drop policy if exists document_sections_update on public.document_sections;
create policy document_sections_update on public.document_sections
  for update to authenticated
  using (public.can_edit_document_section(id))
  with check (public.can_edit_document_section(id));

drop policy if exists document_sections_delete on public.document_sections;
create policy document_sections_delete on public.document_sections
  for delete to authenticated
  using (public.can_edit_document(document_id));

-- ---- document_comments ----
drop policy if exists document_comments_select on public.document_comments;
create policy document_comments_select on public.document_comments
  for select to authenticated
  using (public.is_project_member(public.document_project_id(document_id)));

drop policy if exists document_comments_insert on public.document_comments;
create policy document_comments_insert on public.document_comments
  for insert to authenticated
  with check (
    public.is_active_user()
    and public.is_project_member(public.document_project_id(document_id))
    and author_id = auth.uid()
  );

-- «решено» ставит автор ветки, автор документа, руководитель
-- или ответственный за раздел
drop policy if exists document_comments_update on public.document_comments;
create policy document_comments_update on public.document_comments
  for update to authenticated
  using (
    public.is_active_user()
    and (
      author_id = auth.uid()
      or public.can_edit_document(document_id)
      or (section_id is not null and public.can_edit_document_section(section_id))
    )
  )
  with check (
    public.is_active_user()
    and (
      author_id = auth.uid()
      or public.can_edit_document(document_id)
      or (section_id is not null and public.can_edit_document_section(section_id))
    )
  );

drop policy if exists document_comments_delete on public.document_comments;
create policy document_comments_delete on public.document_comments
  for delete to authenticated
  using (author_id = auth.uid() or public.can_edit_document(document_id));

-- ---- document_versions (пишет только RPC через security definer) ----
drop policy if exists document_versions_select on public.document_versions;
create policy document_versions_select on public.document_versions
  for select to authenticated
  using (public.is_project_member(public.document_project_id(document_id)));

-- ---- document_tasks ----
drop policy if exists document_tasks_select on public.document_tasks;
create policy document_tasks_select on public.document_tasks
  for select to authenticated
  using (public.is_project_member(public.document_project_id(document_id)));

drop policy if exists document_tasks_insert on public.document_tasks;
create policy document_tasks_insert on public.document_tasks
  for insert to authenticated
  with check (
    public.can_edit_document(document_id)
    or (section_id is not null and public.can_edit_document_section(section_id))
  );

drop policy if exists document_tasks_delete on public.document_tasks;
create policy document_tasks_delete on public.document_tasks
  for delete to authenticated
  using (
    public.can_edit_document(document_id)
    or (section_id is not null and public.can_edit_document_section(section_id))
  );

-- ---------------------------------------------------------------------
-- 6. Триггеры
-- ---------------------------------------------------------------------

-- updated_at документа
create or replace function public.touch_document()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_documents_touch on public.documents;
create trigger trg_documents_touch
  before update on public.documents
  for each row execute function public.touch_document();

-- правка раздела поднимает updated_at документа: список документов
-- сортируется по свежести, и правка внутри раздела — это правка документа
create or replace function public.touch_document_from_section()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.documents
     set updated_at = now()
   where id = coalesce(new.document_id, old.document_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_document_sections_touch_doc on public.document_sections;
create trigger trg_document_sections_touch_doc
  after insert or update or delete on public.document_sections
  for each row execute function public.touch_document_from_section();

-- Ответственный и порядок разделов — не дело исполнителя раздела:
-- иначе назначенный на раздел мог бы переписать назначение соседу.
create or replace function public.guard_document_section_structure()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (new.assignee_id is distinct from old.assignee_id
      or new.position is distinct from old.position
      or new.document_id is distinct from old.document_id)
     and not public.can_edit_document(old.document_id) then
    raise exception 'Менять ответственного и порядок разделов может автор документа или руководитель';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_document_sections_guard on public.document_sections;
create trigger trg_document_sections_guard
  before update on public.document_sections
  for each row execute function public.guard_document_section_structure();

-- Назначили на раздел — уведомляем
create or replace function public.notify_document_section_assigned()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_doc   public.documents%rowtype;
begin
  if new.assignee_id is null or new.assignee_id = v_actor then
    return new;
  end if;

  -- OLD доступен только на UPDATE, поэтому сравниваем отдельной проверкой
  if tg_op = 'UPDATE' and new.assignee_id is not distinct from old.assignee_id then
    return new;
  end if;

  select * into v_doc from public.documents where id = new.document_id;
  if not found then
    return new;
  end if;

  insert into public.notifications (user_id, document_id, section_id, type, message)
  values (
    new.assignee_id, v_doc.id, new.id, 'doc_assigned',
    'Вам назначен раздел «' || new.title || '» документа «' || v_doc.title || '»'
  );

  return new;
end;
$$;

drop trigger if exists trg_document_sections_notify on public.document_sections;
create trigger trg_document_sections_notify
  after insert or update of assignee_id on public.document_sections
  for each row execute function public.notify_document_section_assigned();

-- Комментарий: упомянутым — «упомянули», остальным заинтересованным —
-- «новый комментарий». Один человек получает не больше одного уведомления.
create or replace function public.notify_document_comment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_doc      public.documents%rowtype;
  v_section  public.document_sections%rowtype;
  v_notified uuid[] := array[new.author_id];
begin
  select * into v_doc from public.documents where id = new.document_id;
  if not found then
    return new;
  end if;

  if new.section_id is not null then
    select * into v_section from public.document_sections where id = new.section_id;
  end if;

  -- упомянутые (только активные участники проекта)
  insert into public.notifications (user_id, document_id, section_id, type, message)
  select p.id, v_doc.id, new.section_id, 'doc_mention',
         'Вас упомянули в комментарии к документу «' || v_doc.title || '»'
    from public.profiles p
   where p.id = any(new.mentions)
     and p.is_active
     and not (p.id = any(v_notified))
     and (
       p.role = 'admin'
       or exists (
         select 1 from public.project_members m
          where m.project_id = v_doc.project_id and m.user_id = p.id
       )
     );

  v_notified := v_notified || new.mentions;

  -- автор документа
  if v_doc.author_id is not null and not (v_doc.author_id = any(v_notified)) then
    insert into public.notifications (user_id, document_id, section_id, type, message)
    values (v_doc.author_id, v_doc.id, new.section_id, 'doc_comment',
      'Новый комментарий к документу «' || v_doc.title || '»');
    v_notified := v_notified || v_doc.author_id;
  end if;

  -- ответственный за раздел
  if v_section.assignee_id is not null and not (v_section.assignee_id = any(v_notified)) then
    insert into public.notifications (user_id, document_id, section_id, type, message)
    values (v_section.assignee_id, v_doc.id, new.section_id, 'doc_comment',
      'Новый комментарий к разделу «' || v_section.title || '»');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_document_comments_notify on public.document_comments;
create trigger trg_document_comments_notify
  after insert on public.document_comments
  for each row execute function public.notify_document_comment();

-- ---------------------------------------------------------------------
-- 7. RPC
-- ---------------------------------------------------------------------

-- Взять мягкую блокировку раздела.
-- Занято — не ошибка: возвращаем, кто держит, и клиент открывает на чтение.
create or replace function public.acquire_document_section_lock(p_section_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor   uuid := auth.uid();
  v_section public.document_sections%rowtype;
begin
  if not public.can_edit_document_section(p_section_id) then
    raise exception 'Недостаточно прав для редактирования раздела';
  end if;

  select * into v_section
    from public.document_sections
   where id = p_section_id
     for update;

  if not found then
    raise exception 'Раздел не найден';
  end if;

  if v_section.locked_by is null
     or v_section.locked_by = v_actor
     or v_section.locked_at is null
     or v_section.locked_at <= now() - public.document_lock_ttl() then
    update public.document_sections
       set locked_by = v_actor, locked_at = now()
     where id = p_section_id;

    return jsonb_build_object('ok', true, 'mine', true, 'holder_id', v_actor);
  end if;

  return jsonb_build_object(
    'ok', false,
    'mine', false,
    'holder_id', v_section.locked_by,
    'holder_name', (select full_name from public.profiles where id = v_section.locked_by),
    'locked_at', v_section.locked_at
  );
end;
$$;

-- Отпустить блокировку (закрыли редактор / ушли со страницы)
create or replace function public.release_document_section_lock(p_section_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.document_sections
     set locked_by = null, locked_at = null
   where id = p_section_id
     and locked_by = auth.uid();
end;
$$;

-- Сохранение раздела (автосохранение раз в несколько секунд).
--
-- Версии: снимок на каждое сохранение засыпал бы историю (автосейв идёт
-- каждые несколько секунд), поэтому подряд идущие сохранения одного
-- автора в пределах TTL блокировки склеиваются в один снимок — версия
-- получается «на сеанс правки». Смена автора или пауза начинают новую.
create or replace function public.save_document_section(
  p_section_id uuid,
  p_content    jsonb,
  p_title      text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor       uuid := auth.uid();
  v_section     public.document_sections%rowtype;
  v_doc         public.documents%rowtype;
  v_title       text;
  v_old_ment    uuid[];
  v_new_ment    uuid[];
  v_fresh       uuid[];
  v_refs        uuid[];
  v_last        public.document_versions%rowtype;
  v_version_id  uuid;
begin
  select * into v_section from public.document_sections where id = p_section_id;
  if not found then
    raise exception 'Раздел не найден';
  end if;

  if not public.can_edit_document_section(p_section_id) then
    raise exception 'Недостаточно прав для редактирования раздела';
  end if;

  -- чужая живая блокировка — сохранять нельзя
  if v_section.locked_by is not null
     and v_section.locked_by <> v_actor
     and v_section.locked_at is not null
     and v_section.locked_at > now() - public.document_lock_ttl() then
    raise exception 'Раздел редактирует %',
      coalesce(
        (select full_name from public.profiles where id = v_section.locked_by),
        'другой участник'
      );
  end if;

  select * into v_doc from public.documents where id = v_section.document_id;

  v_title := coalesce(nullif(btrim(p_title), ''), v_section.title);
  v_old_ment := public.document_mention_ids(v_section.content);
  v_new_ment := public.document_mention_ids(p_content);
  v_refs := public.document_task_ref_ids(p_content);

  update public.document_sections
     set content    = p_content,
         title      = v_title,
         updated_at = now(),
         updated_by = v_actor,
         -- сохранение продлевает блокировку: человек явно работает
         locked_by  = v_actor,
         locked_at  = now()
   where id = p_section_id;

  -- ---- версия ----
  select * into v_last
    from public.document_versions
   where section_id = p_section_id
   order by created_at desc
   limit 1;

  if v_last.id is not null
     and v_last.author_id = v_actor
     and v_last.created_at > now() - public.document_lock_ttl() then
    update public.document_versions
       set content = p_content, title = v_title, created_at = now()
     where id = v_last.id
    returning id into v_version_id;
  else
    insert into public.document_versions (document_id, section_id, title, content, author_id)
    values (v_doc.id, p_section_id, v_title, p_content, v_actor)
    returning id into v_version_id;
  end if;

  -- ---- упоминания: уведомляем только новых ----
  v_fresh := array(
    select m
      from unnest(v_new_ment) m
     where m <> v_actor
       and not (m = any(v_old_ment))
  );

  insert into public.notifications (user_id, document_id, section_id, type, message)
  select p.id, v_doc.id, p_section_id, 'doc_mention',
         'Вас упомянули в разделе «' || v_title || '» документа «' || v_doc.title || '»'
    from public.profiles p
   where p.id = any(v_fresh)
     and p.is_active
     and (
       p.role = 'admin'
       or exists (
         select 1 from public.project_members m
          where m.project_id = v_doc.project_id and m.user_id = p.id
       )
     );

  -- ---- ссылки #142 → связанные задачи ----
  insert into public.document_tasks (document_id, task_id, section_id, auto, created_by)
  select v_doc.id, t.id, p_section_id, true, v_actor
    from public.tasks t
   where t.id = any(v_refs)
     and t.project_id = v_doc.project_id
  on conflict (document_id, task_id) do nothing;

  -- ссылка ушла из текста — снимаем автосвязь (ручные не трогаем)
  delete from public.document_tasks dt
   where dt.document_id = v_doc.id
     and dt.section_id = p_section_id
     and dt.auto
     and not (dt.task_id = any(v_refs));

  return jsonb_build_object(
    'ok', true,
    'saved_at', now(),
    'version_id', v_version_id,
    'mentioned', coalesce(array_length(v_fresh, 1), 0)
  );
end;
$$;

-- Откат раздела к версии. Текущее состояние сначала уходит в историю,
-- чтобы откат можно было отменить тем же откатом.
create or replace function public.restore_document_version(p_version_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor   uuid := auth.uid();
  v_version public.document_versions%rowtype;
  v_section public.document_sections%rowtype;
begin
  select * into v_version from public.document_versions where id = p_version_id;
  if not found or v_version.section_id is null then
    raise exception 'Версия не найдена';
  end if;

  if not public.can_edit_document_section(v_version.section_id) then
    raise exception 'Недостаточно прав для отката раздела';
  end if;

  select * into v_section
    from public.document_sections
   where id = v_version.section_id
     for update;

  if v_section.locked_by is not null
     and v_section.locked_by <> v_actor
     and v_section.locked_at is not null
     and v_section.locked_at > now() - public.document_lock_ttl() then
    raise exception 'Раздел редактирует %',
      coalesce(
        (select full_name from public.profiles where id = v_section.locked_by),
        'другой участник'
      );
  end if;

  -- снимок текущего состояния перед перезаписью
  insert into public.document_versions (document_id, section_id, title, content, author_id)
  values (v_section.document_id, v_section.id, v_section.title, v_section.content, v_actor);

  update public.document_sections
     set content    = v_version.content,
         title      = coalesce(v_version.title, title),
         updated_at = now(),
         updated_by = v_actor
   where id = v_section.id;

  -- снимок восстановленного состояния — иначе следующее автосохранение
  -- склеится с ним и в истории не останется следа отката
  insert into public.document_versions (document_id, section_id, title, content, author_id)
  values (
    v_section.document_id, v_section.id,
    coalesce(v_version.title, v_section.title), v_version.content, v_actor
  );

  return jsonb_build_object('ok', true, 'section_id', v_section.id);
end;
$$;

grant execute on function public.document_project_id(uuid) to authenticated, service_role;
grant execute on function public.section_document_id(uuid) to authenticated, service_role;
grant execute on function public.can_edit_document(uuid) to authenticated, service_role;
grant execute on function public.can_edit_document_section(uuid) to authenticated, service_role;
grant execute on function public.document_lock_ttl() to authenticated, service_role;
grant execute on function public.document_mention_ids(jsonb) to authenticated, service_role;
grant execute on function public.document_task_ref_ids(jsonb) to authenticated, service_role;
grant execute on function public.acquire_document_section_lock(uuid) to authenticated, service_role;
grant execute on function public.release_document_section_lock(uuid) to authenticated, service_role;
grant execute on function public.save_document_section(uuid, jsonb, text) to authenticated, service_role;
grant execute on function public.restore_document_version(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 8. Представление: документ с прогрессом по разделам
-- ---------------------------------------------------------------------
create or replace view public.documents_enriched
with (security_invoker = on) as
select
  d.*,
  a.full_name as author_name,
  coalesce(s.total, 0) as sections_total,
  coalesce(s.ready, 0) as sections_ready,
  case
    when coalesce(s.total, 0) = 0 then 0
    else round(coalesce(s.ready, 0) * 100.0 / s.total)::int
  end as progress,
  coalesce(c.open_comments, 0) as open_comments,
  coalesce(t.tasks_count, 0) as tasks_count
from public.documents d
  left join public.profiles a on a.id = d.author_id
  left join lateral (
    select
      count(*) as total,
      count(*) filter (where ds.status = 'ready') as ready
    from public.document_sections ds
    where ds.document_id = d.id
  ) s on true
  left join lateral (
    select count(*) as open_comments
    from public.document_comments dc
    where dc.document_id = d.id and dc.resolved = false
  ) c on true
  left join lateral (
    select count(*) as tasks_count
    from public.document_tasks dt
    where dt.document_id = d.id
  ) t on true;

comment on view public.documents_enriched is 'Документы с прогрессом (доля готовых разделов) и счётчиками';

-- ---------------------------------------------------------------------
-- 9. Доступ ролей API и realtime.
--    Права всё равно решает RLS; grant лишь открывает таблицу PostgREST.
-- ---------------------------------------------------------------------
grant select, insert, update, delete on public.documents         to authenticated;
grant select, insert, update, delete on public.document_sections to authenticated;
grant select, insert, update, delete on public.document_comments to authenticated;
grant select                         on public.document_versions to authenticated;
grant select, insert, delete         on public.document_tasks    to authenticated;
grant select                         on public.documents_enriched to authenticated;

-- Мягкая блокировка и статусы разделов должны доезжать до соседей сами
do $$
begin
  alter publication supabase_realtime add table public.document_sections;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.document_comments;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.documents;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;
