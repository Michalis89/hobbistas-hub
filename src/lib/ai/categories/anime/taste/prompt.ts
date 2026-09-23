import { ANIME_AI_TASTE_TEXT_LIMITS, type AnimeAiEvidenceDocument } from './types';

/**
 * The anime taste prompts.
 *
 * Written for anime and shared with nothing. Almost every instruction here encodes something that
 * is true of serialised Japanese animation and false elsewhere: that a demographic label like
 * shounen or seinen describes a magazine's readership rather than a viewer's taste, that where
 * someone stopped watching is a graded signal rather than a binary, that "action" covers both a
 * tournament ladder and a war tragedy. The same sentences pointed at a games library would be
 * meaningless.
 *
 * The axes named below are examples offered to widen the model's vocabulary past genre nouns, not
 * a checklist. Nothing requires a pillar to use any of them, and a profile that invents a better
 * description of what the evidence shows is the desired outcome.
 */

const SHARED_RULES = [
  'Do not output percentages, numeric confidence values, star ratings or rankings. All numbers are computed elsewhere.',
  'Do not merely restate genre frequency. Two shows tagged Action can differ completely in whether the appeal is tournament escalation, war tragedy, or stylish spectacle; say which one this viewer returns to.',
  'Treat demographic labels — shounen, seinen, shoujo, josei — as publishing categories, not tastes. Never name a pillar after one.',
  'Name each pillar after the specific storytelling or structural pattern its cited titles actually share.',
  'Useful axes include, where the evidence supports them: character-driven drama, long-form adventure, battle escalation, psychological tension, mystery construction, romance dynamics, comedic register, dark fantasy, worldbuilding density, political intrigue, power-system rigour, emotional intensity, pacing, episodic versus serialised structure, ensemble versus single-protagonist focus, tournament or progression arcs, iyashikei comfort, and tolerance for fanservice, horror or abstraction. Use none of these unless the evidence supports it, and prefer a better description of your own.',
  'A pillar may be about content (what the story is about) or form (how it is told: pacing, arc structure, episodic versus serialised, ensemble versus protagonist-focused). Set kind accordingly.',
  'Weigh the evidence by what it cost the viewer. A finished, highly rated or favourited series is the strongest signal; something abandoned early is the clearest statement of what does not work.',
  'Read progressBand carefully. "bailed" means the viewer stopped in the first quarter — a rejection of premise or tone. "most" means they watched nearly all of it before stopping, which is far weaker evidence of dislike and is often a stall rather than a verdict.',
  'Entries marked derivative are OVAs, specials or recaps of a parent series. Do not treat one as independent evidence of a preference.',
  'Each entry in the evidence is one franchise, already collapsed across its seasons and cours. Do not treat a long-running series as several separate signals, and do not build a pillar around a single franchise.',
  'A negative signal must name the concrete storytelling or structural pattern every one of its cited titles actually shares, verified title by title. "Repetitive low-stakes episodic comedy" or "romance driven by misunderstanding loops" is a signal; "boring shows", "shonen aversion" or a bare genre name is not.',
  'Prefer a narrower label that is true of all cited titles over a broader one that is loosely true of most. If the titles do not share one precise pattern, split them into separate signals or omit them; returning fewer negative signals is better than returning an inaccurate one.',
  'Every entry carries an aversionEvidence field: clear, weak, or none. Read it; do not re-derive it from status, score or favourite.',
  'A negative signal may cite ONLY entries whose aversionEvidence is clear or weak, and must include at least one clear entry. Citing an entry whose aversionEvidence is none discards the entire response, pillars included.',
  'A signal built only from weak entries will be discarded. Weak entries may corroborate a clear one; they can never carry a signal by themselves.',
  'If dataQuality.clearAversionCount is 0 this viewer has expressed no aversion at all. Return an empty negativeSignals array, and describe no rejection, dislike, aversion, avoidance or impatience anywhere in the response - including identity.description and summary. Write only about what the viewer is drawn to. Claiming a rejection that the evidence does not contain is the single worst outcome here.',
  'Each open question must name a genuine ambiguity in the supplied evidence: an observed pattern with more than one plausible explanation, stated so a future signal could settle it. Do not forecast what the viewer will enjoy next, and do not ask about data that is not in the evidence.',
  'You may use general knowledge about the supplied titles, but every evidence claim must cite only titles present in the evidence document.',
  'The response JSON schema is supplied separately in generationConfig.responseSchema.',
  'Use schemaVersion exactly 1.',
  'Keep all descriptions concise: one sentence each. Constraints: identity label <= 4 words; 2-4 pillars; each pillar cites 2-5 exact supplied titles; 0-3 negative signals; 0-2 open questions.',
  `Hard character limits, counted in characters and not words. Exceeding any of them discards the whole response: identity.label <= ${ANIME_AI_TASTE_TEXT_LIMITS.identityLabel}; identity.description <= ${ANIME_AI_TASTE_TEXT_LIMITS.description}; every pillar and negative signal name <= ${ANIME_AI_TASTE_TEXT_LIMITS.name}; every pillar and negative signal description <= ${ANIME_AI_TASTE_TEXT_LIMITS.description}; summary <= ${ANIME_AI_TASTE_TEXT_LIMITS.summary}; each open question <= ${ANIME_AI_TASTE_TEXT_LIMITS.openQuestion}.`,
  'Count the characters of summary and of every description before returning. These bounds are the single most common reason a response is rejected; prefer a shorter sentence to a borderline one.',
];

export function buildAnimeTastePrompt(evidence: AnimeAiEvidenceDocument): string {
  return [
    'Infer a semantic Anime Taste Profile from the supplied deterministic evidence.',
    'The identity label should name the strongest recurring tension in the evidence, not the most common genre.',
    ...SHARED_RULES,
    'Return only raw JSON. Do not wrap the response in Markdown fences, prose, or comments.',
    'Evidence document:',
    JSON.stringify(evidence),
  ].join('\n\n');
}

/**
 * Retry prompt.
 *
 * Not a paraphrase — the same semantic rules with the JSON formatting requirements hardened. Used
 * only after a first attempt produced unparseable or structurally invalid output.
 */
export function buildAnimeTasteRetryPrompt(evidence: AnimeAiEvidenceDocument): string {
  return [
    'Return an Anime Taste Profile as one valid JSON object only.',
    'Do not include Markdown, code fences, prose before JSON, prose after JSON, JavaScript syntax, backticks, comments, or trailing commas.',
    'Every JSON string must use double quotes and must escape embedded double quotes.',
    ...SHARED_RULES,
    'Evidence document:',
    JSON.stringify(evidence),
  ].join('\n\n');
}
