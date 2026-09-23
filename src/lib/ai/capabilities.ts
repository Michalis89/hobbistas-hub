/**
 * Which categories the AI layer actually supports, and for what.
 *
 * Client-safe on purpose: plain data, no node builtins, no zod, no server-only imports. The
 * dashboard, the API routes and the server services all read support from here, so "is this
 * category wired up?" has exactly one answer in the codebase.
 *
 * Two capabilities, deliberately independent. Taste profiling and reranking are separate
 * features with separate spend, separate failure modes and separate rollout risk: a category
 * will normally earn a taste profile long before anyone lets a model touch its ordering.
 * Collapsing them into one `supported` flag would make "taste on, rerank off" unrepresentable,
 * which is precisely the state every new category starts in.
 */

/** How far reranking has been taken for a category. */
export type AiRerankMode =
  /** No AI reranking of any kind. No provider call, no cache write, no observation row. */
  | 'off'
  /**
   * The provider is asked and the answer is recorded, but nothing the user sees is affected.
   * The served ordering stays byte-for-byte deterministic.
   */
  | 'shadow';

export type AiCategoryCapability = {
  /** Whether a taste profile can be generated for this category. */
  taste: boolean;
  rerank: AiRerankMode;
  /**
   * Minimum evidence-bearing titles before a taste profile is worth generating.
   *
   * Per-category because evidence density differs: a books library of six is a different signal
   * from a games library of six. Only meaningful when `taste` is true.
   */
  minTasteEvidenceTitles: number;
};

/**
 * Default evidence floor for a category that has not chosen its own.
 *
 * Below this the model has nothing to generalise from and the server refuses anyway, so asking
 * only spends a request to be told no.
 */
export const DEFAULT_MIN_TASTE_EVIDENCE_TITLES = 6;

/**
 * Anime's own evidence floor, counted in collapsed franchise families.
 *
 * Higher than the default for two reasons that point the same way.
 *
 * *Each anime entry carries less information.* A game arrives with genres, themes, game modes,
 * player perspectives and a developer. An anime row arrives with genres and an episode count —
 * the importer writes no studios, and the `tags` column holds alternative titles rather than
 * themes. With a thinner per-title signal the model needs more titles before a pattern is
 * anything but genre frequency.
 *
 * *Eight collapsed families is a smaller commitment than six games.* A cour is roughly four
 * hours against a game's thirty, and season collapse means eight families is typically twelve to
 * twenty library rows — a realistic bar for anyone who tracks anime at all.
 *
 * Below eight the strength bands also stop meaning anything: with fewer families one series can
 * exceed a quarter of the reference denominator on its own and read as a `Defining` pillar.
 */
export const ANIME_MIN_TASTE_EVIDENCE_TITLES = 8;

/**
 * Manga's own evidence floor, counted in collapsed families.
 *
 * Seven: above the games default of six, below anime's eight. It is genuinely between them rather
 * than a compromise, and three properties of manga libraries put it there.
 *
 * *A manga family is a higher bar than an anime family.* Anime's eight is measured after a
 * collapse that folds seasons, cours, OVAs and films into one entry, so eight families is
 * routinely twelve to twenty library rows and each family may be a single twelve-episode cour.
 * Manga barely collapses — a series is one row — so seven families is seven distinct series, and
 * a completed serialised manga is dozens of hours against a cour's four. Seven families here is a
 * larger commitment than eight there.
 *
 * *The per-title metadata is thin, but less thin than anime's.* Manga rows carry no authors, no
 * artists, no publishers, no serialisation data and no relations, and — as on anime rows — the
 * `tags` column holds alternative titles rather than themes. What they do carry is MAL's flat
 * label list, which mixes genres, themes and demographics together, so a typical manga row arrives
 * with four to seven labels where an anime row arrives with two or three. More semantic surface
 * per title means fewer titles are needed before a pattern is more than genre frequency.
 *
 * *Below seven the strength bands stop meaning anything.* With a reference denominator of ten, a
 * library of six lets a single series exceed a fifth of the denominator on its own and read as a
 * `Strong` pillar on no evidence but its own size.
 */
export const MANGA_MIN_TASTE_EVIDENCE_TITLES = 7;

/**
 * Films: eight collapsed franchise families.
 *
 * The same figure as anime, reached from the opposite direction. A film is the *smallest* commitment
 * in the library — two hours against a game's thirty — which argues for a higher bar, and a film row
 * carries the thinnest metadata of any category: genres, a runtime, and nothing else. There are no
 * themes, no studios, no credits on the row at all.
 *
 * What pulls it back down to eight is the one thing films have that nothing else does: derived
 * authorship. Directors and actors arrive from `user_category_profiles` already franchise-deduped,
 * with single-franchise actors already excluded, and that is a genuinely strong signal per title. It
 * also only exists once the deterministic profile has enough data to compute it — which happens at
 * the same threshold — so eight is where both signals become available together.
 */
export const MOVIES_MIN_TASTE_EVIDENCE_TITLES = 8;

/**
 * Television: seven collapsed series.
 *
 * Below anime's eight and above the games default of six, and it is genuinely between them rather
 * than a compromise.
 *
 * *A tv family is the heaviest unit in the app.* Anime's eight is counted after a collapse that
 * folds seasons, cours, OVAs and films into one entry, where a single family may be one twelve-episode
 * cour — roughly four hours. A collapsed tv series is typically three to five seasons, so seven
 * families is well over a hundred hours of watching. Seven here is a larger commitment than eight
 * there.
 *
 * *The metadata is thin but structured.* A tv row carries genres, an episode total and a season
 * count. The season count in particular is a real signal no other category has: it says whether this
 * viewer stays with long-running shows or prefers limited series.
 *
 * *Below seven the strength bands stop meaning anything.* With a reference denominator of ten, a
 * library of six lets one series exceed a fifth of the denominator on its own and read as `Strong`
 * on no evidence but its own length.
 */
export const TV_MIN_TASTE_EVIDENCE_TITLES = 7;

/**
 * Books: six works, the shared default.
 *
 * The only category that earns the default rather than an adjustment, and for a reason worth stating
 * so nobody "harmonises" it upward later. A book is a ten-hour commitment that barely collapses — a
 * series contributes one entry per volume — so six entries is six real reading decisions. And books
 * are the only category with a true per-row authorship signal: `media_items.tags` holds author names,
 * so every entry arrives naming who wrote it. Six titles with six authors is a denser document than
 * eight anime rows with genres alone.
 */
export const BOOKS_MIN_TASTE_EVIDENCE_TITLES = DEFAULT_MIN_TASTE_EVIDENCE_TITLES;

/**
 * The registry. Adding a category here is the *only* place support is declared.
 *
 * Registering a category is a claim that the server implementation exists — a flag flipped ahead of
 * the code produces requests that can only fail. Every media category the app tracks now has a
 * taste adapter; the `rerank` column is what still separates them, and every category starts at
 * `off` there until it has a reranker of its own, a prompt of its own and a replay of its own slot
 * rules.
 */
const AI_CATEGORY_CAPABILITIES = {
  games: {
    taste: true,
    rerank: 'shadow',
    minTasteEvidenceTitles: DEFAULT_MIN_TASTE_EVIDENCE_TITLES,
  },
  /**
   * Anime: taste live, reranking observed.
   *
   * `shadow` is not a softer `true`. The anime reranker asks the provider and records the answer
   * beside what the viewer was actually shown; the served ordering stays byte-for-byte
   * deterministic. It earns `shadow` rather than `off` because the implementation exists — an
   * adapter, a prompt of its own, and a replay of the anime engine's slot rules — and it stays out
   * of `isAiRerankUserVisibleCategory` until the recorded comparisons say the blend is an
   * improvement.
   *
   * The evidence floor is eight rather than the default six, and the difference is deliberate —
   * see `ANIME_MIN_TASTE_EVIDENCE_TITLES`.
   */
  anime: {
    taste: true,
    rerank: 'shadow',
    minTasteEvidenceTitles: ANIME_MIN_TASTE_EVIDENCE_TITLES,
  },
  /**
   * Manga: taste live, reranking observed.
   *
   * The first category reranked off the *shared pipeline's* shadow context rather than a bespoke
   * engine's — manga has no engine of its own, so its slot replay re-runs the pipeline's
   * cluster-diversity selection. Registering it as `shadow` is still a claim that the
   * implementation exists, not that it is trusted: the served ordering stays byte-for-byte
   * deterministic until the recorded comparisons say otherwise.
   *
   * The evidence floor is seven rather than six or eight — see `MANGA_MIN_TASTE_EVIDENCE_TITLES`.
   */
  manga: {
    taste: true,
    rerank: 'shadow',
    minTasteEvidenceTitles: MANGA_MIN_TASTE_EVIDENCE_TITLES,
  },
  /**
   * Movies: taste only.
   *
   * `rerank: 'off'` is not an oversight, and this is the third time it is worth restating. A film
   * taste profile existing says nothing about whether a model improves film *ordering*: there is no
   * movies reranker, no shadow corpus and no evidence either way. The reranking dispatcher must
   * refuse movies outright rather than rely on no caller asking.
   */
  movies: {
    taste: true,
    rerank: 'off',
    minTasteEvidenceTitles: MOVIES_MIN_TASTE_EVIDENCE_TITLES,
  },
  /** Television: taste only, for the same reason movies is. See `TV_MIN_TASTE_EVIDENCE_TITLES`. */
  tv: {
    taste: true,
    rerank: 'off',
    minTasteEvidenceTitles: TV_MIN_TASTE_EVIDENCE_TITLES,
  },
  /** Books: taste only, at the shared evidence floor. See `BOOKS_MIN_TASTE_EVIDENCE_TITLES`. */
  books: {
    taste: true,
    rerank: 'off',
    minTasteEvidenceTitles: BOOKS_MIN_TASTE_EVIDENCE_TITLES,
  },
} as const satisfies Record<string, AiCategoryCapability>;

/** Categories with an AI implementation of any kind behind them. */
export type AiCategory = keyof typeof AI_CATEGORY_CAPABILITIES;

/** Categories that can produce a taste profile today. */
export type AiTasteCategory = AiCategory;

export function getAiCategoryCapability(category: string): AiCategoryCapability | null {
  return (
    (AI_CATEGORY_CAPABILITIES as Record<string, AiCategoryCapability | undefined>)[category] ?? null
  );
}

export function isAiTasteSupportedCategory(category: string): category is AiTasteCategory {
  return getAiCategoryCapability(category)?.taste === true;
}

/** True only for categories whose reranker runs in shadow mode. */
export function isAiRerankShadowCategory(category: string): category is AiCategory {
  return getAiCategoryCapability(category)?.rerank === 'shadow';
}

/**
 * Whether reranking may influence what a user is shown.
 *
 * Always false today, and asserted so by test. Reads as a real question rather than a constant so
 * the call sites that must respect it already exist when the answer changes.
 */
export function isAiRerankUserVisibleCategory(category: string): boolean {
  const mode = getAiCategoryCapability(category)?.rerank;
  return mode !== undefined && mode !== 'off' && mode !== 'shadow';
}

export function getMinTasteEvidenceTitles(category: string): number {
  return getAiCategoryCapability(category)?.minTasteEvidenceTitles ?? DEFAULT_MIN_TASTE_EVIDENCE_TITLES;
}

/** Every registered category, for tests and diagnostics. Never for iteration in request paths. */
export function listAiCategories(): AiCategory[] {
  return Object.keys(AI_CATEGORY_CAPABILITIES) as AiCategory[];
}
