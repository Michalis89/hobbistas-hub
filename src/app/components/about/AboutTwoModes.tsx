import { Lock, Users, Check } from 'lucide-react';

const soloPoints = [
  'Your library, backlog and progress — visible only to you',
  'Recommendations computed from your own ratings and genres, nothing else',
  'Share a read-only link to your backlog when you want, with an expiry date',
  'No feed, no follower count, no profile anyone can look up',
];

const socialPoints = [
  'A public profile and an explore feed of what real people are tracking',
  'Follow other members and see their libraries and reviews',
  'Community suggestions layered on top of your personal ones',
  'Direct messages between members',
];

export function AboutTwoModes() {
  return (
    <section className="px-4 py-14 md:px-6 md:py-20">
      <div className="mx-auto max-w-5xl">
        <div className="mb-10 text-center md:mb-14">
          <p className="mb-3 text-xs uppercase tracking-[0.28em] text-primary">How you use it</p>
          <h2 className="mb-4 text-3xl font-semibold text-foreground md:text-4xl">
            Two ways to use Hobbistas
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            Most trackers decide for you whether your hobbies are a private record or a public
            performance. Hobbistas lets you pick — and starts on the private side.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <div className="rounded-2xl border border-primary/40 bg-card p-6 md:p-7">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Lock className="h-5 w-5" aria-hidden />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Solo</h3>
                <p className="text-xs font-medium uppercase tracking-wide text-primary">
                  How every account starts
                </p>
              </div>
            </div>

            <ul className="space-y-3">
              {soloPoints.map(point => (
                <li
                  key={point}
                  className="flex gap-3 text-sm leading-relaxed text-muted-foreground"
                >
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                  {point}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6 md:p-7">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <Users className="h-5 w-5" aria-hidden />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Social layer</h3>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Opt-in — coming soon
                </p>
              </div>
            </div>

            <ul className="space-y-3">
              {socialPoints.map(point => (
                <li
                  key={point}
                  className="flex gap-3 text-sm leading-relaxed text-muted-foreground"
                >
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  {point}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="mx-auto mt-6 max-w-2xl text-center text-sm text-muted-foreground">
          The social layer is a single switch in your settings, off by default. Turn it off again
          and the public side disappears with it — your library goes back to being yours alone.
        </p>
      </div>
    </section>
  );
}
