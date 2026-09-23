'use client';

import AiIdentityCard from './AiIdentityCard';
import { useAiTasteProfile } from './useAiTasteProfile';

/**
 * Renders the Anime AI identity, and nothing at all when there is no profile.
 *
 * A per-category component over a shared `<AiIdentitySection category>`: the presentation lives in
 * `AiIdentityCard`, and this file exists so a genuinely anime-specific addition — seasonal or cour framing is a
 * change here rather than a new prop on every other category's card.
 *
 * `enabled` defaults to false so that mounting is never by itself enough to spend an AI request:
 * the caller must say the tab is active and the library is substantial, via `isAiTasteEligible`.
 */
export default function AiAnimeIdentitySection({ enabled = false }: { enabled?: boolean }) {
  const profile = useAiTasteProfile('anime', { enabled });

  if (!profile) {
    return null;
  }

  return <AiIdentityCard eyebrow="Anime Identity" profile={profile} />;
}
