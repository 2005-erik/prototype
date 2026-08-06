-- =====================================================================
-- Удаление проекта должно проходить целиком:
--   projects → tasks → всё, что относится к задаче
--   projects → statuses → task_status_durations
--
-- Что было сломано. При удалении проекта Postgres каскадно удаляет и
-- statuses, и tasks — но порядок обработки не определён. Если statuses
-- удаляются раньше tasks, срабатывают внешние ключи на statuses,
-- у которых поведение при удалении не задано (NO ACTION):
--   * task_status_durations.status_id → «violates foreign key constraint
--     task_status_durations_status_id_fkey» (эта ошибка и наблюдалась);
--   * tasks.status_id → та же ошибка следом, уже про tasks_status_id_fkey.
-- Починка только первого ключа сдвинула бы падение на второй.
--
-- Решение:
--   1. Все ключи, ссылающиеся на tasks, — on delete cascade: ни одна из
--      этих строк не имеет смысла без задачи (activity, comments,
--      attachments, checklist_items, durations, notifications).
--   2. task_status_durations.status_id — on delete cascade: замер времени
--      в удалённом статусе не о чем.
--   3. tasks.status_id — НЕ каскад: удаление колонки не должно уносить
--      задачи. Ключ остаётся запретом, но становится deferrable initially
--      deferred — проверка переносится на конец транзакции, поэтому внутри
--      одного каскадного удаления промежуточное состояние допустимо,
--      а попытка удалить непустой статус отдельным запросом по-прежнему
--      падает (плюс есть проверка на клиенте в useProjectSettings).
--
-- Все блоки идемпотентны и ищут ключи по каталогу, а не по именам:
-- имя констрейнта в базе может отличаться от умолчательного.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Всё, что ссылается на tasks → on delete cascade
-- ---------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select c.conname,
           c.conrelid::regclass::text as tbl,
           a.attname
      from pg_constraint c
      join pg_attribute a
        on a.attrelid = c.conrelid
       and a.attnum = c.conkey[1]
     where c.contype = 'f'
       and c.confrelid = 'public.tasks'::regclass
       and array_length(c.conkey, 1) = 1
       and c.confdeltype <> 'c'
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
    execute format(
      'alter table %s add constraint %I foreign key (%I)
         references public.tasks (id) on delete cascade',
      r.tbl, r.conname, r.attname
    );
    raise notice 'FK % на %(%) переведён в on delete cascade', r.conname, r.tbl, r.attname;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Всё, что ссылается на statuses:
--    tasks.status_id — deferrable, остальные — on delete cascade
-- ---------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select c.conname,
           c.conrelid::regclass::text as tbl,
           c.conrelid = 'public.tasks'::regclass as is_tasks,
           a.attname,
           c.confdeltype,
           c.condeferrable
      from pg_constraint c
      join pg_attribute a
        on a.attrelid = c.conrelid
       and a.attnum = c.conkey[1]
     where c.contype = 'f'
       and c.confrelid = 'public.statuses'::regclass
       and array_length(c.conkey, 1) = 1
  loop
    if r.is_tasks then
      -- задачи переживают удаление статуса: только откладываем проверку
      continue when r.condeferrable;
      execute format('alter table %s drop constraint %I', r.tbl, r.conname);
      execute format(
        'alter table %s add constraint %I foreign key (%I)
           references public.statuses (id)
           deferrable initially deferred',
        r.tbl, r.conname, r.attname
      );
      raise notice 'FK % на %(%) сделан deferrable', r.conname, r.tbl, r.attname;
    else
      continue when r.confdeltype = 'c';
      execute format('alter table %s drop constraint %I', r.tbl, r.conname);
      execute format(
        'alter table %s add constraint %I foreign key (%I)
           references public.statuses (id) on delete cascade',
        r.tbl, r.conname, r.attname
      );
      raise notice 'FK % на %(%) переведён в on delete cascade', r.conname, r.tbl, r.attname;
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Проверка цепочки целиком. Если что-то осталось незакрытым —
--    миграция падает здесь, а не у пользователя на кнопке «Удалить».
-- ---------------------------------------------------------------------
do $$
declare
  v_bad text;
begin
  select string_agg(
           format('%s.%s → %s (on delete %s%s)',
                  c.conrelid::regclass, a.attname, c.confrelid::regclass,
                  c.confdeltype,
                  case when c.condeferrable then ', deferrable' else '' end),
           '; ')
    into v_bad
    from pg_constraint c
    join pg_attribute a
      on a.attrelid = c.conrelid
     and a.attnum = c.conkey[1]
   where c.contype = 'f'
     and c.confrelid in (
           'public.tasks'::regclass,
           'public.statuses'::regclass,
           'public.projects'::regclass
         )
     and array_length(c.conkey, 1) = 1
     -- допустимо: каскад, либо отложенная проверка (tasks.status_id)
     and c.confdeltype <> 'c'
     and not c.condeferrable;

  if v_bad is not null then
    raise exception 'Цепочка удаления не замкнута: %', v_bad;
  end if;
end;
$$;
