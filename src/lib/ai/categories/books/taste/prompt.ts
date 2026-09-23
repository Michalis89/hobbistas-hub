import { BOOKS_AI_TASTE_TEXT_LIMITS, type BooksAiEvidenceDocument } from './types';

/**
 * The books taste prompts.
 *
 * Written for reading and shared with nothing. What makes books different from every other category
 * here is that the authorship signal is *on the row*: each entry names its own authors, where films
 * and series can only be handed a library-wide derived list. That changes what the model is asked
 * to do — it can observe that a reader returns to one author across unrelated books, which is a
 * genuinely different claim from "likes literary fiction".
 *
 * The other thing books need saying plainly is that an abandoned book is weak evidence. Two hundred
 * pages in is more hours than a film asks for in total; people stop reading because life intervened
 * far more often than because the book failed. Every other category can treat abandonment as a
 * verdict. This one cannot.
 */

const SHARED_RULES = [
  'Do not output percentages, numeric confidence values, star ratings or rankings. All numbers are computed elsewhere.',
  'Do not merely restate genre frequency. Two books tagged Fiction can differ completely in whether the appeal is prose style, structural ambition, moral argument or narrative propulsion; say which one this reader returns to.',
  'Name each pillar after the specific literary or structural pattern its cited titles actually share.',
  'Useful axes include, where the evidence supports them: prose density and style, structural ambition, narrative propulsion, moral or political argument, interiority and character psychology, worldbuilding depth, historical or scientific grounding, unreliable or layered narration, tonal bleakness, humour, essayistic digression, series commitment, and tolerance for length or difficulty. Use none of these unless the evidence supports it, and prefer a better description of your own.',
  'A pillar may be about content (what the book is about) or form (how it is written: prose, structure, narration, pacing). Set kind accordingly.',
  'Each entry lists its authors. A reader returning to one author across books that share no series is a strong and specific observation; make it when the evidence shows it, naming the author in the description. Never put an author name in evidenceTitles: those must be exact book titles from the entries list.',
  'Read authorDataRatio and distinctAuthorCount before making any claim about authors. When authorDataRatio is low most entries have no author recorded, and an apparent pattern is an artefact of missing data.',
  'Entries are collapsed across editions, printings and bindings: one book, however many rows it occupied. Do not treat an illustrated edition as separate evidence from the paperback.',
  'Instalments of a series are separate entries because reading the next one is a separate decision, but they share a familyKey. A pillar whose every citation shares a familyKey describes that series rather than this reader, and will be rejected. Cite across at least two families.',
  'Weigh the evidence by what it cost the reader. A finished, highly rated or favourited book is the strongest signal.',
  'An abandoned book is weak evidence of dislike, much weaker than an abandoned film or series. Two hundred pages is more hours than a film, and readers stop for reasons that have nothing to do with the book. Read aversionEvidence rather than inferring a verdict from status.',
  'Read readRatio before interpreting an abandonment. Stopping in the first fifth rejects a voice or a premise. Stopping past sixty percent is a stall, not a judgement.',
  'Read pageDataRatio before saying anything about length or difficulty. When it is low, most entries have no page count and any claim about preferred book length is unsupported.',
  'A negative signal must name the concrete literary or structural pattern every one of its cited titles actually shares, verified title by title. "Plot-forward thrillers with flat prose" is a signal; "boring books", "classics" or a bare genre name is not.',
  'Prefer a narrower label that is true of all cited titles over a broader one that is loosely true of most. If the titles do not share one precise pattern, split them into separate signals or omit them; returning fewer negative signals is better than returning an inaccurate one.',
  'Every entry carries an aversionEvidence field: clear, weak, or none. Read it; do not re-derive it from status, score or favourite.',
  'A negative signal may cite ONLY entries whose aversionEvidence is clear or weak, and must include at least one clear entry. Citing an entry whose aversionEvidence is none discards the entire response, pillars included.',
  'A signal built only from weak entries will be discarded. Weak entries may corroborate a clear one; they can never carry a signal by themselves.',
  'If dataQuality.clearAversionCount is 0 this reader has expressed no aversion at all. Return an empty negativeSignals array, and describe no rejection, dislike, aversion, avoidance or impatience anywhere in the response - including identity.description and summary. Write only about what the reader is drawn to.',
  'Each open question must name a genuine ambiguity in the supplied evidence: an observed pattern with more than one plausible explanation, stated so a future signal could settle it. Do not forecast what the reader will enjoy next, and do not ask about data that is not in the evidence.',
  'You may use general knowledge about the supplied titles, but every evidence claim must cite only titles present in the evidence document.',
  'The response JSON schema is supplied separately in generationConfig.responseSchema.',
  'Use schemaVersion exactly 1.',
  'Keep all descriptions concise: one sentence each. Constraints: identity label <= 4 words; 2-4 pillars; each pillar cites 2-5 exact supplied titles; 0-3 negative signals; 0-2 open questions.',
  `Hard character limits, counted in characters and not words. Exceeding any of them discards the whole response: identity.label <= ${BOOKS_AI_TASTE_TEXT_LIMITS.identityLabel}; identity.description <= ${BOOKS_AI_TASTE_TEXT_LIMITS.description}; every pillar and negative signal name <= ${BOOKS_AI_TASTE_TEXT_LIMITS.name}; every pillar and negative signal description <= ${BOOKS_AI_TASTE_TEXT_LIMITS.description}; summary <= ${BOOKS_AI_TASTE_TEXT_LIMITS.summary}; each open question <= ${BOOKS_AI_TASTE_TEXT_LIMITS.openQuestion}.`,
  'Count the characters of summary and of every description before returning. These bounds are the single most common reason a response is rejected; prefer a shorter sentence to a borderline one.',
  'identity.label must be at most FOUR words. Count them before returning. This is a hard limit enforced in code: a five-word label discards the entire response, pillars included, and it is the single most common way a first generation is lost. "Authored Historical Drama" is four words; "Drawn To Authored Historical Drama" is five and would be rejected.',
];

export function buildBooksTastePrompt(evidence: BooksAiEvidenceDocument): string {
  return [
    'Infer a semantic Reading Taste Profile from the supplied deterministic evidence.',
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
export function buildBooksTasteRetryPrompt(evidence: BooksAiEvidenceDocument): string {
  return [
    'Return a Reading Taste Profile as one valid JSON object only.',
    'Do not include Markdown, code fences, prose before JSON, prose after JSON, JavaScript syntax, backticks, comments, or trailing commas.',
    'Every JSON string must use double quotes and must escape embedded double quotes.',
    ...SHARED_RULES,
    'Evidence document:',
    JSON.stringify(evidence),
  ].join('\n\n');
}
