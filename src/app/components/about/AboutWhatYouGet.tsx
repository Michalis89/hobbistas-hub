import { Layers, Download, Sparkles, Lock, Share2, Newspaper, WifiOff } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type Capability = {
  title: string;
  description: string;
  icon: LucideIcon;
};

const capabilities: Capability[] = [
  {
    title: 'Six categories, one library',
    description:
      'Games, anime, manga, movies, TV and books share a single backlog, a single history and one set of statuses. Each keeps the progress fields that actually make sense for it — hours played, episodes watched, chapters, pages.',
    icon: Layers,
  },
  {
    title: 'Bring your existing lists',
    description:
      'Connect Steam and your games arrive with playtime. Connect MyAnimeList and your anime and manga arrive with progress and scores. You are not starting from an empty page.',
    icon: Download,
  },
  {
    title: 'Recommendations from your library alone',
    description:
      'Suggestions are computed from the genres, themes and ratings already in your account — across every category at once, so what you love in games can surface something in books.',
    icon: Sparkles,
  },
  {
    title: 'A diary only you can read',
    description:
      'The optional diary is encrypted in your browser with AES-256 before anything is sent. The server stores ciphertext it has no key for. Losing your passphrase means losing the entries — that is the trade-off of it being real encryption.',
    icon: Lock,
  },
  {
    title: 'Share without going public',
    description:
      'Generate a link to your backlog or dashboard and send it to whoever you want. It is read-only, it can expire, and it needs no account on the other end. No profile, no follows.',
    icon: Share2,
  },
  {
    title: 'Articles and reviews, open to everyone',
    description:
      'The articles and reviews sections are public and readable without an account — no login wall, no newsletter gate. Members can comment and like.',
    icon: Newspaper,
  },
  {
    title: 'Installable, and works offline',
    description:
      'Hobbistas is a Progressive Web App. Install it from the browser on phone or desktop, keep browsing your library with no connection, and additions you make offline sync when you are back.',
    icon: WifiOff,
  },
];

export function AboutWhatYouGet() {
  return (
    <section className="px-4 py-14 md:px-6 md:py-20">
      <div className="mx-auto max-w-5xl">
        <div className="mb-10 text-center md:mb-14">
          <p className="mb-3 text-xs uppercase tracking-[0.28em] text-primary">Available today</p>
          <h2 className="mb-4 text-3xl font-semibold text-foreground md:text-4xl">
            What actually works right now
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            Everything below is live and free. Nothing here is a promise — the promises are further
            down, in the roadmap.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {capabilities.map(capability => {
            const Icon = capability.icon;
            return (
              <div
                key={capability.title}
                className="flex gap-4 rounded-2xl border border-border bg-card p-5 transition hover:border-primary/40"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" aria-hidden />
                </div>
                <div>
                  <h3 className="mb-2 font-semibold text-foreground">{capability.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {capability.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
