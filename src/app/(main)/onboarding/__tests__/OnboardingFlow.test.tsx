import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OnboardingFlow from '@/app/(main)/onboarding/OnboardingFlow';
import { fetchSession } from '@/store/slices/authSlice';
import { DASHBOARD_PATH } from '@/lib/routes/authRoutes';

const pushMock = jest.fn();
const dispatchMock = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

jest.mock('react-redux', () => ({
  useDispatch: () => dispatchMock,
}));

jest.mock('@/store/slices/authSlice', () => ({
  fetchSession: jest.fn(() => ({ type: 'auth/fetchSession' })),
}));

function mockJsonResponse(payload: unknown, ok = true) {
  return {
    ok,
    json: jest.fn(async () => payload),
  } as unknown as Response;
}

function createDeferredResponse() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>(res => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('OnboardingFlow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    dispatchMock.mockResolvedValue({ type: 'auth/fetchSession/fulfilled' });
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  it('renders category choices, toggles selections, and skips to the dashboard', async () => {
    const user = userEvent.setup();
    render(<OnboardingFlow />);

    expect(screen.getByText('What do you want to track?')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Hobby categories' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start exploring/i })).toBeDisabled();

    const games = screen.getByRole('button', { name: /games backlog, platforms, playtime/i });
    await user.click(games);
    expect(games).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /start exploring/i })).toBeEnabled();

    await user.click(games);
    expect(games).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /start exploring/i })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Skip for now' }));
    expect(pushMock).toHaveBeenCalledWith(DASHBOARD_PATH);
  });

  it('merges existing profiles, saves selected categories, refreshes auth, and redirects', async () => {
    const user = userEvent.setup();
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(mockJsonResponse({ data: { profiles: { books: { pages: 12 } } } }))
      .mockResolvedValueOnce(mockJsonResponse({ data: { profiles: {} } }));

    render(<OnboardingFlow />);

    await user.click(screen.getByRole('button', { name: /games backlog, platforms, playtime/i }));
    await user.click(screen.getByRole('button', { name: /anime seasons and watchlists/i }));
    await user.click(screen.getByRole('button', { name: /start exploring/i }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith(DASHBOARD_PATH);
    });

    expect(global.fetch).toHaveBeenNthCalledWith(1, '/api/me/category-profile', {
      cache: 'no-store',
    });
    expect(global.fetch).toHaveBeenNthCalledWith(2, '/api/me/category-profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ books: { pages: 12 }, games: {}, anime: {} }),
    });
    expect(dispatchMock).toHaveBeenCalledWith(fetchSession());
  });

  it('uses empty existing profiles when the preload response fails and shows saving state', async () => {
    const user = userEvent.setup();
    const putResponse = createDeferredResponse();
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(mockJsonResponse({ error: 'ignored' }, false))
      .mockReturnValueOnce(putResponse.promise);

    render(<OnboardingFlow />);

    await user.click(screen.getByRole('button', { name: /books reading list and pages/i }));
    await user.click(screen.getByRole('button', { name: /start exploring/i }));

    expect(screen.getByRole('button', { name: /setting things up/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Skip for now' })).toBeDisabled();

    await act(async () => {
      putResponse.resolve(mockJsonResponse({ ok: true }));
      await putResponse.promise;
    });

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith(DASHBOARD_PATH);
    });
    expect(global.fetch).toHaveBeenNthCalledWith(2, '/api/me/category-profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ books: {} }),
    });
  });

  it('shows API error messages and clears them when category selection changes', async () => {
    const user = userEvent.setup();
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(mockJsonResponse({ profiles: { tv: { episodes: 2 } } }))
      .mockResolvedValueOnce(mockJsonResponse({ error: 'Nope' }, false));

    render(<OnboardingFlow />);

    await user.click(screen.getByRole('button', { name: /tv series episode progress/i }));
    await user.click(screen.getByRole('button', { name: /start exploring/i }));

    expect(await screen.findByText('Nope')).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalledWith('Onboarding save failed:', expect.any(Error));

    await user.click(screen.getByRole('button', { name: /movies watchlist and ratings/i }));
    expect(screen.queryByText('Nope')).not.toBeInTheDocument();

    consoleError.mockRestore();
  });

  it('falls back when the failed save response has invalid JSON', async () => {
    const user = userEvent.setup();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(mockJsonResponse({ data: {} }))
      .mockResolvedValueOnce({
        ok: false,
        json: jest.fn(async () => {
          throw new Error('bad json');
        }),
      });

    render(<OnboardingFlow />);

    await user.click(screen.getByRole('button', { name: /manga chapters and series/i }));
    await user.click(screen.getByRole('button', { name: /start exploring/i }));

    expect(await screen.findByText('Could not save your hobbies.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start exploring/i })).toBeEnabled();

    (console.error as jest.Mock).mockRestore();
  });

  it('falls back for non-Error thrown save failures', async () => {
    const user = userEvent.setup();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    (global.fetch as jest.Mock).mockRejectedValueOnce('offline');

    render(<OnboardingFlow />);

    await user.click(screen.getByRole('button', { name: /games backlog, platforms, playtime/i }));
    await user.click(screen.getByRole('button', { name: /start exploring/i }));

    expect(
      await screen.findByText('Could not save your hobbies. Please try again.'),
    ).toBeInTheDocument();

    (console.error as jest.Mock).mockRestore();
  });

  it('does not save when continue is invoked without a selected category', () => {
    render(<OnboardingFlow />);

    fireEvent.submit(screen.getByRole('form', { name: 'Onboarding hobby selection' }));

    expect(global.fetch).not.toHaveBeenCalled();
  });
});
