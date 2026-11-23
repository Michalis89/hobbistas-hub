import { render, screen } from '@testing-library/react';
import ArticleSeriesNavigation from '../ArticleSeriesNavigation';

jest.mock('server-only', () => ({}));

describe('ArticleSeriesNavigation', () => {
  const series = {
    id: 1,
    slug: 'the-story',
    title: 'The story',
    description: null,
    cover_image: null,
    translation: { title: 'Η ιστορία', description: null },
    chapters: [
      { id: 1, slug: 'first', title: 'First', topic: 'articles', published_at: null },
      {
        id: 3,
        slug: 'third',
        title: 'Third',
        title_el: 'Τρίτο',
        topic: 'reviews',
        published_at: null,
      },
    ],
  };

  it('numbers visible chapters consecutively and links to localized review URLs', () => {
    render(<ArticleSeriesNavigation series={series} articleId={1} locale="el" />);
    expect(screen.getByText('Κεφάλαιο 1 / 2')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Η ιστορία' })).toHaveAttribute(
      'href',
      '/series/the-story?lang=el',
    );
    expect(screen.getByRole('link', { name: /Τρίτο/ })).toHaveAttribute(
      'href',
      '/review/third?lang=el',
    );
  });

  it('does not render for a chapter outside the visible list', () => {
    const { container } = render(
      <ArticleSeriesNavigation series={series} articleId={2} locale="en" />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
