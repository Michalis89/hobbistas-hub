import { act, renderHook } from '@testing-library/react';
import type { FormEvent } from 'react';
import { useLoginForm } from '../useLoginForm';

const mockPush = jest.fn();
const mockDispatch = jest.fn();
const mockSetSession = jest.fn();
const mockSetAuthPersistence = jest.fn();
const mockFetchSession = jest.fn(() => ({ type: 'fetchSession' }));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => new URLSearchParams(''),
}));

jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
}));

jest.mock('@/store/slices/authSlice', () => ({
  fetchSession: () => mockFetchSession(),
}));

jest.mock('@/lib/supabase-client', () => ({
  setAuthPersistence: (remember: boolean) => mockSetAuthPersistence(remember),
  supabase: {
    auth: {
      setSession: (...args: unknown[]) => mockSetSession(...args),
    },
  },
}));

describe('useLoginForm double-submit guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDispatch.mockResolvedValue({ ok: true });
  });

  it('submits once when handleSubmit is called twice rapidly', async () => {
    let resolveFetch: ((value: unknown) => void) | null = null;
    const fetchPromise = new Promise(resolve => {
      resolveFetch = resolve;
    });
    global.fetch = jest.fn(() => fetchPromise as Promise<Response>) as unknown as typeof fetch;

    const { result } = renderHook(() => useLoginForm());

    act(() => {
      result.current.handleIdentifierChange('user123');
      result.current.handlePasswordChange('Password1!');
      result.current.setCaptchaToken('captcha-token');
    });

    const event = { preventDefault: jest.fn() } as unknown as FormEvent;

    act(() => {
      void result.current.handleSubmit(event);
      void result.current.handleSubmit(event);
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(result.current.loading).toBe(true);

    await act(async () => {
      resolveFetch?.({
        ok: true,
        status: 200,
        json: async () => ({ data: { redirectUrl: '/profile/edit' } }),
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.loading).toBe(false);
  });

  it('still submits after an attempt that failed client-side validation', async () => {
    // Regression: the in-flight guard used to latch on early returns, so one
    // malformed email permanently froze the form until a page reload.
    global.fetch = jest.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({ data: { redirectUrl: '/dashboard' } }),
        }) as unknown as Response,
    ) as unknown as typeof fetch;

    const { result } = renderHook(() => useLoginForm());
    const event = { preventDefault: jest.fn() } as unknown as FormEvent;

    act(() => {
      result.current.handleIdentifierChange('not-an-email@');
      result.current.handlePasswordChange('a-long-enough-password');
      result.current.setCaptchaToken('captcha-token');
    });

    await act(async () => {
      await result.current.handleSubmit(event);
    });

    expect(global.fetch).not.toHaveBeenCalled();
    expect(result.current.errors.identifier).toBeDefined();

    act(() => {
      result.current.handleIdentifierChange('user@example.com');
    });

    await act(async () => {
      await result.current.handleSubmit(event);
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('offers a resend action when the account was never verified', async () => {
    global.fetch = jest.fn(
      async () =>
        ({
          ok: false,
          status: 401,
          json: async () => ({ error: 'Your email is not confirmed yet.' }),
        }) as unknown as Response,
    ) as unknown as typeof fetch;

    const { result } = renderHook(() => useLoginForm());
    const event = { preventDefault: jest.fn() } as unknown as FormEvent;

    act(() => {
      result.current.handleIdentifierChange('user@example.com');
      result.current.handlePasswordChange('a-long-enough-password');
      result.current.setCaptchaToken('captcha-token');
    });

    await act(async () => {
      await result.current.handleSubmit(event);
    });

    expect(result.current.needsVerification).toBe(true);
  });
});
