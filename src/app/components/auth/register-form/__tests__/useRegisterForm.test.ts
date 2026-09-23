import { act, renderHook } from '@testing-library/react';
import type { FormEvent } from 'react';
import { useRegisterForm } from '../useRegisterForm';

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

describe('useRegisterForm double-submit guard', () => {
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

    const { result } = renderHook(() => useRegisterForm({}));

    act(() => {
      result.current.handleInputChange('email', 'user@example.com');
      result.current.handleInputChange('username', 'user123');
      result.current.handleInputChange('password', 'Password1!');
      result.current.handleInputChange('password_confirm', 'Password1!');
      result.current.handleTermsChange(true);
      result.current.setCaptchaToken('captcha-token');
    });

    const event = { preventDefault: jest.fn() } as unknown as FormEvent<HTMLFormElement>;

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
        json: async () => ({ data: {} }),
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.loading).toBe(false);
  });

  it('still submits after an attempt that failed client-side validation', async () => {
    // Regression: the in-flight guard used to latch on early returns, so one
    // rejected password permanently froze the form until a page reload.
    global.fetch = jest.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({ data: {} }),
        }) as unknown as Response,
    ) as unknown as typeof fetch;

    const { result } = renderHook(() => useRegisterForm({}));
    const event = { preventDefault: jest.fn() } as unknown as FormEvent<HTMLFormElement>;

    act(() => {
      result.current.handleInputChange('email', 'user@example.com');
      result.current.handleInputChange('username', 'user123');
      result.current.handleInputChange('password', 'short');
      result.current.handleInputChange('password_confirm', 'short');
      result.current.handleTermsChange(true);
      result.current.setCaptchaToken('captcha-token');
    });

    await act(async () => {
      await result.current.handleSubmit(event);
    });

    expect(global.fetch).not.toHaveBeenCalled();
    expect(result.current.errors.password).toBeDefined();

    act(() => {
      result.current.handleInputChange('password', 'a-long-enough-password');
      result.current.handleInputChange('password_confirm', 'a-long-enough-password');
    });

    await act(async () => {
      await result.current.handleSubmit(event);
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('calls preventDefault before bailing out on a duplicate submit', async () => {
    // Without this the blocked submit falls through to a native GET form post,
    // which puts the password in the URL.
    global.fetch = jest.fn(
      () => new Promise(() => {}) as Promise<Response>,
    ) as unknown as typeof fetch;

    const { result } = renderHook(() => useRegisterForm({}));

    act(() => {
      result.current.handleInputChange('email', 'user@example.com');
      result.current.handleInputChange('username', 'user123');
      result.current.handleInputChange('password', 'a-long-enough-password');
      result.current.handleInputChange('password_confirm', 'a-long-enough-password');
      result.current.handleTermsChange(true);
      result.current.setCaptchaToken('captcha-token');
    });

    const blockedEvent = { preventDefault: jest.fn() } as unknown as FormEvent<HTMLFormElement>;

    act(() => {
      void result.current.handleSubmit({
        preventDefault: jest.fn(),
      } as unknown as FormEvent<HTMLFormElement>);
      void result.current.handleSubmit(blockedEvent);
    });

    expect(blockedEvent.preventDefault).toHaveBeenCalled();
  });
});
