import { createRouteHandlerClient } from '@/lib/supabase-route-handler';
import type { MediaHistoryEntry } from '../types';
import { animeAdapter } from '../adapters/anime.adapter';
import { buildAnimeRecommendations } from './anime-recommendation-engine';
import { buildAnimeTasteProfile } from './anime-taste-engine';
import type { AnimeRecommendationResult } from './anime-types';

export async function generateAnimeRecommendationsV3(
  userId: string,
): Promise<AnimeRecommendationResult> {
  const supabase = await createRouteHandlerClient();
  const { history, candidates } = await animeAdapter.loadData(supabase, userId);

  const backlog = history.filter(entry => entry.status === 'planned');
  const taste = buildAnimeTasteProfile(history);

  const recommendations = buildAnimeRecommendations({
    history,
    backlog,
    databaseCandidates: candidates,
    taste,
  });

  return {
    tasteProfile: taste.profile,
    backlogPicks: recommendations.backlogPicks,
    possibleNext: recommendations.possibleNext,
    shadowContext: recommendations.shadowContext,
    debug: buildResultDebug(history),
  };
}

function buildResultDebug(history: MediaHistoryEntry[]): AnimeRecommendationResult['debug'] {
  return {
    completedCount: history.filter(item => item.status === 'completed').length,
    inProgressCount: history.filter(item => item.status === 'current').length,
    droppedCount: history.filter(item => item.status === 'dropped').length,
    backlogCount: history.filter(item => item.status === 'planned').length,
  };
}
