import Link from 'next/link';
import { Languages } from 'lucide-react';
import {
  ARTICLE_LOCALE_LABELS,
  ARTICLE_LOCALE_SHORT_LABELS,
  type ArticleLocale,
} from '@/lib/articles/locales';
import { cn } from '@/lib/utils';

type ArticleLanguageSwitcherProps = {
  /** Languages this article actually has. One means nothing to switch to. */
  readonly available: readonly ArticleLocale[];
  readonly active: ArticleLocale;
  /** Path of the article being read, without a query string. */
  readonly articlePath: string;
  /** Preserved so a preview link does not lose its token on switching. */
  readonly previewToken?: string;
  readonly className?: string;
};

/**
 * Switches the reading language.
 *
 * Plain links rather than buttons: the language is a URL parameter, so each
 * version is addressable, shareable and crawlable, it works before hydration,
 * and the server renders the right text on the first response instead of
 * swapping it in afterwards.
 */
export default function ArticleLanguageSwitcher({
  available,
  active,
  articlePath,
  previewToken,
  className,
}: ArticleLanguageSwitcherProps) {
  if (available.length < 2) {
    return null;
  }

  const hrefFor = (locale: ArticleLocale) => {
    const params = new URLSearchParams();
    params.set('lang', locale);
    if (previewToken) {
      params.set('preview', previewToken);
    }
    return `${articlePath}?${params.toString()}`;
  };

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-border/70 bg-card/70 p-1',
        className,
      )}
    >
      <Languages className="ml-1.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="sr-only">Reading language</span>
      {available.map(locale => {
        const isActive = locale === active;
        return (
          <Link
            key={locale}
            href={hrefFor(locale)}
            // The active language is still a link, not a disabled control: it
            // is the canonical URL for this version and worth being able to copy.
            aria-current={isActive ? 'true' : undefined}
            lang={locale}
            title={ARTICLE_LOCALE_LABELS[locale]}
            className={cn(
              'rounded-full px-2.5 py-1 text-xs font-semibold transition-colors',
              isActive
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground',
            )}
          >
            {ARTICLE_LOCALE_SHORT_LABELS[locale]}
          </Link>
        );
      })}
    </div>
  );
}
