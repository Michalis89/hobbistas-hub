import { buildMetadata } from '@/utils/seo/metadata/helpers';
import { PageWrapper } from '@/app/components/layout/PageWrapper';
import OnboardingFlow from './OnboardingFlow';

export const metadata = buildMetadata({
  title: 'Get started | Hobbistas',
  description: 'Pick your hobbies and start tracking in seconds.',
  path: '/onboarding',
  noindex: true,
});

export default function OnboardingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <PageWrapper className="mt-8">
        <OnboardingFlow />
      </PageWrapper>
    </div>
  );
}
