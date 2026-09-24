/**
 * @jest-environment node
 */
import { renderToString } from 'react-dom/server';
import BackButton from '@/app/components/shared/BackButton';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));

describe('BackButton on the server', () => {
  // Runs with no `window` at all, which is the point: a `'use client'`
  // component is still server-rendered for the initial HTML, and reading
  // `window` while rendering threw "window is not defined" on every page
  // that mounts this.
  it('renders without touching window', () => {
    expect(typeof window).toBe('undefined');
    expect(() => renderToString(<BackButton />)).not.toThrow();
  });

  it('renders nothing, because a request has no display mode', () => {
    expect(renderToString(<BackButton />)).toBe('');
  });
});
