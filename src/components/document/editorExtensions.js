import { Node, mergeAttributes } from '@tiptap/core'
import Mention from '@tiptap/extension-mention'
import Suggestion from '@tiptap/suggestion'
import { PluginKey } from '@tiptap/pm/state'
import { getInitials } from '../../lib/utils'

// Отдельные ключи плагинов: в одном редакторе живут два триггера —
// «@» для людей и «#» для задач.
const MENTION_KEY = new PluginKey('docMention')
const TASK_REF_KEY = new PluginKey('docTaskRef')

const MAX_SUGGESTIONS = 8

// ---------------------------------------------------------------------
// Выпадающий список подсказок.
// Своя разметка на DOM: плагин сам позиционирует элемент через mount(),
// а React-обвязка ради восьми строк списка тут ничего не добавляет.
// ---------------------------------------------------------------------
function createSuggestionRenderer(renderRow, emptyText) {
  return () => {
    let root = null
    let unmount = null
    let items = []
    let command = null
    let selected = 0

    const pick = (index) => {
      const item = items[index]
      if (item && command) command(item)
    }

    const paint = () => {
      if (!root) return
      root.replaceChildren()

      if (items.length === 0) {
        const empty = document.createElement('p')
        empty.className = 'doc-suggest__empty'
        empty.textContent = emptyText
        root.append(empty)
        return
      }

      items.forEach((item, index) => {
        const row = document.createElement('button')
        row.type = 'button'
        row.className =
          index === selected ? 'doc-suggest__row is-active' : 'doc-suggest__row'
        // mousedown, а не click: click уводит фокус из редактора
        // и подсказка успевает закрыться раньше выбора
        row.addEventListener('mousedown', (e) => {
          e.preventDefault()
          pick(index)
        })
        renderRow(row, item)
        root.append(row)
      })
    }

    return {
      onStart(props) {
        root = document.createElement('div')
        root.className = 'doc-suggest'
        items = props.items ?? []
        command = props.command
        selected = 0
        paint()
        unmount = props.mount(root)
      },
      onUpdate(props) {
        items = props.items ?? []
        command = props.command
        selected = 0
        paint()
      },
      onKeyDown({ event }) {
        if (items.length === 0) return false
        if (event.key === 'ArrowDown') {
          selected = (selected + 1) % items.length
          paint()
          return true
        }
        if (event.key === 'ArrowUp') {
          selected = (selected - 1 + items.length) % items.length
          paint()
          return true
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
          pick(selected)
          return true
        }
        return false
      },
      onExit() {
        unmount?.()
        unmount = null
        root?.remove()
        root = null
        items = []
        command = null
      },
    }
  }
}

// ---------------------------------------------------------------------
// @имя — упоминание участника проекта.
// getMembers() возвращает актуальный список: состав проекта может
// поменяться, пока документ открыт.
// ---------------------------------------------------------------------
export function buildMentionExtension(getMembers) {
  return Mention.configure({
    HTMLAttributes: { class: 'doc-mention' },
    renderHTML({ node }) {
      return [
        'span',
        {
          class: 'doc-mention',
          'data-type': 'mention',
          'data-id': node.attrs.id ?? '',
          'data-label': node.attrs.label ?? '',
        },
        `@${node.attrs.label ?? ''}`,
      ]
    },
    renderText({ node }) {
      return `@${node.attrs.label ?? ''}`
    },
    suggestion: {
      char: '@',
      pluginKey: MENTION_KEY,
      items: ({ query }) => {
        const term = query.trim().toLowerCase()
        return getMembers()
          .filter((m) => !term || (m.full_name ?? '').toLowerCase().includes(term))
          .slice(0, MAX_SUGGESTIONS)
      },
      command: ({ editor, range, props }) => {
        editor
          .chain()
          .focus()
          .insertContentAt(range, [
            { type: 'mention', attrs: { id: props.id, label: props.full_name } },
            { type: 'text', text: ' ' },
          ])
          .run()
      },
      render: createSuggestionRenderer((row, item) => {
        const avatar = document.createElement('span')
        avatar.className = 'doc-suggest__avatar'
        avatar.textContent = getInitials(item.full_name)

        const name = document.createElement('span')
        name.className = 'doc-suggest__title'
        name.textContent = item.full_name ?? 'Пользователь'

        row.append(avatar, name)

        if (item.position) {
          const position = document.createElement('span')
          position.className = 'doc-suggest__hint'
          position.textContent = item.position
          row.append(position)
        }
      }, 'Никого не нашли'),
    },
  })
}

// ---------------------------------------------------------------------
// #142 — живая ссылка на задачу. Отдельный узел, а не текст: так номер
// переживает переименование задачи, а название подставляется при вставке.
// ---------------------------------------------------------------------
export const TaskRef = Node.create({
  name: 'taskRef',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: false,

  addOptions() {
    return {
      HTMLAttributes: {},
      suggestion: {
        char: '#',
        pluginKey: TASK_REF_KEY,
        items: () => [],
        command: ({ editor, range, props }) => {
          editor
            .chain()
            .focus()
            .insertContentAt(range, [
              {
                type: 'taskRef',
                attrs: {
                  id: props.id,
                  number: props.number,
                  title: props.title,
                },
              },
              { type: 'text', text: ' ' },
            ])
            .run()
        },
      },
    }
  },

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-id'),
        renderHTML: (attrs) => ({ 'data-id': attrs.id ?? '' }),
      },
      number: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-number'),
        renderHTML: (attrs) => ({ 'data-number': attrs.number ?? '' }),
      },
      title: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-title'),
        renderHTML: (attrs) => ({ 'data-title': attrs.title ?? '' }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-type="taskRef"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const number = node.attrs.number ?? '?'
    const title = node.attrs.title ? ` ${node.attrs.title}` : ''
    return [
      'span',
      mergeAttributes(
        { 'data-type': 'taskRef', class: 'doc-taskref' },
        this.options.HTMLAttributes,
        HTMLAttributes
      ),
      `#${number}${title}`,
    ]
  },

  renderText({ node }) {
    return `#${node.attrs.number ?? ''}`
  },

  addProseMirrorPlugins() {
    return [Suggestion({ editor: this.editor, ...this.options.suggestion })]
  },
})

// Настройка узла #142 под конкретный проект: поиск задач уходит на сервер
export function buildTaskRefExtension(searchTasks) {
  return TaskRef.configure({
    suggestion: {
      char: '#',
      pluginKey: TASK_REF_KEY,
      items: async ({ query }) => {
        const found = await searchTasks(query)
        return found.slice(0, MAX_SUGGESTIONS)
      },
      command: ({ editor, range, props }) => {
        editor
          .chain()
          .focus()
          .insertContentAt(range, [
            {
              type: 'taskRef',
              attrs: { id: props.id, number: props.number, title: props.title },
            },
            { type: 'text', text: ' ' },
          ])
          .run()
      },
      render: createSuggestionRenderer((row, item) => {
        const number = document.createElement('span')
        number.className = 'doc-suggest__number'
        number.textContent = `#${item.number ?? '—'}`

        const title = document.createElement('span')
        title.className = 'doc-suggest__title'
        title.textContent = item.title ?? 'Без названия'

        row.append(number, title)

        if (item.completed_at) {
          const done = document.createElement('span')
          done.className = 'doc-suggest__hint'
          done.textContent = 'завершена'
          row.append(done)
        }
      }, 'Задач не нашли'),
    },
  })
}
