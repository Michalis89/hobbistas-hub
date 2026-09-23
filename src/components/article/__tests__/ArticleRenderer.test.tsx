import { render, screen } from '@testing-library/react';
import { ArticleRenderer, isArticleDoc } from '@/components/article/ArticleRenderer';
import type { ArticleDocNode } from '@/components/article/ArticleRenderer';

const doc = (...content: ArticleDocNode[]): ArticleDocNode => ({ type: 'doc', content });
const text = (value: string, marks?: ArticleDocNode['marks']): ArticleDocNode => ({
  type: 'text',
  text: value,
  ...(marks ? { marks } : {}),
});
const para = (...content: ArticleDocNode[]): ArticleDocNode => ({ type: 'paragraph', content });

const renderDoc = (node: ArticleDocNode) => render(<ArticleRenderer doc={node} />);

describe('ArticleRenderer', () => {
  it('renders paragraphs and preserves text', () => {
    const { container } = renderDoc(doc(para(text('Hello Spira'))));
    expect(container.querySelectorAll('p')).toHaveLength(1);
    expect(screen.getByText('Hello Spira')).toBeInTheDocument();
  });

  it('gives headings slugified ids for in-page anchors', () => {
    const { container } = renderDoc(
      doc({ type: 'heading', attrs: { level: 2 }, content: [text('Spira: A World')] }),
    );
    expect(container.querySelector('h2')).toHaveAttribute('id', 'spira-a-world');
  });

  it('slugifies Greek headings instead of dropping them', () => {
    const { container } = renderDoc(
      doc({ type: 'heading', attrs: { level: 2 }, content: [text('Η σειρά')] }),
    );
    expect(container.querySelector('h2')).toHaveAttribute('id', 'i-seira');
  });

  it('de-duplicates repeated heading ids', () => {
    const { container } = renderDoc(
      doc(
        { type: 'heading', attrs: { level: 2 }, content: [text('Intro')] },
        { type: 'heading', attrs: { level: 2 }, content: [text('Intro')] },
        { type: 'heading', attrs: { level: 2 }, content: [text('Intro')] },
      ),
    );
    const ids = Array.from(container.querySelectorAll('h2')).map(h => h.id);
    expect(ids).toEqual(['intro', 'intro-1', 'intro-2']);
    expect(new Set(ids).size).toBe(3);
  });

  it('clamps out-of-range heading levels', () => {
    const { container } = renderDoc(
      doc({ type: 'heading', attrs: { level: 6 }, content: [text('Deep')] }),
    );
    expect(container.querySelector('h2')).toBeInTheDocument();
  });

  it('renders every supported mark', () => {
    const { container } = renderDoc(
      doc(
        para(
          text('b', [{ type: 'bold' }]),
          text('i', [{ type: 'italic' }]),
          text('u', [{ type: 'underline' }]),
          text('s', [{ type: 'strike' }]),
          text('c', [{ type: 'code' }]),
        ),
      ),
    );
    expect(container.querySelector('strong')).toHaveTextContent('b');
    expect(container.querySelector('em')).toHaveTextContent('i');
    expect(container.querySelector('u')).toHaveTextContent('u');
    expect(container.querySelector('s')).toHaveTextContent('s');
    expect(container.querySelector('code')).toHaveTextContent('c');
  });

  it('renders lists, blockquotes and code blocks', () => {
    const { container } = renderDoc(
      doc(
        {
          type: 'bulletList',
          content: [{ type: 'listItem', content: [para(text('one'))] }],
        },
        {
          type: 'orderedList',
          attrs: { start: 3 },
          content: [{ type: 'listItem', content: [para(text('three'))] }],
        },
        { type: 'blockquote', content: [para(text('quoted'))] },
        { type: 'codeBlock', attrs: { language: 'ts' }, content: [text('const x = 1;')] },
        { type: 'horizontalRule' },
      ),
    );
    expect(container.querySelector('ul li')).toHaveTextContent('one');
    expect(container.querySelector('ol')).toHaveAttribute('start', '3');
    expect(container.querySelector('blockquote')).toHaveTextContent('quoted');
    expect(container.querySelector('pre code')).toHaveClass('language-ts');
    expect(container.querySelector('hr')).toBeInTheDocument();
  });

  it('applies validated text alignment only', () => {
    const { container } = renderDoc(
      doc(
        { type: 'paragraph', attrs: { textAlign: 'center' }, content: [text('mid')] },
        { type: 'paragraph', attrs: { textAlign: 'javascript:alert(1)' }, content: [text('bad')] },
      ),
    );
    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs[0]).toHaveStyle({ textAlign: 'center' });
    expect(paragraphs[1].getAttribute('style')).toBeNull();
  });

  describe('url safety', () => {
    it('renders https links as external-safe anchors', () => {
      const { container } = renderDoc(
        doc(para(text('link', [{ type: 'link', attrs: { href: 'https://example.com' } }]))),
      );
      const anchor = container.querySelector('a');
      expect(anchor).toHaveAttribute('href', 'https://example.com');
      expect(anchor).toHaveAttribute('rel', 'noopener noreferrer');
      expect(anchor).toHaveAttribute('target', '_blank');
    });

    it.each([
      ['http://example.com'],
      ['javascript:alert(1)'],
      ['//evil.com'],
      ['data:text/html,alert'],
    ])('strips the anchor for %s but keeps the text', href => {
      const { container } = renderDoc(doc(para(text('link', [{ type: 'link', attrs: { href } }]))));
      expect(container.querySelector('a')).toBeNull();
      expect(screen.getByText('link')).toBeInTheDocument();
    });

    it('renders https images', () => {
      const { container } = renderDoc(
        doc({ type: 'image', attrs: { src: 'https://cdn.example.com/a.png', alt: 'Kratos' } }),
      );
      const image = container.querySelector('img');
      expect(image).toHaveAttribute('src', 'https://cdn.example.com/a.png');
      expect(image).toHaveAttribute('alt', 'Kratos');
      expect(image).toHaveAttribute('loading', 'lazy');
    });

    it.each([['http://cdn.example.com/a.png'], ['javascript:alert(1)'], ['//cdn/a.png']])(
      'drops the image for %s',
      src => {
        const { container } = renderDoc(doc({ type: 'image', attrs: { src } }));
        expect(container.querySelector('img')).toBeNull();
      },
    );

    it('gives images an empty alt when none is provided', () => {
      const { container } = renderDoc(
        doc({ type: 'image', attrs: { src: 'https://cdn.example.com/a.png' } }),
      );
      expect(container.querySelector('img')).toHaveAttribute('alt', '');
    });
  });

  describe('figures', () => {
    it('renders an image with its caption and width', () => {
      const { container } = renderDoc(
        doc({
          type: 'figure',
          attrs: { src: 'https://cdn.example.com/a.png', alt: 'Kratos', align: 'wide' },
          content: [text('Kratos looks tired')],
        }),
      );

      expect(container.querySelector('figure')).toHaveAttribute('data-align', 'wide');
      expect(container.querySelector('figure img')).toHaveAttribute('alt', 'Kratos');
      expect(container.querySelector('figcaption')).toHaveTextContent('Kratos looks tired');
    });

    it('omits an empty caption element', () => {
      const { container } = renderDoc(
        doc({ type: 'figure', attrs: { src: 'https://cdn.example.com/a.png' }, content: [] }),
      );
      expect(container.querySelector('figcaption')).toBeNull();
    });

    it('falls back to the inline width for an unknown alignment', () => {
      const { container } = renderDoc(
        doc({
          type: 'figure',
          attrs: { src: 'https://cdn.example.com/a.png', align: 'javascript:alert(1)' },
        }),
      );
      expect(container.querySelector('figure')).toHaveAttribute('data-align', 'inline');
    });

    it('drops a figure whose source is not https', () => {
      const { container } = renderDoc(
        doc({ type: 'figure', attrs: { src: 'http://cdn.example.com/a.png' } }),
      );
      expect(container.querySelector('figure')).toBeNull();
    });
  });

  describe('media cards', () => {
    const card = (attrs: Record<string, unknown>) => doc({ type: 'mediaCard', attrs });

    it('renders an embed linking to the media page', () => {
      const { container } = renderDoc(
        card({ mediaId: 12, category: 'movies', slug: 'the-odyssey', title: 'The Odyssey' }),
      );
      expect(screen.getByText('The Odyssey')).toBeInTheDocument();
      expect(container.querySelector('a[href="/media/movies/the-odyssey"]')).toBeInTheDocument();
    });

    it('falls back to the numeric id when no slug was stored', () => {
      const { container } = renderDoc(
        card({ mediaId: 12, category: 'movies', title: 'The Odyssey' }),
      );
      expect(container.querySelector('a[href="/media/movies/12"]')).toBeInTheDocument();
    });

    it('drops a card whose category is not embeddable', () => {
      const { container } = renderDoc(
        card({ mediaId: 12, category: '../../etc', title: 'Nope', slug: 'x' }),
      );
      expect(container.querySelector('a')).toBeNull();
    });

    it('drops a card missing the fields it needs', () => {
      expect(renderDoc(card({ category: 'games', title: 'No id' })).container.querySelector('a')).toBeNull();
      expect(renderDoc(card({ mediaId: 1, category: 'games' })).container.querySelector('a')).toBeNull();
    });
  });

  it('drops unknown nodes and marks but keeps their text', () => {
    const { container } = renderDoc(
      doc({
        type: 'iframeEmbed',
        attrs: { src: 'https://evil.com' },
        content: [para(text('still here', [{ type: 'somethingElse' }]))],
      }),
    );
    expect(container.querySelector('iframe')).toBeNull();
    expect(screen.getByText('still here')).toBeInTheDocument();
  });

  it('renders an empty document without crashing', () => {
    const { container } = renderDoc(doc());
    expect(container.querySelector('section')).toBeInTheDocument();
  });
});

describe('isArticleDoc', () => {
  it('accepts a TipTap document', () => {
    expect(isArticleDoc({ type: 'doc', content: [] })).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isArticleDoc(null)).toBe(false);
    expect(isArticleDoc(undefined)).toBe(false);
    expect(isArticleDoc('<p>html</p>')).toBe(false);
    expect(isArticleDoc({ type: 'paragraph', content: [] })).toBe(false);
    expect(isArticleDoc({ type: 'doc' })).toBe(false);
  });
});
