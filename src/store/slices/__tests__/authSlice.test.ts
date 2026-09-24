import { configureStore } from '@reduxjs/toolkit';
import type { UnknownAction } from '@reduxjs/toolkit';
import type { AuthSession } from '@/types/auth';
import type { User } from '@/types/user';
import authReducer, {
  clearError,
  fetchSession,
  login,
  logout,
  selectAuth,
  selectAuthError,
  selectCanAccessAdminPanel,
  selectCanEditArticles,
  selectCanAccessStudio,
  selectIsAdmin,
  selectIsAdminOrModerator,
  selectIsAuthenticated,
  selectIsAuthorOf,
  selectIsLoading,
  selectNavbarAuth,
  selectUser,
  selectUserRoles,
  setError,
  setLoading,
  setUser,
  updateUserProfile,
} from '@/store/slices/authSlice';
import { supabase } from '@/lib/supabase-client';
import { getUserRoles, hasAnyRole } from '@/lib/roles';

jest.mock('@/lib/supabase-client', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
      signInWithPassword: jest.fn(),
      signOut: jest.fn(),
    },
    rpc: jest.fn(),
    from: jest.fn(),
  },
}));

jest.mock('@/lib/roles', () => ({
  getUserRoles: jest.fn(),
  hasAnyRole: jest.fn(),
}));

function makeStore() {
  return configureStore({
    reducer: {
      auth: authReducer,
    },
  });
}

const user = { id: 'u1', username: 'mike' } as unknown as User;

describe('authSlice', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('handles sync reducers setUser/setLoading/setError/clearError', () => {
    let state = authReducer(undefined, { type: '@@INIT' });
    expect(state).toMatchObject({
      user: null,
      isAuthenticated: false,
      isLoading: true,
      error: null,
    });

    state = authReducer(state, setUser(user));
    expect(state.user).toEqual(user);
    expect(state.isAuthenticated).toBe(true);
    expect(state.isLoading).toBe(false);

    state = authReducer(state, setLoading(true));
    expect(state.isLoading).toBe(true);

    state = authReducer(state, setError('boom'));
    expect(state.error).toBe('boom');
    expect(state.isLoading).toBe(false);

    state = authReducer(state, clearError());
    expect(state.error).toBeNull();
  });

  it('fetchSession fulfills with null when no session exists', async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: null },
      error: null,
    });
    const store = makeStore();

    const action = await store.dispatch(fetchSession());

    expect(action.type).toBe(fetchSession.fulfilled.type);
    expect(store.getState().auth).toMatchObject({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('fetchSession rejects on session error', async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: null },
      error: new Error('session fail'),
    });
    const store = makeStore();

    const action = await store.dispatch(fetchSession());

    expect(action.type).toBe(fetchSession.rejected.type);
    expect(store.getState().auth.error).toBe('session fail');
  });

  it('fetchSession rejects when /api/me fails', async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: { user: { id: 'u1' } } },
      error: null,
    });
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false });
    const store = makeStore();

    const action = await store.dispatch(fetchSession());

    expect(action.type).toBe(fetchSession.rejected.type);
    expect(store.getState().auth.error).toBe('Failed to fetch user profile');
  });

  it('fetchSession fulfills with user profile', async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: { user: { id: 'u1' } } },
      error: null,
    });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ data: user }),
    });
    const store = makeStore();

    const action = await store.dispatch(fetchSession());

    expect(action.type).toBe(fetchSession.fulfilled.type);
    expect(store.getState().auth).toMatchObject({
      user,
      isAuthenticated: true,
      isLoading: false,
      error: null,
    });
  });

  it('login fulfills and calls rpc/update_user_last_login', async () => {
    (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValue({
      data: { user: { id: 'u1' } },
      error: null,
    });
    (supabase.rpc as jest.Mock).mockResolvedValue({});
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ data: user }),
    });
    const store = makeStore();

    const action = await store.dispatch(login({ email: 'a@a.com', password: 'pw' }));

    expect(action.type).toBe(login.fulfilled.type);
    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'a@a.com',
      password: 'pw',
    });
    expect(supabase.rpc).toHaveBeenCalledWith('update_user_last_login', { user_id: 'u1' });
    expect(store.getState().auth.isAuthenticated).toBe(true);
  });

  it('login rejects on sign in error and /api/me failure', async () => {
    const store = makeStore();

    (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValueOnce({
      data: null,
      error: new Error('bad credentials'),
    });
    const action1 = await store.dispatch(login({ email: 'a@a.com', password: 'bad' }));
    expect(action1.type).toBe(login.rejected.type);
    expect(store.getState().auth.error).toBe('bad credentials');

    (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValueOnce({
      data: { user: { id: 'u1' } },
      error: null,
    });
    (supabase.rpc as jest.Mock).mockResolvedValue({});
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false });
    const action2 = await store.dispatch(login({ email: 'a@a.com', password: 'pw' }));
    expect(action2.type).toBe(login.rejected.type);
    expect(store.getState().auth.error).toBe('Failed to fetch user profile');
  });

  it('logout fulfills for hook success/failure, and rejects on signOut error', async () => {
    const store = makeStore();

    (supabase.auth.signOut as jest.Mock).mockResolvedValueOnce({
      error: new Error('signout fail'),
    });
    const rejected = await store.dispatch(logout());
    expect(rejected.type).toBe(logout.rejected.type);
    expect(store.getState().auth.error).toBe('signout fail');

    (supabase.auth.signOut as jest.Mock).mockResolvedValueOnce({ error: null });
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true });
    const fulfilled1 = await store.dispatch(logout());
    expect(fulfilled1.type).toBe(logout.fulfilled.type);
    expect(global.fetch).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' });

    (supabase.auth.signOut as jest.Mock).mockResolvedValueOnce({ error: null });
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('hook fail'));
    const fulfilled2 = await store.dispatch(logout());
    expect(fulfilled2.type).toBe(logout.fulfilled.type);
    expect(console.warn).toHaveBeenCalledWith(
      'Failed to clear server auth cookies:',
      expect.any(Error),
    );
    expect(store.getState().auth).toMatchObject({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
  });

  it('updateUserProfile fulfills and rejects', async () => {
    const store = makeStore();
    const single = jest.fn().mockResolvedValue({ data: user, error: null });
    const select = jest.fn().mockReturnValue({ single });
    const eq = jest.fn().mockReturnValue({ select });
    const update = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ update });

    const fulfilled = await store.dispatch(
      updateUserProfile({ userId: 'u1', updates: { bio: 'x' } }),
    );
    expect(fulfilled.type).toBe(updateUserProfile.fulfilled.type);
    expect(supabase.from).toHaveBeenCalledWith('users');
    expect(store.getState().auth.user).toEqual(user);

    const singleErr = jest.fn().mockResolvedValue({ data: null, error: new Error('update fail') });
    const selectErr = jest.fn().mockReturnValue({ single: singleErr });
    const eqErr = jest.fn().mockReturnValue({ select: selectErr });
    const updateErr = jest.fn().mockReturnValue({ eq: eqErr });
    (supabase.from as jest.Mock).mockReturnValue({ update: updateErr });

    const rejected = await store.dispatch(updateUserProfile({ userId: 'u1', updates: {} }));
    expect(rejected.type).toBe(updateUserProfile.rejected.type);
    expect(store.getState().auth.error).toBe('update fail');
  });

  it('uses fallback reducer messages when rejected action has no message', () => {
    let state = authReducer(undefined, { type: '@@INIT' });

    state = authReducer(state, { type: fetchSession.rejected.type, error: {} } as UnknownAction);
    expect(state.error).toBe('Session loading error');
    state = authReducer(state, { type: login.rejected.type, error: {} } as UnknownAction);
    expect(state.error).toBe('Login error');
    state = authReducer(state, { type: logout.rejected.type, error: {} } as UnknownAction);
    expect(state.error).toBe('Logout error');
    state = authReducer(state, { type: updateUserProfile.rejected.type, error: {} } as UnknownAction);
    expect(state.error).toBe('Profile update error');
  });

  it('covers base selectors, role selectors, author selector and navbar selector', () => {
    const state = {
      auth: {
        user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      },
    } as { auth: AuthSession };

    expect(selectAuth(state)).toBe(state.auth);
    expect(selectUser(state)).toBe(user);
    expect(selectIsAuthenticated(state)).toBe(true);
    expect(selectIsLoading(state)).toBe(false);
    expect(selectAuthError(state)).toBeNull();

    (getUserRoles as jest.Mock).mockReturnValue(['owner']);
    expect(selectUserRoles(state)).toEqual(['owner']);
    expect(getUserRoles).toHaveBeenCalledWith(user);
    expect(selectUserRoles({ auth: { ...state.auth, user: null } })).toEqual([]);

    (hasAnyRole as jest.Mock).mockReturnValue(true);
    expect(selectCanAccessStudio(state)).toBe(true);
    expect(selectCanAccessAdminPanel(state)).toBe(true);
    expect(selectIsAdmin(state)).toBe(true);
    expect(selectIsAdminOrModerator(state)).toBe(true);
    expect(selectCanEditArticles(state)).toBe(true);
    expect(hasAnyRole).toHaveBeenCalled();

    (hasAnyRole as jest.Mock).mockReturnValue(false);
    expect(selectCanAccessStudio({ auth: { ...state.auth, user: null } })).toBe(false);

    expect(selectIsAuthorOf('u1')(state)).toBe(true);
    expect(selectIsAuthorOf('u2')(state)).toBe(false);
    expect(selectIsAuthorOf(null)(state)).toBe(false);

    (hasAnyRole as jest.Mock).mockReturnValue(true);
    const navbar = selectNavbarAuth(state);
    expect(navbar).toEqual({
      isAuthenticated: true,
      isLoading: false,
      user,
      canAccessStudio: true,
      canAccessAdminPanel: true,
    });
  });
});
