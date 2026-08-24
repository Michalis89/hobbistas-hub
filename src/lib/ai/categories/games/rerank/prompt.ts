import { GAME_RERANK_TEXT_LIMITS, type GameRerankRequestPayload } from './types';

/**
 * The games rerank prompt.
 *
 * Two things it works hardest at: forbidding any change to the candidate set, and pushing the
 * comparison away from genre-label overlap. Label matching is precisely what the deterministic
 * scorer already does well; if the model does the same thing it adds latency and cost for a
 * reordering nobody needed.
 *
 * Games-specific and staying that way. "Mechanics, authorship, structure and pacing" is the right
 * axis for a game and the wrong one for a novel; a category that shares this transport should
 * write its own sentences rather than inherit these.
 */
export function buildRerankPrompt(payload: GameRerankRequestPayload): string {
  return [
    'Rank a fixed list of games by how well each fits one player, described by the taste profile below.',
    'You may only reorder the supplied list. Do not add, remove, merge, rename or invent entries.',
    'Return every supplied candidateId exactly once. Ranks must be a permutation of 1..N with no gaps or repeats. Rank 1 is the best fit.',
    'Judge fit on mechanics, authorship, structure and pacing — what the player actually does moment to moment and how the game is shaped around them.',
    'Do not rank by genre-label overlap. Two games sharing the label "RPG" can differ completely in whether the player follows an authored story or manages systems; say which of those this player wants and rank accordingly.',
    'Treat each negative signal as a demotion criterion, not an exclusion: a matching candidate should rank low, but must still appear in the output.',
    'Weigh pillars by their strengthBand. A Defining pillar should dominate an Emerging one when the two disagree.',
    'Reason comparatively. Each rationale should say why this candidate sits above or below its neighbours, naming a pillar or negative signal.',
    `Each rationale must be a single short clause of at most ${GAME_RERANK_TEXT_LIMITS.rationale} characters. Be terse: no full sentences, no restating the title.`,
    'Do not output percentages, scores, star ratings or any numeric confidence in rationale text.',
    'You may use general knowledge about the supplied titles, but rank only the candidates given.',
    'Return only raw JSON. Do not wrap the response in Markdown fences, prose or comments.',
    'The response JSON schema is supplied separately in generationConfig.responseSchema.',
    'Use schemaVersion exactly 1.',
    'Input:',
    JSON.stringify(payload),
  ].join('\n\n');
}
