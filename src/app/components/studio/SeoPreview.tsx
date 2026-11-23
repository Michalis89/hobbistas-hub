import { SITE_URL } from '@/config/site';
import {
  SOURCE_ARTICLE_LOCALE,
  type ArticleLocale,
  type ResolvedArticleSeo,
  type ArticleSeoSource,
} from '@/lib/articles/locales';

/** Roughly where Google truncates, in characters. */
const TITLE_LIMIT = 60;
const DESCRIPTION_LIMIT = 155;

type SeoPreviewProps = {
  /** The values the page will publish, from `resolveArticleSeo`. */
  readonly seo: ResolvedArticleSeo;
  readonly slug: string;
  readonly basePath: string;
  /** The language this preview shows; non-source languages get `?lang=`. */
  readonly locale?: ArticleLocale;
};

/** English names for the Studio's English UI (the shared labels are endonyms). */
const LANGUAGE_NAMES: Record<ArticleLocale, string> = { en: 'English', el: 'Greek' };

const truncate = (value: string, limit: number) =>
  value.length <= limit ? value : `${value.slice(0, limit - 1).trimEnd()}…`;

function Counter({ used, limit }: { used: number; limit: number }) {
  const state = used === 0 ? 'empty' : used > limit ? 'over' : used > limit * 0.9 ? 'near' : 'ok';

  return (
    <span
      className={
        state === 'over'
          ? 'text-destructive'
          : state === 'near'
            ? 'text-warning'
            : 'text-muted-foreground'
      }
    >
      {used}/{limit}
    </span>
  );
}

function sourceLabel(
  source: ArticleSeoSource,
  field: 'title' | 'description',
  locale: ArticleLocale,
): string {
  const own = LANGUAGE_NAMES[locale];
  const base = LANGUAGE_NAMES[SOURCE_ARTICLE_LOCALE];
  const content = field === 'title' ? 'title' : 'standfirst';
  switch (source) {
    case 'translation-meta':
      return `${own} meta ${field}`;
    case 'translation-content':
      return `${own} ${content}`;
    case 'source-meta':
      return locale === SOURCE_ARTICLE_LOCALE ? `meta ${field}` : `${base} meta ${field}`;
    case 'source-content':
      return locale === SOURCE_ARTICLE_LOCALE ? content : `${base} ${content}`;
    default:
      return 'automatic fallback';
  }
}

/**
 * Approximates a search result so the author can see what a reader will
 * actually read before clicking. Shows the resolved values the page
 * publishes, and where each one comes from, so a fallback is never a surprise.
 */
export default function SeoPreview({
  seo,
  slug,
  basePath,
  locale = SOURCE_ARTICLE_LOCALE,
}: SeoPreviewProps) {
  const displayHost = SITE_URL.replace(/^https?:\/\//, '');
  const displayTitle = seo.title || 'Untitled article';
  const query = locale === SOURCE_ARTICLE_LOCALE ? '' : `?lang=${locale}`;
  const usesOtherLanguage = locale !== SOURCE_ARTICLE_LOCALE;

  return (
    <div className="space-y-2" lang={locale}>
      <div className="rounded-xl border border-border bg-background/60 p-3">
        <p className="truncate text-[11px] text-muted-foreground">
          {displayHost}
          {basePath}/{slug || '...'}
          {query}
        </p>
        <p className="mt-1 text-[15px] leading-snug text-[#8ab4f8]">
          {truncate(displayTitle, TITLE_LIMIT)}
        </p>
        <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
          {truncate(seo.description, DESCRIPTION_LIMIT)}
        </p>
      </div>

      <div className="flex justify-between text-[11px]">
        <span className="text-muted-foreground">
          Title <Counter used={seo.title.length} limit={TITLE_LIMIT} />
        </span>
        <span className="text-muted-foreground">
          Description <Counter used={seo.description.length} limit={DESCRIPTION_LIMIT} />
        </span>
      </div>

      <p className="text-[11px] text-muted-foreground" lang="en">
        Title from: {sourceLabel(seo.titleSource, 'title', locale)}. Description from:{' '}
        {sourceLabel(seo.descriptionSource, 'description', locale)}.
        {usesOtherLanguage &&
        (seo.titleSource.startsWith('source') || seo.descriptionSource.startsWith('source'))
          ? ` Falls back to ${LANGUAGE_NAMES[SOURCE_ARTICLE_LOCALE]} where the ${LANGUAGE_NAMES[locale]} fields are empty.`
          : ''}
      </p>
    </div>
  );
}
