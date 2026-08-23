import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import type {
  CategoryDashboardSection,
  DashboardCategoryKey,
  MediaSuggestion,
} from '@/lib/dashboard/category-data';
import { buildRecommendationServe, recordRecommendationImpressions } from './serve';

/**
 * Records impressions for the owner's own dashboard and stamps each suggestion with its serve.
 *
 * Called from the authenticated dashboard path only — `fetchCategoryDashboardData` itself is
 * shared with `/u/[username]`, `/share/[token]` and their public API routes, where the viewer is
 * not the owner and an impression would be attributed to the wrong person. Keeping the write out
 * here rather than inside the fetch is what makes that distinction structural.
 *
 * Returns the sections either way: instrumentation failure must never cost the user their
 * dashboard.
 */
export async function instrumentOwnDashboardSuggestions(
  supabase: SupabaseClient<Database>,
  userId: string,
  sections: Record<DashboardCategoryKey, CategoryDashboardSection>,
): Promise<Record<DashboardCategoryKey, CategoryDashboardSection>> {
  const categories = Object.keys(sections) as DashboardCategoryKey[];
  const writes: Array<Promise<void>> = [];

  for (const category of categories) {
    const section = sections[category];
    const suggestions = section?.mediaSuggestions ?? [];
    if (suggestions.length === 0) {
      continue;
    }

    const serve = buildRecommendationServe({
      userId,
      category,
      surface: 'dashboard_media_suggestions',
      slots: suggestions.map((suggestion, index) => ({
        mediaId: suggestion.mediaId,
        source: suggestion.source,
        subtype: suggestion.source,
        deterministicRank: index + 1,
      })),
    });

    const stamped: MediaSuggestion[] = suggestions.map((suggestion, index) => ({
      ...suggestion,
      serveId: serve.serveId,
      slotIndex: index,
    }));

    sections[category] = { ...section, mediaSuggestions: stamped };
    writes.push(recordRecommendationImpressions(supabase, serve));
  }

  await Promise.all(writes);

  return sections;
}
