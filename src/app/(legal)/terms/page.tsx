import Link from 'next/link';
import { buildMetadata } from '@/utils/seo/metadata/helpers';
import StructuredData from '@/utils/seo/StructuredData';
import { getBreadcrumbStructuredData } from '@/utils/seo/metadata/structuredData';
import { SITE_CONTACT_EMAIL, SITE_NAME, SITE_URL } from '@/config/site';
import { PageContainer, PageHeader } from '@/app/components/layout';

export const metadata = buildMetadata({
  title: 'Terms of Service | Hobbistas',
  description: 'Read the Terms of Service for using Hobbistas.',
  path: '/terms',
});

export default function TermsPage() {
  const breadcrumb = [
    { name: 'Home', url: `${SITE_URL}/` },
    { name: 'Terms of Service', url: `${SITE_URL}/terms` },
  ];

  return (
    <>
      <StructuredData data={getBreadcrumbStructuredData(breadcrumb)} />
      <PageContainer size="lg" className="py-12">
        <div className="flex flex-col gap-6">
          {/* Header / Hero */}
          <section className="rounded-3xl border border-border bg-card p-6 shadow-2xl md:p-8">
            <PageHeader
              eyebrow={`${SITE_NAME} • Legal Information`}
              title="Terms of Service"
              description={
                <>
                  These Terms of Service govern your access to and use of{' '}
                  <span className="font-semibold text-primary">{SITE_NAME}</span> (the
                  &quot;Service&quot;) via the website{' '}
                  <a
                    href={SITE_URL}
                    className="font-medium text-primary underline-offset-2 hover:underline"
                  >
                    {SITE_URL.replace('https://', '')}
                  </a>
                  . By creating an account or using the Service, you acknowledge that you have read,
                  understood, and agree to be bound by these Terms.
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

          {/* Content Card */}
          <section className="rounded-3xl border border-border bg-card p-6 text-sm leading-relaxed text-foreground shadow-xl md:p-8 md:text-base">
            <div className="space-y-6">
              {/* 1. Service Identity */}
              <section>
                <h2 className="mb-2 text-lg font-semibold text-foreground">1. Service Identity</h2>
                <p>
                  <span className="font-semibold text-primary">{SITE_NAME}</span> is a web platform
                  for tracking backlog, reviews, and related content around hobbies. The Service is
                  provided on a personal basis and is not an official product of any company.
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Any use of names, logos, trademarks, or terms such as &quot;PlayStation&quot;,
                  &quot;PS5&quot;, &quot;Trophies&quot;, etc. is for descriptive purposes only and
                  belongs to their respective legal owners.
                </p>
              </section>

              {/* 2. Acceptance of Terms */}
              <section>
                <h2 className="mb-2 text-lg font-semibold text-foreground">
                  2. Acceptance of Terms
                </h2>
                <p>
                  By accessing or using the Service, you agree to be bound by these Terms of
                  Service. If you do not agree with any part of these Terms, you must discontinue
                  use of the Service immediately and delete your account if you have one.
                </p>
                <p className="mt-2">
                  The Service is intended for users aged 16 or older. By using the Service, you
                  represent that you are at least 16 years of age.
                </p>
              </section>

              {/* 3. User Account */}
              <section>
                <h2 className="mb-2 text-lg font-semibold text-foreground">
                  3. User Account &amp; Security
                </h2>
                <p>
                  To fully use the Service, you may need to create an account using an email address
                  and password or other authentication methods. You are solely responsible for:
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>maintaining the confidentiality of your login credentials,</li>
                  <li>all activities that occur under your account,</li>
                  <li>
                    providing accurate and current profile information (where you choose to provide
                    it).
                  </li>
                </ul>
                <p className="mt-2">
                  If you suspect unauthorized use of your account, you should change your password
                  and, if necessary, contact us.
                </p>
              </section>

              {/* 4. User Content */}
              <section>
                <h2 className="mb-2 text-lg font-semibold text-foreground">4. User Content</h2>
                <p>
                  The Service may allow you to create or submit content, such as text, comments,
                  ratings, and similar materials (&quot;User Content&quot;). You retain ownership of
                  your intellectual property rights in your User Content, but by publishing it:
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>
                    you grant us a non-exclusive, worldwide, royalty-free license to use, display,
                    and store the User Content in connection with operating the Service,
                  </li>
                  <li>
                    you represent that your content does not violate third-party rights (including
                    intellectual property, personal data, trademarks, etc.).
                  </li>
                </ul>
                <p className="mt-2">
                  We reserve the right (but have no obligation) to remove content that we determine
                  violates these Terms, applicable law, or is otherwise inappropriate.
                </p>
                <p className="mt-2">
                  If you believe content on the Service infringes your copyright, please follow our{' '}
                  <Link
                    href="/copyright"
                    className="font-medium text-primary underline-offset-2 hover:underline"
                  >
                    Copyright &amp; Takedown Policy
                  </Link>
                  .
                </p>
              </section>

              {/* 5. Acceptable Use */}
              <section>
                <h2 className="mb-2 text-lg font-semibold text-foreground">5. Acceptable Use</h2>
                <p>You may not use the Service to:</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>engage in illegal activities or violate the rights of others,</li>
                  <li>post offensive, racist, abusive, pornographic, or violent content,</li>
                  <li>send spam, use automated scripts, scrape content, or attack the system,</li>
                  <li>attempt unauthorized access to data or accounts,</li>
                  <li>
                    use the Service in any manner that could damage, overload, or destabilize the
                    platform.
                  </li>
                </ul>
                <p className="mt-2">
                  In case of violation, we may suspend or delete your account and remove related
                  content without prior notice.
                </p>
              </section>

              {/* 6. Intellectual Property */}
              <section>
                <h2 className="mb-2 text-lg font-semibold text-foreground">
                  6. Intellectual Property &amp; Trademarks
                </h2>
                <p>
                  All content of the Service (interface, design, platform logos, text, UI elements,
                  etc.), excluding User Content and third-party trademarks, belongs to the creator
                  of <span>{SITE_NAME}</span> and is protected by applicable law.
                </p>
                <p className="mt-2">
                  Third-party trademarks, logos, and product names belong to their respective legal
                  owners and are used for descriptive purposes only. The Service is not affiliated
                  with, endorsed by, or owned by any company.
                </p>
              </section>

              {/* 7. Availability & Modifications */}
              <section>
                <h2 className="mb-2 text-lg font-semibold text-foreground">
                  7. Availability &amp; Modifications
                </h2>
                <p>
                  The Service is provided &quot;as is&quot; and &quot;as available&quot;, without
                  warranties of continuous operation, absence of errors, or complete accuracy of
                  information. We may discontinue, modify, or remove features at any time without
                  prior notice.
                </p>
                <p className="mt-2">
                  We also reserve the right to update these Terms of Service. When material changes
                  are made, you may be notified via the Service or by email. Continued use of the
                  Service after changes indicates acceptance of the updated Terms.
                </p>
              </section>

              {/* 8. Limitation of Liability */}
              <section>
                <h2 className="mb-2 text-lg font-semibold text-foreground">
                  8. Limitation of Liability
                </h2>
                <p>
                  To the maximum extent permitted by applicable law, we are not liable for any
                  direct or indirect damages, loss of data, profits, or any other form of loss that
                  may arise from:
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>your use of or inability to use the Service,</li>
                  <li>any errors, omissions, or inaccuracies in content,</li>
                  <li>unauthorized access to or use of accounts, servers, or databases,</li>
                  <li>any interruption, delay, or malfunction of the Service.</li>
                </ul>
              </section>

              {/* 9. Personal Data */}
              <section>
                <h2 className="mb-2 text-lg font-semibold text-foreground">
                  9. Personal Data Protection
                </h2>
                <p>
                  The processing of your personal data is governed by our{' '}
                  <Link
                    href="/privacy"
                    className="font-medium text-primary underline-offset-2 hover:underline"
                  >
                    Privacy Policy
                  </Link>
                  , which forms an integral part of these Terms. Please read it carefully, as it
                  describes in detail what data we collect, for what purposes, and what rights you
                  have under applicable legal frameworks (including GDPR).
                </p>
              </section>

              {/* 10. Account Termination */}
              <section>
                <h2 className="mb-2 text-lg font-semibold text-foreground">
                  10. Account Termination &amp; Deletion
                </h2>
                <p>
                  You may delete your account at any time through your profile settings, if
                  available, or by contacting us. Upon deletion, data that identifies you may be
                  deleted or anonymized in accordance with our Privacy Policy.
                </p>
                <p className="mt-2">
                  We reserve the right to suspend or close accounts that violate these Terms,
                  applicable law, or misuse the Service.
                </p>
              </section>

              {/* 11. Applicable Law */}
              <section>
                <h2 className="mb-2 text-lg font-semibold text-foreground">
                  11. Applicable Law &amp; Dispute Resolution
                </h2>
                <p>
                  These Terms are governed by Greek law. Any disputes arising from these Terms that
                  cannot be resolved amicably shall be subject to the jurisdiction of the courts of
                  Greece.
                </p>
              </section>

              {/* 12. Contact */}
              <section>
                <h2 className="mb-2 text-lg font-semibold text-foreground">12. Contact</h2>
                <p>
                  For any questions regarding these Terms of Service or the Service itself, you may
                  contact us at:
                </p>
                <p className="mt-1 font-medium text-primary">{SITE_CONTACT_EMAIL}</p>
              </section>

              <p className="pt-4 text-xs text-muted-foreground opacity-70">
                These terms are provided for informational purposes and may be further adapted or
                refined with legal counsel as the Service evolves.
              </p>
            </div>
          </section>
        </div>
      </PageContainer>
    </>
  );
}
