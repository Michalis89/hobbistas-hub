import Link from 'next/link';
import { buildMetadata } from '@/utils/seo/metadata/helpers';
import StructuredData from '@/utils/seo/StructuredData';
import { getBreadcrumbStructuredData } from '@/utils/seo/metadata/structuredData';
import { SITE_CONTACT_EMAIL, SITE_NAME, SITE_URL } from '@/config/site';
import { PageContainer, PageHeader } from '@/app/components/layout';

export const metadata = buildMetadata({
  title: 'Copyright & Takedown Policy | Hobbistas',
  description:
    'How Hobbistas handles copyrighted material, and how to ask for content to be removed.',
  path: '/copyright',
});

const linkClass = 'font-medium text-primary underline-offset-2 hover:underline';

export default function CopyrightPage() {
  const breadcrumb = [
    { name: 'Home', url: `${SITE_URL}/` },
    { name: 'Copyright & Takedown Policy', url: `${SITE_URL}/copyright` },
  ];

  return (
    <>
      <StructuredData data={getBreadcrumbStructuredData(breadcrumb)} />
      <PageContainer size="lg" className="py-12">
        <div className="flex flex-col gap-6">
          <section className="rounded-3xl border border-border bg-card p-6 shadow-2xl md:p-8">
            <PageHeader
              eyebrow={`${SITE_NAME} • Legal Information`}
              title="Copyright & Takedown Policy"
              description={
                <>
                  <span className="font-semibold text-primary">{SITE_NAME}</span> respects the
                  rights of authors, artists and publishers. This page explains where the media
                  information and images on the Service come from, and how a rights holder can ask
                  for something to be removed.
                </>
              }
              meta={`Last updated: ${new Date().getFullYear()}`}
              align="left"
              contentClassName="items-start"
              titleClassName="mt-2 text-3xl font-extrabold tracking-tight md:text-4xl"
              eyebrowClassName="tracking-[0.25em] text-muted-foreground"
              descriptionClassName="text-sm leading-relaxed text-foreground md:text-base"
              metaClassName="text-xs text-muted-foreground opacity-70"
            />
          </section>

          <section className="rounded-3xl border border-border bg-card p-6 text-sm leading-relaxed text-foreground shadow-xl md:p-8 md:text-base">
            <div className="space-y-6">
              <section>
                <h2 className="mb-2 text-lg font-semibold text-foreground">
                  1. Where media information comes from
                </h2>
                <p>
                  Titles, descriptions and cover images of books, games, films, series, anime and
                  manga are retrieved from third-party catalogues, including Google Books, Open
                  Library, the National Library of Greece, Hardcover, IGDB, TMDB and MyAnimeList.
                  Some of these catalogues are maintained by their own users.
                </p>
                <p className="mt-2">
                  Cover images and other artwork belong to their respective publishers, artists and
                  rights holders. They are shown only to identify the work a user is tracking or
                  discussing, and {SITE_NAME} claims no ownership of them.
                </p>
              </section>

              <section>
                <h2 className="mb-2 text-lg font-semibold text-foreground">
                  2. Reporting infringing material
                </h2>
                <p>
                  If you believe material on the Service infringes a copyright you own or are
                  authorised to act for, send a notice to{' '}
                  <a href={`mailto:${SITE_CONTACT_EMAIL}`} className={linkClass}>
                    {SITE_CONTACT_EMAIL}
                  </a>{' '}
                  with the subject line &quot;Copyright notice&quot;, including:
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>the copyrighted work you believe has been infringed;</li>
                  <li>
                    the exact URL(s) on {SITE_NAME} where the material appears, enough for us to
                    find it;
                  </li>
                  <li>your name, postal address, telephone number and email address;</li>
                  <li>
                    a statement that you have a good-faith belief that the use is not authorised by
                    the rights holder, its agent or the law;
                  </li>
                  <li>
                    a statement that the information in the notice is accurate and that you are the
                    rights holder or authorised to act on its behalf;
                  </li>
                  <li>your physical or electronic signature.</li>
                </ul>
                <p className="mt-2">
                  These elements follow the notice requirements of the U.S. Digital Millennium
                  Copyright Act (17 U.S.C. § 512(c)(3)). Notices from the European Union are equally
                  welcome under the notice-and-action procedure of the Digital Services Act
                  (Regulation (EU) 2022/2065, Article 16), and are handled the same way.
                </p>
              </section>

              <section>
                <h2 className="mb-2 text-lg font-semibold text-foreground">3. What happens next</h2>
                <p>
                  When we receive a complete notice we review it promptly and, where it is
                  justified, remove or disable access to the material. Because most images come from
                  external catalogues, removing an image from {SITE_NAME} does not remove it from
                  its original source; where relevant we will tell you which catalogue it came from.
                </p>
                <p className="mt-2">
                  If the material was posted by a user, we will let that user know it was removed
                  and why.
                </p>
              </section>

              <section>
                <h2 className="mb-2 text-lg font-semibold text-foreground">4. Counter-notice</h2>
                <p>
                  If content you posted was removed and you believe that was a mistake or that you
                  have the right to use it, you may reply to us at the same address explaining why,
                  with your contact details and signature. If the counter-notice is valid we may
                  restore the material, unless the original complainant tells us they have started
                  legal proceedings.
                </p>
              </section>

              <section>
                <h2 className="mb-2 text-lg font-semibold text-foreground">5. Repeat infringers</h2>
                <p>
                  Accounts that repeatedly post infringing material may be suspended or closed, as
                  described in our{' '}
                  <Link href="/terms" className={linkClass}>
                    Terms of Service
                  </Link>
                  .
                </p>
              </section>

              <section>
                <h2 className="mb-2 text-lg font-semibold text-foreground">6. Misuse</h2>
                <p>
                  Please only send a notice for material you have the rights to. Knowingly false
                  notices or counter-notices may carry legal consequences for the sender.
                </p>
              </section>
            </div>
          </section>
        </div>
      </PageContainer>
    </>
  );
}
