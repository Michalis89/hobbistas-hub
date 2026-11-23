import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getPublicSeries, chapterPath, seriesPath } from '@/lib/articles/series';
import {
  articleLocaleAlternates,
  type ArticleLocale,
  ARTICLE_OG_LOCALES,
} from '@/lib/articles/locales';
import { buildMetadata } from '@/utils/seo/metadata/helpers';
import StructuredData from '@/utils/seo/StructuredData';
import { getBreadcrumbStructuredData } from '@/utils/seo/metadata/structuredData';
import { SITE_URL } from '@/config/site';
import ArticleLanguageSwitcher from '@/app/components/article/ArticleLanguageSwitcher';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ lang?: string }> };
async function resolve({ params, searchParams }: Props) {
  const [{ slug }, { lang }] = await Promise.all([params, searchParams]);
  const series = await getPublicSeries({ slug });
  if (!series) {
    notFound();
  }
  const locale: ArticleLocale = lang === 'el' && series.translation ? 'el' : 'en';
  const title = locale === 'el' ? series.translation!.title : series.title;
  const description =
    (locale === 'el' ? series.translation!.description : null) || series.description || '';
  return { series, locale, title, description };
}
export async function generateMetadata(props: Props) {
  const { series, locale, title, description } = await resolve(props);
  const locales: ArticleLocale[] = series.translation ? ['en', 'el'] : ['en'];
  const languages = articleLocaleAlternates('/series', series.slug, locales);
  return buildMetadata({
    title,
    description,
    path: seriesPath(series.slug, locale),
    ...(languages ? { languages } : {}),
    ogLocale: ARTICLE_OG_LOCALES[locale],
    ogAlternateLocales: locales.filter(l => l !== locale).map(l => ARTICLE_OG_LOCALES[l]),
    images: series.cover_image ? [{ url: series.cover_image, alt: title }] : undefined,
  });
}
export default async function SeriesPage(props: Props) {
  const { series, locale, title, description } = await resolve(props);
  return (
    <main className="mx-auto max-w-4xl space-y-8 px-4 py-10">
      <StructuredData
        data={getBreadcrumbStructuredData([
          { name: 'Home', url: SITE_URL },
          { name: title, url: `${SITE_URL}${seriesPath(series.slug, locale)}` },
        ])}
      />
      <ArticleLanguageSwitcher
        available={series.translation ? ['en', 'el'] : ['en']}
        active={locale}
        articlePath={`/series/${series.slug}`}
      />
      {series.cover_image && (
        <Image
          src={series.cover_image}
          alt=""
          width={1200}
          height={600}
          unoptimized
          className="max-h-96 w-full rounded-xl object-cover"
        />
      )}
      <header>
        <h1 className="font-serif text-4xl font-bold">{title}</h1>
        {description && <p className="mt-4 text-muted-foreground">{description}</p>}
      </header>
      <ol className="space-y-3">
        {series.chapters.map((chapter, index) => (
          <li key={chapter.id}>
            <Link
              href={chapterPath(chapter, locale)}
              className="hover:bg-surface-hover block rounded-xl border border-border bg-card p-4"
            >
              <span className="mr-3 text-muted-foreground">{index + 1}.</span>
              {locale === 'el' ? chapter.title_el || chapter.title : chapter.title}
            </Link>
          </li>
        ))}
      </ol>
    </main>
  );
}
