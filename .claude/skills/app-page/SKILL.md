---
name: app-page
description: Add or restructure a page in the Next.js App Router — anything under src/app/(main)/ or src/app/(legal)/. Use when creating a new screen or route, adding metadata/SEO to a page, gating a page behind login or a user setting, splitting a server page from its client component, or wiring breadcrumbs, layout shell, and structured data.
---

# Adding a page

Pages live in route groups: `(main)` for the app shell, `(legal)` for legal pages, `api/` for handlers. Route-local components go in a `_components/` folder inside the route directory; anything reused across routes goes in `src/app/components/<domain>/`.

## Default shape: async Server Component

Server Components are the default. Only add `'use client'` when the file itself needs state, effects, or browser APIs — and when it does, prefer keeping the page a server component that renders a thin `...PageClient` child (see `src/app/(main)/diary/page.tsx` → `DiaryPageClient`).

```tsx
import { redirect } from 'next/navigation';
import { createRouteHandlerClient } from '@/lib/supabase-route-handler';
import { getUserSettings } from '@/lib/settings';
import { PageContainer } from '@/app/components/layout';
import { PageHeader } from '@/app/components/layout/PageHeader';
import { buildMetadata } from '@/utils/seo/metadata/helpers';

export const metadata = buildMetadata({
  title: 'Explore',
  description: 'Discover what the community is enjoying',
  path: '/explore',
  noindex: true,
});

export default async function ExplorePage() {
  const supabase = await createRouteHandlerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect('/auth/login');
  }

  const settings = await getUserSettings(session.user.id, { supabase });
  if (!settings.social_profile_enabled) {
    redirect('/settings');
  }

  return (
    <main className="pb-10 pt-6 md:pb-16 md:pt-8">
      <PageContainer size="lg" className="space-y-6">
        <PageHeader title="Explore" description="..." eyebrow="Community" align="left" />
        {/* content */}
      </PageContainer>
    </main>
  );
}
```

## Guard order — do not reorder

1. **Session check** → `redirect('/auth/login')`
2. **Feature-flag check** via `getUserSettings(userId, { supabase })` → `redirect('/settings')`
3. **Role check** for admin pages, using `src/lib/roles.ts` helpers (`isAdminLike`, `isAdminOrModerator`) — never compare role strings inline
4. Data loading

A client-side Redux selector (`selectCanAccessAdminPanel`, etc.) is for hiding UI only. It is never a substitute for a server guard, and the backing API route must guard independently.

## Metadata

Static page:
```tsx
export const metadata = buildMetadata({ title, description, path, noindex });
```

Dynamic page — export `generateMetadata` and await `params` (Next 16: `params` is a Promise):
```tsx
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) { … }
export default function Page({ params }: { params: Promise<{ slug: string }> }) { … }
```

`buildMetadata` (in `src/utils/seo/metadata/helpers.ts`) accepts `{ title, description, path, images, openGraphType, publishedTime, modifiedTime, authors, noindex }`. It normalizes the canonical path, trims the description to 160 chars, and strips a duplicated site-name suffix from the title — so pass the bare title.

Set `noindex: true` for anything behind auth (dashboard, settings, explore, diary, dnd, support, share links). Public content pages stay indexable and should also render JSON-LD via `src/utils/seo/StructuredData.tsx` / `src/utils/seo/metadata/structuredData.ts`.

## Layout primitives

From `src/app/components/layout`: `PageContainer` (sizes `sm` `max-w-4xl` / `md` `max-w-5xl` / `lg`+`xl` `max-w-screen-2xl` / `full`), `PageHeader` (`title`, `description`, `eyebrow`, `align`), `PageShell`, `PageWrapper`, `Footer`. Standard page wrapper is `<main className="pb-10 pt-6 md:pb-16 md:pt-8">` with a `PageContainer size="lg" className="space-y-6"` inside. Use these rather than reinventing spacing — see the `ui-component` skill for tokens.

## Data loading

- Initial load: fetch in the Server Component with `createRouteHandlerClient` (or a helper in `src/lib/dashboard/server-data.ts`-style modules) and pass down as props.
- Client-side/refreshing data: SWR with `apiClient.swrFetcher` from `src/lib/api/client.ts`. That client redirects to login on a 401, which is why raw `fetch` should not be used for authenticated endpoints.
- Do not add a Redux slice. Redux holds auth state only.

## Changing an existing URL

If a page moves, add a permanent redirect in `next.config.ts`. The existing redirects (`/news` → `/articles`, `/reviews` → `/review`, `/pages/backlog` → `/backlog`) are load-bearing for SEO — never delete them. Sitemap regenerates via `next-sitemap` on `postbuild`.

## Verify

```
npm run lint
npm run build
```
Build catches the common failures here: missing `await` on `params`, server-only imports pulled into a client component, and metadata type errors.
