'use client';

/**
 * First-run setup.
 *
 * New accounts used to land on /profile/edit — a full settings screen complete
 * with avatar uploads, social links and a delete-account danger zone. This is
 * the deliberately small alternative: pick hobbies, save, start using the app.
 * Everything here is skippable, and the same settings remain available later.
 */

import { type FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDispatch } from 'react-redux';
import {
  ArrowRight,
  BookOpen,
  Clapperboard,
  Gamepad2,
  Library,
  Sparkles,
  Tv,
  Check,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { fetchSession } from '@/store/slices/authSlice';
import type { AppDispatch } from '@/store/store';
import { DASHBOARD_PATH } from '@/lib/routes/authRoutes';

type OnboardingCategory = {
  slug: string;
  label: string;
  blurb: string;
  icon: LucideIcon;
};

// PRIMARY_HOBBY_CATEGORIES from src/config/hobbies.ts. The social-layer
// categories (coding, pet, vape) are deliberately absent: they are secondary,
// gated behind a setting, and would pad a first-run choice that works best when
// it stays short. They remain available in profile settings.
const CATEGORIES: OnboardingCategory[] = [
  { slug: 'games', label: 'Games', blurb: 'Backlog, platforms, playtime', icon: Gamepad2 },
  { slug: 'anime', label: 'Anime', blurb: 'Seasons and watchlists', icon: Sparkles },
  { slug: 'manga', label: 'Manga', blurb: 'Chapters and series', icon: Library },
  { slug: 'movies', label: 'Movies', blurb: 'Watchlist and ratings', icon: Clapperboard },
  { slug: 'tv', label: 'TV Series', blurb: 'Episode progress', icon: Tv },
  { slug: 'books', label: 'Books', blurb: 'Reading list and pages', icon: BookOpen },
];

export default function OnboardingFlow() {
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();

  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canContinue = useMemo(() => selected.length > 0 && !saving, [selected.length, saving]);

  const toggle = (slug: string) => {
    setError(null);
    setSelected(prev =>
      prev.includes(slug) ? prev.filter(item => item !== slug) : [...prev, slug],
    );
  };

  const goToApp = () => {
    router.push(DASHBOARD_PATH);
  };

  const handleContinue = async () => {
    if (selected.length === 0) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // PUT replaces the whole map, so merge onto whatever already exists rather
      // than wiping category data for someone revisiting this screen.
      const existingResponse = await fetch('/api/me/category-profile', { cache: 'no-store' });
      const existingJson = existingResponse.ok ? await existingResponse.json() : null;
      const existingProfiles: Record<string, unknown> =
        (existingJson?.data ?? existingJson)?.profiles ?? {};

      const profiles = selected.reduce<Record<string, unknown>>(
        (acc, slug) => {
          acc[slug] = acc[slug] ?? {};
          return acc;
        },
        { ...existingProfiles },
      );

      const response = await fetch('/api/me/category-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profiles),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || 'Could not save your hobbies.');
      }

      await dispatch(fetchSession());
      goToApp();
    } catch (saveError) {
      console.error('Onboarding save failed:', saveError);
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Could not save your hobbies. Please try again.',
      );
      setSaving(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void handleContinue();
  };

  return (
    <Card className="border-border bg-card shadow-[var(--shadow-lg)]">
      <CardHeader className="space-y-2">
        <p className="text-xs uppercase tracking-[0.25em] text-primary">Step 1 of 1</p>
        <CardTitle className="text-2xl font-black tracking-tight text-foreground md:text-3xl">
          What do you want to track?
        </CardTitle>
        <CardDescription className="text-base text-muted-foreground">
          Pick at least one. This shapes your dashboard and recommendations — you can change it any
          time in your profile.
        </CardDescription>
      </CardHeader>

      <form aria-label="Onboarding hobby selection" onSubmit={handleSubmit}>
        <CardContent className="space-y-6">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div
            role="group"
            aria-label="Hobby categories"
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          >
            {CATEGORIES.map(category => {
              const Icon = category.icon;
              const active = selected.includes(category.slug);

              return (
                <button
                  key={category.slug}
                  type="button"
                  onClick={() => toggle(category.slug)}
                  aria-pressed={active}
                  disabled={saving}
                  className={[
                    'group relative flex items-start gap-3 rounded-[var(--radius-lg)] border p-4 text-left',
                    'transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2',
                    'focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card',
                    'disabled:cursor-not-allowed disabled:opacity-60',
                    active
                      ? 'border-primary/55 bg-primary/10'
                      : 'border-border bg-background/30 hover:border-primary/35 hover:bg-background/50',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)]',
                      active ? 'bg-primary/20 text-primary' : 'bg-primary/10 text-primary',
                    ].join(' ')}
                  >
                    <Icon className="h-5 w-5" />
                  </span>

                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                      {category.label}
                      {active ? (
                        <Check className="h-4 w-4 text-primary" aria-hidden="true" />
                      ) : null}
                    </span>
                    <span className="mt-0.5 block text-sm text-muted-foreground">
                      {category.blurb}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={goToApp}
              disabled={saving}
              className="text-muted-foreground"
            >
              Skip for now
            </Button>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              disabled={!canContinue}
              className="gap-2"
            >
              {saving ? (
                <>
                  Setting things up
                  <Spinner className="h-4 w-4" />
                </>
              ) : (
                <>
                  Start exploring
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </form>
    </Card>
  );
}
