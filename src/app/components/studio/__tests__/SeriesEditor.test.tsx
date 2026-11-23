import { render, screen, within } from '@testing-library/react';
import SeriesEditor, { type SeriesEditorArticle } from '../SeriesEditor.client';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), refresh: jest.fn() }),
}));

const article = (id: number, title: string, locked = false): SeriesEditorArticle => ({
  id,
  title,
  status: 'published',
  author_id: locked ? 'someone-else' : 'me',
  assignedElsewhere: false,
  locked,
});

describe('SeriesEditor chapter controls', () => {
  const initial = {
    id: 1,
    title: 'Lore',
    slug: 'lore',
    description: null,
    cover_image: null,
    status: 'draft' as const,
    version: 3,
    translation: null,
    chapterIds: [10, 20, 30],
  };
  const articles = [
    article(10, 'Mine A'),
    article(20, 'Theirs', true),
    article(30, 'Mine B'),
    article(40, 'Mine unused'),
  ];

  it("shows another author's chapter by title and locks its removal", () => {
    render(<SeriesEditor initial={initial} articles={articles} />);
    const chapters = screen.getAllByRole('listitem').slice(0, 3);
    expect(within(chapters[1]).getByText(/Theirs/)).toBeInTheDocument();
    expect(within(chapters[1]).getByText(/by another author/)).toBeInTheDocument();
    expect(within(chapters[1]).getByRole('button', { name: 'Remove chapter 2' })).toBeDisabled();
    expect(within(chapters[0]).getByRole('button', { name: 'Remove chapter 1' })).toBeEnabled();
  });

  it('lets own chapters move past a locked one', () => {
    render(<SeriesEditor initial={initial} articles={articles} />);
    expect(screen.getByRole('button', { name: 'Move chapter 1 down' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Move chapter 3 up' })).toBeEnabled();
  });

  it('never offers locked articles in the picker', () => {
    render(<SeriesEditor initial={{ ...initial, chapterIds: [10] }} articles={articles} />);
    expect(screen.getByText('Mine unused')).toBeInTheDocument();
    expect(screen.queryByText(/^Theirs/)).not.toBeInTheDocument();
  });
});
