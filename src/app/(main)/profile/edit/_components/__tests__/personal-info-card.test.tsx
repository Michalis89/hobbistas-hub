import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import type { User } from '@/types/user';

// Mock all UI dependencies
jest.mock('@/components/ui/card', () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="card" className={className}>
      {children}
    </div>
  ),
  CardHeader: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="card-header" className={className}>
      {children}
    </div>
  ),
  CardContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="card-content" className={className}>
      {children}
    </div>
  ),
  CardTitle: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <h2 data-testid="card-title" className={className}>
      {children}
    </h2>
  ),
}));

jest.mock('@/components/ui/input', () => ({
  Input: ({
    label,
    name,
    value,
    onChange,
    placeholder,
    disabled,
    type,
  }: {
    label?: string;
    name?: string;
    value: string;
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    placeholder?: string;
    disabled?: boolean;
    type?: string;
  }) => (
    <div>
      {label && <label>{label}</label>}
      <input
        data-testid={`input-${name || label?.toLowerCase().replace(/\s/g, '-')}`}
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
      />
    </div>
  ),
}));

jest.mock('@/components/ui/select-field', () => ({
  SelectField: ({
    label,
    value,
    onChange,
    options,
  }: {
    label?: string;
    value: string;
    onChange: (v: string) => void;
    options: string[];
  }) => (
    <select
      data-testid={`select-${label?.toLowerCase().replace(/\s/g, '-')}`}
      value={value}
      onChange={e => onChange(e.target.value)}
    >
      {options.map(opt => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  ),
}));

jest.mock('@/components/ui/textarea', () => ({
  Textarea: ({
    name,
    value,
    onChange,
    placeholder,
    rows,
    maxLength,
  }: {
    name?: string;
    value: string;
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    placeholder?: string;
    rows?: number;
    maxLength?: number;
  }) => (
    <textarea
      data-testid="textarea-bio"
      name={name}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      rows={rows}
      maxLength={maxLength}
    />
  ),
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    type,
    variant,
    className,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    type?: string;
    variant?: string;
    className?: string;
  }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      type={type as 'button'}
      data-variant={variant}
      className={className}
    >
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/avatar-image', () => ({
  AvatarImage: ({ src, alt, size }: { src: string; alt: string; size: number }) => (
    <div data-testid="avatar-image" aria-label={alt} data-src={src} data-size={size} />
  ),
}));

jest.mock('@/data/hobbyConstants', () => ({
  COUNTRIES: ['GR', 'US', 'UK'],
}));

jest.mock('../../_constants', () => ({
  SOCIAL_PLATFORMS: [
    { key: 'discord', label: 'Discord', icon: () => <svg />, placeholder: 'discord handle' },
    { key: 'instagram', label: 'Instagram', icon: () => <svg />, placeholder: '@handle' },
  ],
  TIMEZONES: ['Europe/Athens', 'UTC'],
}));

import { PersonalInfoCard } from '../personal-info-card';

const mockUser = {
  id: 'user-1',
  username: 'testuser',
  full_name: 'Test User',
  display_name: 'Test',
  date_of_birth: '1990-01-01',
  country: 'GR',
  timezone: 'Europe/Athens',
  bio: 'Hello world',
  avatar_url: 'https://example.com/avatar.jpg',
  location_city: 'Athens',
  social_links: {},
  privacy_settings: {},
  category_profile: {},
  genre_affinity: null,
  created_at: '2024-01-01',
  updated_at: '2024-01-01',
} as unknown as User;

const defaultFormData = {
  display_name: 'Test',
  full_name: 'Test User',
  date_of_birth: '1990-01-01',
  country: 'GR',
  timezone: 'Europe/Athens',
  bio: 'Hello world',
  avatar_url: 'https://example.com/avatar.jpg',
};

const defaultProps = {
  user: mockUser,
  formData: defaultFormData,
  socialLinks: { discord: 'myhandle', instagram: '' },
  locationCity: 'Athens',
  privacySettings: {
    profile_visibility: 'public' as const,
    show_full_name: false,
    show_age: false,
    show_location: true,
    show_email: false,
    show_social_links: true,
    show_stats: true,
    show_psn_id: true,
  },
  currentAvatar: 'https://example.com/avatar.jpg',
  onFormChange: jest.fn(),
  onSelectChange: jest.fn(() => jest.fn()),
  onSocialLinkChange: jest.fn(),
  onLocationCityChange: jest.fn(),
  onPrivacyToggle: jest.fn(),
  onVisibilityChange: jest.fn(),
  onAvatarUpload: jest.fn(),
  onAvatarRemove: jest.fn(),
};

describe('PersonalInfoCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    defaultProps.onSelectChange = jest.fn(() => jest.fn());
  });

  it('renders the Personal Information card title', () => {
    render(<PersonalInfoCard {...defaultProps} />);
    expect(screen.getByText('Personal Information')).toBeInTheDocument();
  });

  it('renders the username field (disabled)', () => {
    render(<PersonalInfoCard {...defaultProps} />);
    const usernameInput = screen.getByTestId('input-username');
    expect(usernameInput).toBeDisabled();
    expect(usernameInput).toHaveValue('testuser');
  });

  it('renders the display name field', () => {
    render(<PersonalInfoCard {...defaultProps} />);
    const displayNameInput = screen.getByTestId('input-display_name');
    expect(displayNameInput).toHaveValue('Test');
  });

  it('calls onFormChange when display name changes', () => {
    render(<PersonalInfoCard {...defaultProps} />);
    const input = screen.getByTestId('input-display_name');
    fireEvent.change(input, { target: { name: 'display_name', value: 'New Name' } });
    expect(defaultProps.onFormChange).toHaveBeenCalledTimes(1);
  });

  it('renders the bio textarea with current value', () => {
    render(<PersonalInfoCard {...defaultProps} />);
    expect(screen.getByTestId('textarea-bio')).toHaveValue('Hello world');
  });

  it('caps the bio at the length the counter advertises', () => {
    render(<PersonalInfoCard {...defaultProps} />);
    expect(screen.getByTestId('textarea-bio')).toHaveAttribute('maxLength', '500');
  });

  it('shows the bio character count', () => {
    render(<PersonalInfoCard {...defaultProps} />);
    expect(screen.getByText('11 / 500 characters')).toBeInTheDocument();
  });

  it('shows 0 characters when bio is empty', () => {
    render(<PersonalInfoCard {...defaultProps} formData={{ ...defaultFormData, bio: '' }} />);
    expect(screen.getByText('0 / 500 characters')).toBeInTheDocument();
  });

  it('renders city input with current value', () => {
    render(<PersonalInfoCard {...defaultProps} />);
    const cityInput = screen.getByTestId('input-city');
    expect(cityInput).toHaveValue('Athens');
  });

  it('calls onLocationCityChange when city input changes', () => {
    render(<PersonalInfoCard {...defaultProps} />);
    const cityInput = screen.getByTestId('input-city');
    fireEvent.change(cityInput, { target: { value: 'Thessaloniki' } });
    expect(defaultProps.onLocationCityChange).toHaveBeenCalledWith('Thessaloniki');
  });

  it('renders social platform inputs', () => {
    render(<PersonalInfoCard {...defaultProps} />);
    expect(screen.getByText('Discord')).toBeInTheDocument();
    expect(screen.getByText('Instagram')).toBeInTheDocument();
  });

  it('calls onSocialLinkChange when social input changes', () => {
    render(<PersonalInfoCard {...defaultProps} />);
    const socialInputs = screen.getAllByPlaceholderText('discord handle');
    fireEvent.change(socialInputs[0], { target: { value: 'newhandle' } });
    expect(defaultProps.onSocialLinkChange).toHaveBeenCalledWith('discord', 'newhandle');
  });

  it('renders avatar image when currentAvatar is set', () => {
    render(<PersonalInfoCard {...defaultProps} />);
    expect(screen.getByTestId('avatar-image')).toBeInTheDocument();
  });

  it('renders "No avatar" placeholder when currentAvatar is empty', () => {
    render(<PersonalInfoCard {...defaultProps} currentAvatar="" />);
    expect(screen.getByText('No avatar')).toBeInTheDocument();
    expect(screen.queryByTestId('avatar-image')).not.toBeInTheDocument();
  });

  it('calls onAvatarRemove when Remove button is clicked', () => {
    render(<PersonalInfoCard {...defaultProps} />);
    fireEvent.click(screen.getByText('Remove'));
    expect(defaultProps.onAvatarRemove).toHaveBeenCalledTimes(1);
  });

  it('calls onAvatarUpload when file input changes', () => {
    render(<PersonalInfoCard {...defaultProps} />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [new File([''], 'avatar.png')] } });
    expect(defaultProps.onAvatarUpload).toHaveBeenCalledTimes(1);
  });

  it('renders a button for every privacy flag the app reads', () => {
    render(<PersonalInfoCard {...defaultProps} />);
    expect(screen.getByText('Show full name')).toBeInTheDocument();
    expect(screen.getByText('Show age')).toBeInTheDocument();
    expect(screen.getByText('Show country/city')).toBeInTheDocument();
    expect(screen.getByText('Show email')).toBeInTheDocument();
    expect(screen.getByText('Show social links')).toBeInTheDocument();
    expect(screen.getByText('Show stats')).toBeInTheDocument();
    expect(screen.getByText('Show gaming IDs')).toBeInTheDocument();
  });

  it('renders the reading language selector', () => {
    render(<PersonalInfoCard {...defaultProps} />);
    expect(screen.getByTestId('select-reading-language')).toBeInTheDocument();
  });

  it('renders the profile visibility selector', () => {
    render(<PersonalInfoCard {...defaultProps} />);
    expect(screen.getByTestId('select-profile-visibility')).toHaveValue('public');
  });

  it('calls onVisibilityChange when visibility changes', () => {
    render(<PersonalInfoCard {...defaultProps} />);
    fireEvent.change(screen.getByTestId('select-profile-visibility'), {
      target: { value: 'private' },
    });
    expect(defaultProps.onVisibilityChange).toHaveBeenCalledWith('private');
  });

  it('calls onPrivacyToggle when a privacy button is clicked', () => {
    render(<PersonalInfoCard {...defaultProps} />);
    fireEvent.click(screen.getByText('Show age'));
    expect(defaultProps.onPrivacyToggle).toHaveBeenCalledWith('show_age');
  });

  it('calls onPrivacyToggle for a flag that had no control before', () => {
    render(<PersonalInfoCard {...defaultProps} />);
    fireEvent.click(screen.getByText('Show email'));
    expect(defaultProps.onPrivacyToggle).toHaveBeenCalledWith('show_email');
  });

  it('renders section headers', () => {
    render(<PersonalInfoCard {...defaultProps} />);
    expect(screen.getByText('Account Information')).toBeInTheDocument();
    expect(screen.getByText('Location & Language')).toBeInTheDocument();
    expect(screen.getByText('Social Presence')).toBeInTheDocument();
    expect(screen.getByText('Profile Photo')).toBeInTheDocument();
    expect(screen.getByText('Privacy Settings')).toBeInTheDocument();
  });

  it('renders with empty formData values (covers || fallback branches)', () => {
    const emptyFormData = {
      display_name: '',
      full_name: '',
      date_of_birth: '',
      country: '',
      timezone: '',
      bio: '',
      avatar_url: '',
    };
    render(<PersonalInfoCard {...defaultProps} formData={emptyFormData} currentAvatar="" />);
    expect(screen.getByTestId('input-display_name')).toHaveValue('');
    expect(screen.getByTestId('input-full_name')).toHaveValue('');
    expect(screen.getByTestId('input-date_of_birth')).toHaveValue('');
    expect(screen.getByText('No avatar')).toBeInTheDocument();
  });
});
