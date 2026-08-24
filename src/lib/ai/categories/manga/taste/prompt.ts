import { MANGA_AI_TASTE_TEXT_LIMITS, type MangaAiEvidenceDocument } from './types';

/**
 * The manga taste prompts.
 *
 * Written for manga and shared with nothing. Most of what is here would be wrong pointed anywhere
 * else: that a demographic label names a magazine's readership and not a reader's taste, that
 * where someone stopped reading is graded on a scale specific to serialised comics, that a
 * progress number in this database may be counted in chapters or in volumes depending on which
 * importer wrote the row, and that a two-hundred-chapter current run is a stronger endorsement
 * than most completed series.
 *
 * The axes named below are examples offered to widen the model's vocabulary past genre nouns, not
 * a checklist. Nothing requires a pillar to use any of them, and a profile that invents a better
 * description of what the evidence shows is the desired outcome.
 */

const SHARED_RULES = [
  'Do not output percentages, numeric confidence values, star ratings or rankings. All numbers are computed elsewhere.',
  'Do not merely restate genre frequency. Two manga tagged Action can differ completely in whether the appeal is escalating battle spectacle, a grounded historical campaign, or a tense cat-and-mouse; say which one this reader returns to.',
  'Treat demographic labels — shounen, shoujo, seinen, josei — as publishing categories, not tastes. They describe which magazine serialised a work, not what a reader enjoys. Never name a pillar after one, and never build a pillar whose only shared property is a demographic. A demographic may support an observation; it can never be the observation.',
  'The genres array mixes genres, themes and demographics into one flat list, because the source does. Read themes out of it where they are there, and discount the demographic entries.',
  'Name each pillar after the specific storytelling or structural pattern its cited titles actually share.',
  'Useful axes include, where the evidence supports them: character-driven drama, long-form adventure, battle escalation, psychological tension, mystery construction, romance structure, slice-of-life register, horror, dark fantasy, political intrigue, philosophical preoccupation, power-system complexity, slow burn versus fast pacing, episodic versus serialised storytelling, ensemble versus single-protagonist focus, worldbuilding density, morally ambiguous characters, introspective storytelling, and high-action versus dialogue-heavy panelling. Use none of these unless the evidence supports it, and prefer a better description of your own.',
  'A pillar may be about content (what the story is about) or form (how it is told: pacing, arc structure, episodic versus serialised, ensemble versus protagonist-focused, dialogue-heavy versus action-heavy). Set kind accordingly.',
  'Weigh the evidence by what it cost the reader. Manga is a large commitment per series: a finished, highly rated or favourited work is the strongest signal, and something abandoned in its opening chapters is the clearest statement of what does not work.',
  'chaptersRead is normalised to chapter-equivalents. Where it is null the library did not record progress in a unit that could be established, and you must not infer where the reader stopped.',
  'totalChapters and totalVolumes are frequently null. When they are, no completion ratio exists for that title. Do not invent one and do not reason as though one were available.',
  'Read progressBand carefully; it is the graded answer to "where did they stop", already computed. "bailed" means the opening chapters — a rejection of premise, art or tone. "sampled" means a real stretch of reading that still did not reach a third of the work. "partial" means the middle. "most" means nearly all of it, and is only ever set when the length was actually known.',
  'A deep abandonment is weak evidence of dislike. A reader who stopped at "partial" or "most" spent months with that series; a hiatus, a stalled translation or one weak arc explains that far better than distaste does. An early abandonment is the opposite and is strong evidence.',
  'A long current run is strong positive evidence even with no rating attached. Long-running series are exactly the ones readers never mark complete, so an unrated series someone is deep into often says more than a completed one they scored 7.',
  'Do not let series length itself become a preference. That a reader follows a four-hundred-chapter series says they like that series; it does not by itself mean they like long series, unless several unrelated families show the same pattern.',
  'Entries marked derivative are one-shots, gaiden, side stories, anthologies, 4-koma and doujinshi. Do not treat one as independent evidence of a preference.',
  'Each entry in the evidence is one family, already collapsed across editions, sequels, numbered parts and side stories. Do not treat a long-running series as several separate signals, and do not build a pillar around a single family.',
  'A negative signal must name the concrete storytelling or structural pattern every one of its cited titles actually shares, verified title by title. "Repetitive battle escalation with little character progression", "prolonged romantic misunderstanding loops", "low-conflict episodic slice-of-life" and "exposition-heavy political plotting with little character focus" are signals. "Dislikes shounen", "boring manga", "slow stories" and "romance aversion" are not: the first names a magazine, and the rest name nothing at all.',
  'Prefer a narrower label that is true of all cited titles over a broader one that is loosely true of most. If the titles do not share one precise pattern, split them into separate signals or omit them; returning fewer negative signals is better than returning an inaccurate one.',
  'Every entry carries an aversionEvidence field: clear, weak, or none. Read it; do not re-derive it from status, score or progress.',
  'A negative signal may cite ONLY entries whose aversionEvidence is clear or weak, and must include at least one clear entry. Citing an entry whose aversionEvidence is none discards the entire response, pillars included.',
  'A signal built only from weak entries will be discarded. Weak entries may corroborate a clear one; they can never carry a signal by themselves.',
  'If dataQuality.clearAversionCount is 0 this reader has expressed no aversion at all. Return an empty negativeSignals array, and describe no rejection, dislike, aversion, avoidance or impatience anywhere in the response — including identity.description, every pillar description, and summary. Write only about what the reader is drawn to. This is checked automatically and a rejection claim with no signal behind it discards the whole response.',
  'Each open question must name a genuine ambiguity in the supplied evidence: an observed pattern with more than one plausible explanation, stated so a future signal could settle it. Do not forecast what the reader will enjoy next, and do not ask about data that is not in the evidence.',
  'You may use general knowledge about the supplied titles, but every evidence claim must cite only titles present in the evidence document.',
  'The response JSON schema is supplied separately in generationConfig.responseSchema.',
  'Use schemaVersion exactly 1.',
  'Keep all descriptions concise: one sentence each. Constraints: identity label <= 4 words; 2-4 pillars; each pillar cites 2-5 exact supplied titles; 0-3 negative signals; 0-2 open questions.',
  `Hard character limits, counted in characters and not words. Exceeding any of them discards the whole response: identity.label <= ${MANGA_AI_TASTE_TEXT_LIMITS.identityLabel}; identity.description <= ${MANGA_AI_TASTE_TEXT_LIMITS.description}; every pillar and negative signal name <= ${MANGA_AI_TASTE_TEXT_LIMITS.name}; every pillar and negative signal description <= ${MANGA_AI_TASTE_TEXT_LIMITS.description}; summary <= ${MANGA_AI_TASTE_TEXT_LIMITS.summary}; each open question <= ${MANGA_AI_TASTE_TEXT_LIMITS.openQuestion}.`,
  'Count the characters of summary and of every description before returning. These bounds are the single most common reason a response is rejected; prefer a shorter sentence to a borderline one.',
];

export function buildMangaTastePrompt(evidence: MangaAiEvidenceDocument): string {
  return [
    'Infer a semantic Manga Taste Profile from the supplied deterministic evidence.',
    'The identity label should name the strongest recurring tension in the evidence, not the most common genre and never a demographic bracket.',
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
export function buildMangaTasteRetryPrompt(evidence: MangaAiEvidenceDocument): string {
  return [
    'Return a Manga Taste Profile as one valid JSON object only.',
    'Do not include Markdown, code fences, prose before JSON, prose after JSON, JavaScript syntax, backticks, comments, or trailing commas.',
    'Every JSON string must use double quotes and must escape embedded double quotes.',
    ...SHARED_RULES,
    'Evidence document:',
    JSON.stringify(evidence),
  ].join('\n\n');
}
