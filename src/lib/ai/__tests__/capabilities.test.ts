import {
  ANIME_MIN_TASTE_EVIDENCE_TITLES,
  DEFAULT_MIN_TASTE_EVIDENCE_TITLES,
  MANGA_MIN_TASTE_EVIDENCE_TITLES,
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

const UNREGISTERED_CATEGORIES = ['movies', 'tv', 'books', 'coding', 'pet', 'vape', ''];

describe('AI category registry', () => {
  it('registers exactly games, anime and manga', () => {
    expect(listAiCategories().sort()).toEqual(['anime', 'games', 'manga']);
  });

  it('supports taste for all three registered categories', () => {
    expect(isAiTasteSupportedCategory('games')).toBe(true);
    expect(isAiTasteSupportedCategory('anime')).toBe(true);
    expect(isAiTasteSupportedCategory('manga')).toBe(true);
  });

  it('runs games reranking in shadow mode', () => {
    expect(getAiCategoryCapability('games')?.rerank).toBe('shadow');
    expect(isAiRerankShadowCategory('games')).toBe(true);
  });

  it('keeps anime reranking switched off entirely', () => {
    expect(getAiCategoryCapability('anime')?.rerank).toBe('off');
    expect(isAiRerankShadowCategory('anime')).toBe(false);
  });

  it('keeps manga reranking switched off entirely', () => {
    // Manga taste shipping must never be the thing that enables manga reranking. There is no
    // implementation, no shadow corpus and no evidence a model improves the ordering.
    expect(getAiCategoryCapability('manga')?.rerank).toBe('off');
    expect(isAiRerankShadowCategory('manga')).toBe(false);
  });

  it('never lets reranking touch what a user is shown', () => {
    for (const category of ['games', 'anime', 'manga', ...UNREGISTERED_CATEGORIES]) {
      expect(isAiRerankUserVisibleCategory(category)).toBe(false);
    }
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

  it('applies the default evidence floor to an unregistered category', () => {
    expect(getMinTasteEvidenceTitles('movies')).toBe(DEFAULT_MIN_TASTE_EVIDENCE_TITLES);
  });
});

describe('taste and rerank support are independent', () => {
  /**
   * Anime is now the live demonstration of why these are two fields rather than one `supported`
   * flag: its taste profile is in production while its reranking does not exist. A single flag
   * could not express that, and would have forced anime reranking on the day taste shipped.
   */
  it.each(['anime', 'manga'])('holds taste-on / rerank-off for %s', category => {
    const capability = getAiCategoryCapability(category);
    expect(capability?.taste).toBe(true);
    expect(capability?.rerank).toBe('off');
  });

  it('leaves games as the only category with any reranking at all', () => {
    const shadow = listAiCategories().filter(isAiRerankShadowCategory);
    expect(shadow).toEqual(['games']);
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
