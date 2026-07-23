# Контракт RPC аналитики

Все функции определены в миграции `supabase/migrations/20260723000002_analytics_rpc.sql`.

> **Сверено с реальным выводом (2026-07-23):** структуры, имена полей и `null`-кейсы
> совпадают. `numeric`-поля приходят как JSON-числа (напр. `0.5`, `50`, `0.02`),
> не строками — типы `number` в таблицах ниже подтверждены.

**Общее:**
- Сигнатура: `(p_project_id uuid, p_period_days int default 30)`.
- `p_period_days = NULL` → «всё время» (без ограничения по датам).
- Режим: `security invoker` — уважают RLS вызывающего (данные видит только участник проекта).
- Возвращают `json`. Числа с плавающей точкой округлены; там, где данных нет, поле может быть `null` (явно указано).

Вызов из клиента:
```js
supabase.rpc('get_completion_trend', { p_project_id: projectId, p_period_days: 30 })
```

---

## 1. `get_completion_trend(p_project_id, p_period_days) → json`

**Назначение:** динамика по дням за период — сколько задач создано и завершено в каждый день, и сколько всего открыто на конец дня. Источник для `ComposedChart` (столбцы created/completed + линия open_total).

**Структура:** массив точек по дням (по возрастанию даты).

```json
[
  { "date": "2026-06-24", "created": 3, "completed": 1, "open_total": 12 },
  { "date": "2026-06-25", "created": 0, "completed": 2, "open_total": 10 },
  { "date": "2026-06-26", "created": 5, "completed": 0, "open_total": 15 }
]
```

| Поле | Тип | Смысл |
|------|-----|-------|
| `date` | string `YYYY-MM-DD` | День |
| `created` | int | Задач создано в этот день |
| `completed` | int | Задач завершено в этот день (`completed_at::date`) |
| `open_total` | int | Открыто на конец дня: создано ≤ дня И (не завершено ИЛИ завершено позже дня) |

Пустой проект → `[]` (если `p_period_days` задан, всё равно вернётся ряд дат с нулями; для «всё время» на пустом проекте — одна точка на сегодня с нулями).

---

## 2. `get_ontime_stats(p_project_id, p_period_days) → json`

**Назначение:** соблюдение сроков среди задач, **завершённых** за период.

```json
{
  "completed": 24,
  "on_time": 18,
  "late": 4,
  "no_due_date": 2,
  "on_time_percent": 81.8
}
```

| Поле | Тип | Смысл |
|------|-----|-------|
| `completed` | int | Всего завершено за период |
| `on_time` | int | Из них с дедлайном, завершено `completed_at <= due_date` |
| `late` | int | С дедлайном, завершено позже срока |
| `no_due_date` | int | Завершено без дедлайна (не участвуют в проценте) |
| `on_time_percent` | number \| null | `on_time / (on_time + late) * 100`; `null`, если задач с дедлайном нет |

---

## 3. `get_rework_analysis(p_project_id, p_period_days) → json`

**Назначение:** распределение задач по числу возвратов (для задач, **созданных** за период). Источник для `PieChart`.

```json
{
  "total": 43,
  "avg_rework": 0.44,
  "reworked_percent": 30.2,
  "distribution": [
    { "bucket": "0",     "label": "0 возвратов",  "count": 30 },
    { "bucket": "1",     "label": "1 возврат",    "count": 8 },
    { "bucket": "2",     "label": "2 возврата",   "count": 3 },
    { "bucket": "3plus", "label": "3+ возвратов", "count": 2 }
  ]
}
```

| Поле | Тип | Смысл |
|------|-----|-------|
| `total` | int | Всего задач в выборке |
| `avg_rework` | number | Средний `rework_count` |
| `reworked_percent` | number | Доля задач с `rework_count > 0`, % |
| `distribution` | array | 4 корзины: `0` / `1` / `2` / `3plus`, с `label` и `count` |

`distribution` всегда содержит ровно 4 элемента (даже с нулевыми `count`).

---

## 4. `get_cycle_time(p_project_id, p_period_days) → json`

**Назначение:** время цикла по задачам, **завершённым** за период. `total_*` — от создания до завершения; `work_*` — от взятия в работу (`started_at`).

```json
{
  "completed": 24,
  "avg_days": 5.31,
  "median_days": 4.10,
  "min_days": 0.45,
  "max_days": 21.03,
  "avg_work_days": 3.82
}
```

| Поле | Тип | Смысл |
|------|-----|-------|
| `completed` | int | Завершено за период |
| `avg_days` | number \| null | Среднее (завершено − создано), дни |
| `median_days` | number \| null | Медиана того же |
| `min_days` / `max_days` | number \| null | Минимум / максимум |
| `avg_work_days` | number \| null | Среднее (завершено − взято в работу) для задач с `started_at` |

При отсутствии завершённых задач числовые поля будут `null`, `completed = 0`.

---

## 5. `get_status_bottlenecks(p_project_id, p_period_days) → json`

**Назначение:** сколько времени задачи проводят в каждом статусе. Считается по **закрытым** интервалам `task_status_durations` (`duration_seconds is not null`), у которых `left_at` попадает в период. Источник для диаграммы узких мест и таблицы.

> Изменение относительно прежней версии: раньше учитывались только интервалы завершённых задач и не было периода/медианы/максимума. Теперь — все закрытые интервалы за период + медиана, максимум, число задач.

**Структура:** массив по статусам (по `position`). Статусы без данных присутствуют с нулями.

```json
[
  {
    "status_id": "9c1e...-...",
    "status_name": "Новая",
    "status_color": "#94a3b8",
    "position": 1,
    "samples": 12,
    "tasks_count": 12,
    "avg_hours": 5.20,
    "avg_days": 0.22,
    "median_days": 0.15,
    "max_days": 1.10
  },
  {
    "status_id": "77af...-...",
    "status_name": "На проверке",
    "status_color": "#f59e0b",
    "position": 3,
    "samples": 40,
    "tasks_count": 35,
    "avg_hours": 76.80,
    "avg_days": 3.20,
    "median_days": 2.80,
    "max_days": 9.10
  }
]
```

| Поле | Тип | Смысл |
|------|-----|-------|
| `status_id` | uuid | Статус |
| `status_name` | string | Название |
| `status_color` | string \| null | Цвет (`statuses.color`) |
| `position` | int | Порядок колонки |
| `samples` | int | Число закрытых интервалов в выборке |
| `tasks_count` | int | Сколько разных задач прошло через статус |
| `avg_hours` | number | Среднее время в статусе, часы |
| `avg_days` | number | То же в днях |
| `median_days` | number | Медиана времени в статусе, дни |
| `max_days` | number | Максимум, дни |

Долю статуса от общего цикла и подпись «Узкое место» фронт считает сам (сумма `avg_days` по статусам).

---

## 6. `get_employee_stats(p_project_id, p_period_days) → json`

**Назначение:** статистика по **каждому** участнику проекта за период. Источник для таблицы сотрудников и радарной диаграммы.

> Изменение относительно прежней версии: раньше `get_employee_stats(p_user_id, p_project_id)` возвращал объект по одному сотруднику. Теперь `get_employee_stats(p_project_id, p_period_days)` возвращает **массив** по всем участникам.

**Структура:** массив, строка на участника (по `full_name`).

```json
[
  {
    "user_id": "1f2a...-...",
    "full_name": "Абухан Турар",
    "avatar_url": null,
    "position": "Тимлид",
    "completed": 12,
    "avg_completion_days": 4.20,
    "on_time_percent": 83.3,
    "avg_rework": 0.50,
    "active_tasks": 6,
    "overdue_tasks": 1,
    "max_concurrent_tasks": 10,
    "load_percent": 60.0,
    "load_state": "normal"
  }
]
```

| Поле | Тип | Смысл |
|------|-----|-------|
| `user_id` | uuid | Участник |
| `full_name` | string | ФИО |
| `avatar_url` | string \| null | Аватар |
| `position` | string \| null | Должность |
| `completed` | int | Завершено за период |
| `avg_completion_days` | number \| null | Среднее время выполнения, дни (`null`, если не завершал) |
| `on_time_percent` | number \| null | % в срок среди завершённых с дедлайном (`null`, если таких нет) |
| `avg_rework` | number | Средний `rework_count` по его задачам за период |
| `active_tasks` | int | Текущих незавершённых (без периода — состояние «сейчас») |
| `overdue_tasks` | int | Из них просроченных сейчас |
| `max_concurrent_tasks` | int | Порог из профиля |
| `load_percent` | number | `active_tasks * 100 / max_concurrent_tasks` |
| `load_state` | string | `free` <50 / `normal` 50–80 / `busy` 80–100 / `overloaded` >100 |

Нормировку значений для радара (0–100 по осям скорость/сроки/качество/объём/загрузка) фронт делает сам относительно выбранных сотрудников.

---

## Замечания по семантике периода

- «Завершено за период» (`get_ontime_stats`, `get_cycle_time`, `employee.completed`) — фильтр по `completed_at`.
- «Создано за период» (`get_rework_analysis`, `employee.avg_rework`) — фильтр по `created_at`.
- «Время в статусах» (`get_status_bottlenecks`) — фильтр по `left_at` закрытого интервала.
- `active_tasks` / `overdue_tasks` / `load_*` — это **текущее** состояние, период на них не влияет.

Если какая-то семантика периода не подходит — правится точечно в соответствующей функции.
