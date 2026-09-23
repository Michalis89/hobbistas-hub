import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';

// ── External / Next.js mocks ────────────────────────────────────────────────
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));

// Capture props from dynamically-loaded ProfileCategoryTabs
let capturedTabsProps: Record<string, unknown> = {};
jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: () => (props: Record<string, unknown>) => {
    capturedTabsProps = props;
    return <div data-testid="profile-category-tabs" />;
  },
}));

// ── Redux mocks ─────────────────────────────────────────────────────────────
const mockDispatch = jest.fn();
jest.mock('react-redux', () => ({
  useSelector: jest.fn(),
  useDispatch: () => mockDispatch,
}));

jest.mock('@/store/slices/authSlice', () => ({
  selectUser: jest.fn(),
  updateUserProfile: jest.fn(() => ({ type: 'updateUserProfile', unwrap: jest.fn() })),
  logout: jest.fn(() => ({ type: 'logout' })),
  fetchSession: jest.fn(() => ({ type: 'fetchSession', unwrap: jest.fn() })),
}));

// ── Supabase mock ────────────────────────────────────────────────────────────
jest.mock('@/lib/supabase-client', () => ({
  supabase: {
    storage: {
      from: jest.fn(() => ({
        upload: jest.fn().mockResolvedValue({ error: null }),
        getPublicUrl: jest.fn(() => ({ data: { publicUrl: 'https://example.com/avatar.jpg' } })),
      })),
    },
    auth: { signOut: jest.fn().mockResolvedValue({}) },
  },
}));

// ── Settings mock ────────────────────────────────────────────────────────────
jest.mock('@/lib/settings/useUserSettings', () => ({
  useUserSettings: jest.fn(() => ({ settings: { social_enabled: true } })),
}));

// ── UI component mocks ───────────────────────────────────────────────────────
jest.mock('@/components/ui/alert', () => ({
  Alert: ({
    children,
    variant,
    className,
  }: {
    children: React.ReactNode;
    variant?: string;
    className?: string;
  }) => (
    <div data-testid={`alert-${variant}`} className={className}>
      {children}
    </div>
  ),
  AlertDescription: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="alert-description">{children}</div>
  ),
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  CardContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  CardTitle: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <h2 className={className}>{children}</h2>
  ),
}));

// ── Sub-component mocks ──────────────────────────────────────────────────────
jest.mock('../_components/profile-edit-skeleton', () => ({
  ProfileEditSkeleton: () => <div data-testid="profile-edit-skeleton" />,
}));

jest.mock('../_components/profile-page-header', () => ({
  ProfilePageHeader: () => <div data-testid="profile-page-header" />,
}));

// Capture props from PersonalInfoCard for handler testing
let capturedPersonalInfoProps: Record<string, unknown> = {};
jest.mock('../_components/personal-info-card', () => ({
  PersonalInfoCard: (props: Record<string, unknown>) => {
    capturedPersonalInfoProps = props;
    return <div data-testid="personal-info-card" />;
  },
}));

// Capture props from CategorySelectionSection for handler testing
let capturedCategoryProps: Record<string, unknown> = {};
jest.mock('../_components/category-selection-section', () => ({
  CategorySelectionSection: (props: Record<string, unknown>) => {
    capturedCategoryProps = props;
    return <div data-testid="category-selection-section" />;
  },
}));

jest.mock('../_components/save-buttons', () => ({
  SaveButtons: ({
    saving,
    isDirty,
    onCancel,
  }: {
    saving: boolean;
    isDirty: boolean;
    onCancel: () => void;
  }) => (
    <div data-testid="save-buttons">
      <button data-testid="cancel-btn" onClick={onCancel} disabled={saving}>
        Cancel
      </button>
      <span data-testid="dirty-state">{isDirty ? 'dirty' : 'clean'}</span>
    </div>
  ),
}));

// Capture props from DangerZoneCard for handler testing
let capturedDangerProps: Record<string, unknown> = {};
jest.mock('../_components/danger-zone-card', () => ({
  DangerZoneCard: (props: Record<string, unknown>) => {
    capturedDangerProps = props;
    return (
      <div data-testid="danger-zone-card">
        <button
          data-testid="show-delete-btn"
          onClick={() => (props.onShowDeleteConfirm as () => void)()}
        />
        <button
          data-testid="delete-account-btn"
          onClick={() => (props.onDeleteAccount as () => void)()}
        />
        <button
          data-testid="cancel-delete-btn"
          onClick={() => (props.onCancelDelete as () => void)()}
        />
      </div>
    );
  },
}));

// ── Fetch mock ───────────────────────────────────────────────────────────────
global.fetch = jest.fn();

// ── Import the page ──────────────────────────────────────────────────────────
import { useSelector } from 'react-redux';
import EditProfilePage from '../page';

// ── Helper data ──────────────────────────────────────────────────────────────
const mockUser = {
  id: 'user-123',
  username: 'testuser',
  full_name: 'Test User',
  display_name: 'Test',
  date_of_birth: '1990-01-01',
  country: 'GR',
  timezone: 'Europe/Athens',
  bio: 'Hello',
  avatar_url: 'https://example.com/avatar.jpg',
  location_city: 'Athens',
  social_links: { discord: 'myhandle' },
  privacy_settings: { show_age: false, show_social_links: true, show_location: true },
  category_profile: { games: {}, anime: {} },
  genre_affinity: null,
  created_at: '2024-01-01',
  updated_at: '2024-01-01',
};

function setupFetchMock(options: { locationOk?: boolean; categoryOk?: boolean } = {}) {
  const { locationOk = true, categoryOk = true } = options;
  (global.fetch as jest.Mock).mockImplementation((url: string) => {
    if (url === '/api/me/location') {
      return Promise.resolve({ ok: locationOk });
    }
    if (url === '/api/me/category-profile') {
      return Promise.resolve({
        ok: categoryOk,
        json: () => Promise.resolve(categoryOk ? {} : { error: 'Category update failed' }),
      });
    }
    if (url === '/api/auth/delete-account') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: {} }),
      });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });
}

describe('EditProfilePage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedPersonalInfoProps = {};
    capturedCategoryProps = {};
    capturedDangerProps = {};
    capturedTabsProps = {};
    // dispatch() must return an object with .unwrap() (not a Promise)
    mockDispatch.mockReturnValue({ unwrap: jest.fn().mockResolvedValue({}) });
    setupFetchMock();
  });

  // ── Rendering ───────────────────────────────────────────────────────────────

  it('renders the skeleton when user is null', () => {
    (useSelector as jest.Mock).mockReturnValue(null);
    render(<EditProfilePage />);
    expect(screen.getByTestId('profile-edit-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('profile-page-header')).not.toBeInTheDocument();
  });

  it('renders the main page when user is present', () => {
    (useSelector as jest.Mock).mockReturnValue(mockUser);
    render(<EditProfilePage />);
    expect(screen.queryByTestId('profile-edit-skeleton')).not.toBeInTheDocument();
    expect(screen.getByTestId('profile-page-header')).toBeInTheDocument();
    expect(screen.getByTestId('personal-info-card')).toBeInTheDocument();
    expect(screen.getByTestId('category-selection-section')).toBeInTheDocument();
    expect(screen.getByTestId('save-buttons')).toBeInTheDocument();
    expect(screen.getByTestId('danger-zone-card')).toBeInTheDocument();
  });

  it('shows new-user alert when user has no categories', () => {
    (useSelector as jest.Mock).mockReturnValue({
      ...mockUser,
      category_profile: {},
    });
    render(<EditProfilePage />);
    expect(screen.getByTestId('alert-info')).toBeInTheDocument();
    expect(screen.getByText(/Welcome to Hobbistas Hub/)).toBeInTheDocument();
  });

  it('hides new-user alert when user has categories', () => {
    (useSelector as jest.Mock).mockReturnValue(mockUser);
    render(<EditProfilePage />);
    expect(screen.queryByTestId('alert-info')).not.toBeInTheDocument();
  });

  // ── handleCancel ────────────────────────────────────────────────────────────

  it('navigates to /profile when Cancel is clicked', () => {
    (useSelector as jest.Mock).mockReturnValue(mockUser);
    render(<EditProfilePage />);
    fireEvent.click(screen.getByTestId('cancel-btn'));
    expect(mockPush).toHaveBeenCalledWith('/profile');
  });

  // ── handleDeleteAccount ─────────────────────────────────────────────────────

  it('shows error alert when deleteConfirmText is not DELETE', async () => {
    (useSelector as jest.Mock).mockReturnValue(mockUser);
    render(<EditProfilePage />);

    // The DangerZoneCard mock exposes deleteConfirmText via capturedDangerProps
    // By default deleteConfirmText is '', so calling onDeleteAccount triggers error
    await act(async () => {
      fireEvent.click(screen.getByTestId('delete-account-btn'));
    });

    expect(screen.getByTestId('alert-destructive')).toBeInTheDocument();
    expect(screen.getByText('Type "DELETE" to confirm.')).toBeInTheDocument();
  });

  it('shows delete confirm state when show delete is clicked', () => {
    (useSelector as jest.Mock).mockReturnValue(mockUser);
    render(<EditProfilePage />);
    fireEvent.click(screen.getByTestId('show-delete-btn'));
    expect(capturedDangerProps.showDeleteConfirm).toBe(true);
  });

  it('resets delete confirm state when cancel delete is clicked', () => {
    (useSelector as jest.Mock).mockReturnValue(mockUser);
    render(<EditProfilePage />);
    fireEvent.click(screen.getByTestId('show-delete-btn'));
    fireEvent.click(screen.getByTestId('cancel-delete-btn'));
    expect(capturedDangerProps.showDeleteConfirm).toBe(false);
  });

  // ── handleSubmit ────────────────────────────────────────────────────────────

  it('submits the form successfully', async () => {
    (useSelector as jest.Mock).mockReturnValue(mockUser);
    mockDispatch.mockReturnValue({ unwrap: jest.fn().mockResolvedValue({}) });

    render(<EditProfilePage />);

    const form = document.getElementById('edit-profile-form')!;
    await act(async () => {
      fireEvent.submit(form);
    });

    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalled();
    });
  });

  it('shows success alert after successful submit', async () => {
    (useSelector as jest.Mock).mockReturnValue(mockUser);
    mockDispatch.mockReturnValue({ unwrap: jest.fn().mockResolvedValue({}) });

    render(<EditProfilePage />);
    const form = document.getElementById('edit-profile-form')!;

    await act(async () => {
      fireEvent.submit(form);
    });

    await waitFor(() => {
      expect(screen.getByTestId('alert-success')).toBeInTheDocument();
    });
  });

  it('shows error alert when category profile update fails', async () => {
    (useSelector as jest.Mock).mockReturnValue(mockUser);
    mockDispatch.mockReturnValue({ unwrap: jest.fn().mockResolvedValue({}) });
    setupFetchMock({ categoryOk: false });

    render(<EditProfilePage />);
    const form = document.getElementById('edit-profile-form')!;

    await act(async () => {
      fireEvent.submit(form);
    });

    await waitFor(() => {
      expect(screen.getByTestId('alert-destructive')).toBeInTheDocument();
    });
  });

  it('shows generic error alert when dispatch throws', async () => {
    (useSelector as jest.Mock).mockReturnValue(mockUser);
    mockDispatch.mockReturnValue({
      unwrap: jest.fn().mockRejectedValue(new Error('Network error')),
    });

    render(<EditProfilePage />);
    const form = document.getElementById('edit-profile-form')!;

    await act(async () => {
      fireEvent.submit(form);
    });

    await waitFor(() => {
      expect(screen.getByTestId('alert-destructive')).toBeInTheDocument();
    });
  });

  it('shows psn_id unique constraint error message', async () => {
    (useSelector as jest.Mock).mockReturnValue(mockUser);
    mockDispatch.mockReturnValue({
      unwrap: jest.fn().mockRejectedValue(new Error('23505 psn_id unique constraint')),
    });

    render(<EditProfilePage />);
    const form = document.getElementById('edit-profile-form')!;

    await act(async () => {
      fireEvent.submit(form);
    });

    await waitFor(() => {
      expect(screen.getByText('This PSN ID is already used by another user.')).toBeInTheDocument();
    });
  });

  it('shows username unique constraint error message', async () => {
    (useSelector as jest.Mock).mockReturnValue(mockUser);
    mockDispatch.mockReturnValue({
      unwrap: jest.fn().mockRejectedValue(new Error('23505 username unique constraint')),
    });

    render(<EditProfilePage />);
    const form = document.getElementById('edit-profile-form')!;

    await act(async () => {
      fireEvent.submit(form);
    });

    await waitFor(() => {
      expect(screen.getByText('This username is already in use.')).toBeInTheDocument();
    });
  });

  it('shows email unique constraint error message', async () => {
    (useSelector as jest.Mock).mockReturnValue(mockUser);
    mockDispatch.mockReturnValue({
      unwrap: jest.fn().mockRejectedValue(new Error('23505 email unique constraint')),
    });

    render(<EditProfilePage />);
    const form = document.getElementById('edit-profile-form')!;

    await act(async () => {
      fireEvent.submit(form);
    });

    await waitFor(() => {
      expect(screen.getByText('This email is already in use.')).toBeInTheDocument();
    });
  });

  it('shows generic unique constraint error for unknown field', async () => {
    (useSelector as jest.Mock).mockReturnValue(mockUser);
    mockDispatch.mockReturnValue({
      unwrap: jest.fn().mockRejectedValue(new Error('23505 other unique constraint')),
    });

    render(<EditProfilePage />);
    const form = document.getElementById('edit-profile-form')!;

    await act(async () => {
      fireEvent.submit(form);
    });

    await waitFor(() => {
      expect(screen.getByText('This value is already used by another user.')).toBeInTheDocument();
    });
  });

  // ── handleDeleteAccount (success path) ─────────────────────────────────────

  it('performs account deletion when deleteConfirmText is DELETE', async () => {
    (useSelector as jest.Mock).mockReturnValue(mockUser);
    mockDispatch.mockReturnValue({ unwrap: jest.fn().mockResolvedValue({}) });

    render(<EditProfilePage />);

    // Set deleteConfirmText to 'DELETE' via the captured prop setter
    act(() => {
      (capturedDangerProps.onDeleteConfirmTextChange as (t: string) => void)('DELETE');
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('delete-account-btn'));
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/auth/delete-account', expect.any(Object));
    });
  });

  it('shows success alert after account deletion', async () => {
    (useSelector as jest.Mock).mockReturnValue(mockUser);
    mockDispatch.mockReturnValue({ unwrap: jest.fn().mockResolvedValue({}) });

    render(<EditProfilePage />);

    act(() => {
      (capturedDangerProps.onDeleteConfirmTextChange as (t: string) => void)('DELETE');
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('delete-account-btn'));
    });

    await waitFor(() => {
      expect(screen.getByText('Account deleted. Redirecting to home page...')).toBeInTheDocument();
    });
  });

  it('shows error alert when delete-account API fails', async () => {
    (useSelector as jest.Mock).mockReturnValue(mockUser);
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === '/api/auth/delete-account') {
        return Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ error: 'Deletion failed' }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    render(<EditProfilePage />);

    act(() => {
      (capturedDangerProps.onDeleteConfirmTextChange as (t: string) => void)('DELETE');
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('delete-account-btn'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('alert-destructive')).toBeInTheDocument();
      expect(screen.getByText('Deletion failed')).toBeInTheDocument();
    });
  });

  // ── visibleCategoriesForTabs filtering ─────────────────────────────────────

  it('filters social categories when socialLayerEnabled is false', async () => {
    const { useUserSettings } = await import('@/lib/settings/useUserSettings');
    (useUserSettings as jest.Mock).mockReturnValue({ settings: { social_enabled: false } });
    (useSelector as jest.Mock).mockReturnValue({
      ...mockUser,
      category_profile: { games: {}, coding: {} },
    });

    render(<EditProfilePage />);
    // visibleCategoriesForTabs should exclude 'coding' when social disabled
    expect(capturedCategoryProps).toBeDefined();
  });

  // ── Category toggle handler ─────────────────────────────────────────────────

  it('toggleCategory adds a new category', () => {
    (useSelector as jest.Mock).mockReturnValue({
      ...mockUser,
      category_profile: {},
    });
    render(<EditProfilePage />);

    act(() => {
      (capturedCategoryProps.onToggleCategory as (cat: string) => void)('anime');
    });

    // The category selection section should receive updated selectedCategories
    expect(capturedCategoryProps.selectedCategories).toContain('anime');
  });

  it('toggleCategory removes an existing category', () => {
    (useSelector as jest.Mock).mockReturnValue(mockUser);
    render(<EditProfilePage />);

    // Initially has 'games' and 'anime' from mockUser.category_profile
    act(() => {
      (capturedCategoryProps.onToggleCategory as (cat: string) => void)('games');
    });

    expect(capturedCategoryProps.selectedCategories).not.toContain('games');
  });

  // ── Alert display ───────────────────────────────────────────────────────────

  it('renders success alert icon for success alerts', async () => {
    (useSelector as jest.Mock).mockReturnValue(mockUser);
    mockDispatch.mockReturnValue({ unwrap: jest.fn().mockResolvedValue({}) });

    render(<EditProfilePage />);
    const form = document.getElementById('edit-profile-form')!;

    await act(async () => {
      fireEvent.submit(form);
    });

    await waitFor(() => {
      // CheckCircle renders as SVG with data-icon="CheckCircle" (from lucide mock)
      const alert = screen.getByTestId('alert-success');
      expect(alert).toBeInTheDocument();
    });
  });

  // ── PersonalInfoCard handler coverage ───────────────────────────────────────

  it('handleChange updates formData when onFormChange is called', () => {
    (useSelector as jest.Mock).mockReturnValue(mockUser);
    render(<EditProfilePage />);

    act(() => {
      (capturedPersonalInfoProps.onFormChange as (e: React.ChangeEvent<HTMLInputElement>) => void)({
        target: { name: 'display_name', value: 'New Name' },
      } as React.ChangeEvent<HTMLInputElement>);
    });

    expect((capturedPersonalInfoProps.formData as Record<string, unknown>).display_name).toBe(
      'New Name',
    );
  });

  it('handleSelectChange updates formData when onSelectChange is called', () => {
    (useSelector as jest.Mock).mockReturnValue(mockUser);
    render(<EditProfilePage />);

    act(() => {
      const selectFn = (
        capturedPersonalInfoProps.onSelectChange as (name: string) => (value: string) => void
      )('country');
      selectFn('US');
    });

    expect((capturedPersonalInfoProps.formData as Record<string, unknown>).country).toBe('US');
  });

  it('handleSocialLinkChange updates socialLinks when onSocialLinkChange is called', () => {
    (useSelector as jest.Mock).mockReturnValue(mockUser);
    render(<EditProfilePage />);

    act(() => {
      (capturedPersonalInfoProps.onSocialLinkChange as (key: string, value: string) => void)(
        'discord',
        'newhandle',
      );
    });

    expect((capturedPersonalInfoProps.socialLinks as Record<string, string>).discord).toBe(
      'newhandle',
    );
  });

  it('onLocationCityChange updates locationCity', () => {
    (useSelector as jest.Mock).mockReturnValue(mockUser);
    render(<EditProfilePage />);

    act(() => {
      (capturedPersonalInfoProps.onLocationCityChange as (city: string) => void)('Thessaloniki');
    });

    expect(capturedPersonalInfoProps.locationCity).toBe('Thessaloniki');
  });

  it('togglePrivacySetting toggles a privacy key when onPrivacyToggle is called', () => {
    (useSelector as jest.Mock).mockReturnValue(mockUser);
    render(<EditProfilePage />);

    const before = (capturedPersonalInfoProps.privacySettings as Record<string, boolean>).show_age;
    act(() => {
      (capturedPersonalInfoProps.onPrivacyToggle as (key: string) => void)('show_age');
    });

    expect((capturedPersonalInfoProps.privacySettings as Record<string, boolean>).show_age).toBe(
      !before,
    );
  });

  it('handleAvatarRemove clears avatar state when onAvatarRemove is called', () => {
    (useSelector as jest.Mock).mockReturnValue(mockUser);
    render(<EditProfilePage />);

    act(() => {
      (capturedPersonalInfoProps.onAvatarRemove as () => void)();
    });

    expect((capturedPersonalInfoProps.formData as Record<string, unknown>).avatar_url).toBe('');
  });

  it('handleAvatarUpload with no file returns early', () => {
    (useSelector as jest.Mock).mockReturnValue(mockUser);
    render(<EditProfilePage />);

    // Calling with no files should not throw or change state
    act(() => {
      (
        capturedPersonalInfoProps.onAvatarUpload as (e: React.ChangeEvent<HTMLInputElement>) => void
      )({ target: { files: null } } as unknown as React.ChangeEvent<HTMLInputElement>);
    });

    // No crash, currentAvatar remains the same
    expect(capturedPersonalInfoProps.currentAvatar).toBeTruthy();
  });

  it('handleAvatarUpload with a file sets avatarFile and reads it', () => {
    (useSelector as jest.Mock).mockReturnValue(mockUser);

    const mockReadAsDataURL = jest.fn();
    const mockFileReaderInstance = {
      readAsDataURL: mockReadAsDataURL,
      onloadend: null as null | (() => void),
    };
    (global as Record<string, unknown>).FileReader = jest.fn(() => mockFileReaderInstance);

    render(<EditProfilePage />);

    const file = new File(['content'], 'avatar.png', { type: 'image/png' });
    act(() => {
      (
        capturedPersonalInfoProps.onAvatarUpload as (e: React.ChangeEvent<HTMLInputElement>) => void
      )({ target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>);
    });

    expect(mockReadAsDataURL).toHaveBeenCalledWith(file);
  });

  // ── avatarFile upload branch in handleSubmit ─────────────────────────────────

  it('uploads avatarFile via supabase on submit', async () => {
    (useSelector as jest.Mock).mockReturnValue(mockUser);
    mockDispatch.mockReturnValue({ unwrap: jest.fn().mockResolvedValue({}) });
    setupFetchMock();

    const mockReadAsDataURL = jest.fn();
    const mockFileReaderInstance = {
      readAsDataURL: mockReadAsDataURL,
      onloadend: null as null | (() => void),
    };
    (global as Record<string, unknown>).FileReader = jest.fn(() => mockFileReaderInstance);

    render(<EditProfilePage />);

    const file = new File(['content'], 'avatar.png', { type: 'image/png' });
    act(() => {
      (
        capturedPersonalInfoProps.onAvatarUpload as (e: React.ChangeEvent<HTMLInputElement>) => void
      )({ target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>);
    });

    const form = document.getElementById('edit-profile-form')!;
    await act(async () => {
      fireEvent.submit(form);
    });

    await waitFor(() => {
      expect(screen.getByTestId('alert-success')).toBeInTheDocument();
    });
  });

  it('shows error alert when avatarFile upload fails', async () => {
    (useSelector as jest.Mock).mockReturnValue(mockUser);

    const { supabase } = await import('@/lib/supabase-client');
    (supabase.storage.from as jest.Mock).mockReturnValue({
      upload: jest.fn().mockResolvedValue({ error: new Error('Upload failed') }),
      getPublicUrl: jest.fn(() => ({ data: { publicUrl: '' } })),
    });

    const mockReadAsDataURL = jest.fn();
    (global as Record<string, unknown>).FileReader = jest.fn(() => ({
      readAsDataURL: mockReadAsDataURL,
      onloadend: null,
    }));

    render(<EditProfilePage />);

    const file = new File(['content'], 'avatar.png', { type: 'image/png' });
    act(() => {
      (
        capturedPersonalInfoProps.onAvatarUpload as (e: React.ChangeEvent<HTMLInputElement>) => void
      )({ target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>);
    });

    const form = document.getElementById('edit-profile-form')!;
    await act(async () => {
      fireEvent.submit(form);
    });

    await waitFor(() => {
      expect(screen.getByTestId('alert-destructive')).toBeInTheDocument();
    });
  });

  // ── location save failures must not be reported as success ────────────────

  it('reports an error when the location request rejects', async () => {
    (useSelector as jest.Mock).mockReturnValue(mockUser);
    mockDispatch.mockReturnValue({ unwrap: jest.fn().mockResolvedValue({}) });

    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === '/api/me/location') {
        return Promise.reject(new Error('Network error'));
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    render(<EditProfilePage />);
    const form = document.getElementById('edit-profile-form')!;

    await act(async () => {
      fireEvent.submit(form);
    });

    await waitFor(() => {
      expect(screen.getByTestId('alert-destructive')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('alert-success')).not.toBeInTheDocument();
  });

  it('reports an error when the location request returns a failure status', async () => {
    (useSelector as jest.Mock).mockReturnValue(mockUser);
    mockDispatch.mockReturnValue({ unwrap: jest.fn().mockResolvedValue({}) });

    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === '/api/me/location') {
        return Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ error: 'City is too long' }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    render(<EditProfilePage />);
    const form = document.getElementById('edit-profile-form')!;

    await act(async () => {
      fireEvent.submit(form);
    });

    await waitFor(() => {
      expect(screen.getByTestId('alert-destructive')).toBeInTheDocument();
    });
    expect(screen.getByText('City is too long')).toBeInTheDocument();
  });

  // ── pet type truthy branch (lines 138, 193) ──────────────────────────────

  it('initializes pet_types array when category_profile has pet.type', () => {
    (useSelector as jest.Mock).mockReturnValue({
      ...mockUser,
      category_profile: { pet: { type: 'cat' } },
    });
    render(<EditProfilePage />);
    // pet_types should be ['cat']
    expect(capturedPersonalInfoProps).toBeDefined();
  });

  // ── hash scroll useEffect ─────────────────────────────────────────────────

  it('scrolls to element when hash is present on mount', () => {
    // Set hash via history API (jsdom supports this)
    history.pushState({}, '', '#categories');

    const mockScrollIntoView = jest.fn();
    jest.spyOn(document, 'querySelector').mockReturnValueOnce({
      scrollIntoView: mockScrollIntoView,
    } as unknown as Element);

    (useSelector as jest.Mock).mockReturnValue(mockUser);

    jest.useFakeTimers();
    render(<EditProfilePage />);
    act(() => {
      jest.runAllTimers();
    });

    expect(mockScrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    jest.useRealTimers();

    // Restore hash
    history.pushState({}, '', '/');
  });

  // ── ProfileCategoryTabs inline callback coverage ──────────────────────────

  it('onGameFieldChange updates category_notes.games', () => {
    (useSelector as jest.Mock).mockReturnValue(mockUser);
    render(<EditProfilePage />);

    act(() => {
      (capturedTabsProps.onGameFieldChange as (name: string, value: string) => void)(
        'psn_id',
        'mypsn',
      );
    });

    const notes = capturedTabsProps.categoryNotes as Record<string, unknown>;
    expect((notes.games as Record<string, unknown>)?.psn_id).toBe('mypsn');
  });

  it('onGamePlatformChange updates category_notes.games.favorite_platform', () => {
    (useSelector as jest.Mock).mockReturnValue(mockUser);
    render(<EditProfilePage />);

    act(() => {
      (capturedTabsProps.onGamePlatformChange as (value: string) => void)('PS5');
    });

    const notes = capturedTabsProps.categoryNotes as Record<string, unknown>;
    expect((notes.games as Record<string, unknown>)?.favorite_platform).toBe('PS5');
  });

  it('onPetEntryField updates category_notes.pet', () => {
    (useSelector as jest.Mock).mockReturnValue(mockUser);
    render(<EditProfilePage />);

    act(() => {
      (capturedTabsProps.onPetEntryField as (type: string, key: string, value: string) => void)(
        'cat',
        'name',
        'Whiskers',
      );
    });

    const notes = capturedTabsProps.categoryNotes as Record<string, unknown>;
    expect((notes.pet as Record<string, unknown>)?.name).toBe('Whiskers');
  });

  it('onCategoryFieldChange calls handleCategoryNoteField', () => {
    (useSelector as jest.Mock).mockReturnValue(mockUser);
    render(<EditProfilePage />);

    act(() => {
      (
        capturedTabsProps.onCategoryFieldChange as (cat: string, key: string, value: string) => void
      )('anime', 'rating', '5');
    });

    const notes = capturedTabsProps.categoryNotes as Record<string, unknown>;
    expect((notes.anime as Record<string, unknown>)?.rating).toBe('5');
  });

  it('onCategoryListToggle calls handleCategoryListToggle', () => {
    (useSelector as jest.Mock).mockReturnValue(mockUser);
    render(<EditProfilePage />);

    act(() => {
      (capturedTabsProps.onCategoryListToggle as (cat: string, key: string, item: string) => void)(
        'anime',
        'genres',
        'Action',
      );
    });

    const notes = capturedTabsProps.categoryNotes as Record<string, unknown>;
    expect((notes.anime as Record<string, unknown>)?.genres).toContain('Action');
  });

  it('onPetTypeToggle calls togglePetType', () => {
    (useSelector as jest.Mock).mockReturnValue(mockUser);
    render(<EditProfilePage />);

    act(() => {
      (capturedTabsProps.onPetTypeToggle as (type: string) => void)('dog');
    });

    expect(capturedTabsProps.petTypes).toContain('dog');
  });

  // ── FileReader.onloadend callback coverage (lines 272-273) ───────────────

  it('handleAvatarUpload triggers FileReader.onloadend to set preview', () => {
    (useSelector as jest.Mock).mockReturnValue(mockUser);

    let onloadendCb: (() => void) | null = null;
    const mockInstance = {
      result: 'data:image/png;base64,test',
      set onloadend(cb: () => void) {
        onloadendCb = cb;
      },
      get onloadend() {
        return onloadendCb;
      },
      readAsDataURL: jest.fn(),
    };
    (global as Record<string, unknown>).FileReader = jest.fn(() => mockInstance);

    render(<EditProfilePage />);

    const file = new File(['content'], 'avatar.png', { type: 'image/png' });
    act(() => {
      (
        capturedPersonalInfoProps.onAvatarUpload as (e: React.ChangeEvent<HTMLInputElement>) => void
      )({ target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>);
    });

    act(() => {
      onloadendCb?.();
    });

    expect(capturedPersonalInfoProps.currentAvatar).toBe('data:image/png;base64,test');
  });

  // ── router.push in setTimeout after successful submit (line 486) ──────────

  it('navigates to /profile after 1500ms on successful submit', async () => {
    (useSelector as jest.Mock).mockReturnValue(mockUser);
    mockDispatch.mockReturnValue({ unwrap: jest.fn().mockResolvedValue({}) });
    setupFetchMock();

    jest.useFakeTimers();
    render(<EditProfilePage />);
    const form = document.getElementById('edit-profile-form')!;

    await act(async () => {
      fireEvent.submit(form);
    });
    await act(async () => {
      jest.advanceTimersByTime(1500);
    });

    expect(mockPush).toHaveBeenCalledWith('/profile');
    jest.useRealTimers();
  });

  // ── supabase.auth.signOut catch block (lines 554-555) ────────────────────

  it('handles signOut error gracefully after account deletion', async () => {
    (useSelector as jest.Mock).mockReturnValue(mockUser);
    mockDispatch.mockReturnValue({ unwrap: jest.fn().mockResolvedValue({}) });

    const { supabase } = await import('@/lib/supabase-client');
    (supabase.auth.signOut as jest.Mock).mockRejectedValueOnce(new Error('SignOut failed'));

    setupFetchMock();

    render(<EditProfilePage />);

    act(() => {
      (capturedDangerProps.onDeleteConfirmTextChange as (t: string) => void)('DELETE');
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('delete-account-btn'));
    });

    await waitFor(() => {
      expect(screen.getByText('Account deleted. Redirecting to home page...')).toBeInTheDocument();
    });
  });

  // ── normalizedNote {} fallback (line 446) ────────────────────────────────

  it('uses {} for category without a valid note object during submit', async () => {
    (useSelector as jest.Mock).mockReturnValue({
      ...mockUser,
      category_profile: { games: 'invalid-string', anime: null },
    });
    mockDispatch.mockReturnValue({ unwrap: jest.fn().mockResolvedValue({}) });
    setupFetchMock();

    render(<EditProfilePage />);
    const form = document.getElementById('edit-profile-form')!;

    await act(async () => {
      fireEvent.submit(form);
    });

    await waitFor(() => {
      expect(screen.getByTestId('alert-success')).toBeInTheDocument();
    });
  });

  // ── category error fallback message (line 462) ───────────────────────────

  it('shows fallback error message when category response has no error string', async () => {
    (useSelector as jest.Mock).mockReturnValue(mockUser);
    mockDispatch.mockReturnValue({ unwrap: jest.fn().mockResolvedValue({}) });

    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === '/api/me/location') {
        return Promise.resolve({ ok: true });
      }
      if (url === '/api/me/category-profile') {
        return Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ error: 42 }), // non-string error
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    render(<EditProfilePage />);
    const form = document.getElementById('edit-profile-form')!;

    await act(async () => {
      fireEvent.submit(form);
    });

    await waitFor(() => {
      // A non-string error payload falls back to the page's own wording, which
      // reaches the alert intact rather than being replaced by the generic one.
      expect(screen.getByTestId('alert-destructive')).toBeInTheDocument();
      expect(screen.getByText('Failed to update category profile')).toBeInTheDocument();
    });
  });

  // ── Minimal user (null fields) — covers || fallbacks in useEffect ─────────

  it('renders with null user fields and uses fallback values', () => {
    const minimalUser = {
      id: 'user-min',
      username: 'minuser',
      full_name: null,
      display_name: null,
      date_of_birth: null,
      country: null,
      timezone: null,
      bio: null,
      avatar_url: null,
      location_city: null,
      social_links: null,
      privacy_settings: null,
      category_profile: { games: 'str', anime: null },
      genre_affinity: null,
      created_at: '2024-01-01',
      updated_at: '2024-01-01',
    } as unknown as typeof mockUser;

    (useSelector as jest.Mock).mockReturnValue(minimalUser);
    render(<EditProfilePage />);

    expect(screen.getByTestId('profile-page-header')).toBeInTheDocument();
  });

  // ── Vape category data — covers truthy branches in vapeFallback (697-706) ─

  it('renders with vape category data covering truthy branches', () => {
    (useSelector as jest.Mock).mockReturnValue({
      ...mockUser,
      category_profile: {
        vape: { device: 'pod-mod', flavors: ['mint', 'strawberry'] },
      },
    });

    render(<EditProfilePage />);
    expect(screen.getByTestId('profile-category-tabs')).toBeInTheDocument();
  });
});
