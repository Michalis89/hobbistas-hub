import { fireEvent, render, screen } from '@testing-library/react';
import MainError from '@/app/(main)/error';

describe('MainError', () => {
  it('renders the main error fallback, logs the error, retries, and links home', () => {
    const reset = jest.fn();
    const error = Object.assign(new Error('Main app failed'), { digest: 'digest-1' });
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    render(<MainError error={error} reset={reset} />);

    expect(consoleError).toHaveBeenCalledWith('App error:', error);
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument();
    expect(
      screen.getByText('An unexpected error occurred. Try again, or go back to the dashboard.'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(reset).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'Go home' })).toHaveAttribute('href', '/home');

    consoleError.mockRestore();
  });
});
