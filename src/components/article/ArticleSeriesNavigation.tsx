import Link from 'next/link';
import { chapterPath, seriesPath, type PublicSeries } from '@/lib/articles/series';
import type { ArticleLocale } from '@/lib/articles/locales';

export default function ArticleSeriesNavigation({
  series,
  articleId,
  locale,
}: {
  series: PublicSeries;
  articleId: number;
  locale: ArticleLocale;
}) {
  const index = series.chapters.findIndex(chapter => chapter.id === articleId);
  if (index < 0) {
    return null;
  }
  const title = locale === 'el' ? series.translation?.title || series.title : series.title;
  const previous = series.chapters[index - 1];
  const next = series.chapters[index + 1];
  return (
    <nav aria-label="Article series" className="my-8 rounded-xl border border-border bg-card p-5">
      <Link href={seriesPath(series.slug, locale)} className="font-semibold text-primary">
        {title}
      </Link>
      <p className="mt-1 text-sm text-muted-foreground">
        {locale === 'el' ? 'Κεφάλαιο' : 'Chapter'} {index + 1} / {series.chapters.length}
      </p>
      <div className="mt-4 flex flex-wrap justify-between gap-4">
        {previous && (
          <Link href={chapterPath(previous, locale)} className="text-primary">
            ← {locale === 'el' ? previous.title_el || previous.title : previous.title}
          </Link>
        )}
        {next && (
          <Link href={chapterPath(next, locale)} className="ml-auto text-primary">
            {locale === 'el' ? next.title_el || next.title : next.title} →
          </Link>
        )}
      </div>
    </nav>
  );
}
