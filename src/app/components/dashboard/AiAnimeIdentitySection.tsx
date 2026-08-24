'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import DashboardSectionHeader from './DashboardSectionHeader';
import {
  DASH_BORDER,
  DASH_RADIUS_CARD,
  DASH_RADIUS_SECTION,
  DASH_SURFACE_CARD,
} from './dashboard-ui-tokens';
import { useAiTasteProfile } from './useAiTasteProfile';

/**
 * Renders the Anime AI identity, and nothing at all when there is no profile.
 *
 * A separate component from the games one rather than a shared `<AiIdentitySection category>`.
 * The two render identically today, which is precisely why merging them now would be premature:
 * the only real difference between the categories is the eyebrow, and one shared component
 * parameterised on a single string is an abstraction that earns nothing while making the next
 * genuinely anime-specific addition — episode-count context, seasonal framing — a change to the
 * games card as well.
 *
 * `enabled` defaults to false so that mounting is never by itself enough to spend an AI request:
 * the caller must say the tab is active and the library is substantial, via `isAiTasteEligible`.
 */
export default function AiAnimeIdentitySection({ enabled = false }: { enabled?: boolean }) {
  const profile = useAiTasteProfile('anime', { enabled });

  if (!profile) {
    return null;
  }

  return (
    <Card
      className={`col-span-full w-full min-w-0 ${DASH_RADIUS_SECTION} ${DASH_BORDER} bg-muted/[0.055] shadow-none`}
    >
      <CardHeader className="pb-3">
        <DashboardSectionHeader eyebrow="Anime Identity" title={profile.identity.label} />
      </CardHeader>
      <CardContent className="space-y-5 overflow-hidden pt-2">
        <p className="max-w-3xl text-sm text-muted-foreground">{profile.identity.description}</p>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {profile.pillars.map(pillar => (
            <section
              key={`${pillar.name}-${pillar.strengthBand}`}
              className={`min-w-0 space-y-3 ${DASH_RADIUS_CARD} ${DASH_BORDER} ${DASH_SURFACE_CARD} p-3.5 shadow-none`}
            >
              <div className="flex items-start justify-between gap-3">
                <h4 className="min-w-0 text-sm font-semibold leading-tight text-foreground">
                  {pillar.name}
                </h4>
                <span className="shrink-0 rounded-full border border-border/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  {pillar.strengthBand}
                </span>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">{pillar.description}</p>
              <p className="text-xs leading-relaxed text-muted-foreground/85">
                {pillar.evidenceTitles.join(' · ')}
              </p>
            </section>
          ))}
        </div>
        {profile.negativeSignals.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {profile.negativeSignals.map(signal => (
              <section
                key={signal.name}
                className={`min-w-0 space-y-2 ${DASH_RADIUS_CARD} ${DASH_BORDER} ${DASH_SURFACE_CARD} p-3.5 shadow-none`}
              >
                <h4 className="text-sm font-semibold leading-tight text-foreground">
                  {signal.name}
                </h4>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {signal.description}
                </p>
                <p className="text-xs leading-relaxed text-muted-foreground/85">
                  {signal.evidenceTitles.join(' · ')}
                </p>
              </section>
            ))}
          </div>
        ) : null}
        <p className="max-w-3xl text-sm text-muted-foreground">{profile.summary}</p>
      </CardContent>
    </Card>
  );
}
