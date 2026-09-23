import { ANIME_RERANK_TEXT_LIMITS, type AnimeRerankRequestPayload } from './types';

/**
 * The anime rerank prompt.
 *
 * Anime-specific and staying that way. Games asks the model to judge "mechanics, authorship,
 * structure and pacing" because that is what a player does; none of those words mean the same
 * thing about a series someone watches. The three sentences doing real work here are:
 *
 * *Length is a decision, not a statistic.* `format` and `episodes` tell the model whether a
 * candidate is a single cour, a long-running shounen or a film. A viewer whose library is entirely
 * twelve-episode series has revealed something the deterministic scorer cannot see, because it
 * scores genre overlap and nothing else.
 *
 * *Genre labels on anime are especially weak.* MAL's list mixes genre, demographic and theme, so
 * two titles both labelled "Action, Drama" routinely differ completely in whether the drama is
 * earned or decorative. Ranking on label overlap reproduces what the deterministic side already
 * does, at the cost of a provider call.
 *
 * *A negative signal demotes, it does not exclude.* Same rule as every category: the output must be
 * a permutation of the input, so a bad fit ranks last rather than disappearing.
 */
export function buildAnimeRerankPrompt(payload: AnimeRerankRequestPayload): string {
  return [
    'Rank a fixed list of anime by how well each fits one viewer, described by the taste profile below.',
    'You may only reorder the supplied list. Do not add, remove, merge, rename or invent entries.',
    'Return every supplied candidateId exactly once. Ranks must be a permutation of 1..N with no gaps or repeats. Rank 1 is the best fit.',
    'Judge fit on how the story is told and what watching it asks of the viewer: narrative structure, pacing, tonal register, and the commitment implied by its format and episode count.',
    'Treat format and episodes as a real signal, not metadata. A single cour, a fifty-episode run and a film are different commitments; prefer the shape this viewer has actually stayed with.',
    'Do not rank by genre-label overlap. Anime genre labels mix genre, demographic and theme, so two titles sharing "Action, Drama" can differ completely in whether the drama is earned; say which this viewer wants and rank accordingly.',
    'Treat each negative signal as a demotion criterion, not an exclusion: a matching candidate should rank low, but must still appear in the output.',
    'Weigh pillars by their strengthBand. A Defining pillar should dominate an Emerging one when the two disagree.',
    'Reason comparatively. Each rationale should say why this candidate sits above or below its neighbours, naming a pillar or negative signal.',
    `Each rationale must be a single short clause of at most ${ANIME_RERANK_TEXT_LIMITS.rationale} characters. Be terse: no full sentences, no restating the title.`,
    'Do not output percentages, scores, star ratings or any numeric confidence in rationale text.',
    'You may use general knowledge about the supplied titles, but rank only the candidates given.',
    'Return only raw JSON. Do not wrap the response in Markdown fences, prose or comments.',
    'The response JSON schema is supplied separately in generationConfig.responseSchema.',
    'Use schemaVersion exactly 1.',
    'Input:',
    JSON.stringify(payload),
  ].join('\n\n');
}
