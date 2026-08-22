import { render, screen } from '@testing-library/react';
import { ArticleBody, parseArticleDoc } from '@/components/article/ArticleBody';

const doc = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'from rich json' }] }],
};

describe('parseArticleDoc', () => {
  it('accepts a document object', () => {
    expect(parseArticleDoc(doc)).toEqual(doc);
  });

  it('accepts a document stored as a JSON string', () => {
    expect(parseArticleDoc(JSON.stringify(doc))).toEqual(doc);
  });

  it('returns null for anything that is not a document', () => {
    expect(parseArticleDoc(null)).toBeNull();
    expect(parseArticleDoc('')).toBeNull();
    expect(parseArticleDoc('   ')).toBeNull();
    expect(parseArticleDoc('not json')).toBeNull();
    expect(parseArticleDoc('<p>html</p>')).toBeNull();
    expect(parseArticleDoc({ type: 'paragraph' })).toBeNull();
    expect(parseArticleDoc(42)).toBeNull();
  });
});

describe('ArticleBody dual read', () => {
  it('prefers rich content when the article has been migrated', () => {
    render(<ArticleBody contentRich={doc} contentHtml="<p>from legacy html</p>" />);
    expect(screen.getByText('from rich json')).toBeInTheDocument();
    expect(screen.queryByText('from legacy html')).not.toBeInTheDocument();
  });

  it('falls back to html for articles that have not been migrated', () => {
    render(<ArticleBody contentRich={null} contentHtml="<p>from legacy html</p>" />);
    expect(screen.getByText('from legacy html')).toBeInTheDocument();
  });

  it('falls back to html when the rich content is unusable', () => {
    // A malformed content_rich must never blank out a published article.
    render(<ArticleBody contentRich={{ garbage: true }} contentHtml="<p>from legacy html</p>" />);
    expect(screen.getByText('from legacy html')).toBeInTheDocument();
  });

  it('renders nothing when there is no content at all', () => {
    const { container } = render(<ArticleBody contentRich={null} contentHtml="" />);
    expect(container).toBeEmptyDOMElement();
  });
});
