# Прототип — корпоративный таск-менеджер

## Назначение
Внутренний инструмент управления задачами для отдела (аналог Trello).
Руководитель ставит задачи сотрудникам, задаёт сроки, видит все действия.
Сотрудник меняет статус своих задач, комментирует, прикладывает файлы.

## Стек
- React 18 + Vite
- TailwindCSS v4 (через плагин @tailwindcss/vite, НЕ postcss)
- Supabase (Postgres + Auth + Realtime + Storage)
- react-router-dom v6
- @dnd-kit для drag & drop
- date-fns для дат (локаль ru)
- lucide-react для иконок

## Роли
- admin — полный доступ, управление пользователями
- manager — создаёт задачи, назначает исполнителей, ставит сроки, видит дашборд
- employee — видит только свои задачи, меняет ТОЛЬКО статус, комментирует

## Схема БД
Таблицы: profiles, projects, project_members, statuses, tasks,
task_activity, comments, attachments, checklist_items, notifications.

Ключевое:
- tasks.author_id — кто поставил, tasks.assignee_id — исполнитель
- tasks.due_date — срок, tasks.completed_at — фактическое завершение
- статусы настраиваемые: new / in_progress / review / rework / done
- каждое изменение статуса пишется в task_activity (триггер в БД)

## Соглашения по коду
- Функциональные компоненты + хуки, без классов
- Вся работа с Supabase — через хуки в src/hooks/
- Клиент Supabase — единственный экземпляр в src/lib/supabase.js
- Язык интерфейса — русский
- Именование: PascalCase для компонентов, camelCase для хуков
- Никаких console.log в финальном коде
- Обработка ошибок обязательна во всех async-функциях

## Структура папок
src/
  components/
    ui/         — кнопки, инпуты, модалки, бейджи
    board/      — канбан-доска
    task/       — карточка задачи
    layout/     — шапка, сайдбар
  pages/        — страницы-роуты
  hooks/        — useAuth, useTasks, useProjects, useRealtime
  lib/          — supabase.js, utils.js, constants.js
  contexts/     — AuthContext
