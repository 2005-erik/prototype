# Аудит безопасности

**Проект:** Планировщик задач (React + Vite + Supabase)
**Дата:** 2026-07-23
**Область (этап 1):** секреты и конфигурация + сопутствующие находки по RLS/хранилищу/аутентификации, выявленные при проверке.
**Статус:** только отчёт, исправления не вносились.

---

## Сводка

| Критичность | Кол-во | Находки |
|---|---|---|
| 🔴 Критично | 0 | — |
| 🟠 Высоко | 1 | H1 |
| 🟡 Средне | 3 | M1, M2, M3 |
| 🔵 Низко | 5 | L1–L5 |

**Главный вывод по секретам:** утечек нет. `service_role`-ключ и JWT-секреты в коде/истории/сборке **не обнаружены**. `.env.local` не отслеживается git и никогда не коммитился. В бандл попадает только публичный `anon`/publishable-ключ — это ожидаемо.

**Главный риск:** ключевое ролевое правило «сотрудник меняет только статус задачи» на уровне БД (RLS) **не enforced** — оно есть только в UI (H1).

---

## 1. Секреты и конфигурация — результаты проверки

| Проверка | Результат |
|---|---|
| Секреты в исходниках (`sbp_`, `service_role`, `eyJ…`, пароли) | ✅ Не найдено. Совпадения — только имя роли в комментарии `config.toml`, integrity-хэши в `package-lock.json`, легитимный auth-код (`signInWithPassword`). |
| Секреты в git-истории (`git log -p`) | ✅ Чисто. В истории только `import.meta.env.VITE_SUPABASE_ANON_KEY` (чтение переменной, не значение) и `env(...)`-ссылки в `config.toml`. |
| `.env.local` в `.gitignore` | ✅ Да (`.gitignore:13 *.local`, `:14 .env.local`). Не в индексе, в истории отсутствует. |
| `.env.local` в `dist/` | ✅ `dist/` в `.gitignore` и не отслеживается (0 файлов в индексе). |
| `service_role` на фронте | ✅ Нигде. Клиент (`src/lib/supabase.js`) использует только `VITE_SUPABASE_ANON_KEY`. В `dist/` `service_role` отсутствует. |
| `vite.config.js` — лишние переменные | ✅ Чисто. Нет блока `define`, нет ручного проброса `process.env`. Vite экспонирует только `VITE_*` (по умолчанию), что корректно. |
| XSS-векторы | ✅ `dangerouslySetInnerHTML` / `innerHTML` / `eval` в `src` не используются. React экранирует по умолчанию. |
| RLS включён на таблицах | ✅ 11 `enable row level security` — на всех таблицах схемы. |

**`.env.local`** содержит `VITE_SUPABASE_URL` и `VITE_SUPABASE_ANON_KEY = sb_publishable_…`. Это **публикуемый (anon) ключ**, а не `service_role` — его наличие в клиенте и в бандле безопасно по дизайну Supabase (доступ ограничивается RLS для роли `anon`/`authenticated`).

---

## 🟠 Высоко

### H1. RLS позволяет исполнителю менять любые поля своей задачи, а не только статус

**Где:** `supabase/migrations/20260722000004_rls_policies.sql:194–197`

```sql
create policy tasks_update on public.tasks
  for update to authenticated
  using (public.is_project_manager(project_id) or assignee_id = auth.uid())
  with check (public.is_project_manager(project_id) or assignee_id = auth.uid());
```

RLS в Postgres действует на уровне строки, а не колонки. Политика разрешает исполнителю (`assignee_id = auth.uid()`) `UPDATE` строки целиком — то есть менять `title`, `description`, `priority`, `due_date`, **`assignee_id`**, `estimate_hours` и т.д.

**Риск:** заявленное в ТЗ и в UI правило «сотрудник меняет ТОЛЬКО статус» на сервере не enforced. Сотрудник, вызвав Data API напрямую (ключ и URL публичны), может:
- переназначить свою задачу другому/снять с себя (`assignee_id`),
- сдвинуть срок, снизить приоритет, переписать заголовок/описание,
- обнулить `rework_count`/`completed_at` в обход триггеров (триггер `log_task_changes` логирует смену статуса, но не запрещает правку прочих полей).

UI-ограничения (`TaskDrawer`/`TaskRow` показывают поля read-only для employee) обходятся тривиально. Смена статуса корректно идёт через `change_task_status` (SECURITY DEFINER с проверкой прав), но прямой `UPDATE tasks` этим не ограничен.

**Рекомендация (не применять сейчас):** для роли employee запретить прямой `UPDATE tasks` и разрешать смену статуса только через RPC; либо `BEFORE UPDATE`-триггер-страж, который для не-менеджера пропускает изменение лишь `status_id` (и производных), отвергая правку остальных колонок; либо колоночные GRANT + отдельная политика.

---

## 🟡 Средне

### M1. Политика вставки в `task_activity` — `with check (true)`: подделка журнала аудита

**Где:** `supabase/migrations/20260722000004_rls_policies.sql:285–287`

```sql
create policy task_activity_insert on public.task_activity
  for insert to authenticated
  with check (true);
```

Любой аутентифицированный пользователь может вставить **произвольную** запись активности с любым `task_id` (в т.ч. задач из проектов, где он не участник) и любым `user_id`/`action`/`comment`. Это позволяет фальсифицировать журнал изменений (audit trail), приписывать действия другим, засорять ленту.

Записи легитимно создают только триггеры (`log_task_changes`, `log_task_created`), работающие через SECURITY DEFINER, — то есть открытый insert для клиента вообще не нужен.

**Рекомендация:** убрать клиентский insert-полис (оставить только триггерный путь) или ограничить `with check` до `user_id = auth.uid() AND is_project_member(project_id)`.

### M2. Ослабленные настройки аутентификации в `supabase/config.toml`

**Где:** `supabase/config.toml`

- `:182 minimum_password_length = 6` — слабо (рекомендуется ≥ 12 для корпоративного инструмента).
- `:176/:221 enable_signup = true` — открытая саморегистрация. Любой может создать аккаунт; триггер `handle_new_user` выдаёт роль `employee`. Блау-радиус ограничен (без членства в проекте RLS не даёт видеть данные), но для внутреннего инструмента саморегистрация нежелательна.
- `:226 enable_confirmations = false` — email не подтверждается; регистрация на произвольный адрес.
- `:228 secure_password_change = false` — смена пароля без повторной аутентификации.
- `:159 site_url = http://127.0.0.1:3000`, `:163 additional_redirect_urls = [https://127.0.0.1:3000]` — dev-значения.

**Важная оговорка:** `config.toml` управляет **локальным** dev-стеком Supabase. `supabase db push` пушит только миграции, не auth-конфиг. Реальные настройки хостящегося проекта (`qidcyezleymjevaaxzef.supabase.co`) заданы в дашборде и **должны быть проверены отдельно** — не полагайтесь на то, что прод повторяет этот файл (в обе стороны).

**Рекомендация:** сверить с дашбордом хостинга; отключить открытый signup для внутреннего инструмента (приглашения/создание админом), включить email-подтверждение, поднять минимальную длину пароля, задать прод `site_url`/redirects.

### M3. Storage: бакет без ограничения типов файлов

**Где:** `supabase/migrations/20260722000006_storage.sql:12–16`

Бакет `task-attachments` приватный, лимит 10 МБ — хорошо. Но `allowed_mime_types` не задан → загружается **любой** тип (`.html`, `.svg`, исполняемые). Инлайн-XSS частично снят тем, что скачивание идёт через `createSignedUrl(path, 60, { download })` (форсирует `Content-Disposition: attachment`), но это зависит от того, что клиент всегда передаёт `download`, и не мешает хранить/раздавать вредоносные файлы.

**Рекомендация:** ограничить `allowed_mime_types` разумным списком (изображения, pdf, офисные), валидировать тип/размер и на клиенте.

---

## 🔵 Низко / информационно

### L1. Публичный anon-ключ в бандле (информационно)
`VITE_SUPABASE_ANON_KEY` попадает в `dist/assets/*.js` — это by design (ключ публичный, доступ ограничен RLS для ролей `anon`/`authenticated`). Проверено: `service_role` в бандле отсутствует. Действие: убедиться, что политика на всех таблицах — `to authenticated` (так и есть), а роль `anon` нигде не имеет доступа; при желании — ротация ключа перед публичным релизом.

### L2. Обход admin в хелперах RLS (by design)
`is_project_member`/`is_project_manager` (`…000004:` хелперы) возвращают `true` для роли `admin` независимо от членства в проекте. Это осознанное решение («admin — полный доступ»), но означает, что компрометация любого admin-аккаунта = доступ ко всем проектам. Держать число админов минимальным.

### L3. Пользовательский ввод в PostgREST `.or(ilike)`
**Где:** `src/hooks/useTasks.js`, `src/hooks/useMyDay.js` — поиск строит `.or(\`title.ilike.%${safe}%,…\`)`. Запятые/скобки экранируются (`replace(/[,()]/g,' ')`), что снимает основной вектор порчи фильтр-DSL. Остаточный риск низкий (значения всё равно проходят через параметризацию PostgREST), но экранирование стоит держать централизованно и покрыть тестами.

### L4. Dev-редиректы/URL в конфиге
`site_url`/`additional_redirect_urls` = localhost. Перед продом задать боевые домены, иначе — риск open-redirect в auth-флоу (низкий, зависит от прод-настроек дашборда).

### L5. Нет явной серверной валидации размера/типа вложения на фронте
`useTaskDetails.uploadAttachment` шлёт файл без предварительной проверки размера/типа (полагается на лимит бакета 10 МБ). Не уязвимость, но UX/защитный слой. Низкий.

---

## Что проверено и признано корректным (позитив)

- Секретов в коде/истории/сборке нет; `.env.local` изолирован от git и dist.
- `service_role` на фронте отсутствует; клиент — единственный экземпляр на anon-ключе.
- RLS включён на всех 11 таблицах; политики — `to authenticated` (роль `anon` по умолчанию denied).
- Представления `tasks_enriched`/`employee_workload` — `security_invoker` → уважают RLS вызывающего.
- SECURITY DEFINER-функции имеют `set search_path = public` (защита от подмены search_path).
- `change_task_status` (RPC) проверяет права (исполнитель/менеджер) и обязательность комментария на сервере.
- `notifications`: нет клиентского insert-полиса (пишут только триггеры); select/update/delete — только свои.
- Storage-политики привязывают доступ к членству в проекте по первому сегменту пути; бакет приватный, лимит 10 МБ.
- React экранирует вывод; `dangerouslySetInnerHTML`/`eval` не используются.

---

## Приоритет устранения (предлагаемый)

1. **H1** — колоночное ограничение прав employee на `tasks` (ядро ролевой модели).
2. **M1** — закрыть/сузить insert-полис `task_activity`.
3. **M2** — сверить и ужесточить auth-настройки хостящегося проекта.
4. **M3** — ограничить типы файлов в бакете.
5. **L1–L5** — по возможности.

> Отчёт покрывает этап 1 (секреты/конфигурация) и сопутствующие находки. При наличии следующих разделов аудита (RLS-детально, клиентская логика, зависимости) отчёт будет дополнен.

---

## ✅ Устранено (2026-07-23)

Изменения: миграция `supabase/migrations/20260723000003_security_fixes.sql`, `supabase/config.toml`, фронтенд-хуки, `verify_rls.sql`.

### H1 — исполнитель ограничен только сменой статуса
- Добавлен триггер-барьер `enforce_task_field_lock()` (`BEFORE UPDATE ON tasks`, `SECURITY DEFINER`, `search_path = public, pg_temp`).
- Если `auth.uid() = old.assignee_id` **и** не `is_project_manager(old.project_id)` — правка `title`, `description`, `due_date`, `assignee_id`, `priority`, `estimate_hours`, `author_id`, `project_id` → `raise exception 'Недостаточно прав для изменения этого поля'`. Разрешены только `status_id` и `position`.
- Имя триггера `trg_enforce_task_field_lock` сортируется раньше `trg_log_task_changes`, поэтому барьер сравнивает **клиентский** `NEW` (до того, как журналирование проставит `completed_at`/`updated_at`).
- **Менеджеры/админы не затронуты** (`is_project_manager` возвращает `true`).
- **`change_task_status` продолжает работать**: внутри неё меняется только `status_id` → барьер пропускает; смена статуса сотрудником идёт этим путём.

### M1 — защита журнала аудита
- Удалена политика `task_activity_insert (with check true)`. Клиент больше не может вставлять записи; пишут только триггеры/функции через `SECURITY DEFINER` (владелец `postgres` с BYPASSRLS) и `service_role`.
- `task_status_durations` — клиентских insert/update/delete-политик нет (пишут только триггеры), оставлено как есть.
- Всем `SECURITY DEFINER`-функциям закреплён `search_path = public, pg_temp` (12 функций).

### M2 — ослабленная аутентификация (локальный `config.toml`)
- `minimum_password_length = 6 → 10`.
- `[auth] enable_signup = true → false` и `[auth.email] enable_signup = true → false` (саморегистрация запрещена).
- `[auth.email] enable_confirmations = false → true`.
- ⚠️ Это правит **локальный** конфиг. Продовый проект настраивается в дашборде — см. чек-лист ниже.

### M3 — типы файлов бакета
- Для `task-attachments` задан `allowed_mime_types`: pdf, docx, xlsx, pptx, png, jpeg, txt, csv, zip.
- Фронтенд (`useTaskDetails.uploadAttachment`): валидация размера (≤10 МБ) и MIME до загрузки; санитизация имени файла `sanitizeFileName` (убирает путь, оставляет безопасные символы, отсекает длину).

### L3 — экранирование поиска
- `sanitizeSearchTerm` (в `src/lib/utils.js`) убирает `,()\\` из ввода; используется в `useTasks` и `useMyDay` перед `.or(ilike)`.

### Проверки
- `verify_rls.sql` дополнен ассерт-блоками (RLS на всех таблицах, наличие/приоритет барьера H1, отсутствие insert-политики task_activity, `search_path` у DEFINER-функций, `allowed_mime_types`, приватность бакета) + ручные поведенческие тесты H1.

> **Порядок применения:** `supabase db push` (миграция `…000003`). Для auth-настроек прод-проекта — чек-лист ниже (config.toml не пушится через `db push`).

---

## 📋 Чек-лист ручной настройки прод-дашборда (M2)

Supabase Dashboard → проект `qidcyezleymjevaaxzef` → **Authentication → Providers/Policies/Settings**:

- [ ] **Email → Enable Signup** — выключить (пользователей заводит админ; создавать через Dashboard → Authentication → Users → Add user, или инвайт-флоу).
- [ ] **Email → Confirm email** — включить (обязательное подтверждение адреса).
- [ ] **Policies → Minimum password length** — поставить **≥ 10**.
- [ ] **Password requirements** — при возможности включить требования (буквы+цифры/спецсимволы).
- [ ] **Secure password change** — включить (переаутентификация при смене пароля).
- [ ] **URL Configuration → Site URL** и **Redirect URLs** — заменить `127.0.0.1` на боевой домен (иначе риск open-redirect в auth-флоу).
- [ ] **Auth → Rate limits** — проверить лимиты на вход/отправку писем (защита от перебора).
- [ ] **Anonymous sign-ins** — убедиться, что выключены.
- [ ] Проверить, что для продового бакета `task-attachments` применены `allowed_mime_types` и лимит 10 МБ (миграция задаёт их; сверить в Storage → Settings).
- [ ] Ограничить число пользователей с ролью `admin` (L2: компрометация admin = доступ ко всем проектам).
- [ ] Ротация `anon`/publishable-ключа перед публичным релизом, если ключ мог утечь при разработке (L1).

---

## Раздел 2 — построчная проверка RLS (2026-07-23)

Проверено по `20260722000004_rls_policies.sql` с учётом правок `…0723_01` (task_activity.select → по `project_id`) и `…0723_03` (drop task_activity.insert).

### Матрица политик по таблицам

| Таблица | RLS | SELECT | INSERT | UPDATE | DELETE | Реальная проверка? |
|---|:--:|---|---|---|---|---|
| `profiles` | ✅ | `using(true)` ⚠️ | admin | own / admin | admin | **SELECT — нет** (L6), остальные — да |
| `projects` | ✅ | `is_project_member(id)` | role∈(admin,manager) | `is_project_manager` | `is_project_manager` | да |
| `project_members` | ✅ | `is_project_member` | `is_project_manager` | `is_project_manager` | `is_project_manager` | да |
| `statuses` | ✅ | `is_project_member` | `is_project_manager` | `is_project_manager` | `is_project_manager` | да |
| `tasks` | ✅ | `is_project_member` | `is_project_manager` | manager **or** assignee (+триггер H1 по колонкам) | `is_project_manager` | да |
| `task_status_durations` | ✅ | `is_project_member(task_project_id)` | — | — | — | да (запись только триггеры) |
| `task_activity` | ✅ | `is_project_member(project_id)` | — (снят в M1) | — | — | да (запись только триггеры) |
| `comments` | ✅ | `is_project_member(task_project_id)` | member **и** `user_id=uid` | own | own | да |
| `attachments` | ✅ | `is_project_member(task_project_id)` | `is_project_member` | — (immutable) | автор **or** manager | да |
| `checklist_items` | ✅ | `is_project_member` | `is_project_member` | `is_project_member` | `is_project_member` | да |
| `notifications` | ✅ | `user_id=uid` | — (триггеры) | own | own | да |

Прочерк = политики нет → операция для клиента запрещена (deny by default). Это осознанные write-protection'ы, а не пропуски: `task_status_durations`/`task_activity` пишут только триггеры; `notifications` insert — только триггеры; `attachments` не обновляются.

### Ключевые выводы

- **VIEW не обходят RLS.** `tasks_enriched` и `employee_workload` объявлены `with (security_invoker = on)` (`20260722000002_views.sql:10,107`) → выполняются с правами **вызывающего**, наследуя RLS базовых таблиц. Это защищает от классической дыры «view с security_definer видит всё». Автопроверка добавлена в `verify_rls.sql`.
- **Рекурсии в политиках нет.** Политики `project_members` вызывают `is_project_member`, которая сама читает `project_members`. Рекурсии не возникает, потому что хелперы `is_project_member`/`is_project_manager`/`current_user_role`/`task_project_id` — **`SECURITY DEFINER`** (владелец с BYPASSRLS): внутренние `SELECT` не перезапускают политику той же таблицы. Это и есть корректный паттерн против бесконечной рекурсии RLS.
- **`using(true)` встречается ровно один раз** — `profiles.SELECT` (см. L6). Все остальные политики содержат реальную проверку (`is_project_member` / `is_project_manager` / `user_id=auth.uid()` / роль).
- **Покрытие 4 операций:** у таблиц с изменяемыми клиентом данными есть политики на нужные операции; отсутствующие политики = запрет (durations/activity — только чтение; notifications — без insert; attachments — без update). Пропусков, дающих непреднамеренный доступ, не найдено.

### 🔵 L6 (новая, низко) — `profiles.SELECT = using(true)`: внутренний справочник открыт всем

**Где:** `20260722000004_rls_policies.sql:86–88`

```sql
create policy profiles_select on public.profiles
  for select to authenticated using (true);
```

Любой аутентифицированный пользователь читает **все** профили: `full_name`, `position`, `department`, `role`, `avatar_url`, `max_concurrent_tasks`. Ответ на вопрос аудита «может ли employee прочитать profiles чужого отдела» — **да, может** (тест C в `verify_rls.sql`).

**Оценка:** осознанный компромисс — приложению нужны имена/аватары авторов комментариев, исполнителей и участников по всем проектам, где пользователь состоит. Но это раскрывает org-справочник целиком (включая роли и порог загрузки) любому сотруднику. Прямой утечки чувствительных данных нет (паролей/контактов в `profiles` нет), поэтому **Низко**.

**Рекомендация (не применял — вне списка H1/M1/M2/M3):** при необходимости ужесточить до «видно профили тех, с кем есть общий проект» через `EXISTS`-подзапрос по `project_members`, либо скрыть служебные поля (`role`, `max_concurrent_tasks`) отдельным вью для не-админов. Оставлено на ваше решение — влияет на UX (выпадающие списки/аватары).

### Проверка (`verify_rls.sql`)

Добавлено:
- авто-ассерт, что `tasks_enriched`/`employee_workload` — `security_invoker` (иначе FAIL);
- скан всех политик на `using(true)` (WARNING — ожидается только `profiles.SELECT`);
- ассерт отсутствия клиентской записи в `task_activity`/`task_status_durations` и insert в `notifications`;
- **Раздел 2 — сценарные тесты** (ручные, с плейсхолдерами UUID): (A) не-участник ↛ задачи чужого проекта (в т.ч. через `tasks_enriched`); (B) employee ↛ `UPDATE due_date`/`assignee_id`; (C) employee → чужой профиль (демонстрирует L6); (D) не-участник ↛ комментарии/вложения чужой задачи.

---

## Раздел 3 — SECURITY DEFINER функции (2026-07-23)

Проверено 3 критерия: (1) проверка прав вызывающего, (2) `search_path = public, pg_temp`, (3) нет `user_id`-параметра без сверки с `auth.uid()`.

### Обзор всех функций

| Функция | Режим | Прямой вызов клиентом | Проверка прав | search_path | user_id-параметр | Вердикт |
|---|---|---|---|---|---|---|
| `change_task_status(task,status,comment)` | DEFINER | да (RPC) | ✅ assignee **или** manager, через `auth.uid()` | ✅ public,pg_temp | нет | **Безопасно** |
| `get_my_day(p_user_id default auth.uid())` | invoker | да (RPC) | RLS (вью security_invoker) | public | ⚠️ **да, без сверки** | S3 |
| `get_employee_stats(project,period)` | invoker | да (RPC) | RLS, **без ролевого гейта** | public | нет (старая версия с `p_user_id` дропнута) | S4 |
| `get_*` аналитика (trend/ontime/rework/cycle/bottlenecks) | invoker | да | RLS | public (без pg_temp) | нет | S5 (гигиена) |
| `track_status_duration(task,status)` | DEFINER | ⚠️ **да** | ❌ **нет** | ✅ public,pg_temp | нет | **S1** |
| `check_deadlines()` | DEFINER | ⚠️ **да** | ❌ **нет** | ✅ public,pg_temp | нет | **S2** |
| `handle_new_user()` | DEFINER | нет (триггер) | n/a (триггер `auth.users`) | ✅ | нет | Безопасно |
| `create_default_statuses()` | DEFINER | нет (триггер) | n/a | ✅ | нет | Безопасно |
| `log_task_changes()` / `log_task_created()` | DEFINER | нет (триггер¹) | n/a | ✅ | нет | Безопасно |
| `notify_on_comment()` | DEFINER | нет (триггер) | n/a | ✅ | нет | Безопасно |
| `enforce_task_field_lock()` | DEFINER | нет (триггер) | использует `auth.uid()` | ✅ | нет | Безопасно |
| `current_user_role()` / `is_project_member()` / `is_project_manager()` / `task_project_id()` | DEFINER | да (хелперы) | идентичность из `auth.uid()`, нельзя выдать себя за другого | ✅ | нет | Безопасно² |

¹ trigger-функции нельзя вызвать напрямую (`select log_task_changes()` → ошибка «trigger functions can only be called as triggers»).
² `task_project_id(task_id)` раскрывает `project_id` произвольной задачи любому authenticated (uuid, малочувствительно) — информационно, не выделяю в находку.

### Особое внимание (по запросу)

- **`change_task_status`** — ✅ образец: проверяет `v_task.assignee_id = auth.uid() or is_project_manager(...)`, принадлежность статуса проекту, обязательный комментарий; идентичность строго из `auth.uid()`, `user_id` параметром не принимает; `search_path = public, pg_temp`.
- **`get_my_day`** — SECURITY INVOKER, поэтому RLS вью `tasks_enriched` ограничивает выдачу проектами, где вызывающий — участник. Но параметр `p_user_id` **не сверяется** с `auth.uid()`: API `get_my_day('<чужой uuid>')` синтаксически допустим (эскалации нет — RLS режет данные, но это нарушение least-privilege). → **S3**.
- **`get_employee_stats`** — старая сигнатура `(p_user_id, p_project_id)` **удалена** в `20260723000002` (`drop function … (uuid,uuid)`). Текущая `(p_project_id, p_period_days)` `user_id` не принимает — концерн «действовать от чужого имени» закрыт. Остаётся, что нет ролевого гейта → **S4**.

### 🟡 S1 (Средне) — `track_status_duration()` вызывается клиентом напрямую

**Где:** `20260722000003_functions_triggers.sql:79`
SECURITY DEFINER, не триггер, без проверки прав, EXECUTE по умолчанию у `PUBLIC`/`authenticated`. Любой аутентифицированный может `select public.track_status_duration('<любая задача>','<любой статус>')` и писать в `task_status_durations` **в обход RLS для произвольной задачи любого проекта** (функция bypass'ит RLS как definer). Это порча тайминговой аналитики (узкие места) кросс-проектно.
**Рекомендация:** `revoke execute on function public.track_status_duration(uuid,uuid) from public, authenticated, anon;` (нужна только триггерам, которые её и так зовут).

### 🟡 S2 (Низко–Средне) — `check_deadlines()` вызывается клиентом напрямую

**Где:** `20260722000003_functions_triggers.sql:267`
SECURITY DEFINER, без проверки прав, EXECUTE у `authenticated`. Любой может вызвать генерацию уведомлений `due_soon`/`overdue` для всех пользователей (дедуп 12ч ограничивает спам, но это чужая рассылка по запросу постороннего).
**Рекомендация:** `revoke execute` у клиентских ролей; вызывать только из `pg_cron`/`service_role`.

### 🔵 S3 (Низко) — `get_my_day(p_user_id)` не сверяет параметр с `auth.uid()`

Эскалации нет (RLS ограничивает данные), но следует форсировать: игнорировать параметр и брать `auth.uid()`, либо `if p_user_id <> auth.uid() then raise exception`.

### 🔵 S4 (Низко–Средне) — `get_employee_stats` без ролевого гейта

Любой участник проекта (в т.ч. employee) может вызвать и получить **поимённые** метрики коллег (скорость, % в срок, возвраты). Данные производны от задач, которые участник и так видит, но агрегат по человеку чувствительнее. Страница `/analytics` доступна только `admin/manager`, но **сам RPC роль не проверяет**.
**Рекомендация:** добавить в начало `if not public.is_project_manager(p_project_id) then raise exception 'Только для менеджеров проекта'; end if;` (функция станет DEFINER с этой проверкой, либо оставить invoker + проверка).

### 🔵 S5 (Низко, гигиена) — аналитические RPC: `search_path = public` без `pg_temp`

6 функций `get_*` — SECURITY INVOKER (не эскалируют привилегии, риск подмены схемы низкий), но для единообразия стоит указать `set search_path = public, pg_temp`.

### ✅ Устранено S1–S5 (миграция `20260723000004_security_fixes_2.sql`)

- **S1** — `revoke execute on track_status_duration(uuid,uuid) from public, anon, authenticated`. Триггеры (SECURITY DEFINER, владелец postgres) продолжают её вызывать — им EXECUTE не нужен.
- **S2** — `revoke execute on check_deadlines() from public, anon, authenticated` + `grant execute … to service_role`. Планировщик/postgres вызывают без ограничений.
- **S3** — `get_my_day` переписан: выборка всегда по `auth.uid()`, параметр `p_user_id` игнорируется (сигнатура сохранена ради совместимости с клиентом). Запросить «чужой день» больше нельзя.
- **S4** — `get_employee_stats` переведён в plpgsql с гейтом `if not is_project_manager(p_project_id) then raise exception`. Теперь поимённые метрики доступны только менеджеру проекта/админу. ⚠️ Побочный эффект: глобальный `manager`, который в проекте лишь участник (не owner/manager), получит отказ — это осознанное ужесточение до проектной авторизации.
- **S5** — всем 6 аналитическим RPC задан `search_path = public, pg_temp` (`get_employee_stats`/`get_my_day` — в теле, остальные через `ALTER FUNCTION`).

**Проверка:** `verify_rls.sql` — ассерты (FAIL, если `authenticated`/`anon` всё ещё могут вызвать `track_status_duration`/`check_deadlines`). Ролевой гейт S4 — ручным сценарием (вызов `get_employee_stats` от имени employee → ожидается exception).

---

## Раздел 4 — Storage (2026-07-23)

| Вопрос | Ответ | Обоснование |
|---|---|---|
| Может ли посторонний скачать файл по прямой ссылке? | **Нет** | Бакет приватный (`public = false`, `…000006` + `verify_rls`). Публичный URL `/object/public/…` для приватного бакета → 400. Скачивание только через `createSignedUrl` (60с) либо авторизованный запрос, а **storage.objects.SELECT** требует `is_project_member((foldername)[1]::uuid)` — не-участник не сгенерирует и signed URL. |
| Проверяется ли MIME при загрузке? | **Да** | Бакет: `allowed_mime_types` (M3) — pdf/docx/xlsx/pptx/png/jpeg/txt/csv/zip. Клиент: `useTaskDetails.uploadAttachment` отклоняет неразрешённый `file.type` до загрузки. Важный побочный эффект: `svg`/`html` не в списке → stored-XSS через вложение невозможен. |
| Проверяется ли размер? | **Да** | Бакет: `file_size_limit = 10 МБ`. Клиент: проверка `file.size > 10МБ` до загрузки. |
| Path traversal в `{project_id}/{task_id}/{filename}`? | **Нет** | `project_id` и `task_id` берутся из загруженной задачи (uuid из БД, не пользовательский ввод). `filename` → `sanitizeFileName` (срезает `/`,`\`, `..`, оставляет безопасные символы). Storage-ключи — не файловая система, `..` не выходит из бакета; плюс insert-полис пиннит первый сегмент к проекту-члену через `::uuid`-каст. |
| Санитизируется ли имя файла? | **Да** | `sanitizeFileName` (`src/lib/utils.js`): basename, безопасные символы, схлопывание `_`, лимит 120 симв.; в ключе ещё и `crypto.randomUUID()`-префикс (нет коллизий/перезаписи). |

### Мелкие замечания (Низко / информационно)

- **S6 (Низко):** второй сегмент пути (`task_id`) в storage-полисах не сверяется с членством (проверяется только первый — `project_id`). Загрузивший может положить файл под `{свойПроект}/{произвольныйTaskId}/…`. В пределах его проекта — не выход за границы доступа. При желании — добавить проверку и второго сегмента.
- **S7 (инфо):** `attachments.file_path` (storage) и `attachments.task_id` (БД) независимы — теоретически можно сослать строку БД на файл под другим task той же проектной ветки. В пределах проекта, не брешь.
- signed URL — 60с, с `download` (Content-Disposition: attachment). Разумно; при необходимости уменьшить окно/добавить аудит скачиваний.

**Вывод по Storage:** после фиксов M3/L5 — состояние хорошее; критичных проблем нет.

---

## Раздел 5 — Фронтенд (2026-07-23)

### Проверено и корректно (позитив)

- **XSS:** `dangerouslySetInnerHTML` / `innerHTML` / `eval` — **не используются** (grep по `src` пуст). Весь пользовательский контент (заголовки/описания задач, комментарии, сообщения уведомлений, имена файлов) рендерится через `{value}` в JSX → React экранирует. `whitespace-pre-wrap` сохраняет переносы, но не отключает экранирование.
- **console.*:** в `src` **нет ни одного** `console.log/debug/info/warn/error` — утечки объектов пользователей в консоль нет (соответствует правилу CLAUDE.md).
- **localStorage/sessionStorage:** приложение **не** пишет туда чувствительные данные. `lastProjectId` хранится в React-контексте (`ProjectNavContext`), а не в storage. Единственное — сессия Supabase (см. F5-info).
- **Открытые редиректы:** нет. `navigate(from)` в `LoginPage` использует `location.state?.from?.pathname` — только внутренний путь SPA (задаётся `ProtectedRoute`), внешний URL туда не попадает; SPA-навигация не уходит на другой origin. `window.open(url, '_blank', 'noopener')` в `TaskDrawer` открывает только signed URL Supabase, с `noopener`.

### Роль проверяется на фронте, но НЕ дублируется в RLS (UI скрывает — БД разрешает)

Ядро (создание задач/проектов, настройки, участники, статусы, правка полей задачи сотрудником — H1) **продублировано в RLS/триггерах** и защищено на сервере. Но несколько действий уровня «участник проекта» UI ограничивает строже, чем БД:

#### 🔵 F1 (Низко) — чек-лист: UI = только менеджер, RLS = любой участник

**UI** (`TaskDrawer.jsx:93–94`): `canEditChecklist = isManager` (добавление/удаление), `canToggleChecklist = isManager || isAssignee`.
**RLS** (`…000004:261,266,272`): `checklist_items` insert/update/delete = `is_project_member`.
→ Любой участник проекта (в т.ч. сотрудник-не-исполнитель) может добавлять/удалять/отмечать пункты чек-листа **через прямой вызов API**, хотя UI это скрывает.

#### 🔵 F2 (Низко) — комментарии: UI = менеджер/исполнитель, RLS = любой участник

**UI** (`:95`): `canComment = isManager || isAssignee`. **RLS** (`:213`): insert = `is_project_member AND user_id = auth.uid()`.
→ Участник, не являющийся исполнителем, может оставить комментарий через API.

#### 🔵 F3 (Низко) — вложения: UI = менеджер/исполнитель, RLS = любой участник

**UI** (`:96`): `canUpload = isManager || isAssignee`. **RLS** (`:240`): insert = `is_project_member`.
→ Любой участник может загрузить вложение через API. (Удаление — `автор OR менеджер`, совпадает с UI.)

#### 🔵 F4 (Низко) — аналитические RPC: UI-роут = admin/manager, RPC = любой участник

Роут `/analytics` закрыт `ProtectedRoute allowedRoles=['admin','manager']`, но RPC `get_completion_trend/ontime_stats/rework_analysis/cycle_time/status_bottlenecks` — SECURITY INVOKER без ролевого гейта → любой участник проекта может получить агрегаты напрямую. (`get_employee_stats` уже закрыт гейтом менеджера — S4.) Данные производны от задач, которые участник и так видит.

**Оценка F1–F4:** все **Низко** — это действия/чтения в пределах проекта, где пользователь уже участник; ни кросс-проектной эскалации, ни доступа к данным сверх RLS. Расхождение между UX-правилами приложения и более мягким RLS. Прямой угрозы нет, но при желании «правила = требование» RLS стоит ужесточить.

**Рекомендация (если нужно enforced на сервере):**
- `checklist_items` insert/delete → `is_project_manager`; update → `is_project_manager OR assignee задачи`.
- `comments`/`attachments` insert → `is_project_manager OR assignee` (через `task_project_id`/join к tasks).
- аналитические RPC → добавить `is_project_manager(p_project_id)`-гейт (как в S4), если аналитика только для менеджеров.

### Информационно

- **F5-info** — сессия Supabase (JWT + refresh-token) хранится в `localStorage` (дефолт `persistSession = true` у `createClient`). Это стандартное поведение библиотеки, не кастомный код. Риск — кража токена при XSS, но XSS-векторов не найдено. Для повышенной гарантии — cookie-based сессии (актуально для SSR; для Vite-SPA усложняет). Оставлено как есть.
- **deleteTask** экспортируется из `useTasks`, но в UI **не вызывается** (нет кнопки удаления задачи). Мёртвый экспорт; на безопасность не влияет (RLS `tasks_delete = is_project_manager`). Можно удалить при чистке.

**Вывод по фронтенду:** XSS/console/redirect/storage — чисто. Единственный класс находок — F1–F4 (UI строже RLS для member-level действий), все Низко. Готов ужесточить RLS под UX-правила отдельной миграцией — по вашей команде.

---

## Раздел 6 — Зависимости (2026-07-23)

`npm audit`: **1 high** — только `xlsx`. Остальные (react 19, react-router 7, @supabase/supabase-js 2, @dnd-kit, recharts 3, date-fns 4, lucide-react) — без предупреждений.

### 🟠/🔵 D1 — `xlsx` (SheetJS) 0.18.5: Prototype Pollution + ReDoS

- **Где:** `package.json` → `"xlsx": "^0.18.5"` (используется в `useReportExport`, `useAnalyticsExport`).
- **CVE:** GHSA-4r6h-8v6p-xvw6 (Prototype Pollution), GHSA-5pgg-2g8v-p4x9 (ReDoS). npm сообщает **«No fix available»** — патч SheetJS раздаёт только через свой CDN (`cdn.sheetjs.com`), в npm-реестре версия заморожена на 0.18.5.
- **Риск (фактический — Низко):** обе уязвимости лежат в пути **чтения/парсинга** книги (обработка вредоносного `.xlsx`). Приложение xlsx **только пишет** (`XLSX.utils.*_to_sheet` + `writeFile`), не парсит пользовательские файлы → эксплойт-поверхность практически нулевая. Рейтинг npm — High, реальный риск — Низко.
- **Как исправить:** (а) заменить на патч с CDN SheetJS (`npm i https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`); либо (б) перейти на `exceljs` / генерировать CSV (для отчётов достаточно); либо (в) принять с задокументированным ограничением «write-only».

### Внешние скрипты
Рантайм-зависимостей, подгружающих внешние скрипты (`<script src>` на сторонние CDN), **нет** — всё бандлится Vite. Загрузки с внешних origin в приложении отсутствуют (подтверждает и раздел 1: `vite.config` без лишнего, CSP не требуется для сторонних).

---

## Раздел 7 — Auth (2026-07-23)

| Аспект | Состояние | Оценка |
|---|---|---|
| Мин. длина пароля | `minimum_password_length = 10` (M2) | ОК |
| Сложность пароля | `password_requirements = ""` — не задана | **A5** (Низко) |
| Время жизни JWT | `jwt_expiry = 3600` (1 ч) | ОК |
| Refresh-токен | ротация вкл., `reuse_interval = 10с` | ОК |
| Rate limit входа | `sign_in_sign_ups = 30`, `token_refresh = 150` (на IP) | ОК, но без captcha → **A6** |
| Утечка в ошибках входа | Supabase возвращает общий `Invalid login credentials`; UI → «Неверный email или пароль» | **ОК** (нет user-enumeration) |
| Деактивация (`is_active`) | **только клиент** | **A1 (Высоко)** |

### 🟠 A1 (Высоко) — деактивация пользователя не enforced на сервере

- **Где:** `profiles.is_active` (колонка); `AuthContext.loadProfile` делает `signOut`, если `is_active = false`. Но `grep is_active` по `supabase/migrations/` находит **только определение колонки** — ни одна RLS-политика и ни один хелпер (`is_project_member`/`current_user_role`/…) `is_active` не проверяют.
- **Риск:** контроль доступа на сервере игнорирует `is_active`. У деактивированного пользователя действующий JWT остаётся валидным до ~1 ч, а refresh-токен продолжает ротироваться (не отзывается) → аккаунт сохраняет доступ к API **в обход клиента** (прямые запросы с токеном / если SPA не перезагружается). Клиентский `signOut` действует лишь на «честную» вкладку. Фактически деактивация server-side **косметическая**.
- **Как исправить (2 слоя):**
  1. **Отзыв сессии при деактивации:** админ-действие вызывает Supabase Admin API `auth.admin.signOut(user_id, 'global')` (или удаление refresh-токенов) через Edge Function на `service_role`.
  2. **Гейт в RLS:** хелпер `is_current_user_active()` (SECURITY DEFINER: `select is_active from profiles where id = auth.uid()`) и включить `and public.is_current_user_active()` в `is_project_member`/`is_project_manager`/`current_user_role` — тогда даже с валидным токеном деактивированный не читает проекты/задачи.

### 🔵 A5 (Низко) — сложность пароля не задана
`password_requirements = ""` — принимается любой пароль ≥10 символов (напр. `aaaaaaaaaa`). **Фикс:** задать требования (в config.toml/дашборде — буквы+цифры или lower+upper+digits+symbols).

### 🔵 A6 (Низко) — нет captcha на входе
Rate-limit по IP есть, но распределённый перебор с многих IP возможен. **Фикс:** включить `[auth.captcha]` (hCaptcha/Turnstile) для входа/сброса пароля.

---

## Раздел 8 — Аудит и соответствие (2026-07-23)

### Полнота логирования — 🟡 A2 (Средне)

**Логируется** в `task_activity` (триггеры `log_task_changes`/`log_task_created`): `created`, `status_changed`, `assigned`, `due_changed`, `priority_changed`.

**НЕ логируется:**
- правки `title`/`description`/`estimate_hours` задачи;
- добавление/удаление **комментариев**, **вложений**, **пунктов чек-листа** (и их отметка);
- проектный уровень: создание/архивирование/удаление проекта, добавление/удаление участника, смена роли, CRUD статусов — **нигде** не фиксируются.

- **Риск:** неполная трассируемость — по журналу нельзя восстановить, кто изменил описание, кто удалил вложение/участника, кто перекроил статусы. Для внутреннего инструмента с ролевой моделью это пробел соответствия.
- **Как исправить:** расширить `log_task_changes` на `title/description/estimate`; добавить триггеры `after insert/delete` на `comments`/`attachments`/`checklist_items` → запись в `task_activity`; для проектных сущностей — отдельная таблица `project_activity` (или те же триггеры) на `projects`/`project_members`/`statuses`.

### Защита журнала от изменения — ✅ (позитив)
`task_activity` не имеет клиентских политик `update`/`delete`, а `insert` снят (M1) → для пользователей приложения журнал **append-only и неизменяем** (писать может только postgres/service_role). Тампер со стороны приложения невозможен.

### Логирование входов — 🔵 A3 (Низко/инфо)
Приложение логов входа не ведёт. **Но** Supabase GoTrue пишет auth-события (вход, refresh, сброс) в `auth.audit_log_entries` — доступно в Dashboard → Logs. **Предложение:** (а) для базовой потребности опираться на встроенный auth-лог Supabase (учесть срок хранения на вашем тарифе); (б) для собственного неизменяемого журнала — Database Webhook / Auth Hook на события GoTrue → запись в таблицу `login_events`; **не** логировать вход инсертом с клиента (подделывается).

### Персональные данные
- **Собирается:** `profiles` — `full_name`, `position`, `department`, `role`, `avatar_url`, `is_active`, `max_concurrent_tasks`; `auth.users` — `email` (Supabase). Свободный текст задач/комментариев может содержать ПДн.
- **Избыточных полей нет** — набор минимален и служебно-обоснован. Телефонов/адресов/документов не собирается.
- Замечание: все поля профиля читаемы любым authenticated (L6), включая `role`/`department`/`max_concurrent_tasks`.

### Удаление данных уволенного — 🟡 A4 (Средне)
- **Где:** FK на `public.profiles(id)`: `tasks.author_id` (**not null**, без `on delete` → RESTRICT), `tasks.assignee_id` (RESTRICT), `comments.user_id`, `attachments.user_id`, `task_activity.user_id`, `checklist_items.done_by` — все по умолчанию **RESTRICT/NO ACTION**; только `project_members.user_id` — `on delete cascade`. `profiles.id → auth.users on delete cascade`.
- **Риск:** **hard-delete профиля/пользователя невозможен**, пока за ним числятся авторство задач/назначения/комментарии (RESTRICT блокирует). При этом `is_active = false` доступ **не отзывает** (A1). Итог: нет рабочего процесса off-boarding’а/«права на забвение» — ни удалить, ни надёжно отключить.
- **Как исправить:** ввести процедуру off-boarding: (1) `is_active = false` + отзыв сессий (A1); (2) переназначение/снятие активных задач; (3) анонимизация ПДн профиля (`full_name`→«Бывший сотрудник», обнуление `avatar_url`/`position`) вместо hard-delete, чтобы сохранить целостность истории; либо продуманный каскад/`set null` там, где это допустимо (напр. `assignee_id on delete set null`, `author_id` — оставить с анонимизацией).

---

## Сводная таблица находок

| ID | Раздел | Критичность | Статус | Суть |
|---|---|---|---|---|
| **A1** | Auth | 🟠 Высоко | ⛔ Открыто | Деактивация не enforced на сервере (`is_active` вне RLS, сессия не отзывается) |
| H1 | RLS tasks | 🟠 Высоко | ✅ Устранено | employee мог менять любые поля задачи |
| **A2** | Аудит | 🟡 Средне | ⛔ Открыто | Неполное логирование (проект/участники/комментарии/вложения/поля) |
| **A4** | Compliance | 🟡 Средне | ⛔ Открыто | Нет off-boarding/erasure; FK RESTRICT; `is_active` не режет доступ |
| **D1** | Зависимости | 🟠→🔵 | ⛔ Открыто | `xlsx` CVE (High), но write-only → факт. Низко |
| M1 | Аудит | 🟡 Средне | ✅ | Открытый insert в `task_activity` |
| M2 | Auth config | 🟡 Средне | ✅ (лок.)/чек-лист прод | signup/пароль/подтверждение |
| M3 | Storage | 🟡 Средне | ✅ | Ограничение MIME/размера |
| S1 | DEFINER | 🟡 Средне | ✅ | `track_status_duration` REVOKE |
| S2 | DEFINER | 🔵 Низко–Ср | ✅ | `check_deadlines` REVOKE |
| S3 | DEFINER | 🔵 Низко | ✅ | `get_my_day` → `auth.uid()` |
| S4 | DEFINER | 🔵 Низко–Ср | ✅ | `get_employee_stats` ролевой гейт |
| S5 | DEFINER | 🔵 Низко | ✅ | analytics `search_path` |
| F1 | Фронт/RLS | 🔵 Низко | ⛔ | Чек-лист: UI строже RLS |
| F2 | Фронт/RLS | 🔵 Низко | ⛔ | Комментарии: UI строже RLS |
| F3 | Фронт/RLS | 🔵 Низко | ⛔ | Вложения: UI строже RLS |
| F4 | Фронт/RLS | 🔵 Низко | ⛔ | Analytics RPC доступны участнику |
| L3 | Инъекции | 🔵 Низко | ✅ | Экранирование поиска |
| L5 | Storage | 🔵 Низко | ✅ | Клиентская валидация загрузки |
| L6 | RLS | 🔵 Низко | ⛔ | `profiles.SELECT = using(true)` |
| A5 | Auth | 🔵 Низко | ⛔ | Сложность пароля не задана |
| A6 | Auth | 🔵 Низко | ⛔ | Нет captcha на входе |
| A3 | Аудит | 🔵 Низко/инфо | ⛔ | Нет собственного лога входов |
| L1/L2/L4/F5/S6/S7 | разное | 🔵/инфо | — | anon-ключ (by design), admin-bypass (by design), dev-redirects (чек-лист), сессия в localStorage (Supabase default), storage 2-й сегмент |

**Критичных (🔴) находок нет.** Открытых значимых: **A1 (Высоко)**, A2/A4 (Средне), D1 (факт. Низко).

## Приоритизированный план устранения

1. **A1 — деактивация (Высоко).** Хелпер `is_current_user_active()` + гейт в `is_project_member`/`is_project_manager`/`current_user_role`; отзыв сессий (`auth.admin.signOut`) через Edge Function при деактивации. *Самый важный открытый пункт — «отключение» сейчас не отключает.*
2. **A2 — полнота аудита (Средне).** Расширить `log_task_changes` (title/description/estimate) + триггеры на comments/attachments/checklist_items; `project_activity` для проектных сущностей.
3. **A4 — off-boarding (Средне).** Процедура: деактивация → отзыв сессий → переназначение задач → анонимизация профиля; при необходимости `set null`/каскады на FK.
4. **D1 — xlsx.** Патч-версия с CDN SheetJS или переход на CSV/exceljs; либо задокументировать write-only.
5. **F1–F4 (Низко).** Ужесточить RLS под UX-правила (чек-лист/комментарии/вложения → manager|assignee; analytics RPC → manager), если это требование.
6. **L6 / A5 / A6 / L4 / A3 (Низко).** `profiles.SELECT` — сузить до «есть общий проект»; сложность пароля; captcha; прод site_url/redirects; лог входов через Supabase Auth Hook. Часть — в дашборд-чек-лист (M2).

> Разделы 6–8 — режим «проверь». Изменений в код не вносил. Готов реализовать план начиная с **A1** отдельной миграцией + Edge Function по вашей команде.
