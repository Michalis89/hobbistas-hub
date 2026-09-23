import Link from 'next/link';
import { ArrowRight, Compass, Sparkles } from 'lucide-react';
import PageHero from '@/app/components/shared/PageHero';

type AboutHeroProps = {
  isAuthenticated?: boolean;
};

const trustPoints = ['Free to use', 'No ads, no tracking', 'Works offline'];

export function AboutHero({ isAuthenticated = false }: AboutHeroProps) {
  const primaryHref = isAuthenticated ? '/dashboard' : '/auth/register';
  const primaryLabel = isAuthenticated ? 'Go to Dashboard' : 'Start for free';

  return (
    <PageHero
      eyebrow="About Hobbistas"
      title={
        <>
          <span className="text-foreground">A private tracker first.</span>
          <br />
          <span className="text-primary">A community only if you want one.</span>
        </>
      }
      subtitle="Hobbistas tracks games, anime, manga, movies, TV and books in one place. Here's what it does today, what it deliberately does not, and what is coming next."
      sectionClassName="px-4 pb-12 pt-14 md:px-6 md:pb-16 md:pt-20"
      titleClassName="mb-5 text-balance text-[2.35rem] font-semibold leading-[1.08] md:text-5xl lg:text-6xl"
      subtitleClassName="max-w-[46rem] text-[15px] text-muted-foreground md:text-[1.15rem]"
      actions={
        <div className="mx-auto flex w-full max-w-md flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row sm:gap-4">
          <Link
            href={primaryHref}
            className="group inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-8 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 sm:w-auto"
          >
            <Sparkles className="h-5 w-5" />
            {primaryLabel}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>

          <Link
            href="/hobbies"
            className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-border bg-card px-8 py-3.5 text-sm font-semibold text-foreground transition hover:border-primary/20 hover:bg-accent/10 sm:w-auto"
          >
            <Compass className="h-4 w-4" />
            Browse the categories
          </Link>
        </div>
      }
      badges={trustPoints.map(point => (
        <span key={point} className="flex items-center gap-2 text-xs md:text-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
          {point}
        </span>
      ))}
    />
  );
}
