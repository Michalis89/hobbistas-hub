'use client';

import { useEffect, useState } from 'react';
import type { AiTasteCategory } from '@/lib/ai/taste-eligibility';

export type AiTasteProfile = {
  identity: {
    label: string;
    description: string;
  };
  pillars: Array<{
    name: string;
    /**
     * What sort of preference the pillar describes.
     *
     * A union across categories rather than one shared vocabulary: games distinguish content from
     * player behaviour, anime distinguishes content from narrative form. The field is carried but
     * not rendered, so widening it costs nothing and forcing a single enum would have made one
     * category mislabel its own observations.
     */
    kind: 'content' | 'behavior' | 'form';
    description: string;
    evidenceTitles: string[];
    strengthBand: 'Defining' | 'Strong' | 'Present' | 'Emerging';
  }>;
  negativeSignals: Array<{
    name: string;
    description: string;
    evidenceTitles: string[];
  }>;
  summary: string;
  openQuestions: string[];
  source: 'ai' | 'deterministic';
};

type AiTasteProfileResponse = {
  profile: AiTasteProfile | null;
};

/**
 * Fetches the cached AI taste profile for one category.
 *
 * `enabled` is a hard gate, not a hint: when it is false no request is made at all. The endpoint
 * is not free — a miss can reach the provider and write a cache row — so "mounted" is not a good
 * enough reason to call it. The caller decides eligibility via `isAiTasteEligible`.
 */
export function useAiTasteProfile(
  category: AiTasteCategory,
  { enabled }: { enabled: boolean },
): AiTasteProfile | null {
  const [profile, setProfile] = useState<AiTasteProfile | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const controller = new AbortController();

    async function loadProfile() {
      try {
        const response = await fetch(
          `/api/dashboard/ai-taste-profile?category=${encodeURIComponent(category)}`,
          { cache: 'no-store', signal: controller.signal },
        );
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as AiTasteProfileResponse;
        // Only ever replace with a profile. A null means the AI layer is unavailable this
        // request — under StrictMode's double mount that would otherwise wipe a profile the
        // first request already delivered.
        if (payload.profile) {
          setProfile(payload.profile);
        }
      } catch {
        // Aborted or offline: keep whatever is already rendered.
      }
    }

    void loadProfile();
    return () => {
      controller.abort();
    };
  }, [category, enabled]);

  return profile;
}
