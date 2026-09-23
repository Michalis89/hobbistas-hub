import { TV_AI_TASTE_TEXT_LIMITS, type TvAiEvidenceDocument } from './types';

/**
 * The television taste prompts.
 *
 * Written for long-form series and shared with nothing. What separates these instructions from the
 * film ones is that television is a *sustained* commitment, and almost every rule below follows
 * from that.
 *
 * *Where someone stopped is the richest signal the category has.* Abandoning a show after two
 * episodes rejects a premise; abandoning it in season four is a verdict on how it developed, or
 * simply a stall. The evidence grades this rather than leaving it to be inferred, and the prompt
 * says so explicitly because the temptation to re-derive it from `status` alone is strong.
 *
 * *Being mid-series is not half a signal.* Someone four seasons into a running show has spent more
 * hours than a finished film ever asks for. The weights already say this; the prompt has to, too,
 * or the model discounts anything not marked completed.
 *
 * *Seasons are already collapsed.* One series is one entry regardless of how many season rows the
 * library held, and treating a long-running show as several signals is the fastest way to produce a
 * profile that describes one show instead of one viewer.
 */

const SHARED_RULES = [
  'Do not output percentages, numeric confidence values, star ratings or rankings. All numbers are computed elsewhere.',
  'Do not merely restate genre frequency. Two series tagged Drama can differ completely in whether the appeal is institutional detail, character deterioration, ensemble breadth or plot momentum; say which one this viewer returns to.',
  'Name each pillar after the specific storytelling or structural pattern its cited titles actually share.',
  'Useful axes include, where the evidence supports them: serialised versus episodic construction, ensemble breadth, character deterioration arcs, institutional or procedural detail, slow-burn pacing, tonal bleakness, worldbuilding density, mystery construction, comedic register, prestige craft, genre revisionism, and tolerance for long runs or unfinished stories. Use none of these unless the evidence supports it, and prefer a better description of your own.',
  'A pillar may be about content (what the series is about) or form (how it is told: serialised versus episodic, arc structure, pacing across seasons, ensemble versus protagonist focus). Set kind accordingly.',
  "The authorship block lists creators, directors and performers derived from this viewer's own library, with instalments of one franchise already collapsed and single-franchise performers already excluded. Read it as corroboration for a pillar about authored voice or performance. Never cite a person's name in evidenceTitles: those must be exact series titles from the entries list.",
  'If dataQuality.hasAuthorship is false, make no claim about favoured creators or performers at all.',
  'Each entry is one series, already collapsed across every season the library tracked separately. collapsedRowCount says how many rows merged. Do not treat a long-running series as several separate signals, and do not build a pillar around a single series.',
  'Weigh the evidence by what it cost the viewer. A finished, highly rated or favourited series is the strongest signal; one abandoned early is the clearest statement of what does not work.',
  'A series still in progress with a high watchedRatio is strong positive evidence, not a half-signal. Staying with a show for several seasons is a larger commitment than finishing most films.',
  'Read watchedRatio before interpreting an abandonment. Stopping in the first quarter rejects a premise or a tone. Stopping past seventy percent is usually a stall rather than a verdict, and is much weaker evidence of dislike.',
  'Read episodeDataRatio first. When it is low, most entries have no episode total, so watchedRatio is missing and any claim about where this viewer abandons shows is unsupported.',
  'Each entry carries a familyKey naming the franchise it belongs to. A pillar whose every citation shares a familyKey describes that franchise rather than this viewer, and will be rejected. Cite across at least two families.',
  'A negative signal must name the concrete storytelling or structural pattern every one of its cited titles actually shares, verified title by title. "Procedural cases with no serialised arc" is a signal; "boring shows", "network TV" or a bare genre name is not.',
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
  `Hard character limits, counted in characters and not words. Exceeding any of them discards the whole response: identity.label <= ${TV_AI_TASTE_TEXT_LIMITS.identityLabel}; identity.description <= ${TV_AI_TASTE_TEXT_LIMITS.description}; every pillar and negative signal name <= ${TV_AI_TASTE_TEXT_LIMITS.name}; every pillar and negative signal description <= ${TV_AI_TASTE_TEXT_LIMITS.description}; summary <= ${TV_AI_TASTE_TEXT_LIMITS.summary}; each open question <= ${TV_AI_TASTE_TEXT_LIMITS.openQuestion}.`,
  'Count the characters of summary and of every description before returning. These bounds are the single most common reason a response is rejected; prefer a shorter sentence to a borderline one.',
  'identity.label must be at most FOUR words. Count them before returning. This is a hard limit enforced in code: a five-word label discards the entire response, pillars included, and it is the single most common way a first generation is lost. "Authored Historical Drama" is four words; "Drawn To Authored Historical Drama" is five and would be rejected.',
];

export function buildTvTastePrompt(evidence: TvAiEvidenceDocument): string {
  return [
    'Infer a semantic Television Taste Profile from the supplied deterministic evidence.',
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
export function buildTvTasteRetryPrompt(evidence: TvAiEvidenceDocument): string {
  return [
    'Return a Television Taste Profile as one valid JSON object only.',
    'Do not include Markdown, code fences, prose before JSON, prose after JSON, JavaScript syntax, backticks, comments, or trailing commas.',
    'Every JSON string must use double quotes and must escape embedded double quotes.',
    ...SHARED_RULES,
    'Evidence document:',
    JSON.stringify(evidence),
  ].join('\n\n');
}
