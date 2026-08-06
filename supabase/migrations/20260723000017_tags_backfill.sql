-- =====================================================================
-- Разбор уже импортированных задач: хвост «Метки Trello: A, B» в конце
-- описания → настоящие теги и связи, хвост из описания вычищается.
--
-- Формат хвоста задаёт импортёр (edge-функция import-trello):
--   desc += '\n\nМетки Trello: ' || array_to_string(labels, ', ')
-- Блок вложений («Вложения из Trello …») дописывался ПОСЛЕ меток,
-- поэтому вырезаем ровно строку с метками, а не «всё до конца текста».
--
-- Скрипт идемпотентен: после первого прогона хвостов не остаётся,
-- повторный запуск ничего не находит и не меняет.
-- =====================================================================

do $$
declare
  v_tasks   int := 0;
  v_tags    int := 0;
  v_links   int := 0;
begin
  -- ---- 1. Разобранные метки: задача → название тега ----
  create temp table _parsed on commit drop as
  with matched as (
    select
      t.id          as task_id,
      t.project_id  as project_id,
      t.description as description,
      (regexp_match(t.description, '(?m)^Метки Trello:[ \t]*(.+)$'))[1] as labels_line
    from public.tasks t
    where t.description like '%Метки Trello:%'
  )
  select
    m.task_id,
    m.project_id,
    btrim(label) as tag_name
  from matched m
    cross join lateral unnest(string_to_array(m.labels_line, ',')) as label
  where m.labels_line is not null
    and btrim(label) <> '';

  select count(distinct task_id) into v_tasks from _parsed;

  -- ---- 2. Теги проекта ----
  -- Цвет метки из текста уже не восстановить, поэтому раздаём его из
  -- палитры по порядку: направления должны отличаться визуально,
  -- иначе чипы сольются в одну бирюзовую массу.
  insert into public.tags (project_id, name, color)
  select project_id, tag_name,
         (array['#ecc371','#2bbaac','#61bd4f','#f2d600','#ff9f1a',
                '#c377e0','#00c2e0','#ff80ce','#eb5a46','#51e898'])[
           1 + (row_number() over (partition by project_id order by tag_name) - 1) % 10
         ]
    from (select distinct project_id, tag_name from _parsed) d
  on conflict (project_id, name) do nothing;

  get diagnostics v_tags = row_count;

  -- ---- 3. Связи ----
  insert into public.task_tags (task_id, tag_id)
  select distinct p.task_id, g.id
    from _parsed p
    join public.tags g
      on g.project_id = p.project_id and g.name = p.tag_name
  on conflict (task_id, tag_id) do nothing;

  get diagnostics v_links = row_count;

  -- ---- 4. Чистка описаний ----
  -- Убираем строку с метками вместе с пустой строкой перед ней,
  -- остальной текст (в том числе блок вложений) не трогаем.
  update public.tasks t
     set description = nullif(
           btrim(
             regexp_replace(
               t.description,
               '(?m)\n*^Метки Trello:[ \t]*.*$',
               '',
               'g'
             )
           ),
           ''
         )
   where t.description like '%Метки Trello:%';

  raise notice 'Теги: задач разобрано %, тегов создано %, связей создано %',
    v_tasks, v_tags, v_links;
end;
$$;
