import Link from 'next/link';
import { ArrowRight, CheckCircle2, CircleAlert, MailCheck } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { buildMetadata } from '@/utils/seo/metadata/helpers';
import ResendVerificationCard from '@/app/components/auth/ResendVerificationCard';
import SuccessAutoRedirect from './SuccessAutoRedirect';

export const metadata = buildMetadata({
  title: 'Confirm Email',
  description: 'Email confirmation and verification flow.',
  path: '/auth/confirm-email',
  noindex: true,
});

type ConfirmEmailPageProps = {
  searchParams?: Promise<{
    state?: string;
    error?: string;
    error_description?: string;
  }>;
};

export default async function ConfirmEmailPage({ searchParams }: ConfirmEmailPageProps) {
  const params = await searchParams;
  const state = params?.state;
  const hasVerificationError = Boolean(params?.error || params?.error_description);

  const variant = hasVerificationError ? 'error' : state === 'pending' ? 'pending' : 'success';

  const config =
    variant === 'pending'
      ? {
          title: 'Check your email',
          description:
            'We sent you a confirmation link. Open your inbox and click "Confirm Account" to activate your account.',
          alertTitle: 'Verification pending',
          alertDescription:
            'If you do not see the email, check your spam folder and try the registration flow again.',
          ctaHref: '/auth/login',
          ctaLabel: 'Go to sign in',
          Icon: MailCheck,
        }
      : variant === 'error'
        ? {
            title: 'Link expired',
            description:
              'Verification links are single-use and time-limited. Send yourself a fresh one below — your account is untouched.',
            alertTitle: 'Nothing was lost',
            alertDescription:
              'You can keep using your account while it is unverified. Signing in still works.',
            ctaHref: '/auth/login',
            ctaLabel: 'Go to sign in',
            Icon: CircleAlert,
          }
        : {
            title: "You're verified",
            description: 'Your email is confirmed and your account is ready. Sign in to continue.',
            alertTitle: 'Confirmation complete',
            alertDescription: 'You can now access all account features.',
            ctaHref: '/auth/login',
            ctaLabel: 'Continue to sign in',
            Icon: CheckCircle2,
          };

  const Icon = config.Icon;

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-background px-6 py-16">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent opacity-60" />

      <section aria-live="polite" aria-atomic="true" className="relative z-10 w-full max-w-md">
        <Card className="border-border bg-card/95 shadow-xl">
          <CardHeader className="space-y-4 pb-2 text-center">
            <div className="flex justify-center">
              <div className="relative">
                <div className="absolute inset-0 animate-ping rounded-full bg-primary opacity-20" />
                <div className="relative flex h-20 w-20 items-center justify-center rounded-full border border-border bg-card shadow-xl">
                  <Icon className="h-10 w-10 text-primary" />
                </div>
              </div>
            </div>

            <CardTitle className="text-3xl font-black tracking-tight text-foreground">
              {config.title}
            </CardTitle>

            <CardDescription className="mx-auto max-w-[32ch] text-base leading-relaxed text-muted-foreground">
              {config.description}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-5 pt-4">
            <Alert className="border-border bg-background/70 text-foreground">
              <Icon className="h-4 w-4 text-primary" />
              <AlertTitle>{config.alertTitle}</AlertTitle>
              <AlertDescription>{config.alertDescription}</AlertDescription>
            </Alert>

            <Separator className="bg-border/70" />

            <Button asChild variant="primary" size="xl">
              <Link href={config.ctaHref} aria-label={config.ctaLabel}>
                <span className="flex items-center justify-center gap-2">
                  {config.ctaLabel}
                  <ArrowRight className="h-5 w-5" />
                </span>
              </Link>
            </Button>

            {variant === 'success' ? <SuccessAutoRedirect seconds={6} /> : null}

            {variant === 'success' ? null : (
              <>
                <Separator className="bg-border/70" />
                <ResendVerificationCard />
              </>
            )}

            <div className="text-center">
              <Link
                href="/"
                className="text-sm font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card"
              >
                Back to Home
              </Link>
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
