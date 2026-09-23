import { Node, mergeAttributes } from '@tiptap/core';

export type MediaCardAttributes = {
  mediaId: number;
  /** anime | manga | movies | tv | books | games */
  category: string;
  /** Optional: /media/{category}/{id} resolves by id when absent. */
  slug?: string | null;
  title: string;
  cover?: string | null;
  year?: string | null;
};

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mediaCard: {
      /** Embeds a media item inside the article body. */
      setMediaCard: (attributes: MediaCardAttributes) => ReturnType;
    };
  }
}

const numberAttr = (value: string | null): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

/**
 * An inline embed of a tracked media item.
 *
 * Title, cover and slug are denormalised into the node so the document renders
 * without an extra query, and so an article keeps reading correctly even if the
 * media row is later renamed or removed.
 *
 * It renders to an anchor rather than a div: the sanitized `content_html`
 * fallback only allows a small tag set, and an anchor degrades into a working
 * link there instead of vanishing.
 */
export const MediaCard = Node.create({
  name: 'mediaCard',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      mediaId: {
        default: null,
        parseHTML: element => numberAttr(element.getAttribute('data-media-id')),
      },
      category: { default: null, parseHTML: element => element.getAttribute('data-category') },
      slug: { default: null, parseHTML: element => element.getAttribute('data-slug') },
      title: { default: null, parseHTML: element => element.getAttribute('data-title') },
      cover: { default: null, parseHTML: element => element.getAttribute('data-cover') },
      year: { default: null, parseHTML: element => element.getAttribute('data-year') },
    };
  },

  parseHTML() {
    return [{ tag: 'a[data-media-card]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const { mediaId, category, slug, title, cover, year } = HTMLAttributes;

    return [
      'a',
      mergeAttributes({
        'data-media-card': '',
        'data-media-id': mediaId != null ? String(mediaId) : null,
        'data-category': category ?? null,
        'data-slug': slug ?? null,
        'data-title': title ?? null,
        'data-cover': cover ?? null,
        'data-year': year ?? null,
        href: category ? `/media/${category}/${slug || mediaId}` : '#',
      }),
      title ?? 'Media item',
    ];
  },

  addCommands() {
    return {
      setMediaCard:
        attributes =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: attributes }),
    };
  },
});
