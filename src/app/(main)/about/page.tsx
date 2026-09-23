import getSupabaseServer from '@/lib/supabase-server';
import { createRouteHandlerClient } from '@/lib/supabase-route-handler';
import {
  AboutHero,
  AboutTwoModes,
  AboutWhatYouGet,
  AboutPhilosophy,
  AboutFAQ,
  AboutRoadmap,
  AboutPeople,
  AboutFinalCTA,
  type TeamMember,
} from '@/app/components/about';
import { buildMetadata } from '@/utils/seo/metadata/helpers';
import StructuredData from '@/utils/seo/StructuredData';
import { getBreadcrumbStructuredData } from '@/utils/seo/metadata/structuredData';
import { SITE_URL } from '@/config/site';
import type { ReactNode } from 'react';

export const revalidate = 3600;

type AboutSectionProps = {
  children: ReactNode;
  maxWidthClass?: string;
};

function AboutSection({ children, maxWidthClass = 'max-w-5xl' }: AboutSectionProps) {
  return <div className={`mx-auto w-full px-3 md:px-6 ${maxWidthClass}`}>{children}</div>;
}

export const metadata = buildMetadata({
  title: 'About Hobbistas',
  description: 'Learn who we are, how we work, and why Hobbistas was created for every hobby.',
  path: '/about',
});

async function getTeam(): Promise<TeamMember[]> {
  try {
    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from('users')
      .select('id,username,display_name,roles,bio,avatar_url,country')
      .overlaps('roles', ['owner', 'admin', 'moderator', 'author', 'reviewer']);

    if (error || !data) {
      const details =
        error && typeof error === 'object'
          ? {
              message: 'message' in error ? String(error.message) : undefined,
              code: 'code' in error ? String(error.code) : undefined,
              hint: 'hint' in error ? String(error.hint) : undefined,
              details: 'details' in error ? String(error.details) : undefined,
            }
          : error;
      console.warn('Failed to load team', details);
      return [];
    }

    const userIds = data.map(member => member.id);
    if (userIds.length === 0) {
      return [];
    }

    const { data: categoryProfiles, error: categoryProfilesError } = await supabase
      .from('user_category_profiles')
      .select('user_id,profiles')
      .in('user_id', userIds);

    if (categoryProfilesError) {
      console.warn('Failed to load team category profiles', {
        message: categoryProfilesError.message,
        code: categoryProfilesError.code,
      });
    }

    const favoritePlatformByUserId = new Map<string, string>();
    for (const row of categoryProfiles || []) {
      const rawProfiles = row && typeof row === 'object' && 'profiles' in row ? row.profiles : null;
      let profiles: Record<string, unknown> | null = null;
      if (rawProfiles && typeof rawProfiles === 'object') {
        profiles = rawProfiles as Record<string, unknown>;
      } else if (typeof rawProfiles === 'string') {
        try {
          const parsed = JSON.parse(rawProfiles) as unknown;
          profiles =
            parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
        } catch {
          profiles = null;
        }
      }
      const games =
        profiles && typeof profiles.games === 'object'
          ? (profiles.games as Record<string, unknown>)
          : null;
      const favoritePlatform =
        games && typeof games.favorite_platform === 'string' ? games.favorite_platform.trim() : '';

      if (favoritePlatform) {
        favoritePlatformByUserId.set(row.user_id, favoritePlatform);
      }
    }

    return data.map(member => ({
      ...member,
      favorite_platform: favoritePlatformByUserId.get(member.id) ?? null,
    })) as TeamMember[];
  } catch (err) {
    console.warn('Supabase server error while loading team', err);
    return [];
  }
}

export default async function AboutPage() {
  const team = await getTeam();

  // Check auth status server-side
  const supabase = await createRouteHandlerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const isAuthenticated = !!session;

  const breadcrumb = [
    { name: 'Home', url: `${SITE_URL}/` },
    { name: 'About', url: `${SITE_URL}/about` },
  ];

  return (
    <>
      <StructuredData data={getBreadcrumbStructuredData(breadcrumb)} />
      <main className="pb-14 md:pb-20">
        <AboutHero isAuthenticated={isAuthenticated} />

        <AboutSection>
          <AboutTwoModes />
        </AboutSection>

        <AboutSection>
          <AboutWhatYouGet />
        </AboutSection>

        <AboutSection>
          <AboutPhilosophy />
        </AboutSection>

        <AboutSection maxWidthClass="max-w-4xl">
          <AboutFAQ />
        </AboutSection>

        <AboutSection>
          <AboutRoadmap />
        </AboutSection>

        <AboutSection>
          <AboutPeople team={team} />
        </AboutSection>

        <AboutSection>
          <AboutFinalCTA isAuthenticated={isAuthenticated} />
        </AboutSection>
      </main>
    </>
  );
}
