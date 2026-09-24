import { fireEvent, render, screen } from '@testing-library/react';
import BackButton from '@/app/components/shared/BackButton';

const back = jest.fn();
const push = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ back, push }),
}));

/** jsdom ships no matchMedia, so the display mode is stubbed per test. */
function setDisplayMode({ standalone }: { standalone: boolean }) {
  const listeners = new Set<() => void>();
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: standalone && query === '(display-mode: standalone)',
      addEventListener: (_: string, fn: () => void) => listeners.add(fn),
      removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
    }),
  });
}

function setHistoryLength(length: number) {
  Object.defineProperty(window.history, 'length', { configurable: true, value: length });
}

describe('BackButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('stays hidden in a normal browser tab', () => {
    setDisplayMode({ standalone: false });

    render(<BackButton />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('appears once the app is running installed', () => {
    setDisplayMode({ standalone: true });

    render(<BackButton label="Back" />);

    expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument();
  });

  it('goes back when there is history to go back to', () => {
    setDisplayMode({ standalone: true });
    setHistoryLength(3);

    render(<BackButton />);
    fireEvent.click(screen.getByRole('button'));

    expect(back).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });

  it('falls back to a known route when the entry is the first in history', () => {
    // Opening an installed app straight onto a deep link leaves nothing to
    // go back to, and `router.back()` would strand the user.
    setDisplayMode({ standalone: true });
    setHistoryLength(1);

    render(<BackButton fallbackHref="/home" />);
    fireEvent.click(screen.getByRole('button'));

    expect(push).toHaveBeenCalledWith('/home');
    expect(back).not.toHaveBeenCalled();
  });
});
