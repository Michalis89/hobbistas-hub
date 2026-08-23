import {
  AI_TASTE_MIN_EVIDENCE_TITLES,
  isAiTasteEligible,
  isAiTasteSupportedCategory,
} from '../taste-eligibility';

describe('isAiTasteSupportedCategory', () => {
  it('supports games only', () => {
    expect(isAiTasteSupportedCategory('games')).toBe(true);
  });

  it.each(['anime', 'manga', 'movies', 'tv', 'books', 'coding', 'pet', 'vape', ''])(
    'does not support %s',
    category => {
      expect(isAiTasteSupportedCategory(category)).toBe(false);
    },
  );
});

describe('isAiTasteEligible', () => {
  const eligible = { category: 'games', engagedEntryCount: AI_TASTE_MIN_EVIDENCE_TITLES };

  it('allows games with enough engaged titles', () => {
    expect(isAiTasteEligible(eligible)).toBe(true);
  });

  it('refuses games one title below the evidence threshold', () => {
    expect(
      isAiTasteEligible({ category: 'games', engagedEntryCount: AI_TASTE_MIN_EVIDENCE_TITLES - 1 }),
    ).toBe(false);
  });

  it('refuses an empty games library', () => {
    expect(isAiTasteEligible({ category: 'games', engagedEntryCount: 0 })).toBe(false);
  });

  it.each(['anime', 'manga', 'movies', 'tv', 'books'])(
    'refuses %s however large the library',
    category => {
      expect(isAiTasteEligible({ category, engagedEntryCount: 5000 })).toBe(false);
    },
  );

  it('refuses a read-only dashboard', () => {
    expect(isAiTasteEligible({ ...eligible, isReadOnly: true })).toBe(false);
  });

  it('matches the evidence builder threshold, so the client never asks for what the server refuses', () => {
    expect(AI_TASTE_MIN_EVIDENCE_TITLES).toBe(6);
  });
});
