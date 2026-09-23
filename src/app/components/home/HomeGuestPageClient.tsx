import { PageContainer } from '@/app/components/layout';
import { HomeHero, HomeFeatures, HomeFinalCTA } from '@/app/components/home';

export default function HomeGuestPageClient() {
  return (
    <main>
      <HomeHero />

      <PageContainer size="lg">
        <HomeFeatures />
      </PageContainer>

      <HomeFinalCTA />
    </main>
  );
}
