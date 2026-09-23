import { tocFromDoc, tocFromHtml } from '@/lib/articles/toc';
import { createHeadingIdFactory } from '@/lib/articles/headings';

const heading = (level: number, text: string) => ({
  type: 'heading',
  attrs: { level },
  content: [{ type: 'text', text }],
});

const doc = (...content: unknown[]) => ({ type: 'doc', content });

describe('createHeadingIdFactory', () => {
  it('slugifies and de-duplicates within one document', () => {
    const nextId = createHeadingIdFactory();
    expect(nextId('Spira: A World')).toBe('spira-a-world');
    expect(nextId('Intro')).toBe('intro');
    expect(nextId('Intro')).toBe('intro-1');
  });

  it('falls back to "section" for untitled headings', () => {
    expect(createHeadingIdFactory()('!!!')).toBe('section');
  });

  it('starts fresh per document', () => {
    expect(createHeadingIdFactory()('Intro')).toBe('intro');
    expect(createHeadingIdFactory()('Intro')).toBe('intro');
  });
});

describe('tocFromDoc', () => {
  it('collects h2 and h3 with matching ids', () => {
    expect(tocFromDoc(doc(heading(2, 'First'), heading(3, 'Nested')))).toEqual([
      { id: 'first', text: 'First', level: 2 },
      { id: 'nested', text: 'Nested', level: 3 },
    ]);
  });

  it('ignores h1 and paragraphs', () => {
    expect(
      tocFromDoc(doc(heading(1, 'Title'), { type: 'paragraph', content: [] }, heading(2, 'Real'))),
    ).toEqual([{ id: 'real', text: 'Real', level: 2 }]);
  });

  it('ignores headings nested inside other blocks', () => {
    const nested = doc({ type: 'blockquote', content: [heading(2, 'Quoted')] });
    expect(tocFromDoc(nested)).toEqual([]);
  });

  it('de-duplicates repeated headings the same way the renderer does', () => {
    expect(tocFromDoc(doc(heading(2, 'Intro'), heading(2, 'Intro'))).map(e => e.id)).toEqual([
      'intro',
      'intro-1',
    ]);
  });

  it('handles Greek headings', () => {
    expect(tocFromDoc(doc(heading(2, 'Η σειρά')))[0].id).toBe('i-seira');
  });

  it('returns an empty list for anything unusable', () => {
    expect(tocFromDoc(null)).toEqual([]);
    expect(tocFromDoc('<p>html</p>')).toEqual([]);
    expect(tocFromDoc({ type: 'doc' })).toEqual([]);
  });
});

describe('tocFromHtml', () => {
  it('reads the ids present in the markup', () => {
    const html = '<h2 id="spira">Spira</h2><p>x</p><h3 id="sin">Sin &amp; Calm</h3>';
    expect(tocFromHtml(html)).toEqual([
      { id: 'spira', text: 'Spira', level: 2 },
      { id: 'sin', text: 'Sin & Calm', level: 3 },
    ]);
  });

  it('strips inline markup from the label', () => {
    expect(tocFromHtml('<h2 id="a">A <strong>bold</strong> title</h2>')[0].text).toBe(
      'A bold title',
    );
  });

  it('skips headings without an id', () => {
    expect(tocFromHtml('<h2>No id</h2>')).toEqual([]);
  });

  it('returns an empty list for empty input', () => {
    expect(tocFromHtml('')).toEqual([]);
  });
});
