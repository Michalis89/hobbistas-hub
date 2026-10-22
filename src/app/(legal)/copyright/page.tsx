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

/** Change only when the policy text changes. */
const LAST_UPDATED = '22 October 2026';

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
              meta={`Last updated: ${LAST_UPDATED}`}
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
                  This list reflects the elements of a notice under the U.S. Digital Millennium
                  Copyright Act (17 U.S.C. § 512(c)(3)).
                </p>
                <p className="mt-2">
                  If you are in the European Union, you may instead send a notice under Article 16
                  of the Digital Services Act (Regulation (EU) 2022/2065) to the same address. Such
                  a notice should explain why you consider the material illegal, give its exact URL,
                  include your name and email address, and state that you believe in good faith that
                  the information and allegations in it are accurate and complete.
                </p>
                <p className="mt-2">
                  The two procedures are not the same: each notice is assessed under the rules that
                  apply to it, and we will tell you what we decided.
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
                <p className="mt-2">
                  This page describes how we handle notices. It is not legal advice, and it does not
                  by itself decide anyone&apos;s rights or obligations under copyright law, the DMCA
                  or the Digital Services Act.
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
