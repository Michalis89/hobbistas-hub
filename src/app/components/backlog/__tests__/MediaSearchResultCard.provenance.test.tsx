import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SearchResult } from '../types';

jest.mock('@/components/ui/cover-image', () => ({
  __esModule: true,
  CoverThumbImage: () => <div data-testid="cover" />,
}));

jest.mock('@/components/ui/empty', () => ({
  __esModule: true,
  default: ({ title }: { title: string }) => <div>{title}</div>,
}));

import MediaSearchResultCard from '../MediaSearchResultCard';
import CreateEntryPanel from '../CreateEntryPanel';

function result(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    id: 'google-g1',
    title: 'The Lord of the Rings',
    subtitle: 'J.R.R. Tolkien',
    year: '1954',
    status: 'planned',
    tags: [],
    cover: '',
    source: 'external',
    ...overrides,
  } as SearchResult;
}

describe('MediaSearchResultCard provenance', () => {
  it('shows which APIs an external result came from', () => {
    render(
      <MediaSearchResultCard
        entry={result({
          provenance: { origin: 'external', providers: ['google_books', 'open_library'] },
        })}
        onOpenDialog={jest.fn()}
        category="books"
      />,
    );

    expect(screen.getByTestId('search-result-provenance')).toHaveTextContent(
      'Google Books + Open Library',
    );
  });

  it('marks results from our own database', () => {
    render(
      <MediaSearchResultCard
        entry={result({
          source: 'local',
          mediaId: 884,
          provenance: { origin: 'local', providers: ['nlg'] },
        })}
        onOpenDialog={jest.fn()}
        category="books"
      />,
    );

    expect(screen.getByTestId('search-result-provenance')).toHaveTextContent('DB · ΕΒΕ');
  });

  it('shows nothing when the server sent no provenance (production)', () => {
    render(<MediaSearchResultCard entry={result()} onOpenDialog={jest.fn()} category="books" />);

    expect(screen.queryByTestId('search-result-provenance')).not.toBeInTheDocument();
  });

  it('links a Greek title by its external id instead of an empty slug', () => {
    render(
      <MediaSearchResultCard
        entry={result({
          id: 'nlg-562948',
          title: 'Ο άρχοντας των δακτυλιδιών',
          externalId: 'NLG562948' as unknown as number,
        })}
        onOpenDialog={jest.fn()}
        category="books"
      />,
    );

    expect(screen.getByRole('link', { name: 'Ο άρχοντας των δακτυλιδιών' })).toHaveAttribute(
      'href',
      '/media/books/NLG562948',
    );
  });
});

describe('CreateEntryPanel load more', () => {
  const baseProps = {
    category: 'books' as const,
    searchQuery: 'dune',
    onSearchChange: jest.fn(),
    searchResults: [result()],
    isLoading: false,
    onOpenDialog: jest.fn(),
    onClose: jest.fn(),
    libraryEntries: [],
  };

  it('offers another page when the API has one', async () => {
    const onLoadMore = jest.fn();
    render(<CreateEntryPanel {...baseProps} hasMore onLoadMore={onLoadMore} />);

    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));

    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('disables the button while the next page loads', () => {
    render(<CreateEntryPanel {...baseProps} hasMore isLoadingMore onLoadMore={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'Loading...' })).toBeDisabled();
  });

  it('has no button when there is nothing more', () => {
    render(<CreateEntryPanel {...baseProps} onLoadMore={jest.fn()} />);

    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });
});
