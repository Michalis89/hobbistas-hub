import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MediaEntry, SearchResult } from '../types';

const trackRecommendationClick = jest.fn();

jest.mock('@/lib/recommendations/instrumentation/client', () => ({
  __esModule: true,
  trackRecommendationClick: (...args: unknown[]) => trackRecommendationClick(...args),
}));

jest.mock('../MediaSearchResultCard', () => ({
  __esModule: true,
  default: ({ entry, onOpenDialog }: { entry: SearchResult; onOpenDialog: () => void }) => (
    <button type="button" onClick={onOpenDialog}>
      {entry.title}
    </button>
  ),
}));

jest.mock('@/components/ui/empty', () => ({
  __esModule: true,
  default: ({ title }: { title: string }) => <div>{title}</div>,
}));

import SuggestionsPanel from '../SuggestionsPanel';

function suggestion(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    id: 'personal-games-42',
    title: 'Kingdom Come: Deliverance II',
    subtitle: 'Authored medieval drama.',
    status: 'planned',
    tags: [],
    cover: '',
    source: 'local',
    mediaId: 42,
    serveId: 'serve-xyz',
    slotIndex: 0,
    ...overrides,
  } as SearchResult;
}

const libraryEntries: MediaEntry[] = [];

describe('SuggestionsPanel click instrumentation', () => {
  const onOpenDialog = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reports the serve and media id when a suggestion is opened', async () => {
    render(
      <SuggestionsPanel
        category="games"
        suggestions={[suggestion()]}
        isLoading={false}
        onOpenDialog={onOpenDialog}
        libraryEntries={libraryEntries}
      />,
    );

    await userEvent.click(screen.getByText('Kingdom Come: Deliverance II'));

    expect(trackRecommendationClick).toHaveBeenCalledWith({
      serveId: 'serve-xyz',
      mediaId: 42,
    });
  });

  it('still opens the dialog', async () => {
    render(
      <SuggestionsPanel
        category="games"
        suggestions={[suggestion()]}
        isLoading={false}
        onOpenDialog={onOpenDialog}
        libraryEntries={libraryEntries}
      />,
    );

    await userEvent.click(screen.getByText('Kingdom Come: Deliverance II'));

    expect(onOpenDialog).toHaveBeenCalledTimes(1);
    expect(onOpenDialog.mock.calls[0][0]).toMatchObject({ mediaId: 42, source: 'local' });
  });

  it('opens the dialog for an untracked suggestion', async () => {
    render(
      <SuggestionsPanel
        category="games"
        suggestions={[suggestion({ serveId: undefined })]}
        isLoading={false}
        onOpenDialog={onOpenDialog}
        libraryEntries={libraryEntries}
      />,
    );

    await userEvent.click(screen.getByText('Kingdom Come: Deliverance II'));

    expect(onOpenDialog).toHaveBeenCalledTimes(1);
    expect(trackRecommendationClick).toHaveBeenCalledWith({ serveId: undefined, mediaId: 42 });
  });
});
