import {
  ANIME_MIN_TASTE_EVIDENCE_TITLES,
  BOOKS_MIN_TASTE_EVIDENCE_TITLES,
  DEFAULT_MIN_TASTE_EVIDENCE_TITLES,
  MANGA_MIN_TASTE_EVIDENCE_TITLES,
  MOVIES_MIN_TASTE_EVIDENCE_TITLES,
  TV_MIN_TASTE_EVIDENCE_TITLES,
  getAiCategoryCapability,
  getMinTasteEvidenceTitles,
  isAiRerankShadowCategory,
  isAiRerankUserVisibleCategory,
  isAiTasteSupportedCategory,
  listAiCategories,
} from '../capabilities';

/**
 * The capability registry is a rollout control, so these assertions are deliberately blunt.
 *
 * Registering a category is a claim that a server adapter exists behind it; a flag flipped ahead
 * of the code produces requests that can only fail, and — for reranking — provider spend against
 * a corpus nobody can interpret. Every one of these tests should fail loudly the moment a
 * category is added or a capability is widened, which is the point: both must be deliberate.
 */

/** Categories the app has no media taste layer for at all — not hobbies with libraries. */
const UNREGISTERED_CATEGORIES = ['coding', 'pet', 'vape', ''];

/** Every media category, all of which now profile taste. */
const TASTE_CATEGORIES = ['games', 'anime', 'manga', 'movies', 'tv', 'books'];

/** Categories with a reranker behind them. The others must be refused outright. */
const RERANK_SHADOW_CATEGORIES = ['games', 'anime', 'manga'];
const RERANK_OFF_CATEGORIES = ['movies', 'tv', 'books'];

describe('AI category registry', () => {
  it('registers exactly the six media categories', () => {
    expect(listAiCategories().sort()).toEqual([
      'anime',
      'books',
      'games',
      'manga',
      'movies',
      'tv',
    ]);
  });

  it.each(TASTE_CATEGORIES)('supports taste for %s', category => {
    expect(isAiTasteSupportedCategory(category)).toBe(true);
  });

  it('never lets reranking touch what a user is shown', () => {
    for (const category of [...TASTE_CATEGORIES, ...UNREGISTERED_CATEGORIES]) {
      expect(isAiRerankUserVisibleCategory(category)).toBe(false);
    }
  });

  it.each(RERANK_OFF_CATEGORIES)('registers %s for taste but never for reranking', category => {
    // The two fields exist for exactly this state. Shipping a taste profile for a category must
    // never be what enables a model to reorder that category's recommendations.
    expect(getAiCategoryCapability(category)?.taste).toBe(true);
    expect(getAiCategoryCapability(category)?.rerank).toBe('off');
    expect(isAiRerankShadowCategory(category)).toBe(false);
  });

  it.each(RERANK_SHADOW_CATEGORIES)('runs %s reranking in shadow mode', category => {
    expect(getAiCategoryCapability(category)?.rerank).toBe('shadow');
    expect(isAiRerankShadowCategory(category)).toBe(true);
  });

  it.each(UNREGISTERED_CATEGORIES)('does not support taste for %s', category => {
    expect(isAiTasteSupportedCategory(category)).toBe(false);
  });

  it.each(UNREGISTERED_CATEGORIES)('does not support reranking for %s', category => {
    expect(isAiRerankShadowCategory(category)).toBe(false);
    expect(getAiCategoryCapability(category)).toBeNull();
  });

  it('keeps the games evidence floor at six titles', () => {
    expect(getMinTasteEvidenceTitles('games')).toBe(DEFAULT_MIN_TASTE_EVIDENCE_TITLES);
    expect(getMinTasteEvidenceTitles('games')).toBe(6);
  });

  it('gives anime its own, higher evidence floor', () => {
    // Anime rows carry thinner metadata than games rows and collapse harder across seasons, so
    // the floor is not inherited. See the constant's own note.
    expect(getMinTasteEvidenceTitles('anime')).toBe(ANIME_MIN_TASTE_EVIDENCE_TITLES);
    expect(ANIME_MIN_TASTE_EVIDENCE_TITLES).toBe(8);
    expect(ANIME_MIN_TASTE_EVIDENCE_TITLES).toBeGreaterThan(DEFAULT_MIN_TASTE_EVIDENCE_TITLES);
  });

  it('gives manga its own evidence floor, between the games and anime ones', () => {
    // Seven is derived, not split the difference: a manga family is a heavier commitment than an
    // anime family (which collapses seasons), and manga rows carry more labels per title.
    // See the constant's own note.
    expect(getMinTasteEvidenceTitles('manga')).toBe(MANGA_MIN_TASTE_EVIDENCE_TITLES);
    expect(MANGA_MIN_TASTE_EVIDENCE_TITLES).toBe(7);
    expect(MANGA_MIN_TASTE_EVIDENCE_TITLES).toBeGreaterThan(DEFAULT_MIN_TASTE_EVIDENCE_TITLES);
    expect(MANGA_MIN_TASTE_EVIDENCE_TITLES).toBeLessThan(ANIME_MIN_TASTE_EVIDENCE_TITLES);
  });

  it('gives films the same floor as anime, reached from the opposite direction', () => {
    // Thinnest per-row metadata in the app, offset by the only derived-authorship signal that
    // carries a breadth gate. See the constant's own note.
    expect(getMinTasteEvidenceTitles('movies')).toBe(MOVIES_MIN_TASTE_EVIDENCE_TITLES);
    expect(MOVIES_MIN_TASTE_EVIDENCE_TITLES).toBe(8);
    expect(MOVIES_MIN_TASTE_EVIDENCE_TITLES).toBe(ANIME_MIN_TASTE_EVIDENCE_TITLES);
  });

  it('puts television between the games default and anime', () => {
    // A collapsed tv series is the heaviest unit in the app: seasons fold into one entry, so seven
    // families is well over a hundred hours.
    expect(getMinTasteEvidenceTitles('tv')).toBe(TV_MIN_TASTE_EVIDENCE_TITLES);
    expect(TV_MIN_TASTE_EVIDENCE_TITLES).toBe(7);
    expect(TV_MIN_TASTE_EVIDENCE_TITLES).toBeGreaterThan(DEFAULT_MIN_TASTE_EVIDENCE_TITLES);
    expect(TV_MIN_TASTE_EVIDENCE_TITLES).toBeLessThan(ANIME_MIN_TASTE_EVIDENCE_TITLES);
  });

  it('leaves books on the shared default, deliberately', () => {
    // The only category that earns the default: barely collapses, and every row names its author.
    expect(getMinTasteEvidenceTitles('books')).toBe(BOOKS_MIN_TASTE_EVIDENCE_TITLES);
    expect(BOOKS_MIN_TASTE_EVIDENCE_TITLES).toBe(DEFAULT_MIN_TASTE_EVIDENCE_TITLES);
  });

  it('applies the default evidence floor to an unregistered category', () => {
    expect(getMinTasteEvidenceTitles('coding')).toBe(DEFAULT_MIN_TASTE_EVIDENCE_TITLES);
  });
});

describe('taste and rerank support are independent', () => {
  /**
   * Six categories profile taste; three are reranked, in shadow, and none may touch what a user is
   * shown. A single `supported` flag could express none of that — it would have enabled movies, tv
   * and books reranking on the day their taste profiles shipped, against no corpus and no evidence.
   */
  it('never reports a category as rerankable that is not also taste-capable', () => {
    for (const category of listAiCategories()) {
      const capability = getAiCategoryCapability(category);
      if (capability?.rerank !== 'off') {
        expect(capability?.taste).toBe(true);
      }
    }
  });

  it('lists exactly the categories with a reranker behind them', () => {
    // A category may only appear here once an adapter, a prompt and a slot replay exist for it.
    // The list is asserted rather than counted so adding one is a deliberate edit to this test.
    const shadow = listAiCategories().filter(isAiRerankShadowCategory);
    expect(shadow.sort()).toEqual(['anime', 'games', 'manga']);
  });

  it('reads the two capabilities from separate fields', () => {
    for (const category of listAiCategories()) {
      const capability = getAiCategoryCapability(category);
      expect(Object.keys(capability ?? {}).sort()).toEqual([
        'minTasteEvidenceTitles',
        'rerank',
        'taste',
      ]);
    }
  });
});
