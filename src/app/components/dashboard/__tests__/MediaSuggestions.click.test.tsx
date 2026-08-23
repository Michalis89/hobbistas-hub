import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MediaSuggestion } from '@/lib/dashboard/category-data';

const trackRecommendationClick = jest.fn();

jest.mock('@/lib/recommendations/instrumentation/client', () => ({
  __esModule: true,
  trackRecommendationClick: (...args: unknown[]) => trackRecommendationClick(...args),
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({
    children,
    href,
    onClick,
  }: {
    children: React.ReactNode;
    href: string;
    onClick?: () => void;
  }) => (
    <a href={href} onClick={onClick}>
      {children}
    </a>
  ),
}));

jest.mock('@/components/ui/cover-image', () => ({
  __esModule: true,
  CoverThumbImage: ({ alt }: { alt: string }) => <div role="img" aria-label={alt} />,
  IMAGE_SIZES: { grid3: '' },
}));

import MediaSuggestions from '../MediaSuggestions';

function suggestion(overrides: Partial<MediaSuggestion> = {}): MediaSuggestion {
  return {
    mediaId: 42,
    category: 'games',
    title: 'Mass Effect Legendary Edition',
    cover: '',
    slug: 'mass-effect',
    reason: 'Authored sci-fi drama.',
    confidence: 0.9,
    source: 'database',
    serveId: 'serve-abc',
    slotIndex: 0,
    ...overrides,
  };
}

describe('MediaSuggestions click instrumentation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reports the serve and media id when a card is clicked', async () => {
    render(<MediaSuggestions suggestions={[suggestion()]} category="games" />);

    await userEvent.click(screen.getByText('Mass Effect Legendary Edition'));

    expect(trackRecommendationClick).toHaveBeenCalledWith({
      serveId: 'serve-abc',
      mediaId: 42,
    });
  });

  it('sends no title', async () => {
    render(<MediaSuggestions suggestions={[suggestion()]} category="games" />);

    await userEvent.click(screen.getByText('Mass Effect Legendary Edition'));

    expect(JSON.stringify(trackRecommendationClick.mock.calls[0][0])).not.toContain('Mass Effect');
  });

  it('still renders and navigates when there is no serve id', async () => {
    render(
      <MediaSuggestions suggestions={[suggestion({ serveId: undefined })]} category="games" />,
    );

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/media/games/42');

    await userEvent.click(link);
    expect(trackRecommendationClick).toHaveBeenCalledWith({ serveId: undefined, mediaId: 42 });
  });

  it('leaves the visible card content unchanged', () => {
    render(<MediaSuggestions suggestions={[suggestion()]} category="games" />);

    expect(screen.getByText('Mass Effect Legendary Edition')).toBeInTheDocument();
    expect(screen.getByText('Authored sci-fi drama.')).toBeInTheDocument();
    expect(screen.getByText('90%')).toBeInTheDocument();
  });
});
