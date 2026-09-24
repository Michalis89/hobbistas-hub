import type { Metadata } from 'next';
import { Suspense } from 'react';
import getSupabaseServer from '@/lib/supabase-server';
import { createRouteHandlerClient } from '@/lib/supabase-route-handler';
import { Skeleton } from '@/components/ui/skeleton';
import PublicBacklogClient from '@/app/(main)/u/[username]/backlog/PublicBacklogClient';
import type { MediaCategory } from '@/app/components/backlog/types';

export const dynamic = 'force-dynamic';

const isTokenExpired = (expiresAt: string | null | undefined) =>
  Boolean(expiresAt && new Date(expiresAt).getTime() <= Date.now());

type PageProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ category?: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const supabase = getSupabaseServer();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tokenRow } = (await (supabase as any)
    .from('share_tokens')
    .select('user_id,expires_at')
    .eq('token', token)
    .maybeSingle()) as { data: { user_id: string; expires_at: string | null } | null };

  if (!tokenRow || isTokenExpired(tokenRow.expires_at)) {
    // A dead token has to carry the same `noindex` as a live one: otherwise
    // an expired share link is the one share URL that is indexable.
    return { title: 'Invalid Share Link | Hobbistas', robots: { index: false } };
  }

  const { data: user } = await supabase
    .from('users')
    .select('username')
    .eq('id', tokenRow.user_id)
    .maybeSingle();

  return {
    title: user ? `${user.username}'s Library | Hobbistas` : 'Shared Library | Hobbistas',
    description: 'Browse a shared read-only media library on Hobbistas.',
    robots: { index: false },
  };
}

function PageSkeleton() {
  return (
    <div className="space-y-4 px-4 py-6 md:px-6 md:py-8">
      <Skeleton className="h-9 w-48" />
      <div className="flex gap-2">
        <Skeleton className="h-10 w-24 rounded-full" />
        <Skeleton className="h-10 w-24 rounded-full" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-28 w-full rounded-2xl" />
      </div>
    </div>
  );
}

function InvalidLink({ message }: { message: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <p className="text-2xl font-semibold text-foreground">Invalid Share Link</p>
      <p className="mt-2 text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

export default async function ShareTokenPage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const { category } = await searchParams;

  try {
    const supabase = getSupabaseServer();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: tokenRow, error: tokenError } = (await (supabase as any)
      .from('share_tokens')
      .select('user_id,expires_at')
      .eq('token', token)
      .maybeSingle()) as {
      data: { user_id: string; expires_at: string | null } | null;
      error: { message?: string } | null;
    };

    if (tokenError) {
      console.error('[share/token] DB error:', tokenError);
      return <InvalidLink message="Could not verify this share link. Please try again later." />;
    }

    if (!tokenRow || isTokenExpired(tokenRow.expires_at)) {
      return <InvalidLink message="This share link is invalid or has been revoked." />;
    }

    const { data: user } = await supabase
      .from('users')
      .select('id,username')
      .eq('id', tokenRow.user_id)
      .maybeSingle();

    if (!user) {
      return <InvalidLink message="The owner of this link could not be found." />;
    }

    const { data: categoryProfile } = await supabase
      .from('user_category_profiles')
      .select('profiles')
      .eq('user_id', user.id)
      .maybeSingle();
    const profiles = (categoryProfile?.profiles as Record<string, unknown> | null) ?? null;
    const profileKeys = profiles ? Object.keys(profiles) : [];
    const defaultCategory: MediaCategory =
      (category as MediaCategory | undefined) ??
      (profileKeys[0] as MediaCategory | undefined) ??
      'anime';

    const routeClient = await createRouteHandlerClient();
    const {
      data: { session },
    } = await routeClient.auth.getSession();
    const canToggleFavorite = session?.user?.id === user.id;

    return (
      <Suspense fallback={<PageSkeleton />}>
        <PublicBacklogClient
          userId={user.id}
          username={user.username}
          defaultCategory={defaultCategory}
          canToggleFavorite={canToggleFavorite}
          shareToken={token}
        />
      </Suspense>
    );
  } catch (err) {
    console.error('[share/token] Unexpected error:', err);
    return <InvalidLink message="Something went wrong. Please try again later." />;
  }
}
