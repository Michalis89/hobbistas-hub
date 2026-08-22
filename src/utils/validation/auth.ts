export function validateEmail(email: string): { isValid: boolean; error?: string } {
  if (!email || email.trim() === '') {
    return { isValid: false, error: 'Email is required' };
  }

  if (email.length > 255) {
    return { isValid: false, error: 'Email cannot exceed 255 characters' };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { isValid: false, error: 'Invalid email format' };
  }

  return { isValid: true };
}

export function validateUsername(username: string): { isValid: boolean; error?: string } {
  if (!username || username.trim() === '') {
    return { isValid: false, error: 'Username is required' };
  }

  if (username.length < 3) {
    return { isValid: false, error: 'Username must be at least 3 characters' };
  }

  if (username.length > 20) {
    return { isValid: false, error: 'Username cannot exceed 20 characters' };
  }

  if (!/^[a-zA-Z]/.test(username)) {
    return { isValid: false, error: 'Username must start with a letter' };
  }

  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return {
      isValid: false,
      error: 'Username can only contain letters, numbers, and underscore (_)',
    };
  }

  return { isValid: true };
}

export interface PasswordStrength {
  score: number; // 0-4
  label: 'Very Weak' | 'Weak' | 'Medium' | 'Strong' | 'Very Strong';
  color: string;
  errors: string[];
}

/**
 * Password policy: length-based, not composition-based.
 *
 * Mandatory character-class rules (upper + lower + digit + symbol) push people
 * toward short, predictable passwords and are the single biggest source of
 * failed sign-ups. The minimum stays at 8 so every existing account can still
 * sign in; `getPasswordStrength` does the coaching in the UI instead.
 */
export function validatePassword(password: string): { isValid: boolean; error?: string } {
  if (!password) {
    return { isValid: false, error: 'Password is required' };
  }

  if (password.length < 8) {
    return { isValid: false, error: 'Password must be at least 8 characters' };
  }

  if (password.length > 128) {
    return { isValid: false, error: 'Password cannot exceed 128 characters' };
  }

  if (/^(.)\1+$/.test(password)) {
    return { isValid: false, error: 'Password cannot be the same character repeated' };
  }

  return { isValid: true };
}

/**
 * Calculate password strength
 */
export function getPasswordStrength(password: string): PasswordStrength {
  const errors: string[] = [];
  let score = 0;

  if (!password) {
    return {
      score: 0,
      label: 'Very Weak',
      color: '#dc2626',
      errors: ['Enter a password'],
    };
  }

  // Length check
  if (password.length >= 8) {
    score++;
  } else {
    errors.push('At least 8 characters');
  }

  if (password.length >= 12) {
    score++;
  }

  // Character type checks
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) {
    score++;
  } else {
    errors.push('Lowercase and uppercase letters');
  }

  if (/[0-9]/.test(password)) {
    score++;
  } else {
    errors.push('At least one number');
  }

  if (/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
    score++;
  } else {
    errors.push('At least one special character');
  }

  // Avoid common patterns
  if (/(012|123|234|345|456|567|678|789|890)/.test(password)) {
    score--;
  }

  if (
    /(abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz)/i.test(
      password,
    )
  ) {
    score--;
  }
  if (/(.)\1{2,}/.test(password)) {
    score--;
  }

  // Clamp score between 0-4
  score = Math.max(0, Math.min(4, score));

  const strengthMap: Record<number, { label: PasswordStrength['label']; color: string }> = {
    0: { label: 'Very Weak', color: '#dc2626' },
    1: { label: 'Weak', color: '#f97316' },
    2: { label: 'Medium', color: '#eab308' },
    3: { label: 'Strong', color: '#22c55e' },
    4: { label: 'Very Strong', color: '#16a34a' },
  };

  return {
    score,
    ...strengthMap[score],
    errors,
  };
}

export function validatePasswordConfirm(
  password: string,
  confirmPassword: string,
): { isValid: boolean; error?: string } {
  if (!confirmPassword) {
    return { isValid: false, error: 'Confirm your password' };
  }

  if (password !== confirmPassword) {
    return { isValid: false, error: 'Passwords do not match' };
  }

  return { isValid: true };
}

export function validateFullName(name: string): { isValid: boolean; error?: string } {
  if (!name || name.trim() === '') {
    return { isValid: false, error: 'Full name is required' };
  }

  if (name.length < 2) {
    return { isValid: false, error: 'Full name must be at least 2 characters' };
  }

  if (name.length > 100) {
    return {
      isValid: false,
      error: 'Full name cannot exceed 100 characters',
    };
  }

  if (!/^[a-zA-ZΑ-Ωα-ωάέήίόύώΆΈΉΊΌΎΏ\s-]+$/.test(name)) {
    return {
      isValid: false,
      error: 'Full name can only contain letters, spaces, and hyphens',
    };
  }

  return { isValid: true };
}

export function validateDateOfBirth(dob: string): { isValid: boolean; error?: string } {
  if (!dob) {
    return { isValid: false, error: 'Date of birth is required' };
  }

  const date = new Date(dob);
  const today = new Date();

  if (isNaN(date.getTime())) {
    return { isValid: false, error: 'Invalid date' };
  }

  if (date > today) {
    return { isValid: false, error: 'Date of birth cannot be in the future' };
  }

  const age = today.getFullYear() - date.getFullYear();
  const monthDiff = today.getMonth() - date.getMonth();
  const dayDiff = today.getDate() - date.getDate();

  const actualAge = monthDiff < 0 || (monthDiff === 0 && dayDiff < 0) ? age - 1 : age;

  if (actualAge < 13) {
    return { isValid: false, error: 'You must be at least 13 years old to sign up' };
  }

  return { isValid: true };
}

export function validatePSNId(psnId: string): { isValid: boolean; error?: string } {
  if (!psnId || psnId.trim() === '') {
    return { isValid: true }; // Optional field
  }

  if (psnId.length < 3) {
    return { isValid: false, error: 'PSN ID must be at least 3 characters' };
  }

  if (psnId.length > 16) {
    return { isValid: false, error: 'PSN ID cannot exceed 16 characters' };
  }

  // Alphanumeric, underscore, hyphen only
  if (!/^[a-zA-Z0-9_-]+$/.test(psnId)) {
    return {
      isValid: false,
      error: 'PSN ID can only contain letters, numbers, underscore, and hyphen',
    };
  }

  return { isValid: true };
}

export function validateBio(bio: string): { isValid: boolean; error?: string } {
  if (!bio || bio.trim() === '') {
    return { isValid: true }; // Optional field
  }

  if (bio.length > 500) {
    return { isValid: false, error: 'Bio cannot exceed 500 characters' };
  }

  return { isValid: true };
}
