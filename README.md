<div align="center">
  <img src="public/og-image.jpg" alt="Hobbistas Logo" width="320">

  <h1>Hobbistas</h1>

  <p>
    <strong>A unified hobby tracking platform for games, anime, movies, books, TV shows, and more</strong>
  </p>

  <p>
    <a href="https://hobbistas-hub.com">Live App</a> &bull;
    <a href="#features">Features</a> &bull;
    <a href="#tech-stack">Tech Stack</a> &bull;
    <a href="#getting-started">Getting Started</a> &bull;
    <a href="#api-reference">API Reference</a> &bull;
    <a href="#deployment">Deployment</a>
  </p>

  <p>
    <img src="https://img.shields.io/badge/version-1.6.10-blue" alt="Version">
    <img src="https://img.shields.io/badge/Next.js-16-black?logo=next.js" alt="Next.js">
    <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react" alt="React">
    <img src="https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript" alt="TypeScript">
    <img src="https://img.shields.io/badge/Tailwind-3.4-38B2AC?logo=tailwind-css" alt="Tailwind">
    <img src="https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase" alt="Supabase">
    <img src="https://img.shields.io/badge/PWA-enabled-purple?logo=googlechrome" alt="PWA">
  </p>
</div>

---

## Overview

Hobbistas is a full-stack hobby hub that consolidates games, anime, manga, movies, TV shows, and books into a single backlog, activity feed, and social content platform. It ships as a **Progressive Web App** with offline support, push notifications, and background sync — installable on any device.

---

## Features

### Core Library

- **Multi-Category Tracking** — Games, anime, manga, movies, TV, and books with status (playing/watching/reading/completed/dropped/paused) and progress
- **Unified Media System** — One interface, one database, six media types
- **External Metadata Fetching** — Auto-pull metadata from RAWG/IGDB, MyAnimeList, TMDB, and Google Books
- **Backlog Management** — Personal backlog with priority, pinning, and drag-and-drop reordering
- **Personal Diary** — Encrypted private journal tied to your hobby activity

### Platform Integrations

- **Steam** — Import your Steam library with sync status tracking
- **MyAnimeList (MAL)** — Full OAuth flow to import and sync your anime/manga lists
- **PlayStation Network (PSN)** — PSN ID linking and game tracking

### Social & Community

- **Articles** — News, reviews, and community content with rich-text authoring
- **Likes & Comments** — Per-article social engagement with race-condition-safe atomic operations
- **Activity Feed** — Real-time personal and community activity stream
- **View Tracking** — Content engagement analytics

### Dashboard & Discovery

- **Personalized Dashboard** — Continues, suggestions, and favorites based on your history
- **Genre Affinity** — Analyzes your library to surface genre preferences
- **Category Profiles** — Per-hobby statistics and progress summaries
- **Explore** — Browse and discover media across all categories

### Admin & Moderation

- **Role-Based Access** — Six roles: `user`, `author`, `reviewer`, `moderator`, `admin`, `owner`
- **Admin Panel** — User management, support ticket handling, system logs
- **Data Curation Tools** — Search and bulk-import from IGDB, MAL, TMDB, and Google Books
- **Support System** — User-facing ticket submission with admin reply and status tracking

### Progressive Web App (PWA)

- **Installable** — Add to home screen on Android, iOS, and desktop
- **Offline Support** — Cached pages and API responses with multiple Workbox strategies
- **Push Notifications** — Subscribe to updates; notifications deep-link into the app
- **Background Sync** — Library changes queued in IndexedDB while offline; auto-flushed when reconnected
- **Offline Fallback** — Dedicated `/offline` page when content can't be fetched

### Content Tools

- **Rich Text Editor** — Full Tiptap editor with headings, links, images, code blocks, and bubble menu
- **Article Cover Uploads** — Server-side image upload to Supabase Storage
- **SEO** — Metadata builders, structured data, and auto-generated sitemaps
- **D&D Tools** — Campaign management and DM tools section

---

## Tech Stack

| Layer              | Technology                           |
| ------------------ | ------------------------------------ |
| **Framework**      | Next.js 16 (App Router)              |
| **UI**             | React 19, Tailwind CSS, Radix UI     |
| **State**          | Redux Toolkit, SWR                   |
| **Database**       | Supabase (PostgreSQL)                |
| **Auth**           | Supabase Auth (JWT + SSR)            |
| **Rich Text**      | Tiptap 3                             |
| **Charts**         | Recharts                             |
| **Drag & Drop**    | @dnd-kit                             |
| **Animation**      | Framer Motion                        |
| **PWA**            | @ducanh2912/next-pwa + Workbox       |
| **Rate Limiting**  | Upstash Redis + @upstash/ratelimit   |
| **Email**          | Resend                               |
| **Virtualization** | @tanstack/react-virtual              |
| **Testing**        | Jest, React Testing Library, Cypress |
| **Deploy**         | Vercel                               |
| **Analytics**      | Vercel Analytics + Speed Insights    |

### External APIs

| API                   | Purpose                        |
| --------------------- | ------------------------------ |
| **IGDB / RAWG**       | Game metadata and search       |
| **MyAnimeList (MAL)** | Anime & manga database + OAuth |
| **TMDB**              | Movies and TV information      |
| **Google Books**      | Book search and metadata       |
| **Steam**             | Game library import            |
| **PSN API**           | PlayStation game tracking      |
| **Resend**            | Transactional email            |

---

## Database Schema

26 sequential migrations live in `supabase-migrations/`. The schema is built around a unified media model.

### Core Tables

| Table                | Purpose                                               |
| -------------------- | ----------------------------------------------------- |
| `users`              | Accounts, roles, profile data                         |
| `media_items`        | All media (games, anime, movies, books, TV, manga)    |
| `user_media_entries` | Per-user library entries — status, progress, priority |
| `articles`           | News, reviews, community posts                        |
| `article_likes`      | Unique-constrained like records per user/article      |
| `article_comments`   | Comments with author profiles                         |
| `activity_log`       | JSONB event log for the activity feed                 |
| `push_subscriptions` | PWA Web Push endpoint subscriptions                   |
| `support_tickets`    | User support tickets with admin reply thread          |

### Media Categories

The `media_items` table supports: `games`, `anime`, `manga`, `movies`, `tv`, `books`

### Role System

```
owner > admin > moderator > reviewer > author > user
```

---

## Project Structure

```
src/
├── app/
│   ├── (main)/                 # Authenticated user experience
│   │   ├── home/               # Personalized dashboard
│   │   ├── backlog/            # Backlog management
│   │   ├── diary/              # Encrypted personal diary
│   │   ├── explore/            # Content discovery
│   │   ├── profile/            # User profiles + edit
│   │   ├── articles/           # Articles listing + [slug]
│   │   ├── review/             # Reviews + [slug]
│   │   ├── media/[category]/   # Media detail pages
│   │   ├── settings/           # Account settings + integrations
│   │   ├── support/            # User support tickets
│   │   ├── admin/              # Admin panel (role-gated)
│   │   │   └── support/        # Tickets, users, logs, data curation
│   │   └── dnd/                # D&D campaign + DM tools
│   ├── (legal)/                # Privacy, terms
│   ├── auth/                   # Login, register, reset, confirm
│   ├── offline/                # PWA offline fallback
│   ├── api/                    # Route handlers (see API Reference)
│   └── components/             # Shared UI components, modals, editors
├── store/                      # Redux slices + store
├── context/                    # React context providers
├── lib/
│   ├── supabase/               # Clients, types, validation, RLS helpers
│   ├── services/               # External API adapters
│   ├── dashboard/              # Personalization + narrative logic
│   ├── diary/                  # Diary encryption + hooks
│   ├── igdb/                   # IGDB token management + queries
│   ├── cache/                  # Next.js cache tag helpers
│   ├── email/                  # Resend templates
│   ├── roles.ts                # Role hierarchy helpers
│   ├── rate-limit.ts           # Upstash rate limiting
│   └── validation/             # Shared input validators
├── worker/                     # PWA service worker source (Workbox)
├── config/                     # Site constants, SEO strings, roadmap
├── utils/
│   ├── seo/                    # Metadata + structured data builders
│   └── security/               # HTML sanitizers, slugify
├── types/                      # Supabase-generated TypeScript types
└── data/                       # Static genres, categories
supabase-migrations/            # 26 ordered SQL migrations + RLS policies
docs/private/                   # Architecture & audit playbooks
```

---

## API Reference

### Authentication

| Method | Endpoint                    | Description            |
| ------ | --------------------------- | ---------------------- |
| POST   | `/api/auth/login`           | User login             |
| POST   | `/api/auth/register`        | User registration      |
| POST   | `/api/auth/logout`          | User logout            |
| GET    | `/api/auth/session`         | Get current session    |
| POST   | `/api/auth/refresh`         | Refresh token          |
| POST   | `/api/auth/forgot-password` | Request password reset |
| POST   | `/api/auth/update-password` | Update password        |
| DELETE | `/api/auth/delete-account`  | Delete account         |

### Media Library (per `{category}`: games, anime, manga, movies, tv, books)

| Method | Endpoint                      | Description                |
| ------ | ----------------------------- | -------------------------- |
| GET    | `/api/{category}/library`     | Get user's library         |
| PATCH  | `/api/{category}/library`     | Update library entry       |
| DELETE | `/api/{category}/library`     | Remove from library        |
| GET    | `/api/{category}/search`      | Search media (local + API) |
| POST   | `/api/{category}/add`         | Add item to library        |
| GET    | `/api/{category}/suggestions` | Personalised suggestions   |

### Articles & Social

| Method | Endpoint                      | Description           |
| ------ | ----------------------------- | --------------------- |
| GET    | `/api/articles`               | List articles         |
| POST   | `/api/articles`               | Create article        |
| GET    | `/api/articles/[id]`          | Get article           |
| PATCH  | `/api/articles/[id]`          | Update article        |
| DELETE | `/api/articles/[id]`          | Delete article        |
| GET    | `/api/articles/[id]/like`     | Get like state        |
| POST   | `/api/articles/[id]/like`     | Like / unlike article |
| GET    | `/api/articles/[id]/comments` | Get comments          |
| POST   | `/api/articles/[id]/comments` | Add comment           |

### User & Dashboard

| Method | Endpoint                           | Description               |
| ------ | ---------------------------------- | ------------------------- |
| GET    | `/api/me`                          | Current user info         |
| GET    | `/api/me/category-profile`         | Per-category statistics   |
| GET    | `/api/me/genre-affinity`           | Genre preference analysis |
| GET    | `/api/user/stats`                  | Library statistics        |
| GET    | `/api/activity`                    | Activity feed             |
| GET    | `/api/dashboard/suggestions`       | Personalised suggestions  |
| POST   | `/api/dashboard/reorder-favorites` | Reorder favourites        |
| POST   | `/api/dashboard/reorder-pins`      | Reorder pinned items      |

### Integrations

| Method | Endpoint                               | Description        |
| ------ | -------------------------------------- | ------------------ |
| GET    | `/api/integrations/mal/start`          | Start MAL OAuth    |
| GET    | `/api/integrations/mal/callback`       | MAL OAuth callback |
| POST   | `/api/integrations/mal/sync`           | Sync MAL library   |
| POST   | `/api/integrations/steam/sync/start`   | Start Steam import |
| GET    | `/api/integrations/steam/sync/status`  | Check sync status  |
| POST   | `/api/integrations/steam/sync/process` | Process Steam data |

### Notifications

| Method | Endpoint                       | Description                     |
| ------ | ------------------------------ | ------------------------------- |
| POST   | `/api/notifications/subscribe` | Subscribe to push notifications |
| DELETE | `/api/notifications/subscribe` | Unsubscribe                     |
| POST   | `/api/notifications/send`      | Send a push notification        |
| POST   | `/api/notifications/events`    | Track notification interaction  |

### Support

| Method | Endpoint                             | Description         |
| ------ | ------------------------------------ | ------------------- |
| GET    | `/api/support/tickets`               | List user tickets   |
| POST   | `/api/support/tickets`               | Submit ticket       |
| GET    | `/api/support/tickets/[id]`          | Get ticket          |
| GET    | `/api/support/tickets/[id]/messages` | Get ticket messages |
| POST   | `/api/support/tickets/[id]/messages` | Add message         |

### Admin (requires `admin` or `owner` role)

| Method | Endpoint                                | Description             |
| ------ | --------------------------------------- | ----------------------- |
| GET    | `/api/admin/support/tickets`            | All support tickets     |
| PUT    | `/api/admin/support/tickets/[id]`       | Update ticket status    |
| POST   | `/api/admin/support/tickets/[id]/reply` | Reply to ticket         |
| GET    | `/api/admin/support/users`              | List all users          |
| PUT    | `/api/admin/support/users/[id]`         | Update user role/status |
| GET    | `/api/admin/logs`                       | System logs             |
| GET    | `/api/admin/media/entries`              | Browse media entries    |
| POST   | `/api/admin/media/import/igdb`          | Bulk import from IGDB   |
| POST   | `/api/admin/media/import/mal`           | Bulk import from MAL    |
| POST   | `/api/admin/media/import/tmdb`          | Bulk import from TMDB   |
| POST   | `/api/admin/media/import/books`         | Bulk import from Books  |

### Utilities

| Method | Endpoint                     | Description           |
| ------ | ---------------------------- | --------------------- |
| POST   | `/api/track-view`            | Track content views   |
| GET    | `/api/analytics/summary`     | Analytics overview    |
| GET    | `/api/public/stats`          | Public platform stats |
| POST   | `/api/uploads/article-cover` | Upload article cover  |

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Supabase account (free tier works)
- Upstash Redis account (for rate limiting)

### Installation

```bash
git clone https://github.com/Michalis89/hobbistas-hub.git
cd hobbistas-hub
npm install
```

### Environment Setup

Copy `.env.example` to `.env.local` and fill in the values:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=anon-public-key
SUPABASE_SERVICE_ROLE_KEY=service-role-key

# Site
SITE_URL=https://hobbistas-hub.com/
NEXT_PUBLIC_CONTACT_EMAIL=ops@example.com

# Rate limiting (Upstash Redis)
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token

# Transactional email
RESEND_API_KEY=re_...

# External APIs (optional but recommended)
TWITCH_CLIENT_ID=         # IGDB auth
TWITCH_CLIENT_SECRET=     # IGDB auth
MAL_CLIENT_ID=            # Anime/manga
MAL_CLIENT_SECRET=        # Anime/manga
GOOGLE_BOOKS_API_KEY=     # Books

# PWA Push Notifications (VAPID)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
```

### Development

```bash
npm run dev       # Start dev server (localhost:3000)
npm run lint      # ESLint
npm test          # Jest unit tests
```

### Database Setup

Run migrations sequentially in the Supabase SQL editor, or via the CLI:

```bash
supabase db push
```

Migrations live in `supabase-migrations/` and are numbered `01` through `26`.

---

## Scripts

| Script                 | Description                           |
| ---------------------- | ------------------------------------- |
| `npm run dev`          | Start development server              |
| `npm run build`        | Production build                      |
| `npm run start`        | Start production server               |
| `npm run ci`           | Lint + test + build (CI pipeline)     |
| `npm run lint`         | Run ESLint                            |
| `npm test`             | Run Jest unit tests with coverage     |
| `npm run format`       | Run Prettier formatter                |
| `npm run analyze`      | Bundle analysis (webpack)             |
| `npm run sitemap`      | Generate sitemap                      |
| `npm run cypress:open` | Run Cypress E2E tests                 |
| `npm run db:types`     | Re-generate Supabase TypeScript types |

---

## Deployment

### Vercel (Recommended)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Michalis89/hobbistas-hub)

#### Required Environment Variables

| Variable                        | Required | Notes                      |
| ------------------------------- | -------- | -------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | ✅       | Public Supabase URL        |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅       | Public anon key            |
| `SUPABASE_SERVICE_ROLE_KEY`     | ✅       | Server-only — never expose |
| `SITE_URL`                      | ✅       | Canonical domain           |
| `RESEND_API_KEY`                | ✅       | Transactional email        |
| `UPSTASH_REDIS_REST_URL`        | ✅       | Rate limiting              |
| `UPSTASH_REDIS_REST_TOKEN`      | ✅       | Rate limiting              |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`  | ✳️       | Push notifications         |
| `VAPID_PRIVATE_KEY`             | ✳️       | Push notifications         |
| `TWITCH_CLIENT_ID`              | ✳️       | IGDB game data             |
| `TWITCH_CLIENT_SECRET`          | ✳️       | IGDB game data             |
| `MAL_CLIENT_ID`                 | ✳️       | Anime/manga data           |
| `MAL_CLIENT_SECRET`             | ✳️       | Anime/manga data           |
| `GOOGLE_BOOKS_API_KEY`          | ✳️       | Book metadata              |

### Security Notes

1. **RLS** — Row Level Security policies are in `supabase-migrations/05-create-rls-policies.sql`. The `SUPABASE_SERVICE_ROLE_KEY` is used only in `src/lib/supabase-server.ts` and the sitemap seed. Never commit or expose it client-side.
2. **Rate Limiting** — Applied to auth endpoints (`/api/auth/login`, `/api/auth/signup`) via `src/lib/rate-limit.ts` using Upstash Redis.
3. **API Auth** — All protected routes use `src/lib/api/auth.ts` for session validation and explicit role checks for admin/upload access.
4. **File Uploads** — Article covers go through server-side sanitization before being written to Supabase Storage.
5. **Stale Tokens** — `src/app/components/AuthInit.tsx` handles stale JWT invalidation on mount.

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Make your changes
4. Run the full CI suite: `npm run ci`
5. Submit a pull request

---

## License

Distributed under the MIT License. See [LICENSE.txt](LICENSE.txt) for details.

---

<div align="center">
  <p>
    <a href="https://github.com/Michalis89/hobbistas-hub/issues">Report a Bug</a> &bull;
    <a href="https://github.com/Michalis89/hobbistas-hub/issues">Request a Feature</a>
  </p>
  <p>Built with care for tracking what you love</p>
</div>
