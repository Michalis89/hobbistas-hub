import { Suspense } from 'react';
import { Sparkles, ListChecks, Clock3, ShieldCheck } from 'lucide-react';
import LoginForm from '@/app/components/auth/LoginForm';
import { AuthIntroHeading } from '@/app/components/auth/shared/AuthIntroHeading';
import { PageWrapper } from '@/app/components/layout/PageWrapper';
import { buildMetadata } from '@/utils/seo/metadata/helpers';

export const metadata = buildMetadata({
  title: 'Login | Hobbistas',
  description: 'Sign in to Hobbistas and keep all your hobbies organized in one place.',
  path: '/auth/login',
});

const highlights = [
  {
    title: 'Your progress is waiting',
    description: 'Backlogs, lists, and updates in one clean dashboard.',
    icon: ListChecks,
  },
  {
    title: 'Instant continuity',
    description: 'Pick up exactly where you left off, without losing context.',
    icon: Clock3,
  },
  {
    title: 'Secure access',
    description: 'Protected with CAPTCHA and a safe login flow.',
    icon: ShieldCheck,
  },
];

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <PageWrapper className="mt-8">
        <section
          className={[
            // “Hero card”
            'relative isolate overflow-hidden',
            'rounded-[var(--radius-xl)] border border-border bg-card shadow-[var(--shadow-lg)]',
            'px-4 py-5 md:px-8 md:py-8',
          ].join(' ')}
        >
          {/* Ambient blobs */}
          <div className="blur-effect pointer-events-none absolute -left-12 -top-12 hidden h-48 w-48 rounded-full bg-primary/10 blur-xl md:block" />
          <div className="blur-effect pointer-events-none absolute -bottom-16 right-0 hidden h-56 w-56 rounded-full bg-primary/10 blur-xl md:block" />

          <div className="relative grid items-start gap-6 lg:grid-cols-[1.02fr_0.98fr] lg:gap-8">
            <aside className="hidden space-y-6 lg:block">
              <AuthIntroHeading
                variant="desktop"
                eyebrow="Welcome back"
                title="Continue your journey"
                description="Pick up where you left off. Everything in one place with a single sign-in."
              />

              {/* “Row” style (sub-surface) */}
              <div className="rounded-[var(--radius-lg)] border border-border bg-background/30 px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] bg-primary/10 text-primary">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Hobbistas</p>
                    <p className="text-xs text-muted-foreground">
                      Stable, clean, and consistent workspace.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {highlights.map(item => {
                  const Icon = item.icon;
                  return (
                    <article
                      key={item.title}
                      className={[
                        'rounded-[var(--radius-lg)] border border-border bg-background/30',
                        'px-4 py-3',
                        'transition-colors duration-150',
                        'hover:bg-background/40',
                      ].join(' ')}
                    >
                      <div className="flex gap-3">
                        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px] bg-primary/10 text-primary">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">{item.title}</p>
                          <p className="text-sm text-muted-foreground">{item.description}</p>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </aside>

            <div className="space-y-4">
              <AuthIntroHeading
                variant="mobile"
                eyebrow="Welcome back"
                title="Continue your journey"
                description="Sign in to continue with your hobbies and backlogs."
              />

              <Suspense
                fallback={
                  <div className="h-[560px] w-full animate-pulse rounded-[var(--radius-xl)] border border-border bg-card/60" />
                }
              >
                <LoginForm />
              </Suspense>
            </div>
          </div>
        </section>
      </PageWrapper>
    </div>
  );
}
