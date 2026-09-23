import type { GameAiEvidenceDocument } from './types';

/**
 * The games taste prompts.
 *
 * Deliberately not shared with any other category, and deliberately not parameterised into a
 * generic "media taste" template. Almost every line here encodes something specific about games —
 * that a genre label says little about what the player actually does, that abandoning a title
 * unrated is the aversion signal, that "open-world" is a vague label rather than a taste. The
 * same sentences applied to books or film would be either wrong or empty.
 *
 * The retry prompt is not a paraphrase: it is the same semantic instructions with the JSON
 * formatting rules hardened, used only after a first attempt produced unparseable or
 * structurally-wrong output.
 */

export function buildGamingTastePrompt(evidence: GameAiEvidenceDocument): string {
  return [
    'Infer a semantic Gaming Taste Profile from the supplied deterministic evidence.',
    'Do not output percentages, numeric confidence values, or recommendation rankings.',
    'Do not merely restate genre frequency. Distinguish games that share metadata but imply different preferences.',
    'Name each pillar after the specific shared design or taste pattern linking its evidence titles, not a broad genre, platform, budget tier, or loose umbrella label.',
    'Avoid vague labels such as cinematic, epic, open-world, RPG, action, adventure, or AAA unless the description states the more precise shared appeal.',
    'Do not group evidence titles merely because they are polished, popular, cinematic, or open-world; group them by player-facing appeal such as authored narrative, difficult combat mastery, dark atmosphere, exploration pressure, tactical party agency, stealth/traversal fantasy, or emotional stakes.',
    'The identity label should reflect the strongest recurring tensions in the evidence; do not over-index on "epic" if challenge, atmosphere, authored narrative, or combat mastery are equally central.',
    'A negative signal must name the concrete mechanic or play pattern every one of its cited titles actually shares, verified title by title. Do not reach for a genre or category word that only fits some of them.',
    'Prefer a narrower label that is true of all cited titles over a broader one that is loosely true of most. If the titles do not share one precise pattern, split them into separate signals or omit them; returning fewer negative signals is better than returning an inaccurate one.',
    'Ground negative signals in titles the player abandoned unrated or rated poorly. A title the player rated well is not evidence of aversion even if abandoned, and a favorite never is.',
    'Each open question must name a genuine ambiguity in the supplied evidence: an observed pattern that has more than one plausible explanation, stated so a future signal could settle it. Do not forecast what the player will enjoy next, and do not ask about data that is not in the evidence.',
    'You may use general knowledge about supplied game titles, but every evidence claim must cite only titles present in the evidence.',
    'Return only raw JSON. Do not wrap the response in Markdown fences, prose, or comments.',
    'The response JSON schema is supplied separately in generationConfig.responseSchema.',
    'Use schemaVersion exactly 1.',
    'Keep all descriptions concise: one sentence each. Constraints: identity label <= 4 words; 2-4 pillars; each pillar cites 2-5 real supplied titles; 0-3 negative signals; summary <= 45 words; 0-2 open questions.',
    'Evidence document:',
    JSON.stringify(evidence),
  ].join('\n\n');
}

export function buildGamingTasteRetryPrompt(evidence: GameAiEvidenceDocument): string {
  return [
    'Return a Gaming Taste Profile as one valid JSON object only.',
    'Do not include Markdown, code fences, prose before JSON, prose after JSON, JavaScript syntax, backticks, comments, or trailing commas.',
    'Every JSON string must use double quotes and must escape embedded double quotes.',
    'Name pillars after precise shared design/taste patterns, not broad genre umbrellas or popularity/budget labels.',
    'Avoid vague labels such as cinematic, epic, open-world, RPG, action, adventure, or AAA unless the description states the more precise shared appeal.',
    'Do not group evidence titles merely because they are polished, popular, cinematic, or open-world; group them by player-facing appeal such as authored narrative, difficult combat mastery, dark atmosphere, exploration pressure, tactical party agency, stealth/traversal fantasy, or emotional stakes.',
    'The identity label should reflect the strongest recurring tensions in the evidence; do not over-index on "epic" if challenge, atmosphere, authored narrative, or combat mastery are equally central.',
    'A negative signal must name the concrete mechanic or play pattern every one of its cited titles actually shares, verified title by title. Do not reach for a genre or category word that only fits some of them.',
    'Prefer a narrower label that is true of all cited titles over a broader one that is loosely true of most. If the titles do not share one precise pattern, split them into separate signals or omit them; returning fewer negative signals is better than returning an inaccurate one.',
    'Ground negative signals in titles the player abandoned unrated or rated poorly. A title the player rated well is not evidence of aversion even if abandoned, and a favorite never is.',
    'Each open question must name a genuine ambiguity in the supplied evidence: an observed pattern that has more than one plausible explanation, stated so a future signal could settle it. Do not forecast what the player will enjoy next, and do not ask about data that is not in the evidence.',
    'The response JSON schema is supplied separately in generationConfig.responseSchema.',
    'Use schemaVersion exactly 1.',
    'Keep all descriptions concise: one sentence each. Constraints: identity label <= 4 words; 2-4 pillars; each pillar cites 2-5 exact evidence titles; 0-3 negative signals; summary <= 45 words; 0-2 open questions.',
    'Evidence document:',
    JSON.stringify(evidence),
  ].join('\n\n');
}
