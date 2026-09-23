import Link from 'next/link';
import { ArrowRight, LogIn } from 'lucide-react';

export function HomeFinalCTA() {
  return (
    <section className="relative px-4 pb-8 pt-14 md:px-6 md:pb-12 md:pt-16">
      <div className="relative mx-auto max-w-3xl rounded-xl p-7 text-center md:p-10">
        <h2 className="mb-4 text-3xl font-semibold text-foreground md:text-4xl">
          Your hobbies deserve better than five different apps
        </h2>
        <p className="mx-auto mb-8 max-w-xl text-base text-muted-foreground md:text-lg">
          Hobbistas is free. No credit card, no ads. Just a clean space for everything you watch,
          play, and read.
        </p>

        <div className="mx-auto flex w-full max-w-md flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row sm:gap-4">
          <Link
            href="/auth/register"
            className="group inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-8 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 sm:w-auto"
          >
            Create account
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>

          <Link
            href="/auth/login"
            className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-border bg-card px-8 py-3.5 text-sm font-semibold text-foreground transition hover:border-primary/20 hover:bg-accent/10 sm:w-auto"
          >
            <LogIn className="h-4 w-4" />I already have an account
          </Link>
        </div>
      </div>
    </section>
  );
}
