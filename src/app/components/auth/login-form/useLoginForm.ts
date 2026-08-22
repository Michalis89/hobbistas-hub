import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useDispatch } from 'react-redux';
import { validateEmail, validatePassword } from '@/utils/validation/auth';
import { fetchSession } from '@/store/slices/authSlice';
import type { AppDispatch } from '@/store/store';
import { setAuthPersistence, supabase } from '@/lib/supabase-client';
import { RETURN_URL_KEY } from '@/lib/hooks/useRequireAuth';
import { ONBOARDING_PATH } from '@/lib/routes/authRoutes';
import { EXPIRED_RESET_MESSAGE, isCaptchaDisabled } from './constants';

export type AlertState = { type: 'success' | 'error'; message: string } | null;

type LoginFormData = {
  identifier: string;
  password: string;
  remember: boolean;
};

type LoginFormErrors = {
  identifier?: string;
  password?: string;
};

export function useLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dispatch = useDispatch<AppDispatch>();

  // Callers across the app emit both spellings; accept either so the return
  // destination is never silently dropped.
  const redirectParam = searchParams.get('redirect') ?? searchParams.get('redirectTo');
  const forgotMode = searchParams.get('forgot') === 'true';
  const expiredResetLink = searchParams.get('expired') === 'true';
  const resetError = searchParams.get('reset_error');

  const [formData, setFormData] = useState<LoginFormData>({
    identifier: '',
    password: '',
    remember: false,
  });
  const [errors, setErrors] = useState<LoginFormErrors>({});
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [alert, setAlert] = useState<AlertState>(null);
  const [showResetPanel, setShowResetPanel] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetAlert, setResetAlert] = useState<AlertState>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaError, setCaptchaError] = useState<string | null>(null);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const [captchaVisible, setCaptchaVisible] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const submitInFlight = useRef(false);

  const revealCaptchaIfNeeded = () => {
    if (isCaptchaDisabled || captchaVisible) {
      return;
    }
    setCaptchaVisible(true);
  };

  useEffect(() => {
    if (!forgotMode && !expiredResetLink && !resetError) {
      return;
    }

    if (forgotMode || expiredResetLink) {
      setShowResetPanel(true);
    }

    if (expiredResetLink) {
      setResetAlert({
        type: 'error',
        message: EXPIRED_RESET_MESSAGE,
      });
    }

    if (resetError) {
      setAlert({
        type: 'error',
        message: decodeURIComponent(resetError),
      });
    }

    if (typeof window !== 'undefined') {
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.delete('forgot');
      currentUrl.searchParams.delete('expired');
      currentUrl.searchParams.delete('reset_error');
      const nextSearch = currentUrl.searchParams.toString();
      const nextUrl = `${currentUrl.pathname}${nextSearch ? `?${nextSearch}` : ''}${currentUrl.hash}`;
      window.history.replaceState({}, '', nextUrl);
    }
  }, [forgotMode, expiredResetLink, resetError]);

  const clearFieldError = (field: keyof LoginFormErrors) => {
    if (!errors[field]) {
      return;
    }
    setErrors(prev => ({ ...prev, [field]: undefined }));
  };

  const handleIdentifierChange = (value: string) => {
    revealCaptchaIfNeeded();
    setFormData(prev => ({ ...prev, identifier: value }));
    clearFieldError('identifier');
  };

  const handlePasswordChange = (value: string) => {
    revealCaptchaIfNeeded();
    setFormData(prev => ({ ...prev, password: value }));
    clearFieldError('password');
  };

  const handleRememberChange = (checked: boolean) => {
    revealCaptchaIfNeeded();
    setFormData(prev => ({ ...prev, remember: checked }));
  };

  const handleForgotPasswordClick = () => {
    revealCaptchaIfNeeded();
    setShowResetPanel(true);
    setResetAlert(null);
    if (formData.identifier.includes('@')) {
      setResetEmail(formData.identifier);
    }
  };

  const validateForm = () => {
    const nextErrors: LoginFormErrors = {};

    if (!formData.identifier || formData.identifier.trim() === '') {
      nextErrors.identifier = 'Email or username is required';
    } else if (formData.identifier.includes('@')) {
      const emailValidation = validateEmail(formData.identifier);
      if (!emailValidation.isValid) {
        nextErrors.identifier = emailValidation.error;
      }
    } else if (formData.identifier.length < 3) {
      nextErrors.identifier = 'Username must be at least 3 characters';
    }

    const passwordValidation = validatePassword(formData.password);
    if (!passwordValidation.isValid) {
      nextErrors.password = passwordValidation.error;
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSendResetEmail = async () => {
    setResetAlert(null);

    const emailValidation = validateEmail(resetEmail);
    if (!emailValidation.isValid) {
      setResetAlert({
        type: 'error',
        message: emailValidation.error || 'Invalid email address. Try again.',
      });
      return;
    }

    setResetLoading(true);
    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send the email. Try again.');
      }

      setResetAlert({
        type: 'success',
        message: 'Password reset link sent. Check your inbox (and spam).',
      });
    } catch (err) {
      console.error('Reset password error:', err);
      setResetAlert({
        type: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Failed to send the email. Try again or check your email address.',
      });
    } finally {
      setResetLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    // preventDefault must run before the in-flight guard, otherwise a blocked
    // submit falls through to a native GET submit that puts the password in the URL.
    e.preventDefault();

    if (submitInFlight.current) {
      return;
    }
    submitInFlight.current = true;

    // Every exit path below runs through this finally, so the guard can never
    // stay latched and permanently freeze the form.
    try {
      setAlert(null);
      setIsRedirecting(false);
      setNeedsVerification(false);

      if (!isCaptchaDisabled && !captchaVisible) {
        setCaptchaVisible(true);
        setCaptchaError('Load the CAPTCHA first, then try again.');
        return;
      }

      if (!validateForm()) {
        return;
      }

      if (!isCaptchaDisabled && !captchaToken) {
        setCaptchaError('Complete the CAPTCHA to continue.');
        return;
      }

      setCaptchaError(null);
      setLoading(true);

      const response = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: formData.identifier,
          password: formData.password,
          remember: formData.remember,
          captchaToken: isCaptchaDisabled ? 'dev-bypass' : captchaToken,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }
      const payload = data.data ?? data;
      setAuthPersistence(formData.remember);

      if (payload.session) {
        await supabase.auth.setSession({
          access_token: payload.session.access_token,
          refresh_token: payload.session.refresh_token,
        });
      }

      await dispatch(fetchSession());
      setIsRedirecting(true);

      // Determine redirect URL with priority:
      // 1. Redirect parameter from URL
      // 2. Saved URL from sessionStorage
      // 3. Server-provided redirectUrl based on profile completeness
      // 4. Default fallback
      let redirectUrl = payload.redirectUrl || ONBOARDING_PATH;
      if (redirectParam) {
        redirectUrl = decodeURIComponent(redirectParam);
      } else {
        try {
          const savedUrl = sessionStorage.getItem(RETURN_URL_KEY);
          if (savedUrl) {
            redirectUrl = savedUrl;
            sessionStorage.removeItem(RETURN_URL_KEY);
          }
        } catch {
          // Ignore storage errors.
        }
      }

      // Immediate redirect with error handling
      try {
        router.push(redirectUrl);
        // Fallback: if router.push doesn't trigger navigation, use window.location
        setTimeout(() => {
          if (typeof window !== 'undefined' && window.location.pathname === '/auth/login') {
            window.location.href = redirectUrl;
          }
        }, 500);
      } catch (redirectError) {
        console.error('Redirect failed:', redirectError);
        // Force redirect via window.location as fallback
        if (typeof window !== 'undefined') {
          window.location.href = redirectUrl;
        }
      }
    } catch (error) {
      console.error('Login error:', error);
      setIsRedirecting(false);

      // A consumed CAPTCHA token cannot be replayed, so any failed attempt needs
      // a fresh challenge before the user can submit again.
      if (!isCaptchaDisabled) {
        setCaptchaResetKey(prev => prev + 1);
        setCaptchaToken(null);
      }

      if (error instanceof Error && error.message.toLowerCase().includes('captcha')) {
        setCaptchaError('CAPTCHA failed. Retry it, and refresh the page if it persists.');
        setAlert({
          type: 'error',
          message:
            'CAPTCHA verification failed. Please retry. If it keeps failing, refresh and try again.',
        });
        return;
      }

      const errorMessage =
        error instanceof Error ? error.message : 'Login failed. Please check your credentials.';

      const normalizedError = errorMessage.toLowerCase();

      // Legacy accounts created before instant sign-up can still be unconfirmed.
      // Surface a resend action instead of leaving them at a dead end.
      if (normalizedError.includes('not confirmed') || normalizedError.includes('not verified')) {
        setNeedsVerification(true);
        setAlert({ type: 'error', message: errorMessage });
        return;
      }

      if (
        expiredResetLink &&
        (normalizedError.includes('wrong email or password') ||
          normalizedError.includes('invalid login credentials'))
      ) {
        setShowResetPanel(true);
        setResetAlert({
          type: 'error',
          message: EXPIRED_RESET_MESSAGE,
        });
        setAlert({
          type: 'error',
          message: 'Reset link expired. Request a new password reset email below.',
        });
        return;
      }

      setAlert({
        type: 'error',
        message: errorMessage,
      });
    } finally {
      submitInFlight.current = false;
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    setResendLoading(true);
    try {
      const response = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: formData.identifier }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Could not send the verification email.');
      }

      setAlert({
        type: 'success',
        message: 'Verification email sent. Check your inbox (and spam folder).',
      });
      setNeedsVerification(false);
    } catch (error) {
      setAlert({
        type: 'error',
        message:
          error instanceof Error ? error.message : 'Could not send the verification email.',
      });
    } finally {
      setResendLoading(false);
    }
  };

  return {
    redirectParam,
    formData,
    errors,
    showPassword,
    loading,
    isRedirecting,
    alert,
    showResetPanel,
    resetEmail,
    resetLoading,
    resetAlert,
    captchaToken,
    captchaError,
    captchaResetKey,
    captchaVisible,
    needsVerification,
    resendLoading,
    handleResendVerification,
    setShowPassword,
    setShowResetPanel,
    setResetEmail,
    setCaptchaToken,
    setCaptchaError,
    handleIdentifierChange,
    handlePasswordChange,
    handleRememberChange,
    handleForgotPasswordClick,
    handleSendResetEmail,
    handleSubmit,
  };
}
