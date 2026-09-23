import { fireEvent, render, screen } from '@testing-library/react';
import LegalError from '@/app/(legal)/error';

describe('LegalError', () => {
  it('renders the legal error fallback and retries via reset', () => {
    const reset = jest.fn();

    render(<LegalError error={new Error('Legal page failed')} reset={reset} />);

    expect(screen.getByRole('heading', { name: 'Failed to load page' })).toBeInTheDocument();

    const retryButton = screen.getByRole('button', { name: 'Try again' });
    fireEvent.click(retryButton);

    expect(reset).toHaveBeenCalledTimes(1);
  });
});
