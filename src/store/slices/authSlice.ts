import type { PayloadAction } from '@reduxjs/toolkit';
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import type { AuthSession } from '@/types/auth';
import type { User } from '@/types/user';
import { supabase } from '@/lib/supabase-client';

const initialState: AuthSession = {
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,
};

export const fetchSession = createAsyncThunk('auth/fetchSession', async () => {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }
  if (!session) {
    return null;
  }

  // Fetch user profile from /api/me (includes category_profile from user_category_profiles table)
  const response = await fetch('/api/me');
  if (!response.ok) {
    throw new Error('Failed to fetch user profile');
  }
  const { data: userProfile } = await response.json();

  return userProfile as User;
});

export const login = createAsyncThunk(
  'auth/login',
  async ({ email, password }: { email: string; password: string }) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw error;
    }

    await supabase.rpc('update_user_last_login', { user_id: data.user.id } as never);

    // Fetch user profile from /api/me (includes category_profile from user_category_profiles table)
    const response = await fetch('/api/me');
    if (!response.ok) {
      throw new Error('Failed to fetch user profile');
    }
    const { data: userProfile } = await response.json();

    return userProfile as User;
  },
);

export const logout = createAsyncThunk('auth/logout', async () => {
  const { error } = await supabase.auth.signOut();

  // Clearing the server cookies must happen even when signOut fails. They are
  // httpOnly, so the browser cannot remove them itself — skipping this call
  // would leave a cookie behind that still looks like a session to the server.
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch (hookError) {
    console.warn('Failed to clear server auth cookies:', hookError);
  }

  if (error) {
    throw error;
  }
});

export const updateUserProfile = createAsyncThunk(
  'auth/updateProfile',
  async ({ userId, updates }: { userId: string; updates: Partial<User> }) => {
    const { data, error } = await supabase
      .from('users')
      .update(updates as never)
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      throw error;
    }
    return data as User;
  },
);

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setUser: (state, action: PayloadAction<User | null>) => {
      state.user = action.payload;
      state.isAuthenticated = !!action.payload;
      state.isLoading = false;
      state.error = null;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
      state.isLoading = false;
    },
    clearError: state => {
      state.error = null;
    },
  },
  extraReducers: builder => {
    builder
      .addCase(fetchSession.pending, state => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchSession.fulfilled, (state, action) => {
        state.user = action.payload;
        state.isAuthenticated = !!action.payload;
        state.isLoading = false;
        state.error = null;
      })
      .addCase(fetchSession.rejected, (state, action) => {
        state.user = null;
        state.isAuthenticated = false;
        state.isLoading = false;
        state.error = action.error.message || 'Session loading error';
      });

    builder
      .addCase(login.pending, state => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(login.fulfilled, (state, action) => {
        state.user = action.payload;
        state.isAuthenticated = true;
        state.isLoading = false;
        state.error = null;
      })
      .addCase(login.rejected, (state, action) => {
        state.user = null;
        state.isAuthenticated = false;
        state.isLoading = false;
        state.error = action.error.message || 'Login error';
      });

    builder
      .addCase(logout.pending, state => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(logout.fulfilled, state => {
        state.user = null;
        state.isAuthenticated = false;
        state.isLoading = false;
        state.error = null;
      })
      .addCase(logout.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || 'Logout error';
      });

    builder
      .addCase(updateUserProfile.pending, state => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(updateUserProfile.fulfilled, (state, action) => {
        state.user = action.payload;
        state.isLoading = false;
        state.error = null;
      })
      .addCase(updateUserProfile.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || 'Profile update error';
      });
  },
});

export const { setUser, setLoading, setError, clearError } = authSlice.actions;

export default authSlice.reducer;

export const selectAuth = (state: { auth: AuthSession }) => state.auth;
export const selectUser = (state: { auth: AuthSession }) => state.auth.user;
export const selectIsAuthenticated = (state: { auth: AuthSession }) => state.auth.isAuthenticated;
export const selectIsLoading = (state: { auth: AuthSession }) => state.auth.isLoading;
export const selectAuthError = (state: { auth: AuthSession }) => state.auth.error;

import { createSelector } from '@reduxjs/toolkit';
import { getUserRoles, hasAnyRole } from '@/lib/roles';

export const selectUserRoles = (state: { auth: AuthSession }) => {
  const user = state.auth.user;
  return user ? getUserRoles(user) : [];
};

export const selectCanQuickAdd = (state: { auth: AuthSession }) => {
  const user = state.auth.user;
  return !!user && hasAnyRole(user, ['admin', 'author', 'reviewer', 'owner']);
};

export const selectCanAccessAdminPanel = (state: { auth: AuthSession }) => {
  const user = state.auth.user;
  return !!user && hasAnyRole(user, ['admin', 'moderator', 'owner']);
};

export const selectIsAdmin = (state: { auth: AuthSession }) => {
  const user = state.auth.user;
  return !!user && hasAnyRole(user, ['admin', 'owner']);
};

export const selectIsAdminOrModerator = (state: { auth: AuthSession }) => {
  const user = state.auth.user;
  return !!user && hasAnyRole(user, ['admin', 'owner', 'moderator']);
};

export const selectCanEditArticles = (state: { auth: AuthSession }) => {
  const user = state.auth.user;
  return !!user && hasAnyRole(user, ['admin', 'author', 'reviewer', 'owner']);
};

export const selectIsAuthorOf =
  (authorId: string | null | undefined) => (state: { auth: AuthSession }) => {
    const user = state.auth.user;
    return Boolean(user && authorId && user.id === authorId);
  };

export const selectNavbarAuth = createSelector(
  [
    selectIsAuthenticated,
    selectIsLoading,
    selectUser,
    selectCanQuickAdd,
    selectCanAccessAdminPanel,
  ],
  (isAuthenticated, isLoading, user, canQuickAdd, canAccessAdminPanel) => ({
    isAuthenticated,
    isLoading,
    user,
    canQuickAdd,
    canAccessAdminPanel,
  }),
);
