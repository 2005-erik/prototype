-- =====================================================================
-- Начальная схема БД: таблицы, связи, индексы
-- Корпоративный таск-менеджер
-- =====================================================================

-- ---------------------------------------------------------------------
-- profiles — профили пользователей (1:1 с auth.users)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id                    uuid primary key references auth.users (id) on delete cascade,
  full_name             text not null,
  position              text,
  department            text,
  role                  text not null default 'employee'
                          check (role in ('admin', 'manager', 'employee')),
  avatar_url            text,
  is_active             boolean default true,
  max_concurrent_tasks  int default 10,   -- порог перегрузки сотрудника
  created_at            timestamptz default now()
);

-- Страховка на случай, если таблица profiles уже существовала без этой колонки
-- (create table if not exists не изменяет структуру существующей таблицы)
alter table public.profiles
  add column if not exists max_concurrent_tasks int default 10;

comment on table public.profiles is 'Профили пользователей, связаны 1:1 с auth.users';
comment on column public.profiles.max_concurrent_tasks is 'Порог одновременных задач — перегрузка';

-- ---------------------------------------------------------------------
-- projects — проекты (доски)
-- ---------------------------------------------------------------------
create table if not exists public.projects (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  description  text,
  owner_id     uuid references public.profiles (id),
  color        text default '#2563eb',
  is_archived  boolean default false,
  created_at   timestamptz default now()
);

comment on table public.projects is 'Проекты (канбан-доски)';

-- ---------------------------------------------------------------------
-- project_members — участники проекта
-- ---------------------------------------------------------------------
create table if not exists public.project_members (
  project_id  uuid not null references public.projects (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  role        text default 'member'
                check (role in ('owner', 'manager', 'member')),
  primary key (project_id, user_id)
);

comment on table public.project_members is 'Участники проекта и их роль в нём';

-- ---------------------------------------------------------------------
-- statuses — настраиваемые статусы (колонки) внутри проекта
-- ---------------------------------------------------------------------
create table if not exists public.statuses (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects (id) on delete cascade,
  name              text not null,
  code              text not null,
  color             text,
  position          int not null,
  is_final          boolean default false,   -- финальный статус (задача закрыта)
  is_initial        boolean default false,   -- стартовый статус новой задачи
  is_rework         boolean default false,   -- статус доработки (возврат)
  requires_comment  boolean default false    -- обязательный комментарий при переходе
);

comment on table public.statuses is 'Настраиваемые статусы (колонки канбана) на проект';
comment on column public.statuses.is_initial is 'Статус, присваиваемый новой задаче';
comment on column public.statuses.is_rework is 'Статус доработки — возврат исполнителю';
comment on column public.statuses.requires_comment is 'Требуется комментарий при переходе в этот статус';

-- ---------------------------------------------------------------------
-- tasks — задачи
-- ---------------------------------------------------------------------
create table if not exists public.tasks (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references public.projects (id) on delete cascade,
  number             int,
  title              text not null,
  description        text,
  status_id          uuid references public.statuses (id),
  priority           text default 'medium'
                       check (priority in ('low', 'medium', 'high', 'critical')),
  author_id          uuid not null references public.profiles (id),
  assignee_id        uuid references public.profiles (id),
  due_date           timestamptz,
  started_at         timestamptz,
  completed_at       timestamptz,
  estimate_hours     numeric,
  spent_hours        numeric default 0,
  rework_count       int default 0,          -- сколько раз возвращали на доработку
  first_completed_at timestamptz,            -- когда сдали в первый раз
  position           numeric,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

comment on table public.tasks is 'Задачи';
comment on column public.tasks.author_id is 'Кто поставил задачу';
comment on column public.tasks.assignee_id is 'Исполнитель';
comment on column public.tasks.rework_count is 'Число возвратов на доработку';
comment on column public.tasks.first_completed_at is 'Момент первой сдачи задачи';

-- ---------------------------------------------------------------------
-- task_status_durations — учёт времени, проведённого в каждом статусе
-- ---------------------------------------------------------------------
create table if not exists public.task_status_durations (
  id                bigserial primary key,
  task_id           uuid not null references public.tasks (id) on delete cascade,
  status_id         uuid references public.statuses (id),
  entered_at        timestamptz not null,
  left_at           timestamptz,
  duration_seconds  bigint
);

comment on table public.task_status_durations is 'Время нахождения задачи в каждом статусе';

-- ---------------------------------------------------------------------
-- task_activity — журнал действий по задаче
-- ---------------------------------------------------------------------
create table if not exists public.task_activity (
  id          bigserial primary key,
  task_id     uuid not null references public.tasks (id) on delete cascade,
  user_id     uuid references public.profiles (id),
  action      text not null,
  field       text,
  old_value   text,
  new_value   text,
  comment     text,                 -- причина возврата / пояснение
  created_at  timestamptz default now()
);

comment on table public.task_activity is 'Журнал всех изменений задачи';
comment on column public.task_activity.comment is 'Причина возврата или пояснение к действию';

-- ---------------------------------------------------------------------
-- comments — комментарии к задаче
-- ---------------------------------------------------------------------
create table if not exists public.comments (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks (id) on delete cascade,
  user_id     uuid references public.profiles (id),
  body        text not null,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

comment on table public.comments is 'Комментарии к задачам';

-- ---------------------------------------------------------------------
-- attachments — вложения (файлы)
-- ---------------------------------------------------------------------
create table if not exists public.attachments (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks (id) on delete cascade,
  user_id     uuid references public.profiles (id),
  file_name   text,
  file_path   text,
  file_size   bigint,
  mime_type   text,
  created_at  timestamptz default now()
);

comment on table public.attachments is 'Файлы, приложенные к задачам';

-- ---------------------------------------------------------------------
-- checklist_items — пункты чек-листа задачи
-- ---------------------------------------------------------------------
create table if not exists public.checklist_items (
  id        uuid primary key default gen_random_uuid(),
  task_id   uuid not null references public.tasks (id) on delete cascade,
  text      text not null,
  is_done   boolean default false,
  done_by   uuid references public.profiles (id),
  done_at   timestamptz,
  position  int
);

comment on table public.checklist_items is 'Пункты чек-листа внутри задачи';

-- ---------------------------------------------------------------------
-- notifications — уведомления пользователю
-- ---------------------------------------------------------------------
create table if not exists public.notifications (
  id          bigserial primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  task_id     uuid references public.tasks (id) on delete cascade,
  type        text,
  message     text,
  is_read     boolean default false,
  created_at  timestamptz default now()
);

comment on table public.notifications is 'Уведомления пользователей';

-- =====================================================================
-- Индексы
-- =====================================================================
create index if not exists idx_tasks_project_status
  on public.tasks (project_id, status_id);

create index if not exists idx_tasks_assignee
  on public.tasks (assignee_id);

create index if not exists idx_tasks_due_date_open
  on public.tasks (due_date)
  where completed_at is null;

create index if not exists idx_task_activity_task_created
  on public.task_activity (task_id, created_at desc);

create index if not exists idx_task_status_durations_task
  on public.task_status_durations (task_id);

create index if not exists idx_notifications_user_unread
  on public.notifications (user_id)
  where is_read = false;
