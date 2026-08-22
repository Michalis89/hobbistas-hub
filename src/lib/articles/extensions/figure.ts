import { Node, mergeAttributes } from '@tiptap/core';

export const FIGURE_ALIGNMENTS = ['inline', 'wide', 'full'] as const;

export type FigureAlignment = (typeof FIGURE_ALIGNMENTS)[number];

export type FigureAttributes = {
  src: string;
  alt?: string | null;
  align?: FigureAlignment;
};

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    figure: {
      /** Inserts an image with an editable caption. */
      setFigure: (attributes: FigureAttributes & { caption?: string }) => ReturnType;
      /** Cycles the figure at the current selection through the width options. */
      setFigureAlign: (align: FigureAlignment) => ReturnType;
    };
  }
}

/**
 * An image with a caption.
 *
 * The plain `image` node is kept registered for documents written before this
 * existed; everything inserted from now on is a figure, so authors get alt text
 * and a caption instead of a bare floating image.
 *
 * The node's content is the caption, which is why it is `inline*` rather than
 * an atom: the caption is typed into directly.
 */
export const Figure = Node.create({
  name: 'figure',
  group: 'block',
  content: 'inline*',
  draggable: true,
  isolating: true,

  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: element => element.querySelector('img')?.getAttribute('src') ?? null,
      },
      alt: {
        default: null,
        parseHTML: element => element.querySelector('img')?.getAttribute('alt') ?? null,
      },
      align: {
        default: 'inline' as FigureAlignment,
        parseHTML: element => {
          const value = element.getAttribute('data-align');
          return (FIGURE_ALIGNMENTS as readonly string[]).includes(value ?? '') ? value : 'inline';
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'figure[data-figure]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const { src, alt, align, ...rest } = HTMLAttributes;

    return [
      'figure',
      mergeAttributes(rest, { 'data-figure': '', 'data-align': align ?? 'inline' }),
      ['img', { src, alt: alt ?? '', loading: 'lazy', decoding: 'async' }],
      ['figcaption', {}, 0],
    ];
  },

  addCommands() {
    return {
      setFigure:
        ({ caption, ...attributes }) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: attributes,
            content: caption ? [{ type: 'text', text: caption }] : [],
          }),

      setFigureAlign:
        align =>
        ({ commands }) =>
          commands.updateAttributes(this.name, { align }),
    };
  },
});
