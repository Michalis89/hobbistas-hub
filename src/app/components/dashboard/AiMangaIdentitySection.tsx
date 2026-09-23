'use client';

import AiIdentityCard from './AiIdentityCard';
import { useAiTasteProfile } from './useAiTasteProfile';

/**
 * Renders the Manga AI identity, and nothing at all when there is no profile.
 *
 * A per-category component over a shared `<AiIdentitySection category>`: the presentation lives in
 * `AiIdentityCard`, and this file exists so a genuinely manga-specific addition — chapter-count context is a
 * change here rather than a new prop on every other category's card.
 *
 * `enabled` defaults to false so that mounting is never by itself enough to spend an AI request:
 * the caller must say the tab is active and the library is substantial, via `isAiTasteEligible`.
 */
export default function AiMangaIdentitySection({ enabled = false }: { enabled?: boolean }) {
  const profile = useAiTasteProfile('manga', { enabled });

  if (!profile) {
    return null;
  }

  return <AiIdentityCard eyebrow="Manga Identity" profile={profile} />;
}
