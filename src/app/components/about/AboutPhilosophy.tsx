import { Bell, TrendingUp, Cpu, Shield } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type Boundary = {
  title: string;
  description: string;
  icon: LucideIcon;
};

const boundaries: Boundary[] = [
  {
    title: 'No engagement notifications',
    description:
      'No daily reminders, no streaks to protect, no "you have not logged in" emails. The only thing that will ever notify you is a reply to a support ticket you opened yourself.',
    icon: Bell,
  },
  {
    title: 'No scoreboard',
    description:
      'No leaderboards, no badges, no completion percentage shown to anyone else. Dropping something after two episodes costs you nothing here.',
    icon: TrendingUp,
  },
  {
    title: 'No engagement algorithm',
    description:
      'Recommendations read your library and nothing else — your genres, your ratings, your history. Nothing is tuned to keep you on the page longer, and no other person\u2019s behaviour feeds into what you are shown.',
    icon: Cpu,
  },
  {
    title: 'No data to sell',
    description:
      'We do not sell personal data and there is no advertising to target. The diary goes further: it is encrypted on your device, so there is nothing on the server to hand over or leak.',
    icon: Shield,
  },
];

export function AboutPhilosophy() {
  return (
    <section className="px-4 py-14 md:px-6 md:py-20">
      <div className="mx-auto max-w-5xl">
        <div className="grid items-start gap-10 lg:grid-cols-2 lg:gap-14">
          <div className="lg:sticky lg:top-24">
            <p className="mb-3 text-xs uppercase tracking-[0.28em] text-primary">Our philosophy</p>
            <h2 className="mb-5 text-3xl font-semibold text-foreground md:text-4xl">
              Why Hobbistas exists
            </h2>
            <p className="mb-6 leading-relaxed text-foreground/90">
              Hobbistas was built because every other tracker felt like it wanted something from me
              — engagement, daily logins, content to feed an algorithm. I just wanted to remember
              which anime I dropped and why.
            </p>
            <p className="leading-relaxed text-muted-foreground">
              So the defaults are the opposite of what the category usually assumes. Nothing is
              public until you say so, nothing is suggested by strangers, and nothing is designed to
              pull you back in. These are not features we have not built yet — they are the ones we
              decided against.
            </p>
          </div>

          <div className="space-y-4">
            {boundaries.map(boundary => {
              const Icon = boundary.icon;
              return (
                <div
                  key={boundary.title}
                  className="flex gap-4 rounded-xl border border-border bg-card p-5 transition hover:border-primary/40"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" aria-hidden />
                  </div>
                  <div>
                    <h3 className="mb-1.5 font-semibold text-foreground">{boundary.title}</h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {boundary.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
