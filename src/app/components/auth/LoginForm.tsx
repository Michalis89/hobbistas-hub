'use client';

import { LogIn } from 'lucide-react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthFormContainer } from '@/app/components/auth/shared/AuthFormContainer';
import {
  CaptchaSection,
  IdentifierField,
  LoginStatusAlert,
  LoginSubmitButton,
  PasswordField,
  RememberForgotRow,
  ResetPanel,
  SignUpPrompt,
  UnverifiedEmailNotice,
} from './login-form/LoginFormSections';
import { isCaptchaDisabled } from './login-form/constants';
import { useLoginForm } from './login-form/useLoginForm';

export default function LoginForm() {
  const {
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
  } = useLoginForm();

  const canSubmit =
    !loading && !isRedirecting && !(!isCaptchaDisabled && captchaVisible && !captchaToken);

  return (
    <TooltipProvider delayDuration={120}>
      <AuthFormContainer
        icon={<LogIn className="h-5 w-5" />}
        title="Log in to Hobbistas"
        subtitle="Access your account"
      >
        <form onSubmit={handleSubmit} className="space-y-5" suppressHydrationWarning>
          <LoginStatusAlert alert={alert} isRedirecting={isRedirecting} />

          <UnverifiedEmailNotice
            visible={needsVerification}
            loading={resendLoading}
            onResend={handleResendVerification}
          />

          <IdentifierField
            identifier={formData.identifier}
            error={errors.identifier}
            onChange={handleIdentifierChange}
            loading={loading}
            isRedirecting={isRedirecting}
          />

          <PasswordField
            password={formData.password}
            showPassword={showPassword}
            error={errors.password}
            onChange={handlePasswordChange}
            onToggleVisibility={() => setShowPassword(!showPassword)}
            loading={loading}
            isRedirecting={isRedirecting}
          />

          <RememberForgotRow
            remember={formData.remember}
            onRememberChange={handleRememberChange}
            onForgotPassword={handleForgotPasswordClick}
            loading={loading}
            isRedirecting={isRedirecting}
          />

          <CaptchaSection
            captchaVisible={captchaVisible}
            captchaResetKey={captchaResetKey}
            captchaError={captchaError}
            onTokenChange={token => {
              setCaptchaToken(token);
              if (token) {
                setCaptchaError(null);
              }
            }}
          />

          <LoginSubmitButton
            loading={loading}
            isRedirecting={isRedirecting}
            canSubmit={canSubmit}
          />

          <SignUpPrompt redirectParam={redirectParam} />
        </form>

        <ResetPanel
          showResetPanel={showResetPanel}
          resetAlert={resetAlert}
          resetEmail={resetEmail}
          resetLoading={resetLoading}
          onResetEmailChange={setResetEmail}
          onSendRecoveryLink={handleSendResetEmail}
          onClose={() => setShowResetPanel(false)}
        />
      </AuthFormContainer>
    </TooltipProvider>
  );
}
