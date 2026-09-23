import {
  ROADMAP_ITEMS,
  getStatusLabel,
  type RoadmapItem,
  type RoadmapStatus,
} from '@/config/roadmap';

// D&D lives in a dedicated app and is intentionally left out of the public roadmap here.
const EXCLUDED_AREAS = new Set(['dnd']);

const GROUPS: { status: RoadmapStatus; heading: string; blurb: string }[] = [
  { status: 'done', heading: 'Shipped', blurb: 'Live in the app today.' },
  { status: 'in-progress', heading: 'Being built', blurb: 'Actively in development right now.' },
  { status: 'planned', heading: 'Planned', blurb: 'Agreed on, not started yet.' },
];

const statusColors: Record<RoadmapStatus, string> = {
  done: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  'in-progress': 'border-primary/30 bg-primary/10 text-primary',
  planned: 'border-border bg-muted text-muted-foreground',
};

const visibleItems = ROADMAP_ITEMS.filter(item => !EXCLUDED_AREAS.has(item.area));

function RoadmapCard({ item }: { item: RoadmapItem }) {
  return (
    <div className="group rounded-2xl border border-border bg-card p-5 transition hover:border-primary/40">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:text-primary">
          <item.icon className="h-5 w-5" aria-hidden />
        </div>
        <span
          className={`rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide ${statusColors[item.status]}`}
        >
          {getStatusLabel(item.status, 'full')}
        </span>
      </div>
      <h4 className="mb-2 font-semibold text-foreground">{item.title}</h4>
      <p className="text-sm leading-relaxed text-muted-foreground">{item.description}</p>
    </div>
  );
}

export function AboutRoadmap() {
  return (
    <section className="px-4 py-14 md:px-6 md:py-20">
      <div className="mx-auto max-w-5xl">
        <div className="mb-10 text-center md:mb-14">
          <p className="mb-3 text-xs uppercase tracking-[0.28em] text-primary">Roadmap</p>
          <h2 className="mb-4 text-3xl font-semibold text-foreground md:text-4xl">What is next</h2>
          <p className="mx-auto max-w-xl text-muted-foreground">
            We&apos;re building in public. Here&apos;s what is done, what is underway, and what is
            still only a plan.
          </p>
        </div>

        <div className="space-y-10">
          {GROUPS.map(group => {
            const items = visibleItems.filter(item => item.status === group.status);
            if (items.length === 0) {
              return null;
            }

            return (
              <div key={group.status}>
                <div className="mb-5 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border pb-3">
                  <h3 className="text-lg font-semibold text-foreground">{group.heading}</h3>
                  <span className="text-sm text-muted-foreground">{group.blurb}</span>
                  <span className="ml-auto text-sm tabular-nums text-muted-foreground">
                    {items.length}
                  </span>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((item, index) => (
                    <RoadmapCard key={`${item.title}-${index}`} item={item} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          * The roadmap can change based on community feedback
        </p>
      </div>
    </section>
  );
}
