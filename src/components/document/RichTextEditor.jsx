import { useEffect, useRef, useMemo } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { TableKit } from '@tiptap/extension-table'
import { TaskList, TaskItem } from '@tiptap/extension-list'
import { Placeholder } from '@tiptap/extensions'
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  Link2,
  Table as TableIcon,
  Undo2,
  Redo2,
} from 'lucide-react'
import { buildMentionExtension, buildTaskRefExtension } from './editorExtensions'
import { cn } from '../../lib/utils'

// Кнопка панели инструментов
function ToolButton({ active, title, onClick, children }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      // mousedown вместо click: иначе редактор теряет выделение
      onMouseDown={(e) => {
        e.preventDefault()
        onClick()
      }}
      className={cn(
        'rounded p-1.5 transition',
        active ? 'bg-accent/20 text-accent' : 'text-muted hover:bg-line hover:text-fg'
      )}
    >
      {children}
    </button>
  )
}

function Toolbar({ editor }) {
  if (!editor) return null

  const heading = (level) => () =>
    editor.chain().focus().toggleHeading({ level }).run()

  const addLink = () => {
    const previous = editor.getAttributes('link').href ?? ''
    const url = window.prompt('Ссылка', previous)
    if (url === null) return
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-line px-2 py-1.5">
      <ToolButton
        title="Полужирный"
        active={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="h-4 w-4" />
      </ToolButton>
      <ToolButton
        title="Курсив"
        active={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="h-4 w-4" />
      </ToolButton>
      <ToolButton
        title="Зачёркнутый"
        active={editor.isActive('strike')}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough className="h-4 w-4" />
      </ToolButton>
      <ToolButton
        title="Код"
        active={editor.isActive('code')}
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        <Code className="h-4 w-4" />
      </ToolButton>

      <span className="mx-1 h-5 w-px bg-line" />

      <ToolButton
        title="Заголовок 1"
        active={editor.isActive('heading', { level: 1 })}
        onClick={heading(1)}
      >
        <Heading1 className="h-4 w-4" />
      </ToolButton>
      <ToolButton
        title="Заголовок 2"
        active={editor.isActive('heading', { level: 2 })}
        onClick={heading(2)}
      >
        <Heading2 className="h-4 w-4" />
      </ToolButton>
      <ToolButton
        title="Заголовок 3"
        active={editor.isActive('heading', { level: 3 })}
        onClick={heading(3)}
      >
        <Heading3 className="h-4 w-4" />
      </ToolButton>

      <span className="mx-1 h-5 w-px bg-line" />

      <ToolButton
        title="Список"
        active={editor.isActive('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className="h-4 w-4" />
      </ToolButton>
      <ToolButton
        title="Нумерованный список"
        active={editor.isActive('orderedList')}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="h-4 w-4" />
      </ToolButton>
      <ToolButton
        title="Чек-лист"
        active={editor.isActive('taskList')}
        onClick={() => editor.chain().focus().toggleTaskList().run()}
      >
        <ListChecks className="h-4 w-4" />
      </ToolButton>
      <ToolButton
        title="Цитата"
        active={editor.isActive('blockquote')}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Quote className="h-4 w-4" />
      </ToolButton>

      <span className="mx-1 h-5 w-px bg-line" />

      <ToolButton title="Ссылка" active={editor.isActive('link')} onClick={addLink}>
        <Link2 className="h-4 w-4" />
      </ToolButton>
      <ToolButton
        title="Таблица 3×3"
        active={editor.isActive('table')}
        onClick={() =>
          editor
            .chain()
            .focus()
            .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
            .run()
        }
      >
        <TableIcon className="h-4 w-4" />
      </ToolButton>

      <span className="mx-1 h-5 w-px bg-line" />

      <ToolButton title="Отменить" onClick={() => editor.chain().focus().undo().run()}>
        <Undo2 className="h-4 w-4" />
      </ToolButton>
      <ToolButton title="Повторить" onClick={() => editor.chain().focus().redo().run()}>
        <Redo2 className="h-4 w-4" />
      </ToolButton>

      <span className="ml-auto hidden pr-1 text-xs text-muted sm:block">
        @ — упоминание, # — задача
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------
// Редактор раздела. Содержимое не контролируется React-ом: TipTap держит
// своё состояние, а извне мы подменяем текст только когда раздел изменил
// кто-то другой (externalRevision) и в него сейчас не печатают.
// ---------------------------------------------------------------------
export default function RichTextEditor({
  content,
  editable = false,
  onChange,
  members = [],
  searchTasks,
  onOpenTask,
  onMentionClick,
  externalRevision = null,
  placeholder = 'Текст раздела…',
}) {
  // Списки живут в ref: пересоздавать редактор из-за нового состава
  // проекта нельзя — это стёрло бы позицию курсора и историю отмен
  const membersRef = useRef(members)
  membersRef.current = members
  const searchRef = useRef(searchTasks)
  searchRef.current = searchTasks
  const changeRef = useRef(onChange)
  changeRef.current = onChange

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        link: { openOnClick: false, HTMLAttributes: { class: 'doc-link' } },
      }),
      TableKit.configure({ table: { resizable: true } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder }),
      buildMentionExtension(() => membersRef.current),
      buildTaskRefExtension((query) => searchRef.current?.(query) ?? []),
    ],
    [placeholder]
  )

  const editor = useEditor({
    editable,
    content: content ?? { type: 'doc', content: [{ type: 'paragraph' }] },
    extensions,
    editorProps: { attributes: { class: 'doc-content' } },
    onUpdate: ({ editor: instance }) => changeRef.current?.(instance.getJSON()),
  })

  // Право на правку меняется на лету: блокировку могли перехватить
  useEffect(() => {
    editor?.setEditable(editable)
  }, [editor, editable])

  // Раздел изменили снаружи — подтягиваем текст, если в него не печатают
  useEffect(() => {
    if (!editor || externalRevision == null) return
    if (editor.isFocused) return
    editor.commands.setContent(content ?? { type: 'doc', content: [] }, {
      emitUpdate: false,
    })
    // content намеренно вне зависимостей: перезапись идёт по revision,
    // иначе каждый ответ сервера сбрасывал бы курсор
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, externalRevision])

  // Клики по живым ссылкам: #142 открывает задачу, @имя — меню действий
  const onClick = (e) => {
    const taskRef = e.target.closest?.('[data-type="taskRef"]')
    if (taskRef) {
      e.preventDefault()
      onOpenTask?.(taskRef.getAttribute('data-id'))
      return
    }
    const mention = e.target.closest?.('[data-type="mention"]')
    if (mention) {
      e.preventDefault()
      const rect = mention.getBoundingClientRect()
      onMentionClick?.({
        id: mention.getAttribute('data-id'),
        label: mention.getAttribute('data-label'),
        x: rect.left,
        y: rect.bottom,
      })
    }
  }

  return (
    <div className={cn('doc-editor', editable && 'doc-editor--editable')}>
      {editable && <Toolbar editor={editor} />}
      {/* Делегирование клика: узлы редактора живут вне React-дерева */}
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div onClick={onClick}>
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
