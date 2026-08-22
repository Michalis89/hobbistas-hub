'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  buildTasteProfile,
  type CategoryTasteProfileItem,
  type DashboardCategoryKey,
  type InsightTagBucket,
} from '@/lib/dashboard/category-data';
import DashboardSectionHeader from './DashboardSectionHeader';
import {
  DASH_BORDER,
  DASH_RADIUS_CARD,
  DASH_RADIUS_SECTION,
  DASH_SURFACE_CARD,
} from './dashboard-ui-tokens';

const CATEGORY_LABELS: Record<DashboardCategoryKey, string> = {
  games: 'Games',
  anime: 'Anime',
  manga: 'Manga',
  movies: 'Movies',
  tv: 'TV',
  books: 'Books',
};

const BUCKET_LABELS: Record<InsightTagBucket | 'genre', string> = {
  subgenre: 'Genres',
  mechanic: 'Game Modes',
  mood: 'Mood',
  theme: 'Themes',
  structure: 'Player Perspectives',
  genre: 'Genre',
};
const GAME_VISIBLE_BUCKETS: InsightTagBucket[] = ['subgenre', 'mechanic', 'theme', 'structure'];

const MIN_VISIBLE_PERCENTAGE = 0;
const MAX_TRAITS_PER_BUCKET = 5;
const MAX_SPLIT_TRAITS_PER_BUCKET = 10;

const WEAK_METADATA_GENRES = new Set([
  'adult cast',
  'award winning',
  'children',
  'josei',
  'kids',
  'school',
  'seinen',
  'shoujo',
  'shounen',
  'workplace',
]);

const TRAIT_LABEL_OVERRIDES: Record<string, string> = {
  'role-playing-rpg': 'RPG',
  'real-time-strategy-rts': 'RTS',
  'turn-based-strategy-tbs': 'Turn-Based Strategy',
  'hack-and-slash': 'Hack and Slash',
  'single-player narrative immersion': 'Single-Player Narrative Immersion',
  'cinematic campaign preference': 'Cinematic Campaign Preference',
  'narrative-driven worlds': 'Narrative-Driven Worlds',
  'cozy simulator aversion': 'Cozy Simulator Aversion',
  'low-engagement simulator loop aversion': 'Low-Engagement Simulator Loop Aversion',
  'puzzle-first indie aversion': 'Puzzle-First Indie Aversion',
  'multiplayer live-service aversion': 'Multiplayer / Live-Service Aversion',
};

const shouldSplitGenreBuckets = (category: DashboardCategoryKey) =>
  category === 'anime' || category === 'manga';

const isWeakMetadataGenre = (genre: string) => WEAK_METADATA_GENRES.has(genre.toLowerCase());

type TasteProfileBarTrait = {
  name: string;
  percentageValue: number;
  percentageLabel: string;
  count: number;
};

type ExtraTraitSection = {
  label: string;
  traits: TasteProfileBarTrait[];
};

type TasteProfileBarBucket = {
  bucketKey: InsightTagBucket | 'genre';
  traits: TasteProfileBarTrait[];
};

type CategoryTasteProfileCardProps = {
  category: DashboardCategoryKey;
  items: CategoryTasteProfileItem[];
  profileNote?: Record<string, unknown> | null;
};

type IdentitySignal = { name: string; weight: number };
type GamesIdentityProfile = {
  summary: string;
  coreGenres: IdentitySignal[];
  themes: IdentitySignal[];
  playerStyles: IdentitySignal[];
  negativeSignals: IdentitySignal[];
  signalTotals?: {
    coreGenres?: number;
    themes?: number;
    playerStyles?: number;
    negativeSignals?: number;
  };
};
type AnimeIdentityProfile = {
  summary: string;
  coreGenres: IdentitySignal[];
  topThemes: IdentitySignal[];
  viewerStyles: IdentitySignal[];
  premiumSignals: IdentitySignal[];
  negativeSignals: IdentitySignal[];
};
type MovieIdentityProfile = {
  summary: string;
  cinematicAxes: IdentitySignal[];
  toneSignals: IdentitySignal[];
};
type TvIdentityProfile = {
  summary: string;
  coreAxes: IdentitySignal[];
  behavioralAxes: IdentitySignal[];
};
type BooksIdentityProfile = {
  summary: string;
  coreAxes: IdentitySignal[];
  readingSignals: IdentitySignal[];
};

const toStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .filter(
        (item): item is string | number => typeof item === 'string' || typeof item === 'number',
      )
      .map(item => String(item).trim())
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);
  }
  return [];
};

const toTraits = (items: string[]): TasteProfileBarTrait[] => {
  const unique = Array.from(new Set(items.filter(Boolean))).slice(0, MAX_TRAITS_PER_BUCKET);
  if (unique.length === 0) {
    return [];
  }
  const percentage = 100 / unique.length;
  return unique.map(name => ({
    name,
    count: 1,
    percentageValue: percentage,
    percentageLabel: `${Math.round(percentage)}%`,
  }));
};

const buildExtraSectionsFromProfile = (
  category: DashboardCategoryKey,
  profileNote?: Record<string, unknown> | null,
): ExtraTraitSection[] => {
  if (!profileNote || typeof profileNote !== 'object') {
    return [];
  }

  const sections: ExtraTraitSection[] = [];
  const pushIfAny = (label: string, values: string[]) => {
    const traits = toTraits(values);
    if (traits.length > 0) {
      sections.push({ label, traits });
    }
  };

  if (category === 'movies' || category === 'tv') {
    pushIfAny('Favorite Directors', toStringArray(profileNote.directors));
    pushIfAny('Favorite Actors', toStringArray(profileNote.actors));
    pushIfAny(
      category === 'movies' ? 'Streaming Services' : 'Platforms / Services',
      toStringArray(profileNote.services),
    );
    return sections;
  }

  if (category === 'anime') {
    pushIfAny('Favorite Studios', toStringArray(profileNote.favorite_studios));
    pushIfAny('Platforms', toStringArray(profileNote.platforms));
    return sections;
  }

  if (category === 'books') {
    pushIfAny('Favorite Authors', toStringArray(profileNote.authors));
    pushIfAny('Languages', toStringArray(profileNote.languages));
    return sections;
  }

  if (category === 'manga') {
    pushIfAny('Favorite Authors', toStringArray(profileNote.authors));
    return sections;
  }

  if (category === 'games') {
    pushIfAny('Favorite Studios', toStringArray(profileNote.favorite_developers));
    return sections;
  }

  return sections;
};

const toIdentitySignals = (value: unknown, limit: number): IdentitySignal[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map(item => {
      if (!item || typeof item !== 'object') {
        return null;
      }
      const obj = item as Record<string, unknown>;
      const name = typeof obj.name === 'string' ? obj.name.trim() : '';
      const weight = typeof obj.weight === 'number' ? obj.weight : Number(obj.weight ?? NaN);
      if (!name || !Number.isFinite(weight) || weight <= 0) {
        return null;
      }
      return { name, weight };
    })
    .filter((item): item is IdentitySignal => Boolean(item))
    .slice(0, limit);
};

const toSignalTotal = (value: unknown): number | undefined => {
  const total = typeof value === 'number' ? value : Number(value ?? NaN);
  return Number.isFinite(total) && total > 0 ? total : undefined;
};

const parseGamesIdentityProfile = (value: Record<string, unknown> | null | undefined): GamesIdentityProfile | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const summary = typeof value.summary === 'string' ? value.summary.trim() : '';
  const coreGenres = toIdentitySignals(value.coreGenres, 3);
  const themes = toIdentitySignals(value.themes, 3);
  const playerStyles = toIdentitySignals(value.playerStyles, 2);
  const negativeSignals = toIdentitySignals(value.negativeSignals, 4);
  if (!summary || coreGenres.length === 0) {
    return null;
  }
  const signalTotalsValue =
    value.signalTotals && typeof value.signalTotals === 'object'
      ? (value.signalTotals as Record<string, unknown>)
      : null;

  return {
    summary,
    coreGenres,
    themes,
    playerStyles,
    negativeSignals,
    signalTotals: signalTotalsValue
      ? {
          coreGenres: toSignalTotal(signalTotalsValue.coreGenres),
          themes: toSignalTotal(signalTotalsValue.themes),
          playerStyles: toSignalTotal(signalTotalsValue.playerStyles),
          negativeSignals: toSignalTotal(signalTotalsValue.negativeSignals),
        }
      : undefined,
  };
};

const parseAnimeIdentityProfile = (
  value: Record<string, unknown> | null | undefined,
): AnimeIdentityProfile | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const summary = typeof value.summary === 'string' ? value.summary.trim() : '';
  const coreGenres = toIdentitySignals(value.coreGenres, 3);
  const topThemes = toIdentitySignals(value.topThemes, 4);
  const viewerStyles = toIdentitySignals(value.viewerStyles, 3);
  const premiumSignals = toIdentitySignals(value.premiumSignals, 4);
  const negativeSignals = toIdentitySignals(value.negativeSignals, 4);
  if (!summary || coreGenres.length === 0) {
    return null;
  }
  return {
    summary,
    coreGenres,
    topThemes,
    viewerStyles,
    premiumSignals,
    negativeSignals,
  };
};

const parseMovieIdentityProfile = (
  value: Record<string, unknown> | null | undefined,
): MovieIdentityProfile | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const summary = typeof value.summary === 'string' ? value.summary.trim() : '';
  const cinematicAxes = toIdentitySignals(value.topClusters, 5).map(signal => ({
    name: signal.name.replace(/^core:/i, '').trim(),
    weight: signal.weight,
  }));

  const toneProfile = (value.toneProfile ?? null) as
    | { primaryTone?: unknown; toneLabels?: unknown }
    | null;
  const toneLabels = Array.isArray(toneProfile?.toneLabels)
    ? toneProfile?.toneLabels
    : [];
  const toneSignals = toneLabels
    .filter((tone): tone is string => typeof tone === 'string' && tone.trim().length > 0)
    .slice(0, 4)
    .map((tone, index) => ({
      name: tone.trim(),
      weight: Math.max(1, 100 - index * 18),
    }));

  if (!summary || cinematicAxes.length === 0) {
    return null;
  }

  return {
    summary,
    cinematicAxes,
    toneSignals,
  };
};

const parseTvIdentityProfile = (
  value: Record<string, unknown> | null | undefined,
): TvIdentityProfile | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const summaryCandidate =
    typeof value.tvIdentitySummary === 'string'
      ? value.tvIdentitySummary
      : typeof value.summary === 'string'
        ? value.summary
        : '';
  const summary = summaryCandidate.trim();
  const coreAxes = toIdentitySignals(value.coreAxes, 5);
  const behavioralAxes = toIdentitySignals(value.behavioralAxes, 5);

  if (!summary || coreAxes.length === 0) {
    return null;
  }

  return {
    summary,
    coreAxes,
    behavioralAxes,
  };
};

const parseBooksIdentityProfile = (
  value: Record<string, unknown> | null | undefined,
): BooksIdentityProfile | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const summaryCandidate =
    typeof value.booksIdentitySummary === 'string'
      ? value.booksIdentitySummary
      : typeof value.summary === 'string'
        ? value.summary
        : '';
  const summary = summaryCandidate.trim();
  const coreAxes = toIdentitySignals(value.coreAxes, 5);
  const readingSignals = toIdentitySignals(value.readingSignals, 5);

  if (!summary || coreAxes.length === 0) {
    return null;
  }

  return {
    summary,
    coreAxes,
    readingSignals,
  };
};

export const toIdentityTraits = (
  signals: IdentitySignal[],
  denominator?: number,
): TasteProfileBarTrait[] => {
  const visibleTotal = signals.reduce((sum, item) => sum + item.weight, 0);
  const total = denominator && denominator > visibleTotal ? denominator : visibleTotal;
  if (total <= 0) {
    return [];
  }
  return signals.map(item => {
    const pct = (item.weight / total) * 100;
    return {
      name: item.name,
      count: 1,
      percentageValue: Math.max(0, Math.min(100, pct)),
      percentageLabel: `${Math.round(pct)}%`,
    };
  });
};

const formatIdentitySummary = (summary: string): string =>
  summary
    .replace(/\s\+\s/g, ' and ')
    .replace(/role-playing-rpg/gi, 'RPG');

const formatTasteTraitLabel = (name: string): string => {
  const raw = (name ?? '').trim();
  if (!raw) {
    return raw;
  }

  const normalized = raw.toLowerCase();
  const override = TRAIT_LABEL_OVERRIDES[normalized];
  if (override) {
    return override;
  }

  return raw
    .split('-')
    .join(' ')
    .split(/\s+/)
    .map(word => (word ? `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}` : word))
    .join(' ');
};

export default function CategoryTasteProfileCard({
  category,
  items,
  profileNote,
}: CategoryTasteProfileCardProps) {
  const gamesIdentity = category === 'games' ? parseGamesIdentityProfile(profileNote) : null;
  const animeIdentity = category === 'anime' ? parseAnimeIdentityProfile(profileNote) : null;
  const moviesIdentity = category === 'movies' ? parseMovieIdentityProfile(profileNote) : null;
  const tvIdentity = category === 'tv' ? parseTvIdentityProfile(profileNote) : null;
  const booksIdentity = category === 'books' ? parseBooksIdentityProfile(profileNote) : null;
  const visibleExtraSections = buildExtraSectionsFromProfile(category, profileNote)
    .map(section => ({
      ...section,
      traits: [...section.traits]
        .filter(trait => trait.percentageValue >= MIN_VISIBLE_PERCENTAGE)
        .sort((a, b) => {
          if (b.percentageValue !== a.percentageValue) {
            return b.percentageValue - a.percentageValue;
          }
          return a.name.localeCompare(b.name);
        })
        .slice(0, MAX_TRAITS_PER_BUCKET),
    }))
    .filter(section => section.traits.length > 0);
  if (category === 'games' && gamesIdentity) {
    const negativeTraits = toIdentityTraits(
      gamesIdentity.negativeSignals,
      gamesIdentity.signalTotals?.negativeSignals,
    );
    const identityBuckets: Array<{ label: string; traits: TasteProfileBarTrait[] }> = [
      {
        label: 'Core Genres',
        traits: toIdentityTraits(gamesIdentity.coreGenres, gamesIdentity.signalTotals?.coreGenres),
      },
      {
        label: 'Top Themes',
        traits: toIdentityTraits(gamesIdentity.themes, gamesIdentity.signalTotals?.themes),
      },
      {
        label: 'Player Styles',
        traits: toIdentityTraits(
          gamesIdentity.playerStyles,
          gamesIdentity.signalTotals?.playerStyles,
        ),
      },
      ...(negativeTraits.length > 0
        ? [{ label: 'Lower-Confidence Avoid Patterns', traits: negativeTraits }]
        : []),
    ];

    return (
      <Card
        className={`col-span-full w-full min-w-0 ${DASH_RADIUS_SECTION} ${DASH_BORDER} bg-muted/[0.055] shadow-none`}
      >
        <CardHeader className="pb-3">
          <DashboardSectionHeader
            eyebrow="Games Taste Profile"
            title="Identity-based profile from completed and in-progress games"
          />
        </CardHeader>
        <CardContent className="space-y-5 overflow-hidden pt-2">
          <p className="text-sm text-muted-foreground">
            {formatIdentitySummary(gamesIdentity.summary)}
          </p>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {identityBuckets.map(bucket => (
              <section
                key={bucket.label}
                className={`min-w-0 space-y-3 ${DASH_RADIUS_CARD} ${DASH_BORDER} ${DASH_SURFACE_CARD} p-3.5 shadow-none`}
              >
                <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground/85">
                  {bucket.label}
                </h4>
                <div className="space-y-3">
                  {bucket.traits.map(trait => (
                    <div key={`${bucket.label}-${trait.name}`} className="min-w-0 space-y-1.5">
                      <div className="flex items-center justify-between gap-3 text-sm leading-tight">
                        <span className="min-w-0 break-words text-foreground">
                          {formatTasteTraitLabel(trait.name)}
                        </span>
                        <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground/80">
                          {trait.percentageLabel}
                        </span>
                      </div>
                      <Progress value={trait.percentageValue} className="h-1.5 bg-muted" />
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }
  if (category === 'anime' && animeIdentity) {
    const premiumTraits = toIdentityTraits(animeIdentity.premiumSignals);
    const negativeTraits = toIdentityTraits(animeIdentity.negativeSignals);
    const identityBuckets: Array<{ label: string; traits: TasteProfileBarTrait[] }> = [
      { label: 'Core Axis', traits: toIdentityTraits(animeIdentity.coreGenres) },
      { label: 'Top Themes', traits: toIdentityTraits(animeIdentity.topThemes) },
      { label: 'Viewer Styles', traits: toIdentityTraits(animeIdentity.viewerStyles) },
      ...(premiumTraits.length > 0 ? [{ label: 'Premium Signals', traits: premiumTraits }] : []),
      ...(negativeTraits.length > 0 ? [{ label: 'Negative Signals', traits: negativeTraits }] : []),
    ];

    return (
      <Card
        className={`col-span-full w-full min-w-0 ${DASH_RADIUS_SECTION} ${DASH_BORDER} bg-muted/[0.055] shadow-none`}
      >
        <CardHeader className="pb-3">
          <DashboardSectionHeader
            eyebrow="Anime Taste Profile"
            title="Identity-based profile from completed and in-progress anime"
          />
        </CardHeader>
        <CardContent className="space-y-5 overflow-hidden pt-2">
          <p className="text-sm text-muted-foreground">
            {formatIdentitySummary(animeIdentity.summary)}
          </p>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {identityBuckets.map(bucket => (
              <section
                key={bucket.label}
                className={`min-w-0 space-y-3 ${DASH_RADIUS_CARD} ${DASH_BORDER} ${DASH_SURFACE_CARD} p-3.5 shadow-none`}
              >
                <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground/85">
                  {bucket.label}
                </h4>
                <div className="space-y-3">
                  {bucket.traits.map(trait => (
                    <div key={`${bucket.label}-${trait.name}`} className="min-w-0 space-y-1.5">
                      <div className="flex items-center justify-between gap-3 text-sm leading-tight">
                        <span className="min-w-0 break-words text-foreground">
                          {formatTasteTraitLabel(trait.name)}
                        </span>
                        <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground/80">
                          {trait.percentageLabel}
                        </span>
                      </div>
                      <Progress value={trait.percentageValue} className="h-1.5 bg-muted" />
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }
  if (category === 'movies' && moviesIdentity) {
    const identityBuckets: Array<{ label: string; traits: TasteProfileBarTrait[] }> = [
      { label: 'Cinematic Axes', traits: toIdentityTraits(moviesIdentity.cinematicAxes) },
      { label: 'Tone Signals', traits: toIdentityTraits(moviesIdentity.toneSignals) },
    ].filter(bucket => bucket.traits.length > 0);

    return (
      <Card
        className={`col-span-full w-full min-w-0 ${DASH_RADIUS_SECTION} ${DASH_BORDER} bg-muted/[0.055] shadow-none`}
      >
        <CardHeader className="pb-3">
          <DashboardSectionHeader
            eyebrow="Movies Taste Profile"
            title="Identity-based cinematic profile from completed and in-progress movies"
          />
        </CardHeader>
        <CardContent className="space-y-5 overflow-hidden pt-2">
          <p className="text-sm text-muted-foreground">
            {formatIdentitySummary(moviesIdentity.summary)}
          </p>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-2">
            {identityBuckets.map(bucket => (
              <section
                key={bucket.label}
                className={`min-w-0 space-y-3 ${DASH_RADIUS_CARD} ${DASH_BORDER} ${DASH_SURFACE_CARD} p-3.5 shadow-none`}
              >
                <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground/85">
                  {bucket.label}
                </h4>
                <div className="space-y-3">
                  {bucket.traits.map(trait => (
                    <div key={`${bucket.label}-${trait.name}`} className="min-w-0 space-y-1.5">
                      <div className="flex items-center justify-between gap-3 text-sm leading-tight">
                        <span className="min-w-0 break-words text-foreground">
                          {formatTasteTraitLabel(trait.name)}
                        </span>
                        <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground/80">
                          {trait.percentageLabel}
                        </span>
                      </div>
                      <Progress value={trait.percentageValue} className="h-1.5 bg-muted" />
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }
  if (category === 'tv' && tvIdentity) {
    const identityBuckets: Array<{ label: string; traits: TasteProfileBarTrait[] }> = [
      { label: 'Core Series Axes', traits: toIdentityTraits(tvIdentity.coreAxes) },
      { label: 'Retention Signals', traits: toIdentityTraits(tvIdentity.behavioralAxes) },
    ].filter(bucket => bucket.traits.length > 0);

    return (
      <Card
        className={`col-span-full w-full min-w-0 ${DASH_RADIUS_SECTION} ${DASH_BORDER} bg-muted/[0.055] shadow-none`}
      >
        <CardHeader className="pb-3">
          <DashboardSectionHeader
            eyebrow="TV Taste Profile"
            title="Identity-based long-form profile from completed and in-progress series"
          />
        </CardHeader>
        <CardContent className="space-y-5 overflow-hidden pt-2">
          <p className="text-sm text-muted-foreground">
            {formatIdentitySummary(tvIdentity.summary)}
          </p>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-2">
            {identityBuckets.map(bucket => (
              <section
                key={bucket.label}
                className={`min-w-0 space-y-3 ${DASH_RADIUS_CARD} ${DASH_BORDER} ${DASH_SURFACE_CARD} p-3.5 shadow-none`}
              >
                <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground/85">
                  {bucket.label}
                </h4>
                <div className="space-y-3">
                  {bucket.traits.map(trait => (
                    <div key={`${bucket.label}-${trait.name}`} className="min-w-0 space-y-1.5">
                      <div className="flex items-center justify-between gap-3 text-sm leading-tight">
                        <span className="min-w-0 break-words text-foreground">
                          {formatTasteTraitLabel(trait.name)}
                        </span>
                        <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground/80">
                          {trait.percentageLabel}
                        </span>
                      </div>
                      <Progress value={trait.percentageValue} className="h-1.5 bg-muted" />
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }
  if (category === 'books' && booksIdentity) {
    const identityBuckets: Array<{ label: string; traits: TasteProfileBarTrait[] }> = [
      { label: 'Core Book Axes', traits: toIdentityTraits(booksIdentity.coreAxes) },
      { label: 'Reading Signals', traits: toIdentityTraits(booksIdentity.readingSignals) },
    ].filter(bucket => bucket.traits.length > 0);

    return (
      <Card
        className={`col-span-full w-full min-w-0 ${DASH_RADIUS_SECTION} ${DASH_BORDER} bg-muted/[0.055] shadow-none`}
      >
        <CardHeader className="pb-3">
          <DashboardSectionHeader
            eyebrow="Books Taste Profile"
            title="Identity-based profile from completed and in-progress books"
          />
        </CardHeader>
        <CardContent className="space-y-5 overflow-hidden pt-2">
          <p className="text-sm text-muted-foreground">
            {formatIdentitySummary(booksIdentity.summary)}
          </p>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-2">
            {identityBuckets.map(bucket => (
              <section
                key={bucket.label}
                className={`min-w-0 space-y-3 ${DASH_RADIUS_CARD} ${DASH_BORDER} ${DASH_SURFACE_CARD} p-3.5 shadow-none`}
              >
                <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground/85">
                  {bucket.label}
                </h4>
                <div className="space-y-3">
                  {bucket.traits.map(trait => (
                    <div key={`${bucket.label}-${trait.name}`} className="min-w-0 space-y-1.5">
                      <div className="flex items-center justify-between gap-3 text-sm leading-tight">
                        <span className="min-w-0 break-words text-foreground">
                          {formatTasteTraitLabel(trait.name)}
                        </span>
                        <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground/80">
                          {trait.percentageLabel}
                        </span>
                      </div>
                      <Progress value={trait.percentageValue} className="h-1.5 bg-muted" />
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const tasteProfile = buildTasteProfile(items, category);
  const categoryLabel = CATEGORY_LABELS[category] ?? 'Category';
  const profileBuckets: TasteProfileBarBucket[] =
    category === 'games'
      ? GAME_VISIBLE_BUCKETS.map(bucket => ({
          bucketKey: bucket,
          traits: (tasteProfile.topBuckets[bucket] ?? []).map(trait => ({
            name: trait.name,
            count: trait.count,
            percentageValue: Math.max(0, Math.min(100, trait.percent)),
            percentageLabel: `${Math.round(trait.percent)}%`,
          })),
        }))
      : [
          {
            bucketKey: 'genre',
            traits: tasteProfile.topGenres.map(trait => ({
              name: trait.name,
              count: trait.count,
              percentageValue: Math.max(0, Math.min(100, trait.percent)),
              percentageLabel: `${Math.round(trait.percent)}%`,
            })),
          },
        ];

  const visibleBuckets = profileBuckets
    .map(bucket => ({
      ...bucket,
      traits: [...bucket.traits]
        .filter(trait => trait.percentageValue >= MIN_VISIBLE_PERCENTAGE)
        .sort((a, b) => {
          if (b.percentageValue !== a.percentageValue) {
            return b.percentageValue - a.percentageValue;
          }
          return a.name.localeCompare(b.name);
        })
        .slice(
          0,
          shouldSplitGenreBuckets(category) && bucket.bucketKey === 'genre'
            ? MAX_SPLIT_TRAITS_PER_BUCKET
            : MAX_TRAITS_PER_BUCKET,
        ),
    }))
    .filter(bucket => (category === 'games' ? true : bucket.traits.length > 0));

  const nonGamesCardCount = visibleBuckets.length + visibleExtraSections.length;
  const nonGamesGridClass =
    nonGamesCardCount <= 1
      ? 'grid-cols-1'
      : nonGamesCardCount === 2
        ? 'md:grid-cols-2'
        : nonGamesCardCount === 3
          ? 'md:grid-cols-2 xl:grid-cols-3'
          : 'md:grid-cols-2 xl:grid-cols-4';

  return (
    <Card
      className={`col-span-full w-full min-w-0 ${DASH_RADIUS_SECTION} ${DASH_BORDER} bg-muted/[0.055] shadow-none`}
    >
      <CardHeader className="pb-3">
        <DashboardSectionHeader
          eyebrow={`${categoryLabel} Taste Profile`}
          title={`Based on ${tasteProfile.totalItems} completed + in-progress ${
            category === 'games' ? 'games' : 'items'
          }`}
        />
      </CardHeader>
      <CardContent className="space-y-5 overflow-hidden pt-2">
        {visibleBuckets.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data yet.</p>
        ) : category === 'games' ? (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {visibleBuckets.map(bucket => (
              <section
                key={bucket.bucketKey}
                className={`min-w-0 space-y-3 ${DASH_RADIUS_CARD} ${DASH_BORDER} ${DASH_SURFACE_CARD} p-3.5 shadow-none`}
              >
                <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground/85">
                  {BUCKET_LABELS[bucket.bucketKey]}
                </h4>
                <div className="space-y-3">
                  {bucket.traits.length === 0 ? (
                    <p className="text-xs text-muted-foreground/80">No data yet.</p>
                  ) : (
                    bucket.traits.map(trait => (
                      <div
                        key={`${bucket.bucketKey}-${trait.name}`}
                        className="min-w-0 space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-3 text-sm leading-tight">
                          <span className="min-w-0 break-words text-foreground">
                            {formatTasteTraitLabel(trait.name)}
                          </span>
                          <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground/80">
                            {trait.percentageLabel}
                          </span>
                        </div>
                        <Progress value={trait.percentageValue} className="h-1.5 bg-muted" />
                      </div>
                    ))
                  )}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className={`grid gap-5 ${nonGamesGridClass}`}>
            {visibleBuckets.map(bucket => (
              <section
                key={bucket.bucketKey}
                className={`min-w-0 space-y-3 ${DASH_RADIUS_CARD} ${DASH_BORDER} ${DASH_SURFACE_CARD} p-3.5 shadow-none`}
              >
                <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground/85">
                  {BUCKET_LABELS[bucket.bucketKey]}
                </h4>
                <div className="space-y-3">
                  {shouldSplitGenreBuckets(category) && bucket.bucketKey === 'genre' ? (
                    (() => {
                      const nonWeak = bucket.traits.filter(
                        trait => !isWeakMetadataGenre(trait.name),
                      );
                      const weak = bucket.traits.filter(trait => isWeakMetadataGenre(trait.name));
                      const topTraits = (nonWeak.length > 0 ? nonWeak : bucket.traits).slice(
                        0,
                        MAX_TRAITS_PER_BUCKET,
                      );
                      const supportingTraits = (
                        weak.length > 0
                          ? weak
                          : nonWeak.slice(MAX_TRAITS_PER_BUCKET, MAX_SPLIT_TRAITS_PER_BUCKET)
                      ).slice(0, MAX_TRAITS_PER_BUCKET);

                      return (
                        <>
                          <div className="space-y-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-muted-foreground/80">
                              Top Genres
                            </p>
                            {topTraits.map(trait => (
                              <div
                                key={`${bucket.bucketKey}-top-${trait.name}`}
                                className="min-w-0 space-y-1.5"
                              >
                                <div className="flex items-center justify-between gap-3 text-sm leading-tight">
                                  <span className="min-w-0 break-words text-foreground">
                                    {formatTasteTraitLabel(trait.name)}
                                  </span>
                                  <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground/80">
                                    {trait.percentageLabel}
                                  </span>
                                </div>
                                <Progress value={trait.percentageValue} className="h-1.5 bg-muted" />
                              </div>
                            ))}
                          </div>
                          {supportingTraits.length > 0 ? (
                            <div className="space-y-3 pt-1">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-muted-foreground/80">
                                Supporting Genres
                              </p>
                              {supportingTraits.map(trait => (
                                <div
                                  key={`${bucket.bucketKey}-support-${trait.name}`}
                                  className="min-w-0 space-y-1.5"
                                >
                                  <div className="flex items-center justify-between gap-3 text-sm leading-tight">
                                    <span className="min-w-0 break-words text-foreground">
                                      {formatTasteTraitLabel(trait.name)}
                                    </span>
                                    <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground/80">
                                      {trait.percentageLabel}
                                    </span>
                                  </div>
                                  <Progress value={trait.percentageValue} className="h-1.5 bg-muted" />
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </>
                      );
                    })()
                  ) : (
                    bucket.traits.map(trait => (
                      <div key={`${bucket.bucketKey}-${trait.name}`} className="min-w-0 space-y-1.5">
                        <div className="flex items-center justify-between gap-3 text-sm leading-tight">
                          <span className="min-w-0 break-words text-foreground">
                            {formatTasteTraitLabel(trait.name)}
                          </span>
                          <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground/80">
                            {trait.percentageLabel}
                          </span>
                        </div>
                        <Progress value={trait.percentageValue} className="h-1.5 bg-muted" />
                      </div>
                    ))
                  )}
                </div>
              </section>
            ))}
            {visibleExtraSections.map(section => (
              <section
                key={section.label}
                className={`min-w-0 space-y-3 ${DASH_RADIUS_CARD} ${DASH_BORDER} ${DASH_SURFACE_CARD} p-3.5 shadow-none`}
              >
                <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground/85">
                  {section.label}
                </h4>
                <div className="space-y-3">
                  {section.traits.map(trait => (
                    <div key={`${section.label}-${trait.name}`} className="min-w-0 space-y-1.5">
                      <div className="flex items-center justify-between gap-3 text-sm leading-tight">
                        <span className="min-w-0 break-words text-foreground">
                          {formatTasteTraitLabel(trait.name)}
                        </span>
                        <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground/80">
                          {trait.percentageLabel}
                        </span>
                      </div>
                      <Progress value={trait.percentageValue} className="h-1.5 bg-muted" />
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
