import { MOVIES_AI_TASTE_TEXT_LIMITS, type MoviesAiEvidenceDocument } from './types';

/**
 * The movies taste prompts.
 *
 * Written for films and shared with nothing. Three instructions carry things that are true of a
 * film library and false of every other category here.
 *
 * *Authorship is supplied, not inferred.* The evidence carries ranked director and actor lists
 * derived from TMDB credits with franchise deduplication already applied. The model must read them
 * as corroboration — "this is a director-led preference" — and must never cite a person's name
 * where a title belongs, because the validator resolves citations against titles only.
 *
 * *An abandoned film is a hard verdict.* Nobody stalls on a 110-minute film the way they stall on a
 * long series. Where anime and manga need careful language about drop depth, films need the
 * opposite: stopping one means something, and the prompt says so plainly.
 *
 * *Runtime is often missing.* `runtimeDataRatio` tells the model how much of its evidence about
 * pacing and length is actually there, so a claim about preferred film length is made only when the
 * data supports it.
 */

const SHARED_RULES = [
  'Do not output percentages, numeric confidence values, star ratings or rankings. All numbers are computed elsewhere.',
  'Do not merely restate genre frequency. Two films tagged Drama can differ completely in whether the appeal is formal control, performance, moral ambiguity or spectacle; say which one this viewer returns to.',
  'Name each pillar after the specific storytelling or formal pattern its cited titles actually share.',
  'Useful axes include, where the evidence supports them: authored directorial voice, formal control, narrative ambiguity, moral complexity, ensemble versus single-protagonist focus, spectacle and scale, genre revisionism, period and setting, pacing and runtime tolerance, tonal register, performance-led drama, and craft-forward filmmaking. Use none of these unless the evidence supports it, and prefer a better description of your own.',
  'A pillar may be about content (what the film is about) or form (how it is told: structure, pacing, how much is withheld, how it is shot and cut). Set kind accordingly.',
  "The authorship block lists directors and actors derived from this viewer's own library, with instalments of one series already collapsed and single-franchise actors already excluded. Read it as corroboration for a pillar about authored voice or performance. Never cite a person's name in evidenceTitles: those must be exact film titles from the entries list.",
  'If dataQuality.hasAuthorship is false, make no claim about favoured directors or performers at all.',
  'Weigh the evidence by what it cost the viewer. A finished, highly rated or favourited film is the strongest signal; one abandoned partway is the clearest statement of what does not work.',
  'Abandoning a film is a decisive rejection, not a stall. A film is a single sitting, so stopping one says far more than stopping a long series would. Only an abandonment recorded past 90 percent is ambiguous.',
  "Entries are collapsed across cuts, editions and re-release years: one film, however many rows it occupied. Do not treat a director's cut as separate evidence from the theatrical release.",
  'Each entry carries a familyKey naming the series it belongs to. Instalments of one series are separate viewing decisions and stay separate entries, but a pillar whose every citation shares a familyKey describes that series rather than this viewer, and will be rejected. Cite across at least two families.',
  'Read runtimeDataRatio before saying anything about length or pacing. When it is low, most entries have no runtime at all and any claim about preferred film length is unsupported.',
  'A negative signal must name the concrete storytelling or formal pattern every one of its cited titles actually shares, verified title by title. "Effects-led spectacle with thin characterisation" is a signal; "bad films", "blockbusters" or a bare genre name is not.',
  'Prefer a narrower label that is true of all cited titles over a broader one that is loosely true of most. If the titles do not share one precise pattern, split them into separate signals or omit them; returning fewer negative signals is better than returning an inaccurate one.',
  'Every entry carries an aversionEvidence field: clear, weak, or none. Read it; do not re-derive it from status, score or favourite.',
  'A negative signal may cite ONLY entries whose aversionEvidence is clear or weak, and must include at least one clear entry. Citing an entry whose aversionEvidence is none discards the entire response, pillars included.',
  'A signal built only from weak entries will be discarded. Weak entries may corroborate a clear one; they can never carry a signal by themselves.',
  'If dataQuality.clearAversionCount is 0 this viewer has expressed no aversion at all. Return an empty negativeSignals array, and describe no rejection, dislike, aversion, avoidance or impatience anywhere in the response - including identity.description and summary. Write only about what the viewer is drawn to.',
  'Each open question must name a genuine ambiguity in the supplied evidence: an observed pattern with more than one plausible explanation, stated so a future signal could settle it. Do not forecast what the viewer will enjoy next, and do not ask about data that is not in the evidence.',
  'You may use general knowledge about the supplied titles, but every evidence claim must cite only titles present in the evidence document.',
  'The response JSON schema is supplied separately in generationConfig.responseSchema.',
  'Use schemaVersion exactly 1.',
  'Keep all descriptions concise: one sentence each. Constraints: identity label <= 4 words; 2-4 pillars; each pillar cites 2-5 exact supplied titles; 0-3 negative signals; 0-2 open questions.',
  `Hard character limits, counted in characters and not words. Exceeding any of them discards the whole response: identity.label <= ${MOVIES_AI_TASTE_TEXT_LIMITS.identityLabel}; identity.description <= ${MOVIES_AI_TASTE_TEXT_LIMITS.description}; every pillar and negative signal name <= ${MOVIES_AI_TASTE_TEXT_LIMITS.name}; every pillar and negative signal description <= ${MOVIES_AI_TASTE_TEXT_LIMITS.description}; summary <= ${MOVIES_AI_TASTE_TEXT_LIMITS.summary}; each open question <= ${MOVIES_AI_TASTE_TEXT_LIMITS.openQuestion}.`,
  'Count the characters of summary and of every description before returning. These bounds are the single most common reason a response is rejected; prefer a shorter sentence to a borderline one.',
  'identity.label must be at most FOUR words. Count them before returning. This is a hard limit enforced in code: a five-word label discards the entire response, pillars included, and it is the single most common way a first generation is lost. "Authored Historical Drama" is four words; "Drawn To Authored Historical Drama" is five and would be rejected.',
];

export function buildMoviesTastePrompt(evidence: MoviesAiEvidenceDocument): string {
  return [
    'Infer a semantic Film Taste Profile from the supplied deterministic evidence.',
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
export function buildMoviesTasteRetryPrompt(evidence: MoviesAiEvidenceDocument): string {
  return [
    'Return a Film Taste Profile as one valid JSON object only.',
    'Do not include Markdown, code fences, prose before JSON, prose after JSON, JavaScript syntax, backticks, comments, or trailing commas.',
    'Every JSON string must use double quotes and must escape embedded double quotes.',
    ...SHARED_RULES,
    'Evidence document:',
    JSON.stringify(evidence),
  ].join('\n\n');
}
