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
 * The registry. Adding a category here is the *only* place support is declared.
 *
 * Registering a category is a claim that the server implementation exists — a flag flipped ahead
 * of the code produces requests that can only fail. Movies, tv and books are deliberately absent:
 * they have no adapter yet.
 */
const AI_CATEGORY_CAPABILITIES = {
  games: {
    taste: true,
    rerank: 'shadow',
    minTasteEvidenceTitles: DEFAULT_MIN_TASTE_EVIDENCE_TITLES,
  },
  /**
   * Anime: taste only.
   *
   * `rerank: 'off'` is the point of having two fields. Anime taste is live; anime reranking has
   * no implementation, no shadow corpus and no evidence that a model improves its ordering, so
   * the reranking dispatcher must refuse it outright rather than rely on a caller not asking.
   *
   * The evidence floor is eight rather than the default six, and the difference is deliberate —
   * see `ANIME_MIN_TASTE_EVIDENCE_TITLES`.
   */
  anime: {
    taste: true,
    rerank: 'off',
    minTasteEvidenceTitles: ANIME_MIN_TASTE_EVIDENCE_TITLES,
  },
  /**
   * Manga: taste only.
   *
   * `rerank: 'off'` for the same reason anime's is, and it is worth restating rather than
   * inferring. Manga reranking has no implementation, no shadow corpus and no evidence that a
   * model improves its ordering. Taste shipping for a category must never be the thing that
   * enables reranking for it — the two capabilities are separate fields precisely so that the
   * reranking dispatcher refuses manga outright rather than relying on no caller asking.
   *
   * The evidence floor is seven rather than six or eight — see `MANGA_MIN_TASTE_EVIDENCE_TITLES`.
   */
  manga: {
    taste: true,
    rerank: 'off',
    minTasteEvidenceTitles: MANGA_MIN_TASTE_EVIDENCE_TITLES,
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
