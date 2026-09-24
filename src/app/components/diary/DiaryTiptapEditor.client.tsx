'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Strikethrough,
  Underline as UnderlineIcon,
  Undo2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type DiaryTiptapEditorProps = {
  value: string;
  onChange: (value: string) => void;
  language?: 'en' | 'el' | 'und';
  placeholder?: string;
  showOfflineDraftHint?: boolean;
  onReconnectSync?: () => Promise<number>;
};

/** Average adult reading pace, used only for the informational footer. */
const WORDS_PER_MINUTE = 200;

/**
 * The counters read the HTML the parent already holds rather than the editor
 * instance, so no state has to be mirrored back out of TipTap on every keystroke.
 */
function htmlToPlainText(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li|blockquote|pre|h[1-6])>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

function countWords(text: string) {
  return text === '' ? 0 : text.split(/\s+/).length;
}

function ToolbarButton({
  isActive = false,
  disabled = false,
  onClick,
  label,
  children,
}: {
  isActive?: boolean;
  disabled?: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      size="icon"
      variant={isActive ? 'primary' : 'ghost'}
      iconOnly
      disabled={disabled}
      className={cn(
        'min-h-11 min-w-11 rounded-[var(--radius-md)] border transition-colors',
        isActive
          ? 'border-[hsl(var(--accent-primary)/0.45)] bg-[hsl(var(--accent-muted)/0.92)] text-[hsl(var(--text-primary))]'
          : 'border-transparent bg-transparent text-[hsl(var(--text-secondary))] hover:bg-[hsl(var(--surface-hover)/0.76)] hover:text-[hsl(var(--text-primary))]',
        'disabled:cursor-not-allowed disabled:opacity-35',
      )}
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={isActive}
    >
      {children}
    </Button>
  );
}

function ToolbarGroup({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-0.5 rounded-[var(--radius-md)] border border-[hsl(var(--border-subtle)/0.6)] bg-[hsl(var(--surface-overlay)/0.4)] p-0.5">
      {children}
    </div>
  );
}

export default function DiaryTiptapEditor({
  value,
  onChange,
  language = 'und',
  placeholder = 'Write freely. Your words stay encrypted before they ever leave this browser.',
  showOfflineDraftHint = false,
  onReconnectSync,
}: DiaryTiptapEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: false,
        underline: false,
      }),
      Underline,
      // Links stay inside the encrypted payload, so they never reach the
      // server as plaintext. Opening on click would steal the caret mid-write.
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'text-[hsl(var(--accent-primary))] underline underline-offset-4' },
      }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({
        placeholder,
        emptyEditorClass:
          'before:content-[attr(data-placeholder)] before:text-[hsl(var(--text-tertiary))] before:float-left before:h-0 before:pointer-events-none',
      }),
    ],
    content: value,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        spellcheck: 'true',
        lang: language,
        class:
          'mx-auto min-h-full w-full max-w-[68ch] px-6 py-8 text-[17px] leading-[2] text-[hsl(var(--text-primary))] outline-none sm:px-10 sm:py-10',
      },
    },
    onUpdate: ({ editor: editorInstance }) => {
      onChange(editorInstance.getHTML());
    },
  });

  useEffect(() => {
    if (!editor) {
      return;
    }

    if (editor.getHTML() !== value) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [editor, value]);

  useEffect(() => {
    if (!editor) {
      return;
    }
    editor.view.dom.setAttribute('lang', language);
  }, [editor, language]);

  useEffect(() => {
    if (!onReconnectSync) {
      return;
    }

    const handleOnline = async () => {
      const syncedCount = await onReconnectSync();
      if (syncedCount > 0) {
        toast.success('Draft synced');
      }
    };
    const onOnline = () => {
      void handleOnline();
    };

    window.addEventListener('online', onOnline);

    return () => {
      window.removeEventListener('online', onOnline);
    };
  }, [onReconnectSync]);

  const setLink = useCallback(() => {
    if (!editor) {
      return;
    }

    const previousUrl: string = editor.getAttributes('link').href ?? '';
    const url = window.prompt('URL:', previousUrl);

    if (url === null) {
      return;
    }

    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, [editor]);

  const plainText = useMemo(() => htmlToPlainText(value), [value]);
  const wordCount = useMemo(() => countWords(plainText), [plainText]);
  const readingMinutes = Math.max(1, Math.round(wordCount / WORDS_PER_MINUTE));

  if (!editor) {
    return (
      <div className="h-full min-h-[360px] animate-pulse rounded-[var(--radius-lg)] border border-[hsl(var(--border-subtle)/0.7)] bg-[hsl(var(--surface-overlay)/0.52)]" />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[hsl(var(--border-strong)/0.9)] bg-[hsl(var(--surface-overlay)/0.9)] shadow-[var(--shadow-md)]">
      <BubbleMenu
        editor={editor}
        className="flex items-center gap-0.5 rounded-[var(--radius-md)] border border-[hsl(var(--border-default)/0.9)] bg-[hsl(var(--surface-raised))] p-1 shadow-[var(--shadow-md)]"
      >
        <ToolbarButton
          isActive={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
          label="Bold"
        >
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          isActive={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          label="Italic"
        >
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          isActive={editor.isActive('underline')}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          label="Underline"
        >
          <UnderlineIcon className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          isActive={editor.isActive('heading', { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          label="Heading"
        >
          <Heading2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          isActive={editor.isActive('blockquote')}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          label="Quote"
        >
          <Quote className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton isActive={editor.isActive('link')} onClick={setLink} label="Link">
          <LinkIcon className="h-4 w-4" />
        </ToolbarButton>
      </BubbleMenu>

      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-1.5 border-b border-[hsl(var(--border-default)/0.82)] bg-[hsl(var(--surface-raised)/0.94)] px-3 py-2.5 backdrop-blur">
        <ToolbarGroup>
          <ToolbarButton
            disabled={!editor.can().undo()}
            onClick={() => editor.chain().focus().undo().run()}
            label="Undo"
          >
            <Undo2 className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            disabled={!editor.can().redo()}
            onClick={() => editor.chain().focus().redo().run()}
            label="Redo"
          >
            <Redo2 className="h-4 w-4" />
          </ToolbarButton>
        </ToolbarGroup>

        <ToolbarGroup>
          <ToolbarButton
            isActive={editor.isActive('heading', { level: 1 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            label="Heading 1"
          >
            <Heading1 className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            isActive={editor.isActive('heading', { level: 2 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            label="Heading 2"
          >
            <Heading2 className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            isActive={editor.isActive('heading', { level: 3 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            label="Heading 3"
          >
            <Heading3 className="h-4 w-4" />
          </ToolbarButton>
        </ToolbarGroup>

        <ToolbarGroup>
          <ToolbarButton
            isActive={editor.isActive('bold')}
            onClick={() => editor.chain().focus().toggleBold().run()}
            label="Bold"
          >
            <Bold className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            isActive={editor.isActive('italic')}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            label="Italic"
          >
            <Italic className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            isActive={editor.isActive('underline')}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            label="Underline"
          >
            <UnderlineIcon className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            isActive={editor.isActive('strike')}
            onClick={() => editor.chain().focus().toggleStrike().run()}
            label="Strikethrough"
          >
            <Strikethrough className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            isActive={editor.isActive('code')}
            onClick={() => editor.chain().focus().toggleCode().run()}
            label="Inline code"
          >
            <Code className="h-4 w-4" />
          </ToolbarButton>
        </ToolbarGroup>

        <ToolbarGroup>
          <ToolbarButton
            isActive={editor.isActive('bulletList')}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            label="Bullet list"
          >
            <List className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            isActive={editor.isActive('orderedList')}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            label="Numbered list"
          >
            <ListOrdered className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            isActive={editor.isActive('blockquote')}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            label="Quote"
          >
            <Quote className="h-4 w-4" />
          </ToolbarButton>
        </ToolbarGroup>

        <ToolbarGroup>
          <ToolbarButton
            isActive={editor.isActive({ textAlign: 'left' })}
            onClick={() => editor.chain().focus().setTextAlign('left').run()}
            label="Align left"
          >
            <AlignLeft className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            isActive={editor.isActive({ textAlign: 'center' })}
            onClick={() => editor.chain().focus().setTextAlign('center').run()}
            label="Align center"
          >
            <AlignCenter className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            isActive={editor.isActive({ textAlign: 'right' })}
            onClick={() => editor.chain().focus().setTextAlign('right').run()}
            label="Align right"
          >
            <AlignRight className="h-4 w-4" />
          </ToolbarButton>
        </ToolbarGroup>

        <ToolbarGroup>
          <ToolbarButton isActive={editor.isActive('link')} onClick={setLink} label="Link">
            <LinkIcon className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            label="Divider"
          >
            <Minus className="h-4 w-4" />
          </ToolbarButton>
        </ToolbarGroup>
      </div>

      <EditorContent
        editor={editor}
        className={cn(
          'min-h-0 flex-1 overflow-y-auto',
          '[&_.ProseMirror]:min-h-full',
          '[&_.ProseMirror_p]:my-5',
          '[&_.ProseMirror_h1]:mb-4 [&_.ProseMirror_h1]:mt-9 [&_.ProseMirror_h1]:font-serif [&_.ProseMirror_h1]:text-[28px] [&_.ProseMirror_h1]:font-semibold [&_.ProseMirror_h1]:leading-snug [&_.ProseMirror_h1]:tracking-[-0.02em]',
          '[&_.ProseMirror_h2]:mb-3 [&_.ProseMirror_h2]:mt-8 [&_.ProseMirror_h2]:font-serif [&_.ProseMirror_h2]:text-[23px] [&_.ProseMirror_h2]:font-semibold [&_.ProseMirror_h2]:leading-snug',
          '[&_.ProseMirror_h3]:mb-2 [&_.ProseMirror_h3]:mt-7 [&_.ProseMirror_h3]:font-serif [&_.ProseMirror_h3]:text-[19px] [&_.ProseMirror_h3]:font-semibold [&_.ProseMirror_h3]:leading-snug',
          '[&_.ProseMirror_blockquote]:my-6 [&_.ProseMirror_blockquote]:border-l-[3px] [&_.ProseMirror_blockquote]:border-[hsl(var(--accent-primary)/0.6)] [&_.ProseMirror_blockquote]:pl-5 [&_.ProseMirror_blockquote]:font-serif [&_.ProseMirror_blockquote]:italic [&_.ProseMirror_blockquote]:text-[hsl(var(--text-secondary))]',
          '[&_.ProseMirror_ul]:my-5 [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-7',
          '[&_.ProseMirror_ol]:my-5 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-7',
          '[&_.ProseMirror_li]:my-2 [&_.ProseMirror_li>p]:my-0',
          '[&_.ProseMirror_hr]:my-9 [&_.ProseMirror_hr]:border-t [&_.ProseMirror_hr]:border-[hsl(var(--border-default)/0.8)]',
          '[&_.ProseMirror_code]:rounded [&_.ProseMirror_code]:bg-[hsl(var(--surface-raised))] [&_.ProseMirror_code]:px-1.5 [&_.ProseMirror_code]:py-0.5 [&_.ProseMirror_code]:font-mono [&_.ProseMirror_code]:text-[0.9em] [&_.ProseMirror_code]:text-[hsl(var(--accent-primary))]',
          '[&_.ProseMirror_pre]:my-6 [&_.ProseMirror_pre]:overflow-x-auto [&_.ProseMirror_pre]:rounded-[var(--radius-md)] [&_.ProseMirror_pre]:bg-[hsl(var(--surface-raised))] [&_.ProseMirror_pre]:p-4 [&_.ProseMirror_pre_code]:bg-transparent [&_.ProseMirror_pre_code]:p-0 [&_.ProseMirror_pre_code]:text-[hsl(var(--text-primary))]',
        )}
      />

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-[hsl(var(--border-subtle)/0.7)] bg-[hsl(var(--surface-raised)/0.6)] px-4 py-2 text-xs text-[hsl(var(--text-tertiary))] sm:px-5">
        <span>
          {wordCount} {wordCount === 1 ? 'word' : 'words'} &middot; {plainText.length} characters
          {wordCount > 0 ? ` · ${readingMinutes} min read` : ''}
        </span>
        {showOfflineDraftHint ? (
          <span className="text-[hsl(var(--warning))]">Saved offline - will sync on reconnect</span>
        ) : null}
      </div>
    </div>
  );
}
