'use client';

import { useEditor, EditorContent, ReactNodeViewRenderer } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import type { JSONContent } from '@tiptap/core';
import Placeholder from '@tiptap/extension-placeholder';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Code,
  List,
  ListOrdered,
  Quote,
  Heading1,
  Heading2,
  Heading3,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Link as LinkIcon,
  Undo,
  Redo,
  Minus,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { buildArticleExtensions } from '@/lib/articles/schema';
import { MediaCard } from '@/lib/articles/extensions/mediaCard';
import MediaCardNodeView from './MediaCardNodeView.client';
import { FIGURE_ALIGNMENTS, type FigureAlignment } from '@/lib/articles/extensions/figure';
import type { ArticleCategory } from '@/types/database';
import { SlashCommand, type SlashMenuState } from './slashCommand';
import type { SlashItem } from './slashItems';
import SlashCommandMenu from './SlashCommandMenu.client';
import MediaPickerDialog, { type PickedMediaItem } from './MediaPickerDialog.client';
import { ErrorAlert } from '@/components/ui/alert';
import ImageInsertPopover from './ImageInsertPopover';
import { isEditorImageFile, useEditorImageUpload } from './useEditorImageUpload';

const lowlight = createLowlight(common);

interface RichTextEditorProps {
  readonly label?: string;
  readonly value?: string;
  readonly onChange?: (html: string) => void;
  /**
   * Emits the document as TipTap JSON, which is the storage format. HTML is
   * still emitted alongside it as a render cache for legacy consumers.
   */
  readonly onChangeJson?: (json: JSONContent) => void;
  readonly placeholder?: string;
  /** Category searched when embedding a media card. */
  readonly mediaCategory?: ArticleCategory | '';
}

const ToolbarButton = ({
  onClick,
  isActive = false,
  disabled = false,
  children,
  title,
}: {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  title?: string;
}) => (
  <Button
    type="button"
    onClick={onClick}
    disabled={disabled}
    variant={isActive ? 'primary' : 'secondary'}
    size="icon"
    iconOnly
    title={title}
    className="min-h-11 min-w-11 rounded-[10px] border border-border bg-card text-foreground shadow-none transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40 [&_svg]:size-[18px]"
  >
    {children}
  </Button>
);

const ToolbarDivider = () => <div className="mx-1 h-6 w-px bg-border" />;

export default function RichTextEditor({
  label,
  value,
  onChange,
  onChangeJson,
  placeholder = 'Write the article content here...',
  mediaCategory = '',
}: RichTextEditorProps) {
  // The drop/paste handlers are created with the editor, before the upload
  // hook can exist, so they reach it through a ref.
  const insertFilesRef = useRef<(files: readonly File[]) => void>(() => {});
  // The slash extension is configured when the editor is created, before the
  // React state exists, so it reaches the handlers through refs.
  const slashStateRef = useRef<(state: SlashMenuState | null) => void>(() => {});
  const slashKeyRef = useRef<(event: KeyboardEvent) => boolean>(() => false);

  const editor = useEditor({
    // Node and mark set is defined once in @/lib/articles/schema so the editor,
    // the renderer and the migration script can never drift apart.
    extensions: buildArticleExtensions({
      mediaCard: MediaCard.extend({
        addNodeView: () => ReactNodeViewRenderer(MediaCardNodeView),
      }),
      codeBlock: CodeBlockLowlight.configure({
        lowlight,
        HTMLAttributes: {
          class: 'bg-card rounded-lg p-4 my-4 overflow-x-auto font-mono text-sm',
        },
      }),
      extra: [
        // The extension is built once when the editor is created, and
        // ProseMirror only invokes these callbacks from DOM events, never
        // during a React render.
        // eslint-disable-next-line react-hooks/refs -- see comment above
        SlashCommand.configure({
          onStateChange: state => slashStateRef.current(state),
          onKeyDown: event => slashKeyRef.current(event),
        }),
        Placeholder.configure({
          placeholder,
          emptyEditorClass:
            'before:content-[attr(data-placeholder)] before:text-muted-foreground before:float-left before:h-0 before:pointer-events-none',
        }),
      ],
    }),
    content: value || '',
    editorProps: {
      attributes: {
        class: 'prose prose-invert max-w-none min-h-[300px] p-4 outline-none focus:outline-none',
      },
      handleDrop: (_view, event) => {
        const files = Array.from(event.dataTransfer?.files ?? []).filter(isEditorImageFile);
        if (files.length === 0) {
          return false;
        }
        event.preventDefault();
        insertFilesRef.current(files);
        return true;
      },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []).filter(isEditorImageFile);
        if (files.length === 0) {
          return false;
        }
        event.preventDefault();
        insertFilesRef.current(files);
        return true;
      },
    },
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML());
      onChangeJson?.(editor.getJSON());
    },
  });

  const {
    insertFiles,
    isUploading: isImageUploading,
    error: imageUploadError,
    clearError: clearImageUploadError,
  } = useEditorImageUpload(editor);

  useEffect(() => {
    insertFilesRef.current = insertFiles;
  }, [insertFiles]);

  const [isImagePopoverOpen, setIsImagePopoverOpen] = useState(false);
  const [isMediaPickerOpen, setIsMediaPickerOpen] = useState(false);
  const [slashState, setSlashState] = useState<SlashMenuState | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);
  const slashIndexRef = useRef(0);

  useEffect(() => {
    slashIndexRef.current = slashIndex;
  }, [slashIndex]);

  const runSlashItem = useCallback(
    (item: SlashItem) => {
      if (!editor || !slashState) {
        return;
      }
      item.run({
        editor,
        range: slashState.range,
        openImagePicker: () => setIsImagePopoverOpen(true),
        openMediaPicker: () => setIsMediaPickerOpen(true),
      });
      setSlashState(null);
    },
    [editor, slashState],
  );

  const runSlashItemRef = useRef(runSlashItem);

  useEffect(() => {
    runSlashItemRef.current = runSlashItem;
  }, [runSlashItem]);

  useEffect(() => {
    slashStateRef.current = state => {
      setSlashState(state);
      setSlashIndex(0);
    };
  }, []);

  useEffect(() => {
    slashKeyRef.current = event => {
      const items = slashState?.items ?? [];
      if (items.length === 0) {
        return false;
      }

      if (event.key === 'ArrowDown') {
        setSlashIndex(current => (current + 1) % items.length);
        return true;
      }
      if (event.key === 'ArrowUp') {
        setSlashIndex(current => (current - 1 + items.length) % items.length);
        return true;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        const item = items[slashIndexRef.current];
        if (item) {
          runSlashItemRef.current(item);
        }
        return true;
      }
      if (event.key === 'Escape') {
        setSlashState(null);
        return true;
      }
      return false;
    };
  }, [slashState]);

  const insertMediaCard = useCallback(
    (item: PickedMediaItem) => {
      if (!editor || !mediaCategory) {
        return;
      }
      editor
        .chain()
        .focus()
        .setMediaCard({
          mediaId: item.mediaId,
          category: mediaCategory,
          title: item.title,
          cover: item.cover,
          year: item.year,
        })
        .run();
      setIsMediaPickerOpen(false);
    },
    [editor, mediaCategory],
  );

  const setFigureAlign = useCallback(
    (align: FigureAlignment) => editor?.chain().focus().setFigureAlign(align).run(),
    [editor],
  );

  const insertImageByUrl = useCallback(
    (url: string, alt: string) => {
      editor?.chain().focus().setFigure({ src: url, alt }).run();
    },
    [editor],
  );

  useEffect(() => {
    if (editor && value !== undefined && editor.getHTML() !== value) {
      editor.commands.setContent(value);
    }
  }, [editor, value]);

  const setLink = useCallback(() => {
    if (!editor) {
      return;
    }

    const previousUrl = editor.getAttributes('link').href;
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

  if (!editor) {
    return (
      <div className="space-y-2">
        {label && <label className="text-sm font-medium text-foreground">{label}</label>}
        <div className="min-h-[400px] animate-pulse rounded-xl border border-border bg-card" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {label && <label className="text-sm font-medium text-foreground">{label}</label>}

      <BubbleMenu
        editor={editor}
        className="flex items-center gap-1 rounded-xl border border-border bg-card p-1 shadow-2xl"
      >
        {editor.isActive('figure') ? (
          FIGURE_ALIGNMENTS.map(align => (
            <Button
              key={align}
              type="button"
              size="sm"
              variant={editor.isActive('figure', { align }) ? 'primary' : 'ghost'}
              onClick={() => setFigureAlign(align)}
              className="capitalize"
            >
              {align}
            </Button>
          ))
        ) : (
          <>
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleBold().run()}
              isActive={editor.isActive('bold')}
              title="Bold"
            >
              <Bold size={16} />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleItalic().run()}
              isActive={editor.isActive('italic')}
              title="Italic"
            >
              <Italic size={16} />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              isActive={editor.isActive('heading', { level: 2 })}
              title="Heading"
            >
              <Heading2 size={16} />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
              isActive={editor.isActive('blockquote')}
              title="Quote"
            >
              <Quote size={16} />
            </ToolbarButton>
            <ToolbarButton onClick={setLink} isActive={editor.isActive('link')} title="Link">
              <LinkIcon size={16} />
            </ToolbarButton>
          </>
        )}
      </BubbleMenu>

      <div className="rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center gap-1 border-b border-border bg-card p-2">
          <ToolbarButton
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            title="Undo"
          >
            <Undo size={18} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            title="Redo"
          >
            <Redo size={18} />
          </ToolbarButton>

          <ToolbarDivider />

          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            isActive={editor.isActive('heading', { level: 1 })}
            title="Heading 1"
          >
            <Heading1 size={18} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            isActive={editor.isActive('heading', { level: 2 })}
            title="Heading 2"
          >
            <Heading2 size={18} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            isActive={editor.isActive('heading', { level: 3 })}
            title="Heading 3"
          >
            <Heading3 size={18} />
          </ToolbarButton>

          <ToolbarDivider />

          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            isActive={editor.isActive('bold')}
            title="Bold (Ctrl+B)"
          >
            <Bold size={18} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            isActive={editor.isActive('italic')}
            title="Italic (Ctrl+I)"
          >
            <Italic size={18} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            isActive={editor.isActive('underline')}
            title="Underline (Ctrl+U)"
          >
            <UnderlineIcon size={18} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleStrike().run()}
            isActive={editor.isActive('strike')}
            title="Strikethrough"
          >
            <Strikethrough size={18} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleCode().run()}
            isActive={editor.isActive('code')}
            title="Inline code"
          >
            <Code size={18} />
          </ToolbarButton>

          <ToolbarDivider />

          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            isActive={editor.isActive('bulletList')}
            title="Bullet list"
          >
            <List size={18} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            isActive={editor.isActive('orderedList')}
            title="Numbered list"
          >
            <ListOrdered size={18} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            isActive={editor.isActive('blockquote')}
            title="Quote"
          >
            <Quote size={18} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            isActive={editor.isActive('codeBlock')}
            title="Code block"
          >
            <Code size={18} />
          </ToolbarButton>

          <ToolbarDivider />

          <ToolbarButton
            onClick={() => editor.chain().focus().setTextAlign('left').run()}
            isActive={editor.isActive({ textAlign: 'left' })}
            title="Align left"
          >
            <AlignLeft size={18} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().setTextAlign('center').run()}
            isActive={editor.isActive({ textAlign: 'center' })}
            title="Align center"
          >
            <AlignCenter size={18} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().setTextAlign('right').run()}
            isActive={editor.isActive({ textAlign: 'right' })}
            title="Align right"
          >
            <AlignRight size={18} />
          </ToolbarButton>

          <ToolbarDivider />

          <ToolbarButton onClick={setLink} isActive={editor.isActive('link')} title="Link">
            <LinkIcon size={18} />
          </ToolbarButton>
          <ImageInsertPopover
            open={isImagePopoverOpen}
            onOpenChange={setIsImagePopoverOpen}
            onUploadFiles={insertFiles}
            onInsertUrl={insertImageByUrl}
            isUploading={isImageUploading}
            error={imageUploadError}
            onClearError={clearImageUploadError}
          />
          <ToolbarButton
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            title="Horizontal rule"
          >
            <Minus size={18} />
          </ToolbarButton>
        </div>

        {imageUploadError && (
          <div className="border-b border-border p-3">
            <ErrorAlert message={imageUploadError} title="Image upload failed" />
          </div>
        )}

        <EditorContent
          editor={editor}
          className="min-h-[300px] bg-card text-foreground [&_.ProseMirror]:min-h-[300px] [&_.ProseMirror]:outline-none [&_.ProseMirror_a]:text-primary [&_.ProseMirror_a]:underline [&_.ProseMirror_blockquote]:my-4 [&_.ProseMirror_blockquote]:border-l-4 [&_.ProseMirror_blockquote]:border-primary [&_.ProseMirror_blockquote]:pl-4 [&_.ProseMirror_blockquote]:italic [&_.ProseMirror_blockquote]:text-muted-foreground [&_.ProseMirror_code]:rounded [&_.ProseMirror_code]:bg-[hsl(var(--card))] [&_.ProseMirror_code]:px-0.5 [&_.ProseMirror_code]:py-0.5 [&_.ProseMirror_code]:font-mono [&_.ProseMirror_code]:text-sm [&_.ProseMirror_code]:text-primary [&_.ProseMirror_h1]:mb-4 [&_.ProseMirror_h1]:text-2xl [&_.ProseMirror_h1]:font-bold [&_.ProseMirror_h1]:text-foreground [&_.ProseMirror_h2]:mb-3 [&_.ProseMirror_h2]:text-xl [&_.ProseMirror_h2]:font-semibold [&_.ProseMirror_h2]:text-foreground [&_.ProseMirror_h3]:mb-2 [&_.ProseMirror_h3]:text-lg [&_.ProseMirror_h3]:font-medium [&_.ProseMirror_h3]:text-foreground [&_.ProseMirror_hr]:my-6 [&_.ProseMirror_hr]:border-border [&_.ProseMirror_img]:my-4 [&_.ProseMirror_img]:max-w-full [&_.ProseMirror_img]:rounded-lg [&_.ProseMirror_li]:mb-1 [&_.ProseMirror_ol]:mb-3 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-6 [&_.ProseMirror_p]:mb-3 [&_.ProseMirror_pre]:my-4 [&_.ProseMirror_pre]:overflow-x-auto [&_.ProseMirror_pre]:rounded-lg [&_.ProseMirror_pre]:bg-[hsl(var(--card))] [&_.ProseMirror_pre]:p-4 [&_.ProseMirror_pre_code]:bg-transparent [&_.ProseMirror_pre_code]:p-0 [&_.ProseMirror_ul]:mb-3 [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-6"
        />
      </div>

      {slashState && (
        <SlashCommandMenu
          items={slashState.items}
          selectedIndex={slashIndex}
          clientRect={slashState.clientRect}
          onSelect={runSlashItem}
        />
      )}

      <MediaPickerDialog
        open={isMediaPickerOpen}
        category={mediaCategory}
        onClose={() => setIsMediaPickerOpen(false)}
        onSelect={insertMediaCard}
      />
    </div>
  );
}
