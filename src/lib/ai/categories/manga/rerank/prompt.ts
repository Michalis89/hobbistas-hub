import { MANGA_RERANK_TEXT_LIMITS, type MangaRerankRequestPayload } from './types';

/**
 * The manga rerank prompt.
 *
 * Not the anime prompt with different nouns. Three sentences here exist because of things that are
 * true of manga rows and of manga reading, and of nothing else in this codebase:
 *
 * *The demographic guard.* `labels` contains Shounen, Seinen, Josei and Shoujo beside real genres,
 * and those describe which magazine serialised a title — a publisher's target readership, not a
 * reader's taste. The manga taste layer refuses a pillar named after one; the reranker is told the
 * same thing, because a model that ranks on "this reader likes seinen" has learned a distribution
 * channel.
 *
 * *Length is a commitment, and an unknown length is not a short one.* A completed serialised manga
 * is dozens of hours. `totalChapters` is null far more often than the column is populated, and the
 * model must not read that null as "short" — it means the total could not be trusted.
 *
 * *Publication status is a real decision input.* Starting a currently-publishing series with no
 * ending in sight is a different proposition from starting a finished one, in a way that has no
 * equivalent in games and only a weak one in anime.
 */
export function buildMangaRerankPrompt(payload: MangaRerankRequestPayload): string {
  return [
    'Rank a fixed list of manga by how well each fits one reader, described by the taste profile below.',
    'You may only reorder the supplied list. Do not add, remove, merge, rename or invent entries.',
    'Return every supplied candidateId exactly once. Ranks must be a permutation of 1..N with no gaps or repeats. Rank 1 is the best fit.',
    'Judge fit on how the story is told and what reading it asks of the reader: narrative structure, pacing, tonal register, and the commitment implied by its length and publication status.',
    'The labels field mixes genre, theme and demographic bracket in one list. Demographic labels — Shounen, Seinen, Shoujo, Josei — name the magazine a title was serialised in, not a reader. Never treat one as a taste signal or a reason to rank.',
    'Treat a null totalChapters as unknown, never as short. It means the series total could not be trusted, not that the series is brief.',
    'Weigh publication status honestly: an unfinished, currently-publishing series is a different commitment from a finished one, and the profile may show which this reader tolerates.',
    'Do not rank by label overlap. Two titles sharing "Action, Psychological" can differ completely in whether the psychology is earned; say which this reader wants and rank accordingly.',
    'Treat each negative signal as a demotion criterion, not an exclusion: a matching candidate should rank low, but must still appear in the output.',
    'Weigh pillars by their strengthBand. A Defining pillar should dominate an Emerging one when the two disagree.',
    'Reason comparatively. Each rationale should say why this candidate sits above or below its neighbours, naming a pillar or negative signal.',
    `Each rationale must be a single short clause of at most ${MANGA_RERANK_TEXT_LIMITS.rationale} characters. Be terse: no full sentences, no restating the title.`,
    'Do not output percentages, scores, star ratings or any numeric confidence in rationale text.',
    'You may use general knowledge about the supplied titles, but rank only the candidates given.',
    'Return only raw JSON. Do not wrap the response in Markdown fences, prose or comments.',
    'The response JSON schema is supplied separately in generationConfig.responseSchema.',
    'Use schemaVersion exactly 1.',
    'Input:',
    JSON.stringify(payload),
  ].join('\n\n');
}
