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
 * Renders the Games AI identity, and nothing at all when there is no profile.
 *
 * `enabled` defaults to false so that mounting this component is never by itself enough to spend
 * an AI request — the caller has to say the category is active and the library is substantial
 * enough, via `isAiTasteEligible`.
 */
export default function AiGamingIdentitySection({ enabled = false }: { enabled?: boolean }) {
  const profile = useAiTasteProfile('games', { enabled });

  if (!profile) {
    return null;
  }

  return (
    <Card
      className={`col-span-full w-full min-w-0 ${DASH_RADIUS_SECTION} ${DASH_BORDER} bg-muted/[0.055] shadow-none`}
    >
      <CardHeader className="pb-3">
        <DashboardSectionHeader eyebrow="Gaming Identity" title={profile.identity.label} />
      </CardHeader>
      <CardContent className="space-y-5 overflow-hidden pt-2">
        <p className="max-w-3xl text-sm text-muted-foreground">
          {profile.identity.description}
        </p>
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
              <p className="text-xs leading-relaxed text-muted-foreground">
                {pillar.description}
              </p>
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
